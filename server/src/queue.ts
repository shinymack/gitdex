// import { Redis } from '@upstash/redis';

// const redis = new Redis({
//     url: process.env.UPSTASH_REDIS_REST_URL!,
//     token: process.env.UPSTASH_REDIS_REST_TOKEN!,
// });

// export type JobState = 'queued' | 'processing' | 'completed' | 'failed';

// export interface JobData {
//     id: string; // ADDED THIS
//     state: JobState;
//     repoUrl: string;
//     owner: string;
//     repo: string;
//     createdAt: number;
//     updatedAt: number;
//     error?: string | null;
//     currentStep: number;
//     data?: string | null;
// }

// class SimpleQueue {
//     private getJobId(owner: string, repo: string): string {
//         return `job:${owner}/${repo}`;
//     }

//     private getLockKey(owner: string, repo: string): string {
//         return `lock:${owner}/${repo}`;
//     }

//     async addJob(repoUrl: string, force = false): Promise<{ jobId: string; state: JobState }> {
//         let owner: string, repo: string;
//         try {
//             const u = new URL(repoUrl);
//             const parts = u.pathname.split('/').filter(Boolean);
//             owner = parts[0];
//             repo = parts[1].replace('.git', '');
//         } catch (e) {
//             throw new Error("Invalid Repo URL");
//         }

//         const lockKey = this.getLockKey(owner, repo);
//         const COOLDOWN_MS = 60 * 60 * 1000; // 1 Hour

//         const lastIndexed = await redis.get(lockKey);
//         if (lastIndexed && !force) {
//             const timePassed = Date.now() - parseInt(lastIndexed as string);
//             if (timePassed < COOLDOWN_MS) {
//                 throw new Error(`Repository is in cooldown. Try again in ${Math.ceil((COOLDOWN_MS - timePassed) / 60000)} minutes.`);
//             }
//         }

//         const jobId = this.getJobId(owner, repo);
//         const now = Date.now();

//         const jobData: JobData = {
//             id: jobId, // ADDED THIS
//             state: 'processing',
//             repoUrl,
//             owner,
//             repo,
//             createdAt: now,
//             updatedAt: now,
//             currentStep: 0,
//             data: null,
//             error: null
//         };

//         await redis.hset(jobId, jobData);
//         await redis.set(lockKey, now.toString(), { ex: 3600 });

//         return { jobId, state: 'processing' };
//     }

//     async getJob(jobId: string): Promise<JobData | null> {
//         const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
//         const jobHash = await redis.hgetall(formattedId);

//         if (!jobHash || Object.keys(jobHash).length === 0) return null;

//         return {
//             id: jobHash.id as string, // ADDED THIS
//             state: jobHash.state as JobState,
//             repoUrl: jobHash.repoUrl as string,
//             owner: jobHash.owner as string,
//             repo: jobHash.repo as string,
//             createdAt: parseInt(jobHash.createdAt as string || '0'),
//             updatedAt: parseInt(jobHash.updatedAt as string || '0'),
//             error: jobHash.error as string || null,
//             currentStep: parseInt(jobHash.currentStep as string || '0'),
//             data: jobHash.data as string || null
//         };
//     }

//     async getJobByRepo(owner: string, repo: string): Promise<JobData | null> {
//         return this.getJob(`${owner}/${repo}`);
//     }

//     async updateJob(jobId: string, updates: Partial<JobData>): Promise<void> {
//         const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
//         const currentJob = await this.getJob(formattedId);
//         if (!currentJob) return;

//         const updatedJob: JobData = {
//             ...currentJob,
//             ...updates,
//             updatedAt: Date.now()
//         };

//         await redis.hset(formattedId, updatedJob);
//     }

//     async failJob(jobId: string, error: string): Promise<void> {
//         const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
//         const job = await this.getJob(formattedId);

//         if (job) {
//             const lockKey = this.getLockKey(job.owner, job.repo);
//             await redis.del(lockKey);
//         }

//         await this.updateJob(formattedId, { state: 'failed', error });
//     }

//     async completeJob(jobId: string): Promise<void> {
//         await this.updateJob(jobId, { state: 'completed' });
//     }
// }

// export default new SimpleQueue();


import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

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

class SimpleQueue {
  private getJobId(owner: string, repo: string): string {
    return `job:${owner}/${repo}`;
  }

  private getLockKey(owner: string, repo: string): string {
    return `lock:${owner}/${repo}`;
  }

  async addJob(repoUrl: string, force = false): Promise<{ jobId: string; state: JobState }> {
    let owner: string, repo: string;
    try {
      const u = new URL(repoUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      owner = parts[0];
      repo = parts[1].replace('.git', '');
    } catch (e) {
      throw new Error("Invalid Repo URL");
    }

    const lockKey = this.getLockKey(owner, repo);
    const COOLDOWN_MS = 60 * 60 * 1000; // 1 Hour

    const lastIndexed = await redis.get(lockKey);
    if (lastIndexed && !force) {
      const timePassed = Date.now() - parseInt(lastIndexed as string);
      if (timePassed < COOLDOWN_MS) {
        throw new Error(`Repository is in cooldown. Try again in ${Math.ceil((COOLDOWN_MS - timePassed) / 60000)} minutes.`);
      }
    }

    const jobId = this.getJobId(owner, repo);
    const now = Date.now();

    const jobData: JobData = {
      id: jobId,
      state: 'processing',
      repoUrl,
      owner,
      repo,
      createdAt: now,
      updatedAt: now,
      currentStep: 0,
      data: null,
      error: null
    };

    await redis.hset(jobId, jobData);
    await redis.set(lockKey, now.toString(), { ex: 3600 });

    return { jobId, state: 'processing' };
  }

  async getJob(jobId: string): Promise<JobData | null> {
    const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
    const jobHash = await redis.hgetall(formattedId);

    if (!jobHash || Object.keys(jobHash).length === 0) return null;

    return {
      id: jobHash.id as string,
      state: jobHash.state as JobState,
      repoUrl: jobHash.repoUrl as string,
      owner: jobHash.owner as string,
      repo: jobHash.repo as string,
      createdAt: parseInt(jobHash.createdAt as string || '0'),
      updatedAt: parseInt(jobHash.updatedAt as string || '0'),
      error: jobHash.error as string || null,
      currentStep: parseInt(jobHash.currentStep as string || '0'),
      data: jobHash.data as string || null
    };
  }

  async getJobByRepo(owner: string, repo: string): Promise<JobData | null> {
    return this.getJob(`${owner}/${repo}`);
  }

  async updateJob(jobId: string, updates: Partial<JobData>): Promise<void> {
    const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
    const currentJob = await this.getJob(formattedId);
    if (!currentJob) return;

    const updatedJob: JobData = {
      ...currentJob,
      ...updates,
      updatedAt: Date.now()
    };

    await redis.hset(formattedId, updatedJob);
  }

  async failJob(jobId: string, error: string): Promise<void> {
    const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
    const job = await this.getJob(formattedId);

    if (job) {
      const lockKey = this.getLockKey(job.owner, job.repo);
      await redis.del(lockKey);
    }

    // CRITICAL: Clear the massive data payload to save Redis storage costs!
    await this.updateJob(formattedId, { state: 'failed', error, data: null });
  }

  async completeJob(jobId: string): Promise<void> {
    // CRITICAL: Clear the massive data payload to save Redis storage costs!
    await this.updateJob(jobId, { state: 'completed', data: null });
  }
}

export default new SimpleQueue();