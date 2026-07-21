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

const clientUrls = (process.env.CLIENT_URLS || 'http://localhost:3000')
  .split(',')
  .map(url => url.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || clientUrls.includes(origin) || origin.endsWith('.vercel.app')) {
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
  verify: (req: RequestWithRawBody, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use("/api", jobsRoutes);
app.use("/api/dev", devRoutes);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Global Error Handler:", err);
  res.status(500).json({ error: "Internal Server Error" });
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
