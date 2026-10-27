import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page';
import { notFound, redirect } from 'next/navigation';
import { remark } from 'remark';
import { compiler } from '@/lib/mdx-compiler';
import { getMDXComponents } from '@/mdx-components';
import { DynamicDocsSource } from '@/lib/dynamic-source';
import { SyncingGuard } from '@/components/syncing-guard';
import { DocsServiceError } from '@/components/docs-service-error';

interface PageProps {
  params: Promise<{ owner: string; repo: string; slug?: string[] }>;
}

export const dynamic = 'force-dynamic';

function startsWithTitle(content: string, title: string): boolean {
  const first = remark().parse(content).children[0];
  if (!first || first.type !== 'heading' || first.depth !== 1) return false;
  const text = (node: { value?: string; children?: readonly unknown[] }): string =>
    node.value ?? node.children?.map(child => text(child as { value?: string; children?: readonly unknown[] })).join('') ?? '';
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  return normalize(text(first)) === normalize(title);
}

export default async function Page({ params }: PageProps) {
  const { owner, repo, slug = [] } = await params;
  const source = new DynamicDocsSource(owner, repo);
  try {
    await source.initialize();
  } catch {
    return <DocsServiceError owner={owner} repo={repo} />;
  }

  const firstPage = source.getFirstPage();
  if (!firstPage) return <SyncingGuard owner={owner} repo={repo} />;
  if (slug.length === 0) redirect(`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${firstPage.url}`);

  const page = source.getPage(slug);
  if (!page) notFound();

  const compiled = await compiler.compile({ source: page.content });
  const Content = compiled.body;
  return (
    <DocsPage toc={compiled.toc}>
      {!startsWithTitle(page.content, page.title) && (
        <>
          <DocsTitle>{page.title}</DocsTitle>
          {page.description && <DocsDescription>{page.description}</DocsDescription>}
        </>
      )}
      <DocsBody><Content components={getMDXComponents()} /></DocsBody>
    </DocsPage>
  );
}
