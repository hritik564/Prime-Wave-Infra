import { Router } from "express";
import { requireAdminRoles } from "../middleware/auth.middleware.js";
import { adminLimiter } from "../middleware/rateLimiter.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  addPowerBVHandler,
  removePowerBVHandler,
  getPowerSummaryHandler,
  getPowerLedgerHandler,
  getGlobalStatsHandler,
  getGlobalLedgerHandler,
  getGlobalLedgerCsvHandler,
  getGlobalAnalyticsHandler,
  searchMembersHandler,
} from "./power-bv.controller.js";
import {
  powerBvUserIdParamSchema,
  powerBvAddSchema,
  powerBvRemoveSchema,
  powerBvLedgerQuerySchema,
  powerBvGlobalLedgerQuerySchema,
  powerBvSearchQuerySchema,
} from "./power-bv.schema.js";

const router = Router();

// Power Business contains sensitive financial/member-level data and controls.
const powerBusinessGuard = requireAdminRoles("SUPER_ADMIN");

// ── GET /api/admin/power-bv/stats ─────────────────────────────────────────────
router.get(
  "/stats",
  adminLimiter, powerBusinessGuard,
  getGlobalStatsHandler,
);

// ── GET /api/admin/power-bv/ledger ────────────────────────────────────────────
router.get(
  "/ledger",
  adminLimiter, powerBusinessGuard,
  validate(powerBvGlobalLedgerQuerySchema, "query"),
  getGlobalLedgerHandler,
);

// ── GET /api/admin/power-bv/ledger/csv ───────────────────────────────────────
router.get(
  "/ledger/csv",
  adminLimiter, powerBusinessGuard,
  validate(powerBvGlobalLedgerQuerySchema, "query"),
  getGlobalLedgerCsvHandler,
);

// ── GET /api/admin/power-bv/analytics ────────────────────────────────────────
router.get(
  "/analytics",
  adminLimiter, powerBusinessGuard,
  getGlobalAnalyticsHandler,
);

// ── GET /api/admin/power-bv/search ────────────────────────────────────────────
router.get(
  "/search",
  adminLimiter, powerBusinessGuard,
  validate(powerBvSearchQuerySchema, "query"),
  searchMembersHandler,
);

// ── GET /api/admin/power-bv/:userId ──────────────────────────────────────────
router.get(
  "/:userId",
  adminLimiter,
  powerBusinessGuard,
  validate(powerBvUserIdParamSchema, "params"),
  getPowerSummaryHandler,
);

// ── GET /api/admin/power-bv/:userId/ledger ────────────────────────────────────
router.get(
  "/:userId/ledger",
  adminLimiter,
  powerBusinessGuard,
  validate(powerBvUserIdParamSchema, "params"),
  validate(powerBvLedgerQuerySchema, "query"),
  getPowerLedgerHandler,
);

// ── POST /api/admin/power-bv/:userId/add ─────────────────────────────────────
router.post(
  "/:userId/add",
  adminLimiter,
  powerBusinessGuard,
  validate(powerBvUserIdParamSchema, "params"),
  validate(powerBvAddSchema),
  addPowerBVHandler,
);

// ── POST /api/admin/power-bv/:userId/remove ──────────────────────────────────
router.post(
  "/:userId/remove",
  adminLimiter,
  powerBusinessGuard,
  validate(powerBvUserIdParamSchema, "params"),
  validate(powerBvRemoveSchema),
  removePowerBVHandler,
);

export default router;
