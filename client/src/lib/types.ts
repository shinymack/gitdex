export interface DocPage {
  path: string;
  title: string;
  description: string;
  content: string;
  icon?: string;
  sidebar_position?: number;
}

export interface FolderMeta {
  title: string;
  description: string;
  icon?: string;
  root?: boolean;
  pages?: string[];
  defaultOpen?: boolean;
}

export type Status = 'not-indexed' | 'indexed' | 'indexing' | 'error';

export interface GitHubFile {
  path: string;
  type: string;
  content?: string;
  sha?: string;
}

export interface DocTreeItem {
  type: 'page' | 'folder';
  name: string;
  path: string;
  url?: string;
  children?: DocTreeItem[];
  icon?: string;
  title?: string;
  description?: string;
}