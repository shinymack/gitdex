import { redis } from '../config/redis.js';
import type { JobData, JobState } from '../types/job.js';

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
        } catch {
            throw new Error("Invalid Repo URL");
        }

        const addLockKey = `lock:add:${owner}/${repo}`;
        const acquiredAddLock = await redis.set(addLockKey, '1', { ex: 5, nx: true });
        if (acquiredAddLock !== 'OK') {
            console.log(`[Queue] BLOCKED by add lock for ${owner}/${repo}`);
            throw new Error(`A request for ${owner}/${repo} is already in progress.`);
        }

        try {
            const activeJobId = await redis.get<string>('system:active_job');
            if (activeJobId) {
                await this.getJob(activeJobId, false);
            }

            const lockKey = this.getLockKey(owner, repo);
            const COOLDOWN_MS = 60 * 60 * 1000;

            const jobId = this.getJobId(owner, repo);
            const existingJob = await this.getJob(jobId, true);

            if (existingJob) {
                console.log(`[Queue] Existing job state=${existingJob.state} updatedAt=${new Date(existingJob.updatedAt).toISOString()}`);
                if (existingJob.state === 'processing' || existingJob.state === 'queued') {
                    console.log(`[Queue] BLOCKED - job already active (${existingJob.state})`);
                    return { jobId, state: existingJob.state, newlyStarted: false };
                }
            } else {
                console.log(`[Queue] No existing job found for ${jobId}`);
            }

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

            if (existingJob && existingJob.state === 'completed' && !force) {
                const timeSinceComplete = Date.now() - existingJob.updatedAt;
                if (timeSinceComplete < COOLDOWN_MS) {
                    const minutesLeft = Math.ceil((COOLDOWN_MS - timeSinceComplete) / 60000);
                    console.log(`[Queue] BLOCKED by updatedAt fallback. ${minutesLeft}min remaining.`);
                    throw new Error(`Repository is in cooldown. Try again in ${minutesLeft} minutes.`);
                }
            }

            const now = Date.now();
            const jobData: JobData = {
                id: jobId,
                state: 'queued',
                repoUrl,
                owner,
                repo,
                createdAt: now,
                updatedAt: now,
                currentStep: 0,
                data: null,
                error: null
            };

            await redis.hset(jobId, jobData as unknown as Record<string, string | number | null>);
            await redis.set(lockKey, now.toString(), { ex: 3600 });

            const activeResult = await redis.set('system:active_job', jobId, { nx: true });

            if (activeResult === 'OK') {
                await this.updateJob(jobId, { state: 'processing' });
                return { jobId, state: 'processing', newlyStarted: true };
            } else {
                await redis.rpush('system:queue', jobId);
                return { jobId, state: 'queued', newlyStarted: true };
            }
        } finally {
            await redis.del(addLockKey);
        }
    }

    async getJob(jobId: string, bypassSelfHealing = false): Promise<JobData | null> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;

        if (!bypassSelfHealing) {
            const activeJobId = await redis.get<string>('system:active_job');
            if (activeJobId && activeJobId !== formattedId) {
                await this.getJob(activeJobId, false);
            }
        }

        const jobHash = await redis.hgetall(formattedId);

        if (!jobHash || Object.keys(jobHash).length === 0) return null;

        const job: JobData = {
            id: jobHash.id as string,
            state: jobHash.state as JobState,
            repoUrl: jobHash.repoUrl as string,
            owner: jobHash.owner as string,
            repo: jobHash.repo as string,
            createdAt: parseInt(jobHash.createdAt as string || '0'),
            updatedAt: parseInt(jobHash.updatedAt as string || '0'),
            error: (jobHash.error as string) || null,
            currentStep: parseInt(jobHash.currentStep as string || '0'),
            data: (jobHash.data as string) || null
        };

        if (!bypassSelfHealing && job.state === 'processing' && (Date.now() - job.updatedAt > 10 * 60 * 1000)) {
            console.log(`[Queue] Warning: Job ${job.id} has been in state 'processing' since ${new Date(job.updatedAt).toISOString()}.`);
        }

        return job;
    }

    async getJobByRepo(owner: string, repo: string): Promise<JobData | null> {
        return this.getJob(`${owner}/${repo}`);
    }

    async updateJob(jobId: string, updates: Partial<JobData>): Promise<void> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        const currentJob = await this.getJob(formattedId, true);
        if (!currentJob) return;

        const updatedJob: JobData = {
            ...currentJob,
            ...updates,
            updatedAt: Date.now()
        };

        await redis.hset(formattedId, updatedJob as unknown as Record<string, string | number | null>);
    }

    private async triggerNextJob(): Promise<string | null> {
        const nextJobId = await redis.lpop('system:queue');
        if (nextJobId) {
            await this.updateJob(nextJobId as string, { state: 'processing' });
            await redis.set('system:active_job', nextJobId as string);
            return nextJobId as string;
        } else {
            await redis.del('system:active_job');
            return null;
        }
    }

    async failJob(jobId: string, error: string): Promise<string | null> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        const job = await this.getJob(formattedId, true);

        if (job) {
            const lockKey = this.getLockKey(job.owner, job.repo);
            await redis.del(lockKey);
        }

        await this.updateJob(formattedId, { state: 'failed', error, data: null });
        await redis.expire(formattedId, 86400);

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

        const activeJobId = await redis.get('system:active_job');
        if (activeJobId === formattedId) {
            return await this.triggerNextJob();
        }
        return null;
    }

    async acquireStepLock(jobId: string, sectionIndex?: number): Promise<boolean> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        const lockKey = sectionIndex !== undefined ? `lock:step:${formattedId}:${sectionIndex}` : `lock:step:${formattedId}`;
        const result = await redis.set(lockKey, '1', { ex: 60, nx: true });
        return result === 'OK';
    }

    async releaseStepLock(jobId: string, sectionIndex?: number): Promise<void> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        const lockKey = sectionIndex !== undefined ? `lock:step:${formattedId}:${sectionIndex}` : `lock:step:${formattedId}`;
        await redis.del(lockKey);
    }

    async requeueJob(jobId: string): Promise<void> {
        const formattedId = jobId.startsWith('job:') ? jobId : `job:${jobId}`;
        await this.updateJob(formattedId, { state: 'queued', currentStep: 0, data: null });
        await redis.lpush('system:queue', formattedId);

        const activeJob = await redis.get('system:active_job');
        if (!activeJob) {
            await this.updateJob(formattedId, { state: 'processing' });
            await redis.set('system:active_job', formattedId);
        }
        console.log(`[Queue] Job ${formattedId} safely re-queued due to trigger failure.`);
    }

    async healStuckJobs(): Promise<void> {
        const activeJobId = await redis.get<string>('system:active_job');
        if (!activeJobId) return;

        const job = await this.getJob(activeJobId, true);
        if (!job || job.state !== 'processing') return;

        if (Date.now() - job.updatedAt > 15 * 60 * 1000) {
            console.log(`[Queue Cron] Stuck job detected: ${job.id}. Failing it.`);
            await this.failJob(job.id, "Job timed out during background execution.");
        }
    }
}

export default new SimpleQueue();
