import express from "express";
import { clearRedis, deleteDocs } from "../controllers/devController.js";

const router = express.Router();

router.get("/clear", clearRedis);
router.get("/delete", deleteDocs);

export default router;
