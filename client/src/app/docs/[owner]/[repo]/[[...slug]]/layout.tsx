import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { DynamicDocsSource } from '@/lib/dynamic-source';
import { baseOptions } from '@/lib/layout.shared';
import { ReindexButton } from '@/src/components/ReindexButton';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    owner: string;
    repo: string;
  }>;
};

export default async function Layout({ children, params }: LayoutProps) {
  // Await the params before using their properties
  const { owner, repo } = await params;

  const source = new DynamicDocsSource(owner, repo);
  await source.initialize();
  const base = baseOptions();
  const pageTree = source.getPageTree();

  return (
    <DocsLayout
      tree={pageTree}
      sidebar={{
        banner: (
          <div className="flex flex-col gap-2 p-4 border-b border-border">
            <div className="text-sm text-muted-foreground">
              Documentation for <strong className="text-foreground">{owner}/{repo}</strong>
            </div>
            <ReindexButton owner={owner} repo={repo} />
          </div>
        ),
        defaultOpenLevel: 10,
        collapsible: false

      }}
      nav={{
        ...base.nav,
        enabled: true,
      }}
      links={base.links}
    >
      {children}
    </DocsLayout>
  );
}