import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import jobsRoutes from "./src/routes/jobsRoutes.js";
import devRoutes from "./src/routes/devRoutes.js";
import { requestLogger } from "./src/middleware/requestLogger.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(requestLogger);

const clientUrls = new Set((process.env.CLIENT_URLS || 'http://localhost:3000,https://gitdex-alpha.vercel.app')
  .split(',').map(url => url.trim()).filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || clientUrls.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

// CRITICAL: Capture the raw body BEFORE parsing JSON, so QStash signature verification works
app.use(express.json({
  limit: '512kb',
  verify: (req: RequestWithRawBody, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use("/api", jobsRoutes);
if (process.env.NODE_ENV !== 'production') app.use("/api/dev", devRoutes);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Request failed:", err.name);
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 413 ? 'The request is too large.' : status === 400 ? 'The request body is invalid.' : 'The request could not be completed.' });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
