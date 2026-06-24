import { Router } from "express";
import {
  placeUserHandler,
  getBinaryTreeHandler,
  getBinaryParentHandler,
  getBinaryChildrenHandler,
  getBvSummaryHandler,
  getBvHistoryHandler,
  getMatchingHistoryHandler,
  getMatchingSummaryHandler,
  getOrbitHistoryHandler,
  getOrbitSummaryHandler,
} from "./binary.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { placeUserSchema, treeQuerySchema, nodeQuerySchema } from "./binary.schema";
import { bvSummaryQuerySchema, bvHistoryQuerySchema } from "./bv.schema";
import { matchingHistoryQuerySchema, matchingSummaryQuerySchema } from "./matching.schema";
import { orbitHistoryQuerySchema, orbitSummaryQuerySchema } from "./orbit.schema";

const router = Router();

router.use(requireAuth);

// ── Placement ─────────────────────────────────────────────────────────────────

// POST /api/binary/place
router.post("/place", validate(placeUserSchema, "body"), placeUserHandler);

// ── Tree queries ──────────────────────────────────────────────────────────────

// GET /api/binary/tree[?userId=xxx&depth=N]
router.get("/tree",     validate(treeQuerySchema, "query"), getBinaryTreeHandler);

// GET /api/binary/parent[?userId=xxx]
router.get("/parent",   validate(nodeQuerySchema, "query"), getBinaryParentHandler);

// GET /api/binary/children[?userId=xxx]
router.get("/children", validate(nodeQuerySchema, "query"), getBinaryChildrenHandler);

// ── BV queries ────────────────────────────────────────────────────────────────

// GET /api/binary/bv-summary[?userId=xxx]
router.get("/bv-summary", validate(bvSummaryQuerySchema, "query"), getBvSummaryHandler);

// GET /api/binary/bv-history[?userId=xxx&investmentId=xxx&page=N&limit=N]
router.get("/bv-history", validate(bvHistoryQuerySchema, "query"), getBvHistoryHandler);

// ── Matching income queries ───────────────────────────────────────────────────

// GET /api/binary/matching-history[?userId=xxx&page=N&limit=N]
router.get("/matching-history", validate(matchingHistoryQuerySchema, "query"), getMatchingHistoryHandler);

// GET /api/binary/matching-summary[?userId=xxx]
router.get("/matching-summary", validate(matchingSummaryQuerySchema, "query"), getMatchingSummaryHandler);

// ── Orbit income queries ──────────────────────────────────────────────────────

// GET /api/binary/orbit-history[?userId=xxx&page=N&limit=N]
router.get("/orbit-history", validate(orbitHistoryQuerySchema, "query"), getOrbitHistoryHandler);

// GET /api/binary/orbit-summary[?userId=xxx]
router.get("/orbit-summary", validate(orbitSummaryQuerySchema, "query"), getOrbitSummaryHandler);

export default router;
