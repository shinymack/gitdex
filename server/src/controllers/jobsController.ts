import queue, { redis } from "../queue.js";
import { Octokit } from '@octokit/rest';
import { Client } from "@upstash/qstash";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export const createJob = async (req: any, res: any) => {
  try {
    const { repoUrl, force } = req.body;
    if (!repoUrl) return res.status(400).json({ error: "Repo URL required" });

    const { jobId, state, newlyStarted } = await queue.addJob(repoUrl, force === true);
    
    if (state === 'processing' && newlyStarted) {
      const baseUrl = process.env.BASE_URL;
      if (!baseUrl) throw new Error("BASE_URL missing for QStash");
      
      try {
        await qstash.publishJSON({
          url: `${baseUrl}/api/pipeline/step`,
          body: { jobId },
          retries: 2,
        });
      } catch (qstashError: any) {
        console.error(`[Queue] Failed to publish initial QStash step. Failing job: ${qstashError.message}`);
        await queue.failJob(jobId, `QStash publish failed: ${qstashError.message}`);
        throw qstashError;
      }
    }

    res.json({ jobId, status: state, newlyStarted });
  } catch (error: any) {
    if (error.message.includes('cooldown')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create job" });
  }
};

export const getJobStatus = async (req: any, res: any) => {
  try {
    const { jobId } = req.params;
    const job = await queue.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Omit the massive 'data' payload from the response
    const { data, ...safeJob } = job;
    res.json(safeJob);
  } catch (error) {
    res.status(500).json({ error: "Failed to get job status" });
  }
};

export const getStatusByName = async (req: any, res: any) => {
  try {
    const { owner, repo } = req.query;
    if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

    const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME || "";
    if (!docsRepoOwner) {
      return res.status(500).json({ error: "Server configuration error: missing GitHub owner" });
    }
    const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';

    const job = await queue.getJobByRepo(owner, repo);
    const lastIndexedKey = `last_indexed:${owner}/${repo}`;

    // Active job takes priority: never report indexed:true while a pipeline is running.
    // The status page needs indexed:false to keep polling.
    if (job && (job.state === 'processing' || job.state === 'queued')) {
      const cached = await redis.get<string>(lastIndexedKey);
      const { data, ...safeJob } = job;
      return res.json({
        indexed: false,
        job: safeJob,
        lastIndexed: cached ? parseInt(cached) : null,
      });
    }

    let lastIndexed: number | null = null;
    const cached = await redis.get<string>(lastIndexedKey);
    if (cached) {
      lastIndexed = parseInt(cached);
    } else {
      // Cache miss: repo may have been indexed before this feature was added.
      // First verify the file actually exists - listCommits returns delete commits too,
      // so we cannot trust commit history alone to determine if the repo is indexed.
      try {
        await octokit.rest.repos.getContent({
          owner: docsRepoOwner,
          repo: docsRepo,
          path: `docs/${owner}/${repo}/meta.json`,
        });
        // File exists - now get the commit timestamp to cache
        const commits = await octokit.rest.repos.listCommits({
          owner: docsRepoOwner,
          repo: docsRepo,
          path: `docs/${owner}/${repo}/meta.json`,
          per_page: 1,
        });
        const commitDate = commits.data[0]?.commit.committer?.date;
        if (commitDate) {
          lastIndexed = new Date(commitDate).getTime();
          await redis.set(lastIndexedKey, lastIndexed.toString());
        }
      } catch {
        // 404 = not indexed, or GitHub unreachable
      }
    }

    if (lastIndexed !== null) {
      return res.json({
        indexed: true,
        path: `/${owner}/${repo}`,
        lastIndexed,
        job: job ? { id: job.id, state: job.state, updatedAt: job.updatedAt } : null,
      });
    }

    if (job) {
      const { data, ...safeJob } = job;
      return res.json({ indexed: false, job: safeJob });
    }

    return res.json({ indexed: false });
  } catch (error) {
    console.error('getStatusByName error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};