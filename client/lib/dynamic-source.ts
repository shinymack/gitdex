// import type * as PageTree from 'fumadocs-core/page-tree';
// import { useDocsStore } from './docs-store';

// // Define a proper type for frontmatter
// export interface Frontmatter {
//   [key: string]: string | undefined;
//   title?: string;
//   description?: string;
//   sidebar_position?: string;
// }

// export interface DocPage {
//   url: string;
//   name: string;
//   title: string;
//   description?: string;
//   content: string;
//   frontmatter: Frontmatter;
//   slugs: string[];
//   sidebar_position: number;
// }

// export class DynamicDocsSource {
//   private pages: DocPage[] = [];
//   private pageTree: PageTree.Root;
//   private owner: string;
//   private repo: string;

//   constructor(owner: string, repo: string) {
//     this.owner = owner;
//     this.repo = repo;
//     // Initialize with a proper PageTree.Root object
//     this.pageTree = {
//       name: 'root',
//       children: []
//     };
//   }

//   async initialize() {
//     console.log(`Initializing DynamicDocsSource for ${this.owner}/${this.repo}`);
//     const { getDocs } = useDocsStore.getState();
//     const docs = await getDocs(this.owner, this.repo);
    
//     console.log(`Got docs structure with ${docs.files.length} files`);
    
//     // Convert files to page structure - only process MDX files
//     this.pages = docs.files
//       .filter(file => file.path.endsWith('.mdx') && !file.path.includes('meta.json'))
//       .map(file => {
//         // Extract the filename without extension
//         const filename = file.path.replace(/^docs\/[^\/]+\//, '').replace('.mdx', '');
        
//         // Convert to slug format - keep the full filename as the slug
//         const slugs = [filename];
//         const urlPath = filename;
        
//         const frontmatter = this.extractFrontmatter(file.content);
        
//         // Extract sidebar_position from frontmatter
//         const sidebar_position = frontmatter.sidebar_position ? 
//           parseFloat(frontmatter.sidebar_position) : 999;
        
//         const page = {
//           url: `/${urlPath}`,
//           name: filename,
//           title: frontmatter.title || this.formatTitleFromFilename(filename),
//           description: frontmatter.description,
//           content: file.content,
//           frontmatter,
//           slugs,
//           sidebar_position
//         };
        
//         return page;
//       });

//     // Sort pages by sidebar_position
//     this.pages.sort((a, b) => a.sidebar_position - b.sidebar_position);
    
//     // Generate hierarchical page tree
//     this.pageTree = this.generateHierarchicalPageTree();
//     console.log(`Generated hierarchical page tree`);
//   }

//   getPage(slugs: string[] = []): DocPage | null {
//     const url = '/' + slugs.join('/');
//     console.log(`Looking for page with URL: ${url}`);
//     console.log(`Available URLs: ${this.pages.map(p => p.url).join(', ')}`);
    
//     const page = this.pages.find(page => page.url === url);
//     console.log(`Found page: ${!!page}`);
//     return page || null;
//   }

//   getFirstPage(): DocPage | null {
//     // Return the page with the lowest sidebar_position
//     return this.pages.length > 0 ? this.pages[0] : null;
//   }

//   getPageTree(): PageTree.Root {
//     return this.pageTree;
//   }

//   private extractFrontmatter(content: string): Frontmatter {
//     const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
//     if (!frontmatterMatch) return {};
    
//     try {
//       const frontmatter: Frontmatter = {};
//       const lines = frontmatterMatch[1].split('\n');
      
//       for (const line of lines) {
//         const [key, ...rest] = line.split(':');
//         if (key && rest.length > 0) {
//           const value = rest.join(':').trim();
//           frontmatter[key.trim()] = value.replace(/^["']|["']$/g, '');
//         }
//       }
      
//       return frontmatter;
//     } catch {
//       return {};
//     }
//   }

//   private formatTitle(slug: string): string {
//     return slug
//       .split(/[-_]/)
//       .map(word => word.charAt(0).toUpperCase() + word.slice(1))
//       .join(' ');
//   }

//   private generateHierarchicalPageTree(): PageTree.Root {
//     console.log(`Generating hierarchical page tree from ${this.pages.length} pages`);
    
//     // Group pages by their hierarchy level
//     const topLevelPages: DocPage[] = [];
//     const subPagesMap = new Map<string, DocPage[]>();
    
