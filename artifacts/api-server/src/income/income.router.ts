import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { sendSuccess } from "../shared/response";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { getIncomeSummary, getIncomeTrend, type TrendPeriod } from "./income.service";
import { getIncomeDashboard } from "./income.dashboard.service";
import {
  getRoiDetail,
  getBinaryDetail,
  getOrbitDetail,
  getSalaryDetail,
  getLevelDetail,
} from "./income.detail.service";
import type { AuthenticatedRequest } from "../shared/types";

const VALID_PERIODS: TrendPeriod[] = ["7d", "30d", "90d", "1y", "all"];

const incomeRouter = Router();

incomeRouter.use(requireAuth);

// GET /api/income/dashboard — aggregated single-request overview
incomeRouter.get("/dashboard", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getIncomeDashboard(user.sub);
    sendSuccess(res, data, "Income dashboard fetched successfully");
  } catch (err) { next(err); }
});

// GET /api/income/roi — ROI engine detail page data
incomeRouter.get("/roi", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getRoiDetail(user.sub);
    sendSuccess(res, data, "ROI detail fetched successfully");
  } catch (err) { next(err); }
});

// GET /api/income/binary — Binary matching engine detail page data
incomeRouter.get("/binary", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getBinaryDetail(user.sub);
    sendSuccess(res, data, "Binary detail fetched successfully");
  } catch (err) { next(err); }
});

// GET /api/income/orbit — Binary orbit engine detail page data
incomeRouter.get("/orbit", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getOrbitDetail(user.sub);
    sendSuccess(res, data, "Orbit detail fetched successfully");
  } catch (err) { next(err); }
});

// GET /api/income/salary — Salary engine detail page data
incomeRouter.get("/salary", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getSalaryDetail(user.sub);
    sendSuccess(res, data, "Salary detail fetched successfully");
  } catch (err) { next(err); }
});

// GET /api/income/level — Level income engine detail page data
incomeRouter.get("/level", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getLevelDetail(user.sub);
    sendSuccess(res, data, "Level income detail fetched successfully");
  } catch (err) { next(err); }
});

// GET /api/income/summary
incomeRouter.get("/summary", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getIncomeSummary(user.sub);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/income/trend?period=7d|30d|90d|1y|all
incomeRouter.get("/trend", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const period = String(req.query["period"] ?? "30d") as TrendPeriod;
    if (!VALID_PERIODS.includes(period)) {
      throw new AppError(
        `Invalid period. Valid: ${VALID_PERIODS.join("|")}`,
        HTTP_STATUS.BAD_REQUEST,
        "BAD_REQUEST",
      );
    }
    const data = await getIncomeTrend(user.sub, period);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

export default incomeRouter;
