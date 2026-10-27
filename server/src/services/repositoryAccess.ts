import { publicOctokit } from '../config/octokit.js';

export function parseRepositoryUrl(value: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !['github.com', 'www.github.com'].includes(url.hostname) || url.port || url.username || url.password) return null;
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')) return null;
    const repo = parts[1]!.replace(/\.git$/i, '');
    return repo ? { owner: parts[0]!, repo } : null;
  } catch { return null; }
}

export async function getPublicRepository(owner: string, repo: string, signal?: AbortSignal) {
  if (![owner, repo].every(value => /^[A-Za-z0-9_.-]+$/.test(value)) || [owner, repo].some(value => value === '.' || value === '..')) throw new Error('A public GitHub repository is required.');
  const { data } = await publicOctokit.rest.repos.get({ owner, repo, request: { signal } });
  if (data.private || data.visibility !== 'public') throw new Error('This public repository is unavailable.');
  return data;
}

export async function readPublicFile(owner: string, repo: string, sha: string, path: string, signal?: AbortSignal): Promise<string> {
  if (!/^[a-f0-9]{40}$/i.test(sha) || path.startsWith('/') || path.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Invalid source reference.');
  // The raw public endpoint cannot use the privileged documentation writer token.
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${sha}/${encoded}`, { signal: signal || AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('The public source file is unavailable.');
  const maxBytes = 200000;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The source file has no content.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('The source file exceeds the reading limit.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
