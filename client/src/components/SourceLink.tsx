import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

export interface GitHubSourceReference {
  href: string;
  owner: string;
  repo: string;
  /** Kept together because branch names may themselves contain slashes. */
  refAndPath: string;
  startLine?: number;
  endLine?: number;
}

export function parseGitHubSourceHref(href: string | undefined): GitHubSourceReference | null {
  if (!href) return null;
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (url.protocol !== 'https:' || !['github.com', 'www.github.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
  const parts = url.pathname.split('/').slice(1);
  const [owner, repo, kind, ...refAndPath] = parts;
  if (kind !== 'blob' || !owner || !repo || ![owner, repo].every(value => /^[A-Za-z0-9_.-]+$/.test(value)) || refAndPath.length < 2) return null;
  try {
    if (parts.some(part => { const value = decodeURIComponent(part); return !value || value === '.' || value === '..' || /[\\\u0000-\u001f]/.test(value); })) return null;
  } catch { return null; }
  const lines = url.hash.match(/^#L([1-9]\d*)(?:-L([1-9]\d*))?$/);
  if (url.hash && !lines) return null;
  const startLine = lines ? Number(lines[1]) : undefined;
  const endLine = lines ? Number(lines[2] ?? lines[1]) : undefined;
  if (startLine && (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || endLine! < startLine)) return null;
  return { href: url.href, owner, repo, refAndPath: refAndPath.join('/'), startLine, endLine };
}

/** A real hyperlink: labels never determine the repository, revision, path, or lines. */
export function SourceLink({ source, children, title }: { source: GitHubSourceReference; children?: ReactNode; title?: string }) {
  return (
    <a href={source.href} target="_blank" rel="noopener noreferrer" title={title || `Source in ${source.owner}/${source.repo}`} className="inline-flex items-baseline gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[0.9em] text-primary no-underline hover:border-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <span>{children ?? source.refAndPath}</span><ExternalLink aria-hidden="true" className="inline size-3 shrink-0 self-center" />
    </a>
  );
}
