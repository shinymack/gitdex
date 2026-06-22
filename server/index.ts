import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { Redis } from '@upstash/redis';
import jobsRoutes from "./src/routes/jobsRoutes.ts";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const clientUrls = (process.env.CLIENT_URLS || 'http://localhost:3000')
    .split(',')
    .map(url => url.trim());

app.use(cors({
    origin: clientUrls,
    credentials: true
}));

// CRITICAL: Capture the raw body BEFORE parsing JSON, so QStash signature verification works
app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

app.use("/api", jobsRoutes);


// Development route to clear Redis jobs and locks
app.get("/api/dev/clear", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "Not allowed in production" });
    }
    try {
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });

        // Find all job and lock keys
        const jobKeys = await redis.keys('job:*');
        const lockKeys = await redis.keys('lock:*');
        const systemKeys = await redis.keys('system:*');

        const allKeys = [...jobKeys, ...lockKeys, ...systemKeys];

        if (allKeys.length > 0) {
            await redis.del(...allKeys);
        }

        res.json({ success: true, message: `Cleared ${allKeys.length} keys from Redis.` });
    } catch (error: any) {
        console.error('Error clearing Redis:', error);
        res.status(500).json({ error: 'Failed to clear Redis' });
    }
});

app.get("/api/dev/delete", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "Not allowed in production" });
    }

    const { owner, repo } = req.query as { owner?: string; repo?: string };
    if (!owner || !repo) {
        return res.status(400).json({ error: "Missing owner or repo query params" });
    }

    try {
        const { Octokit } = await import('@octokit/rest');
        const { Redis } = await import('@upstash/redis');

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });

        const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME!;
        const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
        const docsPath = `docs/${owner}/${repo}`;

        // Get all files under docs/owner/repo in the tree
        const { data: treeData } = await octokit.rest.git.getTree({
            owner: docsRepoOwner,
            repo: docsRepo,
            tree_sha: 'main',
            recursive: 'true',
        });

        const filesToDelete = treeData.tree.filter(
            (item) => item.path?.startsWith(`${docsPath}/`) && item.type === 'blob'
        );

        if (filesToDelete.length === 0) {
            return res.status(404).json({ error: `No docs found for ${owner}/${repo}` });
        }

        // Create a new tree with those paths set to null (delete)
        const { data: refData } = await octokit.rest.git.getRef({
            owner: docsRepoOwner,
            repo: docsRepo,
            ref: 'heads/main',
        });
        const { data: commitData } = await octokit.rest.git.getCommit({
            owner: docsRepoOwner,
            repo: docsRepo,
            commit_sha: refData.object.sha,
        });
        const { data: newTree } = await octokit.rest.git.createTree({
            owner: docsRepoOwner,
            repo: docsRepo,
            base_tree: commitData.tree.sha,
            tree: filesToDelete.map((f) => ({
                path: f.path!,
                mode: '100644',
                type: 'blob',
                sha: null, // null = delete
            })),
        });
        const { data: newCommit } = await octokit.rest.git.createCommit({
            owner: docsRepoOwner,
            repo: docsRepo,
            message: `GitDex Dev: delete docs for ${owner}/${repo}`,
            tree: newTree.sha,
            parents: [refData.object.sha],
        });
        await octokit.rest.git.updateRef({
            owner: docsRepoOwner,
            repo: docsRepo,
            ref: 'heads/main',
            sha: newCommit.sha,
        });

        // Also wipe Redis job + cooldown lock so it can be re-indexed immediately
        const jobKey = `job:${owner}/${repo}`;
        const lockKey = `lock:${owner}/${repo}`;
        const stepLockKey = `lock:step:${jobKey}`;
        await redis.del(jobKey, lockKey, stepLockKey);

        res.json({
            success: true,
            message: `Deleted ${filesToDelete.length} files for ${owner}/${repo} and cleared Redis keys.`,
        });
    } catch (error: any) {
        console.error('Error deleting docs:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
});



app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}