import type { Request, Response } from 'express';
import { redis } from '../config/redis.js';
import { octokit } from '../config/octokit.js';

export const clearRedis = async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: "Not allowed in production" });
  }

  const { owner, repo, all } = req.query as { owner?: string; repo?: string; all?: string };

  if (all === 'true') {
    try {
      const jobKeys = await redis.keys('job:*');
      const lockKeys = await redis.keys('lock:*');
      const systemKeys = await redis.keys('system:*');
      const lastIndexedKeys = await redis.keys('last_indexed:*');

      const allKeys = Array.from(new Set([...jobKeys, ...lockKeys, ...systemKeys, ...lastIndexedKeys]));

      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }

      return res.json({ success: true, message: `Cleared ALL ${allKeys.length} keys from Redis.` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error clearing all Redis keys:', message);
      return res.status(500).json({ error: 'Failed to clear Redis' });
    }
  }

  if (!owner || !repo) {
    return res.status(400).json({
      error: "Missing owner or repo query params. Usage: /api/dev/clear?owner=OWNER&repo=REPO (or ?all=true to clear everything)"
    });
  }

  try {
    const targetJobId = `job:${owner}/${repo}`;
    
    const jobKeys = await redis.keys(`job:${owner}/${repo}*`);
    const lockKeys = await redis.keys(`lock:*:${owner}/${repo}*`);
    const directLockKeys = await redis.keys(`lock:${owner}/${repo}*`);
    const lastIndexedKey = `last_indexed:${owner}/${repo}`;

    const keysToDelete = Array.from(new Set([
      ...jobKeys,
      ...lockKeys,
      ...directLockKeys,
      lastIndexedKey
    ]));

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }

    const activeJobId = await redis.get<string>('system:active_job');
    if (activeJobId === targetJobId) {
      await redis.del('system:active_job');
    }

    await redis.lrem('system:queue', 0, targetJobId);

    return res.json({
      success: true,
      message: `Cleared ${keysToDelete.length} Redis keys and queue entries for ${owner}/${repo}.`
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error clearing Redis for ${owner}/${repo}:`, message);
    return res.status(500).json({ error: `Failed to clear Redis for ${owner}/${repo}` });
  }
};

export const deleteDocs = async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: "Not allowed in production" });
  }

  const { owner, repo } = req.query as { owner?: string; repo?: string };
  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing owner or repo query params" });
  }

  try {
    const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME!;
    const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
    const docsPath = `docs/${owner}/${repo}`;

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
        mode: '100644' as const,
        type: 'blob' as const,
        sha: null,
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

    const jobKey = `job:${owner}/${repo}`;
    const lockKey = `lock:${owner}/${repo}`;
    const stepLockKey = `lock:step:${jobKey}`;
    const lastIndexedKey = `last_indexed:${owner}/${repo}`;
    await redis.del(jobKey, lockKey, stepLockKey, lastIndexedKey);

    return res.json({
      success: true,
      message: `Deleted ${filesToDelete.length} files for ${owner}/${repo} and cleared Redis keys.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error deleting docs:', message);
    return res.status(500).json({ error: message });
  }
};
