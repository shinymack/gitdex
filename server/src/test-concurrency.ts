import queue from "./services/queueService.js";
import { redis } from "./config/redis.js";

async function main() {
    console.log("=== Concurrency Test Starting ===");
    
    // Cleanup any existing state first
    const repoUrl = "https://github.com/shinymack/test-repo";
    const owner = "shinymack";
    const repo = "test-repo";
    const jobId = `job:${owner}/${repo}`;
    const lockKey = `lock:${owner}/${repo}`;
    const addLockKey = `lock:add:${owner}/${repo}`;
    const stepLockKey = `lock:step:${jobId}`;

    console.log("Cleaning up Redis keys...");
    await redis.del(jobId);
    await redis.del(lockKey);
    await redis.del(addLockKey);
    await redis.del(stepLockKey);
    await redis.del("system:active_job");
    await redis.del("system:queue");

    console.log("Triggering 3 concurrent addJob calls for the SAME repository...");
    const results = await Promise.allSettled([
        queue.addJob(repoUrl, true),
        queue.addJob(repoUrl, true),
        queue.addJob(repoUrl, true),
    ]);

    let index = 1;
    for (const res of results) {
        if (res.status === "fulfilled") {
            console.log(`Call ${index} succeeded: jobId=${res.value.jobId}, state=${res.value.state}, newlyStarted=${res.value.newlyStarted}`);
        } else {
            console.log(`Call ${index} failed: ${res.reason?.message || res.reason}`);
        }
        index++;
    }

    // Inspect queue state
    const activeJob = await redis.get("system:active_job");
    const queueList = await redis.lrange("system:queue", 0, -1);
    console.log(`\nActive job in Redis: ${activeJob}`);
    console.log(`Queue list in Redis: ${JSON.stringify(queueList)}`);

    console.log("\nTriggering concurrent addJob calls for DIFFERENT repositories...");
    const repo1 = "https://github.com/shinymack/repo1";
    const repo2 = "https://github.com/shinymack/repo2";
    
    await redis.del("job:shinymack/repo1");
    await redis.del("job:shinymack/repo2");
    await redis.del("lock:shinymack/repo1");
    await redis.del("lock:shinymack/repo2");
    await redis.del("system:active_job");
    await redis.del("system:queue");

    const diffResults = await Promise.allSettled([
        queue.addJob(repo1, true),
        queue.addJob(repo2, true),
    ]);

    let diffIndex = 1;
    for (const res of diffResults) {
        if (res.status === "fulfilled") {
            console.log(`Repo ${diffIndex} succeeded: jobId=${res.value.jobId}, state=${res.value.state}, newlyStarted=${res.value.newlyStarted}`);
        } else {
            console.log(`Repo ${diffIndex} failed: ${res.reason?.message || res.reason}`);
        }
        diffIndex++;
    }

    const activeJobDiff = await redis.get("system:active_job");
    const queueListDiff = await redis.lrange("system:queue", 0, -1);
    console.log(`Active job in Redis: ${activeJobDiff}`);
    console.log(`Queue list in Redis: ${JSON.stringify(queueListDiff)}`);

    console.log("=== Concurrency Test Finished ===");
}

main().catch(console.error);
