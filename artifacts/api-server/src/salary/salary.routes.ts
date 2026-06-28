import { Router } from "express";
import {
  getSalaryHistoryHandler,
  getSalarySummaryHandler,
  getSalaryAchievementsHandler,
  getSalaryQualificationsHandler,
} from "./salary.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  salaryHistoryQuerySchema,
  salarySummaryQuerySchema,
  salaryAchievementsQuerySchema,
} from "./salary.schema";

const router = Router();

router.use(requireAuth);

// GET /api/salary/history[?userId=&rankName=&year=&month=&page=&limit=]
router.get(
  "/history",
  validate(salaryHistoryQuerySchema, "query"),
  getSalaryHistoryHandler,
);

// GET /api/salary/summary[?userId=]
router.get(
  "/summary",
  validate(salarySummaryQuerySchema, "query"),
  getSalarySummaryHandler,
);

// GET /api/salary/achievements[?userId=&isActive=true|false]
router.get(
  "/achievements",
  validate(salaryAchievementsQuerySchema, "query"),
  getSalaryAchievementsHandler,
);

// GET /api/salary/qualifications[?userId=]
// Returns the live BV-based qualification snapshot used by the dashboard.
router.get(
  "/qualifications",
  validate(salarySummaryQuerySchema, "query"),
  getSalaryQualificationsHandler,
);

export default router;
