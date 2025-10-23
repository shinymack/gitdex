// import express from 'express';
// // import { indexController } from '../controllers/indexController';
// import { createJob, getJobStatus } from '../controllers/jobsController';

// const router = express.Router();
// // router.post('/', indexController);

// // export default router;


// // Replace the existing /index route
// router.post("/index", createJob);

// // Add new route for checking job status
// router.get("/status/:jobId", getJobStatus);



// module.exports = router;


import express from "express";
import { createJob, getJobStatus, getStatusByName } from "../controllers/jobsController.js";

const router = express.Router();

// Replace the existing /index route
router.post("/index", createJob);

// Add new route for checking job status
router.get("/status/:jobId", getJobStatus);

// Name-based status check: /api/status?owner=...&repo=...
router.get('/status', getStatusByName);

// Keep other routes unchanged
// router.get("/", ...);
// router.post("/search", ...);

export default router;