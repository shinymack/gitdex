export type JobState = 'queued' | 'processing' | 'completed' | 'failed';

export interface JobData {
  id: string;
  state: JobState;
  repoUrl: string;
  owner: string;
  repo: string;
  createdAt: number;
  updatedAt: number;
  error?: string | null;
  currentStep: number;
  data?: string | null;
}
