import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { DynamicDocsSource } from '@/lib/dynamic-source';
import { baseOptions } from '@/lib/layout.shared';
import { ReindexButton } from '@/components/ReindexButton';
import { DocsSearch } from '@/components/docs-search';
import { DocsServiceError } from '@/components/docs-service-error';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ owner: string; repo: string }>;
}

function GuideProvenance({ meta, owner, repo }: { meta: Record<string, unknown>; owner: string; repo: string }) {
  const sourceSha = typeof meta.sourceSha === 'string' && /^[a-f\d]{7,64}$/i.test(meta.sourceSha) ? meta.sourceSha : null;
  const docsSha = typeof meta.docsCommitSha === 'string' ? meta.docsCommitSha : null;
  const generator = typeof meta.generatorVersion === 'string' ? meta.generatorVersion : null;
  const coverage = meta.coverage && typeof meta.coverage === 'object' ? meta.coverage as Record<string, unknown> : null;
  const counts = coverage ? ['treeFiles', 'eligibleFiles', 'selectedFiles', 'readFiles', 'omittedFiles'].filter(key => typeof coverage[key] === 'number' && Number.isFinite(coverage[key])) : [];
  const labels: Record<string, string> = { treeFiles: 'Files in tree', eligibleFiles: 'Eligible files', selectedFiles: 'Selected files', readFiles: 'Files read', omittedFiles: 'Files omitted' };
  return (
    <details className="w-full text-xs text-muted-foreground">
      <summary className="cursor-pointer py-2 text-foreground underline-offset-4 hover:underline">Guide provenance and coverage</summary>
      <dl className="mt-2 space-y-3 break-words leading-5">
        <div><dt>Source revision</dt><dd className="text-foreground">{sourceSha ? <a href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${sourceSha}`} target="_blank" rel="noopener noreferrer" className="font-mono underline underline-offset-4">{sourceSha.slice(0, 12)}</a> : 'Not recorded in this guide'}</dd></div>
        {docsSha && <div><dt>Documentation revision</dt><dd className="font-mono text-foreground" title={docsSha}>{docsSha.slice(0, 12)}</dd></div>}
        <div><dt>Generator</dt><dd className="text-foreground">{generator || 'Not recorded in this guide'}</dd></div>
        {counts.map(key => <div key={key} className="flex justify-between gap-3"><dt>{labels[key]}</dt><dd className="text-foreground">{String(coverage![key])}</dd></div>)}
      </dl>
      {!coverage && <p className="mt-3 leading-5">This guide predates recorded scan coverage. It may not describe every file.</p>}
      {coverage?.sampled === true && <p className="mt-3 leading-5">This guide uses a selected subset of repository files, not an exhaustive scan.</p>}
      {coverage?.treeTruncated === true && <p className="mt-3 leading-5">GitHub returned a truncated file tree; additional files may be missing.</p>}
    </details>
  );
}

export default async function Layout({ children, params }: LayoutProps) {
  const { owner, repo } = await params;
  const source = new DynamicDocsSource(owner, repo);
  try {
    await source.initialize();
  } catch {
    return (
      <main className="min-h-dvh bg-background text-foreground">
        <header className="flex items-center justify-between border-b border-border px-6 py-5"><Brand /><ThemeToggle /></header>
        <DocsServiceError owner={owner} repo={repo} />
      </main>
    );
  }
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      sidebar={{
        banner: (
          <div className="flex flex-col gap-4 border-b border-border pb-5 pt-3">
            <a href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`} target="_blank" rel="noopener noreferrer" className="break-all text-sm font-medium text-foreground underline-offset-4 hover:underline">{owner}/{repo}</a>
            {source.getFirstPage() && <DocsSearch owner={owner} repo={repo} />}
            {source.getFirstPage() && <ReindexButton owner={owner} repo={repo} />}
          </div>
        ),
        footer: <div className="flex w-full flex-col gap-4">{source.getFirstPage() && <GuideProvenance meta={source.meta} owner={owner} repo={repo} />}<ThemeToggle className="w-full" /></div>,
        defaultOpenLevel: 10,
        collapsible: false,
        tabs: false,
      }}
    >
      {children}
    </DocsLayout>
  );
}
