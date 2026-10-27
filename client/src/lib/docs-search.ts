import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { remarkHeading } from 'fumadocs-core/mdx-plugins';
import { DynamicDocsSource } from '@/lib/dynamic-source';

export interface DocumentationSearchResult {
  id: string;
  title: string;
  heading: string;
  url: string;
  excerpt: string;
}

interface SearchSection {
  id: string;
  title: string;
  heading: string;
  url: string;
  body: string;
}

interface TextNode {
  type: string;
  value?: string;
  children?: TextNode[];
}

function text(node: TextNode): string {
  return node.value ?? node.children?.map(text).join(' ') ?? '';
}

const indices = new Map<string, SearchSection[]>();
const processor = remark().use(remarkGfm).use(remarkHeading);

/** Only immutable, repository-scoped revisions are cached; no availability failures are cached. */
function buildIndex(owner: string, repo: string, source: DynamicDocsSource): SearchSection[] {
  const key = `${owner}/${repo}@${source.commitSha}`;
  const cached = source.commitSha ? indices.get(key) : undefined;
  if (cached) return cached;
  const sections: SearchSection[] = [];
  for (const page of source.getPages()) {
    const tree = processor.runSync(processor.parse(page.content));
    const pageUrl = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${page.url}`;
    let section: SearchSection = { id: pageUrl, title: page.title, heading: '', url: pageUrl, body: page.description ?? '' };
    sections.push(section);
    for (const node of tree.children) {
      if (node.type === 'heading') {
        const id = node.data?.hProperties?.id;
        const url = typeof id === 'string' ? `${pageUrl}#${encodeURIComponent(id)}` : pageUrl;
        section = { id: `${pageUrl}:${sections.length}`, title: page.title, heading: text(node), url, body: '' };
        sections.push(section);
      } else {
        section.body += ` ${text(node)}`;
      }
    }
  }
  if (source.commitSha) {
    if (indices.size >= 12) indices.delete(indices.keys().next().value!);
    indices.set(key, sections);
  }
  return sections;
}

export function searchDocumentation(owner: string, repo: string, source: DynamicDocsSource, query: string): DocumentationSearchResult[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return buildIndex(owner, repo, source).map(section => {
    const title = section.title.toLocaleLowerCase();
    const heading = section.heading.toLocaleLowerCase();
    const excerpt = section.body.replace(/\s+/g, ' ').trim();
    const body = excerpt.toLocaleLowerCase();
    const combined = `${title} ${heading} ${body}`;
    if (!terms.every(term => combined.includes(term))) return null;
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 6 : 0) + (heading.includes(term) ? 4 : 0) + (body.includes(term) ? 1 : 0), 0);
    const position = Math.max(0, Math.min(...terms.map(term => body.indexOf(term)).filter(index => index >= 0)) - 60);
    const start = Number.isFinite(position) ? position : 0;
    return { score, result: { id: section.id, title: section.title, heading: section.heading, url: section.url, excerpt: `${start > 0 ? '…' : ''}${excerpt.slice(start, start + 180)}${excerpt.length > start + 180 ? '…' : ''}` } };
  }).filter(entry => entry !== null).sort((a, b) => b.score - a.score).slice(0, 20).map(entry => entry.result);
}
