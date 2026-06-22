import express from "express";
import { createJob, getJobStatus, getStatusByName } from "../controllers/jobsController.js";
import { executeNextStep } from "../pipeline.js";
import { Receiver } from "@upstash/qstash";

const router = express.Router();

const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
});

const verifyQstashSignature = async (req: any, res: any, next: any) => {
  try {
    const signature = req.headers["upstash-signature"];
    if (!signature) {
      return res.status(401).json({ error: "Missing Upstash-Signature header" });
    }

    const body = req.rawBody || JSON.stringify(req.body);

    const isValid = await qstashReceiver.verify({
      signature: Array.isArray(signature) ? signature[0] : signature,
      body,
    });

    if (!isValid) {
      return res.status(401).json({ error: "Invalid QStash signature" });
    }

    next();
  } catch (error) {
    console.error("QStash verification failed:", error);
    return res.status(401).json({ error: "Signature verification failed" });
  }
};

router.post("/index", createJob);
router.get("/status/:jobId", getJobStatus);
router.get("/status", getStatusByName);

router.post(
  "/pipeline/step",
  verifyQstashSignature,
  async (req, res) => {
    try {
      const { jobId } = req.body;
      if (!jobId) return res.status(400).json({ error: "Missing jobId" });

      await executeNextStep(jobId);

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Pipeline step error:", error.message);
      res.status(500).json({ error: "Pipeline step failed" });
    }
  }
);

export default router;
