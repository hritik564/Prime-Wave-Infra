import { Router } from "express";
import {
  getLevelIncomeHistoryHandler,
  getLevelIncomeSummaryHandler,
} from "./level-income.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { levelIncomeHistoryQuerySchema, levelIncomeSummaryQuerySchema } from "./level-income.schema";

const router = Router();

router.use(requireAuth);

// GET /api/level-income/history[?userId=xxx&sourceUserId=xxx&level=N&page=N&limit=N]
router.get("/history", validate(levelIncomeHistoryQuerySchema, "query"), getLevelIncomeHistoryHandler);

// GET /api/level-income/summary[?userId=xxx]
router.get("/summary", validate(levelIncomeSummaryQuerySchema, "query"), getLevelIncomeSummaryHandler);

export default router;
