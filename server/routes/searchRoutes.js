import express from 'express';
import { searchController } from '../controllers/searchController';

const router = express.Router();
router.post('/', searchController);

export default router;