import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { redirect } from 'next/navigation';
import { compiler } from '@/lib/mdx-compiler';
import { getMDXComponents } from '@/mdx-components';
import { DynamicDocsSource } from '@/lib/dynamic-source';
import { getTableOfContents } from 'fumadocs-core/content/toc';
import { SyncingGuard } from '@/components/syncing-guard';
import 'mermaid';

interface PageProps {
  params: Promise<{
    owner: string;
    repo: string;
    slug?: string[];
  }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Strips ALL leading frontmatter blocks from raw MDX content.
 * Loops until no more --- blocks remain at the top, handling the case
 * where the model generates double/empty frontmatter that would otherwise
 * leave raw YAML text in the compiled MDX body and crash the JSX parser.
 */
function stripFrontmatter(content: string): string {
  let text = content.trim();

  while (text.startsWith('---')) {
    const closeIndex = text.indexOf('---', 3);
    if (closeIndex === -1) break;
    text = text.slice(closeIndex + 3).trim();
  }

  return text;
}

export default async function Page({ params }: PageProps) {
  const { owner, repo, slug = [] } = await params;

  if (slug.length === 0) {
    const source = new DynamicDocsSource(owner, repo);
    await source.initialize();

    const firstPage = source.getFirstPage();

    if (firstPage) {
      redirect(`/${owner}/${repo}${firstPage.url}`);
    } else {
      return <SyncingGuard owner={owner} repo={repo} />;
    }
  }

  const source = new DynamicDocsSource(owner, repo);
  await source.initialize();

  const page = source.getPage(slug);

  if (!page) {
    return <SyncingGuard owner={owner} repo={repo} />;
  }

  const mdxContent = stripFrontmatter(page.content);
  const toc = getTableOfContents(mdxContent);

  const compiled = await compiler.compile({
    source: mdxContent,
  });

  const MdxContent = compiled.body;

  return (
    <DocsPage full={page.url === '/'} toc={toc}>
      <DocsBody>
        <MdxContent components={getMDXComponents({})} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return [];
}