//     // Separate top-level pages and sub-pages based on naming convention
//     this.pages.forEach(page => {
//       const filename = page.slugs[page.slugs.length - 1] || '';
      
//       // Check if it's a sub-page (has decimal in the prefix)
//       const prefixMatch = filename.match(/^(\d+)\.(\d+)/);
      
//       if (prefixMatch) {
//         // This is a sub-page
//         const topLevelPrefix = prefixMatch[1];
        
//         if (!subPagesMap.has(topLevelPrefix)) {
//           subPagesMap.set(topLevelPrefix, []);
//         }
//         subPagesMap.get(topLevelPrefix)!.push(page);
//       } else {
//         // This is a top-level page
//         topLevelPages.push(page);
//       }
//     });
    
//     // Sort top-level pages by sidebar_position
//     topLevelPages.sort((a, b) => a.sidebar_position - b.sidebar_position);
    
//     // Sort sub-pages within each group
//     subPagesMap.forEach(subPages => {
//       subPages.sort((a, b) => a.sidebar_position - b.sidebar_position);
//     });
    
//     // Create the hierarchical tree
//     const children: PageTree.Node[] = [];
    
//     // Add top-level pages and their sub-pages
//     topLevelPages.forEach(topLevelPage => {
//       const topLevelPrefix = topLevelPage.slugs[topLevelPage.slugs.length - 1]?.match(/^(\d+)/)?.[1];
      
//       // Get sub-pages for this top-level page
//       const subPages = topLevelPrefix ? subPagesMap.get(topLevelPrefix) || [] : [];
      
//       if (subPages.length > 0) {
//         // Create a folder with the top-level page as index and sub-pages as children
//         const folderChildren: PageTree.Node[] = subPages.map(subPage => ({
//           type: 'page',
//           name: subPage.title,
//           url: `/docs/${this.owner}/${this.repo}${subPage.url}`,
//         }));
        
//         children.push({
//           type: 'folder',
//           name: topLevelPage.title,
//           index: {
//             type: 'page',
//             name: topLevelPage.title,
//             url: `/docs/${this.owner}/${this.repo}${topLevelPage.url}`,
//           },
//           children: folderChildren,
//         });
//       } else {
//         // Just add the top-level page directly
//         children.push({
//           type: 'page',
//           name: topLevelPage.title,
//           url: `/docs/${this.owner}/${this.repo}${topLevelPage.url}`,
//         });
//       }
//     });
    
//     return {
//       name: 'root',
//       children,
//     };
//   }

//   private formatTitleFromFilename(filename: string): string {
//     // Remove the numeric prefix and format the title
//     const withoutPrefix = filename.replace(/^\d+(\.\d+)?_/, '');
//     return withoutPrefix
//       .split(/[-_]/)
//       .map(word => word.charAt(0).toUpperCase() + word.slice(1))
//       .join(' ');
//   }
// }

import type * as PageTree from 'fumadocs-core/page-tree';
import { useDocsStore } from './docs-store';

