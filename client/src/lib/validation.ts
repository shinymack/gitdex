export interface GitHubRepository { owner: string; repo: string; repoUrl: string }

export function parseGitHubRepository(value: string): GitHubRepository {
  let input = value.trim();
  if (!input) throw new Error('Enter a public GitHub repository.');
  if (/^(?:www\.)?github\.com\//i.test(input)) input = `https://${input}`;
  else if (!/^[a-z][a-z\d+.-]*:/i.test(input)) input = `https://github.com/${input}`;
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Enter a GitHub repository URL or owner/repository.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['github.com', 'www.github.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Use a repository hosted on github.com.');
  const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')) throw new Error('Use the repository root, not a file, branch, or issue URL.');
  const [owner, name] = parts;
  const repo = name.replace(/\.git$/i, '');
  if (!repo) throw new Error('Include the repository name.');
  return { owner, repo, repoUrl: `https://github.com/${owner}/${repo}` };
}
