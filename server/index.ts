import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { Redis } from '@upstash/redis';
import indexRoutes from "./src/routes/indexRoutes.ts";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const clientUrls = (process.env.CLIENT_URLS || 'http://localhost:3000')
    .split(',')
    .map(url => url.trim());

app.use(cors({
    origin: clientUrls,
    credentials: true
}));

// CRITICAL: Capture the raw body BEFORE parsing JSON, so QStash signature verification works
app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

app.use("/api", indexRoutes);

// Add this import at the top of the file


// ... inside index.ts, after the routes are set up ...

// Development route to clear Redis jobs and locks
app.get("/api/dev/clear", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: "Not allowed in production" });
    }
    try {
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });

        // Find all job and lock keys
        const jobKeys = await redis.keys('job:*');
        const lockKeys = await redis.keys('lock:*');

        const allKeys = [...jobKeys, ...lockKeys];

        if (allKeys.length > 0) {
            // Upstash expects strings or arrays to delete
            await redis.del(...allKeys);
        }

        res.json({ success: true, message: `Cleared ${allKeys.length} keys from Redis.` });
    } catch (error: any) {
        console.error('Error clearing Redis:', error);
        res.status(500).json({ error: 'Failed to clear Redis' });
    }
});

app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
});

app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}