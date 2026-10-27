import express from 'express';
import { createJob, getJobStatus, getStatusByName, reconcile, pipelineStep, pipelineFailure } from '../controllers/jobsController.js';
import { handleChat } from '../controllers/chatController.js';
import { verifyQstashSignature } from '../middleware/verifyQstash.js';

const router=express.Router();
router.post('/index',createJob);
router.get('/status/:jobId',getJobStatus);
router.get('/status',getStatusByName);
router.post('/chat',handleChat);
router.post('/pipeline/step',verifyQstashSignature,pipelineStep);
router.post('/pipeline/reconcile',verifyQstashSignature,reconcile);
router.post('/pipeline/failure',verifyQstashSignature,pipelineFailure);
export default router;
