import express from 'express';
import { getDocController, getDocsFiles } from '../controllers/docsController.js';

const router = express.Router();

// New: GET /api/docs/:owner/:repo/meta.json -> get doc metadata
router.get('/:owner/:repo/meta.json', getDocController);
router.get('/:owner/:repo/files', getDocsFiles);

// Legacy route for single-segment repo (optional)
router.get('/:repo', getDocController);

export default router;