import { Router } from "express";
import {
  placeUserHandler,
  getBinaryTreeHandler,
  getBinaryParentHandler,
  getBinaryChildrenHandler,
  getBvSummaryHandler,
  getBvHistoryHandler,
} from "./binary.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { placeUserSchema, treeQuerySchema, nodeQuerySchema } from "./binary.schema";
import { bvSummaryQuerySchema, bvHistoryQuerySchema } from "./bv.schema";

const router = Router();

router.use(requireAuth);

// ── Placement ─────────────────────────────────────────────────────────────────

// POST /api/binary/place — sponsor places a referred user LEFT or RIGHT
router.post("/place", validate(placeUserSchema, "body"), placeUserHandler);

// ── Tree queries ──────────────────────────────────────────────────────────────

// GET /api/binary/tree[?userId=xxx&depth=N]
router.get("/tree", validate(treeQuerySchema, "query"), getBinaryTreeHandler);

// GET /api/binary/parent[?userId=xxx]
router.get("/parent", validate(nodeQuerySchema, "query"), getBinaryParentHandler);

// GET /api/binary/children[?userId=xxx]
router.get("/children", validate(nodeQuerySchema, "query"), getBinaryChildrenHandler);

// ── BV queries ────────────────────────────────────────────────────────────────

// GET /api/binary/bv-summary[?userId=xxx]
router.get("/bv-summary", validate(bvSummaryQuerySchema, "query"), getBvSummaryHandler);

// GET /api/binary/bv-history[?userId=xxx&investmentId=xxx&page=N&limit=N]
router.get("/bv-history", validate(bvHistoryQuerySchema, "query"), getBvHistoryHandler);

export default router;
