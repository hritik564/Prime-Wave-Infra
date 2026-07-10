import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate, getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { membersQuerySchema, type MembersQuery } from "./network.schema";
import {
  getNetworkStats,
  getLegBreakdown,
  getNetworkPulse,
  getNetworkMembers,
  getNetworkInsights,
  getTopPerformers,
  getTeamActivity,
} from "./network.service";
import { getTeamBusiness } from "./team-business.service";

const router = Router();

router.use(requireAuth);

// GET /api/network/stats
router.get("/stats", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getNetworkStats(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/leg-breakdown
router.get("/leg-breakdown", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getLegBreakdown(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/team-business
router.get("/team-business", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getTeamBusiness(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/pulse
router.get("/pulse", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getNetworkPulse(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/members
router.get("/members", validate(membersQuerySchema, "query"), async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const query = getParsed<MembersQuery>(res, "query");
    const data = await getNetworkMembers(user.sub, query);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/insights
router.get("/insights", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getNetworkInsights(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/top-performers
router.get("/top-performers", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getTopPerformers(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/activity
router.get("/activity", async (req, res, next) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const data = await getTeamActivity(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
