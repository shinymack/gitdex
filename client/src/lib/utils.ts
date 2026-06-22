import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { DocTreeItem } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function findPageByPath(tree: DocTreeItem[], path: string): DocTreeItem | null {
  for (const item of tree) {
    if (item.path === path) {
      return item;
    }
    
    if (item.children) {
      const found = findPageByPath(item.children, path);
      if (found) return found;
    }
  }
  
  return null;
}

export function generateBreadcrumbs(tree: DocTreeItem[], path: string): DocTreeItem[] {
  const breadcrumbs: DocTreeItem[] = [];
  
  function findPath(items: DocTreeItem[], targetPath: string, currentPath: DocTreeItem[] = []): boolean {
    for (const item of items) {
      const newPath = [...currentPath, item];
      
      if (item.path === targetPath) {
        breadcrumbs.push(...newPath);
        return true;
      }
      
      if (item.children && findPath(item.children, targetPath, newPath)) {
        return true;
      }
    }
    
    return false;
  }
  
  findPath(tree, path);
  return breadcrumbs;
}

export function generateStaticParamsFromTree(tree: DocTreeItem[], basePath: string[] = []): Array<{ slug: string[] }> {
  const params: Array<{ slug: string[] }> = [];
  
  function traverse(items: DocTreeItem[], currentPath: string[] = []) {
    for (const item of items) {
      const newPath = [...currentPath, item.name];
      
      if (item.type === 'page') {
        params.push({ slug: newPath });
      }
      
      if (item.children) {
        traverse(item.children, newPath);
      }
    }
  }
  
  traverse(tree, basePath);
  return params;
}