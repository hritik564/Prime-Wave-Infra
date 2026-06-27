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
  getAdminWithdrawalStatsHandler,
  getAdminWithdrawalByIdHandler,
  holdWithdrawalHandler,
  updateWithdrawalNotesHandler,
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
import {
  getAdminWalletsHandler,
  getAdminWalletStatsHandler,
  getAdminWalletByIdHandler,
  saveWalletNotesHandler,
} from "./admin-wallets.controller";
import { adminWalletListQuerySchema, saveWalletNotesSchema } from "./admin-wallets.schema";
import {
  listAdminInvestmentsHandler,
  getAdminInvestmentHandler,
} from "./admin-investments.controller";
import { adminInvestmentListQuerySchema } from "./admin-investments.schema";
import {
  getAdminBinaryNetworkHandler,
  getAdminBinaryStatsHandler,
  getAdminBinaryDetailHandler,
  saveAdminBinaryNotesHandler,
} from "./admin-binary.controller";
import { adminBinaryListQuerySchema, saveBinaryNotesSchema } from "./admin-binary.schema";
import {
  revenueReportHandler,
  dailyBusinessReportHandler,
  topEarnersHandler,
  topSponsorsHandler,
  rankDistributionHandler,
  networkDistributionHandler,
  pendingOperationsHandler,
  riskReportHandler,
  userIncomeSummaryHandler,
} from "./reports/reports.controller";
import {
  exportUsersHandler,
  exportDepositsHandler,
  exportWithdrawalsHandler,
  exportSalaryIncomeHandler,
  exportBinaryIncomeHandler,
} from "./reports/csv-export.controller";
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
  holdWithdrawalSchema,
  updateWithdrawalNotesSchema,
} from "../withdrawals/withdrawals.schema";
import {
  userSearchQuerySchema,
  walletAdjustmentSchema,
} from "./admin-dashboard.schema";
import {
  dateRangeSchema,
  paginatedDateRangeSchema,
  topListSchema,
} from "./reports/reports.schema";

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

// ── Reports — SUPER_ADMIN only ────────────────────────────────────────────────
router.get(
  "/reports/revenue",
  adminLimiter, superAdminGuard,
  validate(dateRangeSchema, "query"),
  revenueReportHandler,
);

router.get(
  "/reports/daily-business",
  adminLimiter, superAdminGuard,
  validate(paginatedDateRangeSchema, "query"),
  dailyBusinessReportHandler,
);

router.get(
  "/reports/top-earners",
  adminLimiter, superAdminGuard,
  validate(topListSchema, "query"),
  topEarnersHandler,
);

router.get(
  "/reports/top-sponsors",
  adminLimiter, superAdminGuard,
  validate(topListSchema, "query"),
  topSponsorsHandler,
);

router.get("/reports/rank-distribution",    adminLimiter, superAdminGuard, rankDistributionHandler);
router.get(
  "/reports/network-distribution",
  adminLimiter, superAdminGuard,
  validate(dateRangeSchema, "query"),
  networkDistributionHandler,
);
router.get("/reports/pending",              adminLimiter, superAdminGuard, pendingOperationsHandler);
router.get("/reports/risk",                 adminLimiter, superAdminGuard, riskReportHandler);

// ── CSV exports — SUPER_ADMIN only ───────────────────────────────────────────
router.get("/reports/export/users",         adminLimiter, superAdminGuard, exportUsersHandler);
router.get("/reports/export/deposits",      adminLimiter, superAdminGuard, exportDepositsHandler);
router.get("/reports/export/withdrawals",   adminLimiter, superAdminGuard, exportWithdrawalsHandler);
router.get("/reports/export/salary-income", adminLimiter, superAdminGuard, exportSalaryIncomeHandler);
router.get("/reports/export/binary-income", adminLimiter, superAdminGuard, exportBinaryIncomeHandler);

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

router.get(
  "/users/:id/income-summary",
  adminLimiter,
  superAdminGuard,
  userIncomeSummaryHandler,
);

// ── Wallet Control Center — SUPER_ADMIN + FINANCE_ADMIN ──────────────────────
router.get(
  "/wallets",
  adminLimiter,
  financeAdminGuard,
  validate(adminWalletListQuerySchema, "query"),
  getAdminWalletsHandler,
);

router.get(
  "/wallets/stats",
  adminLimiter,
  financeAdminGuard,
  getAdminWalletStatsHandler,
);

router.get(
  "/wallets/:userId",
  adminLimiter,
  financeAdminGuard,
  getAdminWalletByIdHandler,
);

router.patch(
  "/wallets/:userId/notes",
  adminLimiter,
  financeAdminGuard,
  validate(saveWalletNotesSchema),
  saveWalletNotesHandler,
);

// ── Wallet adjustments — SUPER_ADMIN + FINANCE_ADMIN ─────────────────────────
router.post(
  "/wallet-adjustments",
  adminLimiter,
  financeAdminGuard,
  validate(walletAdjustmentSchema),
  walletAdjustmentHandler,
);

// ── Binary Network Control Center — SUPER_ADMIN only ─────────────────────────
router.get(
  "/binary/stats",
  adminLimiter, superAdminGuard,
  getAdminBinaryStatsHandler,
);

router.get(
  "/binary/network",
  adminLimiter, superAdminGuard,
  validate(adminBinaryListQuerySchema, "query"),
  getAdminBinaryNetworkHandler,
);

router.get(
  "/binary/:userId",
  adminLimiter, superAdminGuard,
  getAdminBinaryDetailHandler,
);

router.patch(
  "/binary/:userId/notes",
  adminLimiter, superAdminGuard,
  validate(saveBinaryNotesSchema),
  saveAdminBinaryNotesHandler,
);

// ── Investment monitoring — SUPER_ADMIN only ──────────────────────────────────
router.get(
  "/investments",
  adminLimiter, superAdminGuard,
  validate(adminInvestmentListQuerySchema, "query"),
  listAdminInvestmentsHandler,
);

router.get(
  "/investments/:id",
  adminLimiter, superAdminGuard,
  getAdminInvestmentHandler,
);

// ── Withdrawal admin — SUPER_ADMIN and FINANCE_ADMIN only ─────────────────────
const withdrawalAdminGuard = requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN");

router.get(
  "/withdrawals",
  adminLimiter,
  withdrawalAdminGuard,
  validate(adminWithdrawalListQuerySchema, "query"),
  getAdminWithdrawalsHandler,
);

router.get(
  "/withdrawals/stats",
  adminLimiter,
  withdrawalAdminGuard,
  getAdminWithdrawalStatsHandler,
);

router.get(
  "/withdrawals/:id",
  adminLimiter,
  withdrawalAdminGuard,
  getAdminWithdrawalByIdHandler,
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

router.post(
  "/withdrawals/:id/hold",
  adminLimiter,
  withdrawalAdminGuard,
  validate(holdWithdrawalSchema),
  holdWithdrawalHandler,
);

router.patch(
  "/withdrawals/:id/notes",
  adminLimiter,
  withdrawalAdminGuard,
  validate(updateWithdrawalNotesSchema),
  updateWithdrawalNotesHandler,
);

export default router;
