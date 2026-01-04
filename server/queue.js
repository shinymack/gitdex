import Redis from "ioredis";

// Use environment variable for Redis URL
const redis = new Redis(process.env.REDIS_URL, {
    // Add these options for serverless environments
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true, // Important for serverless
});

console.log('Redis Connected!')

redis.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

// Rest of your queue code remains the same
class SimpleQueue {
    constructor() {
        this.processing = false;
        this.removeStuckJobs(); // Remove stuck jobs on startup
        this.startProcessing();
    }

    async addJob(repoUrl, force = false) {
        console.log(`Queue: addJob called`, { repoUrl, force });
        // 1. Parse Owner/Repo
        let owner, repo;
        try {
            const u = new URL(repoUrl);
            const parts = u.pathname.split('/').filter(Boolean);
            owner = parts[0];
            repo = parts[1].replace('.git', '');
        } catch (e) {
            console.error("Queue: Invalid URL", repoUrl);
            throw new Error("Invalid Repo URL");
        }

        const lockKey = `lock:${owner}/${repo}`;
        console.log(`Queue: Checking lock ${lockKey}`);

        // 2. Check for active lock (Cooldown)
        const lastIndexed = await redis.get(lockKey); // stores timestamp
        const COOLDOWN_MS = 60 * 60 * 1000; // 1 Hour

        if (lastIndexed && !force) {
            console.log(`Queue: Lock found`, { lastIndexed, now: Date.now() });
            const timePassed = Date.now() - parseInt(lastIndexed);
            if (timePassed < COOLDOWN_MS) {
                console.log(`Queue: Cooldown active`);
                // Find the existing job ID for this repo to return status
                const existingJob = await this.findJobByRepo(owner, repo);
                if (existingJob) {
                    return { ...existingJob, status: 'cooldown', nextAvailable: parseInt(lastIndexed) + COOLDOWN_MS };
                }
                throw new Error(`Repository is in cooldown. Try again in ${Math.ceil((COOLDOWN_MS - timePassed) / 60000)} minutes.`);
            }
        } else {
            console.log(`Queue: No lock or force=true. Proceeding.`);
        }

        const jobId = `job:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

        await redis.hset(jobId, {
            status: "queued",
            repoUrl,
            createdAt: Date.now(),
            owner,
            repo
        });

        // Set lock immediately to prevent double-click spam
        await redis.set(lockKey, Date.now());

        await redis.lpush("queue", jobId);
        console.log(`Job added: ${jobId} for ${owner}/${repo}`);
        return jobId;
    }

    async removeStuckJobs() {
        try {
            console.log("Removing stuck jobs...");

            const jobKeys = await redis.keys("job:*");

            for (const key of jobKeys) {
                const job = await redis.hgetall(key);

                if (job.status === "processing") {
                    console.log(`Removing stuck job: ${key}`);
                    await redis.del(key);
                }
            }

            console.log("Stuck job removal completed");
        } catch (error) {
            console.error("Error removing stuck jobs:", error);
        }
    }

    async startProcessing() {
        setInterval(async () => {
            if (this.processing) return;
            this.processing = true;

            try {
                const jobId = await redis.rpop("queue");
                if (!jobId) {
                    this.processing = false;
                    return;
                }

                await redis.hset(jobId, { status: "processing", startedAt: Date.now() });

                const job = await redis.hgetall(jobId);
                const { processRepository } = await import("./controllers/indexController.js");

                try {
                    const result = await processRepository(job.repoUrl);
                    await redis.hset(jobId, {
                        status: "completed",
                        result: JSON.stringify(result),
                        completedAt: Date.now(),
                    });
                } catch (error) {
                    await redis.hset(jobId, {
                        status: "failed",
                        error: error.message,
                        completedAt: Date.now(),
                    });

                    // Unlock on failure so user can retry immediately
                    if (job.owner && job.repo) {
                        const lockKey = `lock:${job.owner}/${job.repo}`;
                        console.log(`Queue: Job failed, removing lock ${lockKey}`);
                        await redis.del(lockKey);
                    }
                }
            } catch (error) {
                console.error("Processing error:", error);
            } finally {
                this.processing = false;
            }
        }, 1000);
    }

    async getJobStatus(jobId) {
        const job = await redis.hgetall(jobId);
        if (!job) return null;

        return {
            id: jobId,
            status: job.status,
            repoUrl: job.repoUrl,
            result: job.result ? JSON.parse(job.result) : null,
            error: job.error || null,
            createdAt: parseInt(job.createdAt),
        };
    }

    // Find a job by owner/repo pair by inspecting stored repoUrl or path
    async findJobByRepo(owner, repo) {
        try {
            const jobKeys = await redis.keys('job:*');
            let latestJob = null;

            for (const key of jobKeys) {
                const job = await redis.hgetall(key);
                if (!job || !job.repoUrl) continue;
                try {
                    const u = new URL(job.repoUrl);
                    const parts = u.pathname.split('/').filter(Boolean);
                    const jOwner = parts[0];
                    const jRepo = (parts[1] || '').replace('.git', '');
                    if (jOwner === owner && jRepo === repo) {
                        const jobData = {
                            id: key,
                            status: job.status,
                            repoUrl: job.repoUrl,
                            result: job.result ? JSON.parse(job.result) : null,
                            error: job.error || null,
                            createdAt: parseInt(job.createdAt || 0),
                            nextAvailable: job.nextAvailable ? parseInt(job.nextAvailable) : null
                        };

                        if (!latestJob || jobData.createdAt > latestJob.createdAt) {
                            latestJob = jobData;
                        }
                    }
                } catch (e) {
                    // ignore invalid urls
                }
            }
            return latestJob;
        } catch (error) {
            console.error('findJobByRepo error', error);
            return null;
        }
    }
}

export default new SimpleQueue();