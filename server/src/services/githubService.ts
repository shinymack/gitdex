import { octokit } from "../config/octokit.js";
import { redis } from "../config/redis.js";
import queue from "./queueService.js";
import type { JobData } from "../types/job.js";
import type { PipelineData, RepoItem } from "../types/pipeline.js";

export function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const rawOwner = parts[0];
    const rawRepo = parts[1];
    if (!rawOwner || !rawRepo) return null;
    return {
      owner: rawOwner,
      repo: rawRepo.replace('.git', ''),
    };
  } catch {
    return null;
  }
}

export async function verifyRepoExists(owner: string, repo: string): Promise<{ exists: boolean; error?: string }> {
  const existsKey = `repo_exists:${owner}/${repo}`;
  const cachedExists = await redis.get<string>(existsKey);
  if (cachedExists === '0') {
    return { exists: false };
  }
  if (cachedExists === '1') {
    return { exists: true };
  }

  try {
    await octokit.rest.repos.get({ owner, repo });
    await redis.set(existsKey, '1', { ex: 3600 });
    return { exists: true };
  } catch (error: unknown) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 404) {
      await redis.set(existsKey, '0', { ex: 300 });
      return { exists: false };
    }
    return { exists: false, error: message };
  }
}

export async function scanRepository(job: JobData, data: PipelineData): Promise<void> {
  console.log(`[Pipeline] Step 0: Scanning ${job.owner}/${job.repo}`);
  const { data: repoData } = await octokit.rest.repos.get({ owner: job.owner, repo: job.repo });
  data.defaultBranch = repoData.default_branch || 'main';

  const { data: treeData } = await octokit.rest.git.getTree({
    owner: job.owner,
    repo: job.repo,
    tree_sha: repoData.default_branch,
    recursive: 'true'
  });

  const relevantFiles = (treeData.tree as RepoItem[]).filter((item) =>
    item.type === 'blob' &&
    item.path?.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
    (item.size || 0) < 1000000 &&
    !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|package-lock|bun\.lockb|yarn\.lock|pnpm-lock|\.min\.js|\.bundle\.js)\b/i) &&
    !item.path.includes('/components/ui/')
  );

  const groups: { [key: string]: RepoItem[] } = {};
  for (const file of relevantFiles) {
    if (!file.path) continue;
    const parts = file.path.split('/');
    const dir = (parts.length > 1 ? parts[0] : '.') || '.';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(file);
  }

  const sampledFiles: RepoItem[] = [];
  const dirs = Object.keys(groups);
  let index = 0;
  while (sampledFiles.length < 50 && dirs.length > 0) {
    const currentDir = dirs[index % dirs.length];
    if (!currentDir) {
      dirs.splice(index % dirs.length, 1);
      continue;
    }
    const file = (groups[currentDir] || []).shift();
    if (file) {
      sampledFiles.push(file);
    } else {
      dirs.splice(index % dirs.length, 1);
      continue;
    }
    index++;
  }

  const files: { path: string; content: string }[] = [];
  const concurrency = 10;
  const queueList = [...sampledFiles];
  const workers: Promise<void>[] = [];

  const worker = async () => {
    while (queueList.length > 0) {
      const file = queueList.shift();
      if (!file || !file.path) continue;
      try {
        const fileResponse = await octokit.rest.repos.getContent({
          owner: job.owner,
          repo: job.repo,
          path: file.path,
          mediaType: { format: 'raw' },
        });
        
        const rawData = fileResponse.data;
        const rawContent = typeof rawData === 'string'
          ? rawData
          : String(rawData);
          
        files.push({ path: file.path, content: rawContent });
      } catch {
        // skip
      }
    }
  };

  const { promise, resolve } = Promise.withResolvers<void>();
  
  for (let i = 0; i < Math.min(concurrency, sampledFiles.length); i++) {
    workers.push(worker());
  }
  
  Promise.all(workers).then(() => resolve());
  await promise;

  data.files = files;
  await queue.updateJob(job.id, { currentStep: 1, data: JSON.stringify(data) });
}

interface GitTreeBlobEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  content?: string;
  sha?: string | null;
}

export async function commitToGithub(job: JobData, data: PipelineData): Promise<void> {
  console.log(`[Pipeline] Step 3: Committing to GitHub for ${job.owner}/${job.repo}`);
  const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
  const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME || "";
  if (!docsRepoOwner) throw new Error("Missing DOCS_REPO_OWNER or GITHUB_USERNAME env variable");
  const docsPath = `docs/${job.owner}/${job.repo}`;

  const newBlobs: GitTreeBlobEntry[] = [{
    path: `${docsPath}/meta.json`,
    mode: '100644',
    type: 'blob',
    content: JSON.stringify({ 
      title: `${job.repo} Documentation`, 
      description: `Documentation for ${job.owner}/${job.repo}`, 
      icon: "book", 
      root: true,
      defaultBranch: data.defaultBranch || 'main'
    }, null, 2)
  }];

  for (const { filename, content } of data.generatedFiles) {
    newBlobs.push({ path: `${docsPath}/${filename}`, mode: '100644', type: 'blob', content });
  }

  const { data: refData } = await octokit.rest.git.getRef({ owner: docsRepoOwner, repo: docsRepo, ref: 'heads/main' });
  const { data: commitData } = await octokit.rest.git.getCommit({ owner: docsRepoOwner, repo: docsRepo, commit_sha: refData.object.sha });

  const { data: currentTree } = await octokit.rest.git.getTree({
    owner: docsRepoOwner,
    repo: docsRepo,
    tree_sha: commitData.tree.sha,
    recursive: 'true',
  });

  const newBlobPaths = new Set(newBlobs.map(b => b.path));
  const deletions: GitTreeBlobEntry[] = currentTree.tree
    .filter(item => item.path?.startsWith(`${docsPath}/`) && item.type === 'blob' && !newBlobPaths.has(item.path!))
    .map(item => ({ path: item.path!, mode: '100644', type: 'blob', sha: null }));

  const { data: newTree } = await octokit.rest.git.createTree({
    owner: docsRepoOwner,
    repo: docsRepo,
    base_tree: commitData.tree.sha,
    tree: [...deletions, ...newBlobs]
  });

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner: docsRepoOwner,
    repo: docsRepo,
    message: `GitDex Index: ${job.owner}/${job.repo}`,
    tree: newTree.sha,
    parents: [refData.object.sha]
  });

  await octokit.rest.git.updateRef({
    owner: docsRepoOwner,
    repo: docsRepo,
    ref: 'heads/main',
    sha: newCommit.sha
  });

  await redis.set(`last_indexed:${job.owner}/${job.repo}`, Date.now().toString());
  console.log(`[Pipeline] Wrote last_indexed timestamp for ${job.owner}/${job.repo}`);
}
