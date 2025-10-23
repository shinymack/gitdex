import Redis from "ioredis";
const redis = new Redis(process.env.REDIS_URL);
console.log("Redis Connected!!");
class SimpleQueue {
  constructor() {
    this.processing = false;
    this.removeStuckJobs(); // Remove stuck jobs on startup
    this.startProcessing();
  }

  async addJob(repoUrl) {
    const jobId = `job:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    await redis.hset(jobId, {
      status: "queued",
      repoUrl,
      createdAt: Date.now(),
    });
    await redis.lpush("queue", jobId);
    return jobId;
  }

  // Remove stuck jobs on startup
  async removeStuckJobs() {
    try {
      console.log("Removing stuck jobs...");
      
      const jobKeys = await redis.keys("job:*");
      
      for (const key of jobKeys) {
        const job = await redis.hgetall(key);
        
        if (job.status === "processing") {
          console.log(`Removing stuck job: ${key}`);
          // Delete the job entirely from Redis
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
      for (const key of jobKeys) {
        const job = await redis.hgetall(key);
        if (!job || !job.repoUrl) continue;
        try {
          const u = new URL(job.repoUrl);
          const parts = u.pathname.split('/').filter(Boolean);
          const jOwner = parts[0];
          const jRepo = (parts[1] || '').replace('.git', '');
          if (jOwner === owner && jRepo === repo) {
            return {
              id: key,
              status: job.status,
              repoUrl: job.repoUrl,
              result: job.result ? JSON.parse(job.result) : null,
              error: job.error || null,
              createdAt: parseInt(job.createdAt),
            };
          }
        } catch (e) {
          // ignore invalid urls
        }
      }
      return null;
    } catch (error) {
      console.error('findJobByRepo error', error);
      return null;
    }
  }
}

export default new SimpleQueue();