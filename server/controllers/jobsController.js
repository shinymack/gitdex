import queue from "../queue.js";
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const createJob = async (req, res) => {
    try {
        console.log('JobsController: createJob called', { body: req.body });
        const { repoUrl, force } = req.body;
        if (!repoUrl) {
            console.log('JobsController: Missing repoUrl');
            return res.status(400).json({ error: "Repo URL required" });
        }

        console.log(`JobsController: Adding job to queue`, { repoUrl, force });
        // Pass 'force' to addJob to bypass cooldown if requested
        const jobId = await queue.addJob(repoUrl, true);
        console.log(`JobsController: Job added`, { jobId });
        res.json({ jobId, status: "queued" });
    } catch (error) {
        console.error('JobsController: Error creating job', error);
        res.status(500).json({ error: "Failed to create job" });
    }
};

export const getJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await queue.getJobStatus(jobId);

        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }

        res.json(job);
    } catch (error) {
        res.status(500).json({ error: "Failed to get job status" });
    }
};

// New: GET /api/status?owner=...&repo=...
export const getStatusByName = async (req, res) => {
    try {
        const { owner, repo } = req.query;
        if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

        // First, check if docs exist in the docs storage repo
        const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME;
        const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
        try {
            // Try to fetch meta.json for this repo (get sha too)
            const { data: metaData } = await octokit.rest.repos.getContent({
                owner: docsRepoOwner,
                repo: docsRepo,
                path: `docs/${owner}/${repo}/meta.json`,
            });

            const metaSha = metaData.sha;

            // If we reached here, docs exist
            return res.json({ indexed: true, path: `/docs/${owner}/${repo}`, metaSha });
        } catch (err) {
            // Not found -> not indexed. Fallthrough to check queue for existing job
        }

        // Check queue for an existing job for this repo (by repoUrl or repo path)
        const job = await queue.findJobByRepo(owner, repo);
        if (job) {
            return res.json({ indexed: false, job });
        }

        // Not indexed and no job currently
        return res.json({ indexed: false });
    } catch (error) {
        console.error('getStatusByName error', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};