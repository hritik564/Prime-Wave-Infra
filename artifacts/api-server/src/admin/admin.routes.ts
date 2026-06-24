import { Router } from "express";
import {
  adminLogin,
  adminGetProfile,
  triggerMatchingCycle,
  triggerOrbitCycle,
  listSettings,
  updateSetting,
} from "./admin.controller";
import {
  getPendingDepositsHandler,
  getDepositStatsHandler,
  approveDepositHandler,
  rejectDepositHandler,
} from "./admin-deposits.controller";
import {
  getAdminWithdrawalsHandler,
  approveWithdrawalHandler,
  completeWithdrawalHandler,
  rejectWithdrawalHandler,
} from "./admin-withdrawals.controller";
import {
  getDashboardHandler,
  getSystemHealthHandler,
} from "./admin-dashboard.controller";
import {
  searchUsersHandler,
  getUserDetailHandler,
  blockUserHandler,
  suspendUserHandler,
  activateUserHandler,
} from "./admin-users.controller";
import { walletAdjustmentHandler } from "./admin-wallet-adjustments.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.middleware";
import { authLimiter, adminLimiter } from "../middleware/rateLimiter.middleware";
import { adminLoginSchema } from "./admin.schema";
import {
  adminDepositListQuerySchema,
  rejectDepositSchema,
} from "../deposits/deposits.schema";
import {
  adminWithdrawalListQuerySchema,
  approveWithdrawalSchema,
  completeWithdrawalSchema,
  rejectWithdrawalSchema,
} from "../withdrawals/withdrawals.schema";
import {
  userSearchQuerySchema,
  walletAdjustmentSchema,
} from "./admin-dashboard.schema";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/login", authLimiter, validate(adminLoginSchema), adminLogin);

// ── Protected — any authenticated admin ───────────────────────────────────────
router.get("/profile", adminLimiter, requireAdminAuth, adminGetProfile);

// Manual cycle triggers
router.post("/trigger/matching", adminLimiter, requireAdminAuth, triggerMatchingCycle);
router.post("/trigger/orbit",    adminLimiter, requireAdminAuth, triggerOrbitCycle);

// System settings
router.get("/settings",        adminLimiter, requireAdminAuth, listSettings);
router.patch("/settings/:key", adminLimiter, requireAdminAuth, updateSetting);

// ── Deposit admin — SUPER_ADMIN and FINANCE_ADMIN only ────────────────────────
const financeAdminGuard = requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN");

router.get(
  "/deposits/pending",
  adminLimiter,
  financeAdminGuard,
  validate(adminDepositListQuerySchema, "query"),
  getPendingDepositsHandler,
);

router.get(
  "/deposits/stats",
  adminLimiter,
  financeAdminGuard,
  getDepositStatsHandler,
);

router.post(
  "/deposits/:id/approve",
  adminLimiter,
  financeAdminGuard,
  approveDepositHandler,
);

router.post(
  "/deposits/:id/reject",
  adminLimiter,
  financeAdminGuard,
  validate(rejectDepositSchema, "body"),
  rejectDepositHandler,
);

// ── Dashboard — SUPER_ADMIN only ──────────────────────────────────────────────
const superAdminGuard = requireAdminRoles("SUPER_ADMIN");

router.get("/dashboard",     adminLimiter, superAdminGuard, getDashboardHandler);
router.get("/system-health", adminLimiter, superAdminGuard, getSystemHealthHandler);

// ── User management — SUPER_ADMIN + SUPPORT_ADMIN ─────────────────────────────
const supportAdminGuard = requireAdminRoles("SUPER_ADMIN", "SUPPORT_ADMIN");

router.get(
  "/users/search",
  adminLimiter,
  supportAdminGuard,
  validate(userSearchQuerySchema, "query"),
  searchUsersHandler,
);

router.get(
  "/users/:id",
  adminLimiter,
  supportAdminGuard,
  getUserDetailHandler,
);

router.post(
  "/users/:id/block",
  adminLimiter,
  supportAdminGuard,
  blockUserHandler,
);

router.post(
  "/users/:id/suspend",
  adminLimiter,
  supportAdminGuard,
  suspendUserHandler,
);

router.post(
  "/users/:id/activate",
  adminLimiter,
  supportAdminGuard,
  activateUserHandler,
);

// ── Wallet adjustments — SUPER_ADMIN + FINANCE_ADMIN ─────────────────────────
router.post(
  "/wallet-adjustments",
  adminLimiter,
  financeAdminGuard,
  validate(walletAdjustmentSchema),
  walletAdjustmentHandler,
);

// ── Withdrawal admin — SUPER_ADMIN and FINANCE_ADMIN only ─────────────────────
const withdrawalAdminGuard = requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN");

router.get(
  "/withdrawals/pending",
  adminLimiter,
  withdrawalAdminGuard,
  validate(adminWithdrawalListQuerySchema, "query"),
  getAdminWithdrawalsHandler,
);

router.post(
  "/withdrawals/:id/approve",
  adminLimiter,
  withdrawalAdminGuard,
  validate(approveWithdrawalSchema),
  approveWithdrawalHandler,
);

router.post(
  "/withdrawals/:id/complete",
  adminLimiter,
  withdrawalAdminGuard,
  validate(completeWithdrawalSchema),
  completeWithdrawalHandler,
);

router.post(
  "/withdrawals/:id/reject",
  adminLimiter,
  withdrawalAdminGuard,
  validate(rejectWithdrawalSchema),
  rejectWithdrawalHandler,
);

export default router;
