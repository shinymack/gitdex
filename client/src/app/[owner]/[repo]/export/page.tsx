import { DynamicDocsSource } from '@/lib/dynamic-source';
import { compiler } from '@/lib/mdx-compiler';
import { getMDXComponents } from '../../../../../mdx-components';
import { SyncingGuard } from '@/components/syncing-guard';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ owner: string; repo: string }>;
}

function stripFrontmatter(content: string): string {
  let text = content.trim();
  while (text.startsWith('---')) {
    const closeIndex = text.indexOf('---', 3);
    if (closeIndex === -1) break;
    text = text.slice(closeIndex + 3).trim();
  }
  return text;
}

export default async function ExportPage({ params }: PageProps) {
  const { owner, repo } = await params;

  const source = new DynamicDocsSource(owner, repo);
  await source.initialize();
  const pages = source.getPages();

  if (pages.length === 0) {
    return <SyncingGuard owner={owner} repo={repo} />;
  }

  const compiledPages = await Promise.all(
    pages.map(async (page) => {
      const mdxContent = stripFrontmatter(page.content);
      const compiled = await compiler.compile({ source: mdxContent });
      return { page, Body: compiled.body };
    })
  );

  return (
    <>
      <PrintButton owner={owner} repo={repo} pageCount={pages.length} />

      <div className="max-w-4xl mx-auto px-6 py-8 print:px-0 print:py-0 print:max-w-none">
        {compiledPages.map(({ page, Body }, index) => (
          <div
            key={page.url}
            className="doc-section"
            style={index < compiledPages.length - 1 ? { pageBreakAfter: 'always' } : undefined}
          >
            <Body components={getMDXComponents({})} />
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .doc-section { page-break-after: always; }
          pre { page-break-inside: avoid; }
          .mermaid-pan-zoom-container { page-break-inside: avoid; }
          header, nav, aside, footer { display: none !important; }
        }
      `}</style>
    </>
  );
}

export function generateStaticParams() {
  return [];
}
