import type * as PageTree from 'fumadocs-core/page-tree';
import matter from 'gray-matter';
import { getGithubDocs } from './github';

export interface Frontmatter {
  title?: string;
  description?: string;
  sidebar_position?: number;
}

export interface DocPage {
  url: string;
  name: string;
  title: string;
  description?: string;
  content: string;
  frontmatter: Frontmatter;
  slugs: string[];
  sidebar_position: number;
}

/** Strip only complete, leading YAML blocks, including legacy duplicate blocks. */
export function parseDocument(content: string): { content: string; frontmatter: Frontmatter } {
  let body = content.replace(/^\uFEFF/, '').trimStart();
  let data: Record<string, unknown> = {};
  while (/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(body)) {
    const block = body.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)![0];
    try {
      const parsed = matter(block);
      data = { ...data, ...parsed.data };
    } catch {
      throw new Error('A published documentation page has invalid frontmatter.');
    }
    body = body.slice(block.length).trimStart();
  }
  const position = Number(data.sidebar_position);
  return {
    content: body,
    frontmatter: {
      title: typeof data.title === 'string' ? data.title : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      sidebar_position: Number.isFinite(position) ? position : undefined,
    },
  };
}

export class DynamicDocsSource {
  private pages: DocPage[] = [];
  public meta: Record<string, unknown> = {};
  public commitSha?: string;

  constructor(private owner: string, private repo: string) {}

  async initialize() {
    const docs = await getGithubDocs(this.owner, this.repo);
    this.meta = docs.meta;
    this.commitSha = docs.commitSha;
    this.pages = docs.files.filter(file => /\.(mdx|md)$/.test(file.path)).map(file => {
      const name = file.path.replace(/\.(mdx|md)$/, '');
      const slugs = name.split('/');
      if (slugs.some(slug => !slug || slug === '.' || slug === '..')) {
        throw new Error('The published guide contains an invalid page path.');
      }
      const { content, frontmatter } = parseDocument(file.content);
      return {
        url: `/${slugs.map(encodeURIComponent).join('/')}`,
        name,
        slugs,
        title: frontmatter.title || name.split('/').at(-1)!.replace(/^\d+(?:\.\d+)?[_-]/, '').replace(/[-_]/g, ' '),
        description: frontmatter.description,
        sidebar_position: frontmatter.sidebar_position ?? 999,
        content,
        frontmatter,
      };
    }).sort((a, b) => a.sidebar_position - b.sidebar_position || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  getPage(slugs: string[] = []): DocPage | null {
    return this.pages.find(page => page.slugs.length === slugs.length && page.slugs.every((slug, index) => slug === slugs[index])) ?? null;
  }

  getFirstPage(): DocPage | null { return this.pages[0] ?? null; }
  getPages(): readonly DocPage[] { return this.pages; }

  getPageTree(): PageTree.Root {
    const pageNode = (page: DocPage): PageTree.Item => ({
      type: 'page', name: page.title, url: `/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${page.url}`,
    });
    const children: PageTree.Node[] = [];
    const grouped = new Set<DocPage>();
    for (const page of this.pages) {
      if (grouped.has(page)) continue;
      const prefix = page.slugs.at(-1)?.match(/^(\d+)[_-]/)?.[1];
      const subpages = prefix ? this.pages.filter(child => child !== page && child.slugs.at(-1)?.startsWith(`${prefix}.`)) : [];
      if (subpages.length) {
        subpages.forEach(child => grouped.add(child));
        children.push({ type: 'folder', name: page.title, index: pageNode(page), children: subpages.map(pageNode) });
      } else {
        children.push(pageNode(page));
      }
    }
    return { name: `${this.owner}/${this.repo}`, children };
  }
}
