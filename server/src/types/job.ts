export type JobState = 'queued' | 'processing' | 'completed' | 'failed';
export type PipelinePhase = 'scan' | 'plan' | 'sections' | 'publish';

export interface Delivery {
  runId: string;
  expectedPhase: PipelinePhase;
  sectionIndex?: number;
}

export interface JobData {
  id: string;
  runId: string;
  state: JobState;
  repoUrl: string;
  owner: string;
  repo: string;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  phase: PipelinePhase;
  currentStep: number;
  sectionCount: number;
  sectionsCompleted: number;
  data: string | null;
}
