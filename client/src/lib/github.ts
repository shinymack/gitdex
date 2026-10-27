import { Octokit } from '@octokit/rest';
import { cache } from 'react';

export interface DocFile { path: string; content: string }
export interface DocsStructure { index: string; meta: Record<string, unknown>; files: DocFile[]; commitSha?: string }

export const getGithubDocs = cache(async (owner: string, repo: string): Promise<DocsStructure> => {
  if (![owner, repo].every(value => /^[A-Za-z0-9_.-]+$/.test(value)) || [owner, repo].some(value => value === '.' || value === '..')) throw new Error('Invalid repository identity.');
  const docsOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME;
  const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
  const branch = process.env.DOCS_REPO_BRANCH || 'main';
  if (!docsOwner) throw new Error('The documentation store is not configured.');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  let commit;
  try {
    commit = (await octokit.rest.repos.getCommit({ owner: docsOwner, repo: docsRepo, ref: branch })).data;
  } catch {
    throw new Error('The documentation store is unavailable. Try again shortly.');
  }
  const tree = (await octokit.rest.git.getTree({ owner: docsOwner, repo: docsRepo, tree_sha: commit.commit.tree.sha, recursive: 'true' })).data;
  if (tree.truncated) throw new Error('The documentation index is too large to load completely.');
  const requestedRoot = `docs/${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const directories = new Set<string>();
  for (const entry of tree.tree) {
    const path = entry.path;
    if (!path?.startsWith('docs/')) continue;
    const candidate = path.slice(0, requestedRoot.length);
    if (candidate.toLowerCase() !== requestedRoot) continue;
    if (path.length === requestedRoot.length ? entry.type !== 'tree' : path[requestedRoot.length] !== '/') continue;
    directories.add(`${candidate}/`);
  }
  if (directories.size > 1) throw new Error('Multiple documentation folders match this repository. The documentation store must resolve the conflicting folders.');
  const prefix = directories.values().next().value;
  if (!prefix) return { index: '', meta: {}, files: [], commitSha: commit.sha };
  const entries = tree.tree.filter(item => item.type === 'blob' && item.path?.startsWith(prefix) && (/\.mdx?$/i.test(item.path) || item.path === `${prefix}meta.json`));
  const headers: HeadersInit = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const files = await Promise.all(entries.map(async entry => {
    const path = entry.path!;
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(docsOwner)}/${encodeURIComponent(docsRepo)}/${commit.sha}/${encoded}`, { headers, cache: 'force-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('A published documentation file could not be loaded. Try again.');
    return { path: path.slice(prefix.length), content: await response.text() };
  }));
  const metadata = files.find(file => file.path === 'meta.json');
  let meta: Record<string, unknown> = {};
  if (metadata) {
    try { meta = JSON.parse(metadata.content); } catch { throw new Error('The published guide metadata is invalid.'); }
  }
  return { index: '', meta: { ...meta, docsCommitSha: commit.sha }, files: files.filter(file => file.path !== 'meta.json'), commitSha: commit.sha };
});
