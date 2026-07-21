import express from "express";
import { createJob, getJobStatus, getStatusByName, cronHeal } from "../controllers/jobsController.js";
import { handleChat } from "../controllers/chatController.js";
import { executeNextStep } from "../services/pipelineService.js";
import { verifyQstashSignature } from "../middleware/verifyQstash.js";

const router = express.Router();

router.post("/index", createJob);
router.get("/status/:jobId", getJobStatus);
router.get("/status", getStatusByName);
router.post("/chat", handleChat);
router.post("/pipeline/cron-heal", verifyQstashSignature, cronHeal);

router.post(
  "/pipeline/step",
  verifyQstashSignature,
  async (req, res) => {
    try {
      const { jobId, sectionIndex } = req.body as { jobId?: string; sectionIndex?: string | number };
      if (!jobId) return res.status(400).json({ error: "Missing jobId" });

      const parsedSectionIndex = sectionIndex !== undefined ? parseInt(String(sectionIndex), 10) : undefined;
      await executeNextStep(jobId, parsedSectionIndex);

      return res.status(200).json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Pipeline step error:", message);
      return res.status(500).json({ error: "Pipeline step failed" });
    }
  }
);

export default router;
