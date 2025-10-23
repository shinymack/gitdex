import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { notFound, redirect } from 'next/navigation';
import { compiler } from '@/lib/mdx-compiler';
import { getMDXComponents } from '@/mdx-components';
import { DynamicDocsSource } from '@/lib/dynamic-source';
import { getTableOfContents } from 'fumadocs-core/content/toc';
import 'mermaid';

interface PageProps {
  params: Promise<{
    owner: string;
    repo: string;
    slug?: string[];
  }>;
}

export default async function Page({ params }: PageProps) {
  // Await the params before using their properties
  const { owner, repo, slug = [] } = await params;
  
  // If no slug is provided (visiting /docs/owner/repo), redirect to first page
  if (slug.length === 0) {
    const source = new DynamicDocsSource(owner, repo);
    await source.initialize();
    
    const firstPage = source.getFirstPage();
    
    if (firstPage) {
      redirect(`/docs/${owner}/${repo}${firstPage.url}`);
    } else {
      notFound();
    }
  }
  
  // Normal page rendering for specific slugs
  const source = new DynamicDocsSource(owner, repo);
  await source.initialize();
  
  const page = source.getPage(slug);
  
  if (!page) {
    notFound();
  }

  // Extract MDX content without frontmatter
  const mdxContent = page.content.replace(/^---\s*\n([\s\S]*?)\n---/, '').trim();
  
  // Generate table of contents from the MDX content
  const toc = getTableOfContents(mdxContent.replace(/^---\s*\n([\s\S]*?)\n---/, ''));

  // Compile MDX content
  const compiled = await compiler.compile({
    source: mdxContent.trim(),
  });
  
  const MdxContent = compiled.body;
  
  return (
    <DocsPage full={page.url === '/'}
    toc={toc}>
      <DocsBody>
        <MdxContent components={getMDXComponents({})} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return [];
}
