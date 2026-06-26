import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate, getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { membersQuerySchema, type MembersQuery } from "./network.schema";
import {
  getNetworkStats,
  getNetworkMembers,
  getNetworkInsights,
  getTopPerformers,
  getTeamActivity,
  getMemberJourney,
} from "./network.service";
import { getDecisionEngine } from "./decision-engine.service";

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

// GET /api/network/decision-engine
router.get("/decision-engine", async (req, res, next) => {
  try {
    const { user } = req as unknown as AuthenticatedRequest;
    const data = await getDecisionEngine(user.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/network/member/:memberId/journey
router.get("/member/:memberId/journey", async (req, res, next) => {
  try {
    const { user } = req as unknown as AuthenticatedRequest;
    const { memberId } = req.params;
    const data = await getMemberJourney(user.sub, memberId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
