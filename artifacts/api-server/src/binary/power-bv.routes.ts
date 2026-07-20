import { Router } from "express";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.middleware.js";
import { adminLimiter } from "../middleware/rateLimiter.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  addPowerBVHandler,
  removePowerBVHandler,
  getPowerSummaryHandler,
  getPowerLedgerHandler,
} from "./power-bv.controller.js";
import {
  powerBvUserIdParamSchema,
  powerBvAddSchema,
  powerBvRemoveSchema,
  powerBvLedgerQuerySchema,
} from "./power-bv.schema.js";

const router = Router();

// SUPER_ADMIN + FINANCE_ADMIN — write operations
const writeGuard = requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN");

// Any authenticated admin — read operations
const readGuard = requireAdminAuth;

// ── GET /api/admin/power-bv/:userId ──────────────────────────────────────────
router.get(
  "/:userId",
  adminLimiter,
  readGuard,
  validate(powerBvUserIdParamSchema, "params"),
  getPowerSummaryHandler,
);

// ── GET /api/admin/power-bv/:userId/ledger ────────────────────────────────────
router.get(
  "/:userId/ledger",
  adminLimiter,
  readGuard,
  validate(powerBvUserIdParamSchema, "params"),
  validate(powerBvLedgerQuerySchema, "query"),
  getPowerLedgerHandler,
);

// ── POST /api/admin/power-bv/:userId/add ─────────────────────────────────────
router.post(
  "/:userId/add",
  adminLimiter,
  writeGuard,
  validate(powerBvUserIdParamSchema, "params"),
  validate(powerBvAddSchema),
  addPowerBVHandler,
);

// ── POST /api/admin/power-bv/:userId/remove ──────────────────────────────────
router.post(
  "/:userId/remove",
  adminLimiter,
  writeGuard,
  validate(powerBvUserIdParamSchema, "params"),
  validate(powerBvRemoveSchema),
  removePowerBVHandler,
);

export default router;
