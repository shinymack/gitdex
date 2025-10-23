import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import indexRoutes from "./routes/indexRoutes.js";
import docsRoutes from "./routes/docsRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['https://gitdex-alpha.vercel.app', 'http://localhost:3000'], // Allow your frontend
  credentials: true
}));
app.use(express.json());

// Routes
app.use("/api", indexRoutes);
app.use("/api", docsRoutes);
app.use("/api", searchRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});