// Define a proper type for frontmatter
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
  // Add this to track initialized pages for Vercel
  private initializedPages = new Set<string>();

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    // Initialize with a proper PageTree.Root object
    this.pageTree = {
      name: 'root',
      children: []
    };
  }

  async initialize() {
    console.log(`Initializing DynamicDocsSource for ${this.owner}/${this.repo}`);
    const { getDocs } = useDocsStore.getState();
    const docs = await getDocs(this.owner, this.repo);
    
    console.log(`Got docs structure with ${docs.files.length} files`);
    
    // Convert files to page structure - only process MDX files
    this.pages = docs.files
      .filter(file => file.path.endsWith('.mdx') && !file.path.includes('meta.json'))
      .map(file => {
        // Extract the filename without extension
        const filename = file.path.replace(/^docs\/[^\/]+\//, '').replace('.mdx', '');
        
        // Convert to slug format - keep the full filename as the slug
        const slugs = [filename];
        const urlPath = filename;
        
        const frontmatter = this.extractFrontmatter(file.content);
        
        // Extract sidebar_position from frontmatter
        const sidebar_position = frontmatter.sidebar_position ? 
          parseFloat(frontmatter.sidebar_position) : 999;
        
        const page = {
          url: `/${urlPath}`,
          name: filename,
          title: frontmatter.title || this.formatTitleFromFilename(filename),
          description: frontmatter.description,
          content: file.content,
          frontmatter,
          slugs,
          sidebar_position
        };
        
        return page;
      });

    // Sort pages by sidebar_position
    this.pages.sort((a, b) => a.sidebar_position - b.sidebar_position);
    
    // Generate hierarchical page tree
    this.pageTree = this.generateHierarchicalPageTree();
    
    // Pre-load all pages to prevent lazy loading on Vercel
    this.pages.forEach(page => {
      this.initializedPages.add(page.url);
    });
    
    console.log(`Generated hierarchical page tree with ${this.pages.length} pages`);
  }

  getPage(slugs: string[] = []): DocPage | null {
    const url = '/' + slugs.join('/');
    console.log(`Looking for page with URL: ${url}`);
    console.log(`Available URLs: ${this.pages.map(p => p.url).join(', ')}`);
    
    const page = this.pages.find(page => page.url === url);
    
    // Track page access for Vercel
    if (page && !this.initializedPages.has(page.url)) {
      this.initializedPages.add(page.url);
    }
    
    console.log(`Found page: ${!!page}`);
    return page || null;
  }

  getFirstPage(): DocPage | null {
    if (this.pages.length === 0) return null;
    
    // Find the page with lowest sidebar_position
    return this.pages.reduce((first, current) => 
      current.sidebar_position < first.sidebar_position ? current : first
    );
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

  private formatTitle(slug: string): string {
    return slug
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private generateHierarchicalPageTree(): PageTree.Root {
    console.log(`Generating hierarchical page tree from ${this.pages.length} pages`);
    
    // Group pages by their hierarchy level
    const topLevelPages: DocPage[] = [];
    const subPagesMap = new Map<string, DocPage[]>();
    
    // Separate top-level pages and sub-pages based on naming convention
    this.pages.forEach(page => {
      const filename = page.slugs[page.slugs.length - 1] || '';
      
      // Check if it's a sub-page (has decimal in the prefix)
      const prefixMatch = filename.match(/^(\d+)\.(\d+)/);
      
      if (prefixMatch) {
        // This is a sub-page
        const topLevelPrefix = prefixMatch[1];
        
        if (!subPagesMap.has(topLevelPrefix)) {
          subPagesMap.set(topLevelPrefix, []);
        }
        subPagesMap.get(topLevelPrefix)!.push(page);
      } else {
        // This is a top-level page
        topLevelPages.push(page);
      }
    });
    
    // Sort top-level pages by sidebar_position
    topLevelPages.sort((a, b) => a.sidebar_position - b.sidebar_position);
    
    // Sort sub-pages within each group
    subPagesMap.forEach(subPages => {
      subPages.sort((a, b) => a.sidebar_position - b.sidebar_position);
    });
    
    // Create the hierarchical tree
    const children: PageTree.Node[] = [];
    
    // Add top-level pages and their sub-pages
    topLevelPages.forEach(topLevelPage => {
      const topLevelPrefix = topLevelPage.slugs[topLevelPage.slugs.length - 1]?.match(/^(\d+)/)?.[1];
      
      // Get sub-pages for this top-level page
      const subPages = topLevelPrefix ? subPagesMap.get(topLevelPrefix) || [] : [];
      
      if (subPages.length > 0) {
        // Create a folder with the top-level page as index and sub-pages as children
        const folderChildren: PageTree.Node[] = subPages.map(subPage => ({
          type: 'page',
          name: subPage.title,
          url: `/docs/${this.owner}/${this.repo}${subPage.url}`,
        }));
        
        children.push({
          type: 'folder',
          name: topLevelPage.title,
          index: {
            type: 'page',
            name: topLevelPage.title,
            url: `/docs/${this.owner}/${this.repo}${topLevelPage.url}`,
          },
          children: folderChildren,
        });
      } else {
        // Just add the top-level page directly
        children.push({
          type: 'page',
          name: topLevelPage.title,
          url: `/docs/${this.owner}/${this.repo}${topLevelPage.url}`,
        });
      }
    });
    
    return {
      name: 'root',
      children,
    };
  }

  private formatTitleFromFilename(filename: string): string {
    // Remove the numeric prefix and format the title
    const withoutPrefix = filename.replace(/^\d+(\.\d+)?_/, '');
    return withoutPrefix
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}