import type { Request, Response } from "express";
import queue from "../services/queueService.js";
import { redis } from "../config/redis.js";
import { octokit } from "../config/octokit.js";
import { qstash } from "../config/qstash.js";
import { parseOwnerRepo, verifyRepoExists } from "../services/githubService.js";
import { triggerNextStep } from "../services/qstashService.js";

export const createJob = async (req: Request, res: Response) => {
  try {
    const { repoUrl, force } = req.body as { repoUrl?: string; force?: boolean };
    if (!repoUrl) return res.status(400).json({ error: "Repo URL required" });

    const parsed = parseOwnerRepo(repoUrl);
    if (!parsed) return res.status(400).json({ error: "Invalid Repo URL" });

    const { owner, repo } = parsed;
    const verification = await verifyRepoExists(owner, repo);
    if (!verification.exists) {
      return res.status(404).json({ error: verification.error ? `GitHub verification failed: ${verification.error}` : "Repository not found on GitHub." });
    }

    const { jobId, state, newlyStarted } = await queue.addJob(repoUrl, force === true);
    
    if (state === 'processing' && newlyStarted) {
      try {
        await triggerNextStep(jobId);
      } catch (qstashError: unknown) {
        const message = qstashError instanceof Error ? qstashError.message : String(qstashError);
        console.error(`[Queue] Failed to publish initial QStash step. Failing job: ${message}`);
        await queue.failJob(jobId, `QStash publish failed: ${message}`);
        throw qstashError;
      }
    }

    return res.json({ jobId, status: state, newlyStarted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('cooldown')) {
      return res.status(429).json({ error: message });
    }
    return res.status(500).json({ error: "Failed to create job" });
  }
};

export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params as { jobId: string };
    const job = await queue.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const { data: _data, ...safeJob } = job;
    return res.json(safeJob);
  } catch (error: unknown) {
    console.error('getJobStatus error', error);
    return res.status(500).json({ error: "Failed to get job status" });
  }
};

export const getStatusByName = async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.query as { owner?: string; repo?: string };
    if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

    const verification = await verifyRepoExists(owner, repo);
    if (!verification.exists) {
      return res.status(404).json({ error: verification.error ? `GitHub verification failed: ${verification.error}` : "Repository not found on GitHub." });
    }

    const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME || "";
    if (!docsRepoOwner) {
      return res.status(500).json({ error: "Server configuration error: missing GitHub owner" });
    }
    const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';

    const job = await queue.getJobByRepo(owner, repo);
    const lastIndexedKey = `last_indexed:${owner}/${repo}`;

    if (job && (job.state === 'processing' || job.state === 'queued')) {
      const cached = await redis.get<string>(lastIndexedKey);
      const { data: _data, ...safeJob } = job;
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
      try {
        await octokit.rest.repos.getContent({
          owner: docsRepoOwner,
          repo: docsRepo,
          path: `docs/${owner}/${repo}/meta.json`,
        });
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
      const { data: _data, ...safeJob } = job;
      return res.json({ indexed: false, job: safeJob });
    }

    return res.json({ indexed: false });
  } catch (error: unknown) {
    console.error('getStatusByName error', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const cronHeal = async (req: Request, res: Response) => {
  try {
    await queue.healStuckJobs();
    return res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Cron healing failed:", message);
    return res.status(500).json({ error: message });
  }
};
