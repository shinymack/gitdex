import queue from "../queue.ts";
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
      
      await qstash.publishJSON({
        url: `${baseUrl}/api/pipeline/step`,
        body: { jobId },
        retries: 2,
      });
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

    const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME;
    const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
    
    const job = await queue.getJobByRepo(owner, repo);

    try {
      await octokit.rest.repos.getContent({
        owner: docsRepoOwner,
        repo: docsRepo,
        path: `docs/${owner}/${repo}/meta.json`,
      });
      return res.json({ 
        indexed: true, 
        path: `/${owner}/${repo}`,
        job: job ? { id: job.id, state: job.state, updatedAt: job.updatedAt } : null
      });
    } catch (err) {
      // Not found, fallthrough
    }

    if (job) {
      // Omit the massive 'data' payload from the response
      const { data, ...safeJob } = job;
      return res.json({ indexed: false, job: safeJob });
    }

    return res.json({ indexed: false });
  } catch (error) {
    console.error('getStatusByName error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};