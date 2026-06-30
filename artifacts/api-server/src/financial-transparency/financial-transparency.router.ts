import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getFinancialTransparencyData } from "./financial-transparency.service";
import { sendSuccess } from "../shared/response";

const router = Router();

router.use(requireAuth);

// GET /api/financial-transparency
// Read-only schedule metadata aggregator. No financial logic — only reads
// job_execution_logs and system_settings to expose timing data to the frontend.
router.get("/", async (req, res, next) => {
  try {
    const data = await getFinancialTransparencyData();
    sendSuccess(res, data, "Financial transparency data fetched successfully");
  } catch (err) {
    next(err);
  }
});

export default router;
