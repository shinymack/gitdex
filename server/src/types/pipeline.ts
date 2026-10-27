export interface TocEntry {
  prefix: string;
  title: string;
  filename: string;
  description: string;
  relevant_files: string[];
}
export interface Artifact { filename: string; content: string }
export interface Coverage {
  treeFiles: number;
  eligibleFiles: number;
  selectedFiles: number;
  readFiles: number;
  omittedFiles: number;
  treeTruncated: boolean;
  sampled: boolean;
}
export interface SectionManifest extends TocEntry {
  dependencies: Record<string, string>;
  contentHash: string;
}
export interface GuideManifest {
  version: 2;
  runId: string;
  sourceSha: string;
  generatorVersion: string;
  planningHash: string;
  publishedAt: number;
  coverage: Coverage;
  sections: SectionManifest[];
}
export interface PublishedGuide {
  commitSha: string;
  lastIndexed: number | null;
  manifest?: GuideManifest;
  files: Artifact[];
}
export interface PipelineData {
  files: { path: string; content: string; sha: string }[];
  sourceFiles: Record<string, string>;
  sourceSha: string;
  planningHash: string;
  coverage: Coverage;
  toc: TocEntry[];
  generatedFiles: Artifact[];
  sectionsWritten: number;
  defaultBranch: string;
  previous?: PublishedGuide;
}
export interface RepoItem { path?: string; type?: string; size?: number; sha?: string }
