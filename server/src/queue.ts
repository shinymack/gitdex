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

    async addJob(repoUrl: string, force = false): Promise<{ jobId: string; state: JobState; newlyStarted: boolean }> {
        let owner: string, repo: string;
        try {
            const u = new URL(repoUrl);
            const parts = u.pathname.split('/').filter(Boolean);
            const rawOwner = parts[0];
            const rawRepo = parts[1];
            if (!rawOwner || !rawRepo) throw new Error('Missing owner or repo in URL');
            owner = rawOwner;
            repo = rawRepo.replace('.git', '');
        } catch (e) {
            throw new Error("Invalid Repo URL");
        }

        const lockKey = this.getLockKey(owner, repo);
        const COOLDOWN_MS = 60 * 60 * 1000; // 1 Hour

        // Layer 1: Redis lock key (set at job creation, 1h TTL)
        const lastIndexed = await redis.get<string>(lockKey);
        console.log(`[Queue] addJob ${owner}/${repo} | force=${force} | lockKey=${lockKey} | lastIndexed=${lastIndexed}`);

        if (lastIndexed && !force) {
            const timePassed = Date.now() - parseInt(lastIndexed);
            if (timePassed < COOLDOWN_MS) {
                const minutesLeft = Math.ceil((COOLDOWN_MS - timePassed) / 60000);
                console.log(`[Queue] BLOCKED by lock key. ${minutesLeft}min remaining.`);
                throw new Error(`Repository is in cooldown. Try again in ${minutesLeft} minutes.`);
            }
        }

        const jobId = this.getJobId(owner, repo);

        // Layer 2: Job updatedAt timestamp (fallback if lock key was deleted)
        const existingJob = await this.getJob(jobId);
        if (existingJob) {
            console.log(`[Queue] Existing job state=${existingJob.state} updatedAt=${new Date(existingJob.updatedAt).toISOString()}`);

            if (existingJob.state === 'processing' || existingJob.state === 'queued') {
                console.log(`[Queue] BLOCKED - job already active (${existingJob.state})`);
                return { jobId, state: existingJob.state, newlyStarted: false };
            }

            if (existingJob.state === 'completed' && !force) {
                const timeSinceComplete = Date.now() - existingJob.updatedAt;
                if (timeSinceComplete < COOLDOWN_MS) {
                    const minutesLeft = Math.ceil((COOLDOWN_MS - timeSinceComplete) / 60000);
                    console.log(`[Queue] BLOCKED by updatedAt fallback. ${minutesLeft}min remaining.`);
                    throw new Error(`Repository is in cooldown. Try again in ${minutesLeft} minutes.`);
                }
            }
        } else {
            console.log(`[Queue] No existing job found for ${jobId}`);
        }

        const now = Date.now();
        const jobData: JobData = {
            id: jobId,
            state: 'queued', // Start as queued initially
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

        // STRICT SERIALIZATION: Check if any job is currently processing
        const activeJobId = await redis.get('system:active_job');

        if (!activeJobId) {
            // No active job! Start immediately.
            await this.updateJob(jobId, { state: 'processing' });
            await redis.set('system:active_job', jobId);
            return { jobId, state: 'processing', newlyStarted: true };
        } else {
            // A job is already running. Add to queue list and wait.
            await redis.rpush('system:queue', jobId);
            return { jobId, state: 'queued', newlyStarted: true };
        }
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

    private async triggerNextJob(): Promise<string | null> {
        // Pop the oldest job from the queue
        const nextJobId = await redis.lpop('system:queue');
        if (nextJobId) {
            await this.updateJob(nextJobId as string, { state: 'processing' });
            await redis.set('system:active_job', nextJobId as string);
            return nextJobId as string;
        } else {
            // Queue is empty, clear the active job lock
            await redis.del('system:active_job');
            return null;
        }
    }

    async failJob(jobId: string, error: string): Promise<string | null> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        const job = await this.getJob(formattedId);

        if (job) {
            const lockKey = this.getLockKey(job.owner, job.repo);
            await redis.del(lockKey);
        }

        await this.updateJob(formattedId, { state: 'failed', error, data: null });
        await redis.expire(formattedId, 86400);

        // If the failing job was the active job, trigger the next one!
        const activeJobId = await redis.get('system:active_job');
        if (activeJobId === formattedId) {
            return await this.triggerNextJob();
        }
        return null;
    }

    async completeJob(jobId: string): Promise<string | null> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        await this.updateJob(formattedId, { state: 'completed', data: null });
        await redis.expire(formattedId, 86400);

        // If the completing job was the active job, trigger the next one!
        const activeJobId = await redis.get('system:active_job');
        if (activeJobId === formattedId) {
            return await this.triggerNextJob();
        }
        return null;
    }
    async acquireStepLock(jobId: string): Promise<boolean> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        const lockKey = `lock:step:${formattedId}`;
        // Set lock with a 60-second TTL (enough time to finish a step, but clears if server crashes)
        const result = await redis.set(lockKey, '1', { ex: 60, nx: true });
        return result === 'OK';
    }

    async releaseStepLock(jobId: string): Promise<void> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        const lockKey = `lock:step:${formattedId}`;
        await redis.del(lockKey);
    }
    async requeueJob(jobId: string): Promise<void> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        // Reset it to queued state
        await this.updateJob(formattedId, { state: 'queued', currentStep: 0, data: null });
        // Push it to the front of the queue so it runs next
        await redis.lpush('system:queue', formattedId);

        // If there is no active job right now, we manually set it so the next trigger can grab it
        const activeJob = await redis.get('system:active_job');
        if (!activeJob) {
            await this.updateJob(formattedId, { state: 'processing' });
            await redis.set('system:active_job', formattedId);
            // We can't call QStash here without circular dependencies, 
            // but at least it's safely back in the queue and marked as active.
            // The next time anyone indexes a new repo, or polls, the system is in a safe state.
        }
        console.log(`[Queue] Job ${formattedId} safely re-queued due to trigger failure.`);
    }
}

export default new SimpleQueue();