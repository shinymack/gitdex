export interface TocEntry {
  prefix: string;
  title: string;
  filename: string;
  description: string;
  relevant_files: string[];
}

export interface PipelineData {
  files: { path: string; content: string }[];
  toc: TocEntry[];
  generatedFiles: { filename: string; content: string }[];
  sectionsWritten: number;
  defaultBranch?: string;
}

export interface RepoItem {
  path?: string;
  type?: string;
  size?: number;
}
