import type * as PageTree from 'fumadocs-core/page-tree';
import { getGithubDocs } from './github';

export interface Frontmatter {
    [key: string]: string | undefined;
    title?: string;
    description?: string;
    sidebar_position?: string;
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

export class DynamicDocsSource {
    private pages: DocPage[] = [];
    private pageTree: PageTree.Root;
    private owner: string;
    private repo: string;

    constructor(owner: string, repo: string) {
        this.owner = owner;
        this.repo = repo;
        this.pageTree = {
            name: 'root',
            children: []
        };
    }

    async initialize() {
        const docs = await getGithubDocs(this.owner, this.repo);

        this.pages = docs.files
            .filter(file => file.path.endsWith('.mdx') && !file.path.includes('meta.json'))
            .map(file => {
                const filename = file.path.replace(/^docs\/[^\/]+\//, '').replace('.mdx', '');
                const slugs = [filename];
                const urlPath = filename;

                const frontmatter = this.extractFrontmatter(file.content);
                const sidebar_position = frontmatter.sidebar_position ?
                    parseFloat(frontmatter.sidebar_position) : 999;

                return {
                    url: `/${urlPath}`,
                    name: filename,
                    title: frontmatter.title || this.formatTitleFromFilename(filename),
                    description: frontmatter.description,
                    content: file.content,
                    frontmatter,
                    slugs,
                    sidebar_position
                };
            });

        this.pages.sort((a, b) => a.sidebar_position - b.sidebar_position);
        this.pageTree = this.generateHierarchicalPageTree();
    }

    getPage(slugs: string[] = []): DocPage | null {
        const url = '/' + slugs.join('/');
        const page = this.pages.find(page => page.url === url);
        return page || null;
    }

    getFirstPage(): DocPage | null {
        return this.pages.length > 0 ? this.pages[0] : null;
    }

    getPageTree(): PageTree.Root {
        return this.pageTree;
    }

    private extractFrontmatter(content: string): Frontmatter {
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) return {};

        try {
            const frontmatter: Frontmatter = {};
            const lines = frontmatterMatch[1].split('\n');

            for (const line of lines) {
                const [key, ...rest] = line.split(':');
                if (key && rest.length > 0) {
                    const value = rest.join(':').trim();
                    frontmatter[key.trim()] = value.replace(/^["']|["']$/g, '');
                }
            }

            return frontmatter;
        } catch {
            return {};
        }
    }

    private generateHierarchicalPageTree(): PageTree.Root {
        const topLevelPages: DocPage[] = [];
        const subPagesMap = new Map<string, DocPage[]>();

        this.pages.forEach(page => {
            const filename = page.slugs[page.slugs.length - 1] || '';
            const prefixMatch = filename.match(/^(\d+)\.(\d+)/);

            if (prefixMatch) {
                const topLevelPrefix = prefixMatch[1];
                if (!subPagesMap.has(topLevelPrefix)) {
                    subPagesMap.set(topLevelPrefix, []);
                }
                subPagesMap.get(topLevelPrefix)!.push(page);
            } else {
                topLevelPages.push(page);
            }
        });

        topLevelPages.sort((a, b) => a.sidebar_position - b.sidebar_position);
        subPagesMap.forEach(subPages => {
            subPages.sort((a, b) => a.sidebar_position - b.sidebar_position);
        });

        const children: PageTree.Node[] = [];

        topLevelPages.forEach(topLevelPage => {
            const topLevelPrefix = topLevelPage.slugs[topLevelPage.slugs.length - 1]?.match(/^(\d+)/)?.[1];
            const subPages = topLevelPrefix ? subPagesMap.get(topLevelPrefix) || [] : [];

            if (subPages.length > 0) {
                const folderChildren: PageTree.Node[] = subPages.map(subPage => ({
                    type: 'page',
                    name: subPage.title,
                    url: `/${this.owner}/${this.repo}${subPage.url}`,
                }));

                children.push({
                    type: 'folder',
                    name: topLevelPage.title,
                    index: {
                        type: 'page',
                        name: topLevelPage.title,
                        url: `/${this.owner}/${this.repo}${topLevelPage.url}`,
                    },
                    children: folderChildren,
                });
            } else {
                children.push({
                    type: 'page',
                    name: topLevelPage.title,
                    url: `/${this.owner}/${this.repo}${topLevelPage.url}`,
                });
            }
        });

        return {
            name: 'root',
            children,
        };
    }

    private formatTitleFromFilename(filename: string): string {
        const withoutPrefix = filename.replace(/^\d+(\.\d+)?_/, '');
        return withoutPrefix
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}