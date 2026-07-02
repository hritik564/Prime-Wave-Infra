import { Router } from "express";
import {
  adminLogin,
  adminGetProfile,
  triggerMatchingCycle,
  triggerOrbitCycle,
  triggerSalaryEvaluateAll,
  triggerSeedBinaryTree,
  triggerRoiCycle,
  triggerSalaryCycle,
  triggerFullCycle,
  triggerRepairSeedInvestments,
  listSettings,
  updateSetting,
} from "./admin.controller";
import {
  getAdminDepositsHandler,
  getPendingDepositsHandler,
  getDepositByIdHandler,
  getDepositStatsHandler,
  approveDepositHandler,
  rejectDepositHandler,
  markDepositConfirmingHandler,
  createManualAdminDepositHandler,
  creditUserWalletHandler,
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
  updateUserHandler,
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
  engineDashboardHandler,
  engineListHandler,
  engineDetailHandler,
  saveEngineNotesHandler,
  releaseQueueHandler,
} from "./admin-engine.controller";
import { engineIdParamSchema, saveEngineNotesBodySchema } from "./admin-engine.schema";
import {
  getAllPlanConfigHandler,
  saveConfigFieldHandler,
  getVersionsHandler,
  getAuditHandler,
  getPlansHandler,
  createPlanHandler,
  updatePlanStatusHandler,
  updatePlanConfigHandler,
  getLevelConfigHandler,
  saveLevelConfigHandler,
  getSalaryRanksHandler,
  updateSalaryRankHandler,
} from "./admin-plans.controller";
import {
  saveConfigFieldSchema,
  configKeyParamSchema,
  createPlanSchema,
  planIdParamSchema,
  updatePlanStatusSchema,
  updatePlanConfigSchema,
  saveLevelConfigSchema,
  rankNameParamSchema,
  updateSalaryRankSchema,
} from "./admin-plans.schema";
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
import { depositAuditHandler } from "./reports/deposit-audit.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.middleware";
import { authLimiter, adminLimiter } from "../middleware/rateLimiter.middleware";
import { adminLoginSchema } from "./admin.schema";
import {
  adminDepositListQuerySchema,
  rejectDepositSchema,
  manualAdminDepositSchema,
  walletCreditSchema,
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

import { adminDepositVerificationRouter } from "../deposit-verification/deposit-verification.routes";
import {
  listCompanyWalletsHandler,
  updateCompanyWalletHandler,
} from "./admin-company-wallets.controller";
import {
  rdActivationHandler,
  reconcileCountersHandler,
} from "./admin-scripts.controller";
import {
  updateCompanyWalletParamSchema,
  updateCompanyWalletBodySchema,
} from "./admin-company-wallets.schema";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/login", authLimiter, validate(adminLoginSchema), adminLogin);

// ── Protected — any authenticated admin ───────────────────────────────────────
router.get("/profile", adminLimiter, requireAdminAuth, adminGetProfile);

// Manual cycle triggers
router.post("/trigger/matching",       adminLimiter, requireAdminAuth, triggerMatchingCycle);
router.post("/trigger/orbit",          adminLimiter, requireAdminAuth, triggerOrbitCycle);
router.post("/trigger/roi",            adminLimiter, requireAdminRoles("SUPER_ADMIN"), triggerRoiCycle);
router.post("/trigger/salary-cycle",   adminLimiter, requireAdminRoles("SUPER_ADMIN"), triggerSalaryCycle);
router.post("/trigger/full-cycle",     adminLimiter, requireAdminRoles("SUPER_ADMIN"), triggerFullCycle);
router.post("/salary/evaluate-all",    adminLimiter, requireAdminAuth, triggerSalaryEvaluateAll);
router.post("/dev/seed-binary-tree",   adminLimiter, requireAdminRoles("SUPER_ADMIN"), triggerSeedBinaryTree);
router.post("/dev/repair-seed-investments", adminLimiter, requireAdminRoles("SUPER_ADMIN"), triggerRepairSeedInvestments);

// System settings
router.get("/settings",        adminLimiter, requireAdminAuth, listSettings);
router.patch("/settings/:key", adminLimiter, requireAdminAuth, updateSetting);

// ── Deposit admin — SUPER_ADMIN and FINANCE_ADMIN only ────────────────────────
const financeAdminGuard = requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN");

router.get(
  "/deposits",
  adminLimiter,
  financeAdminGuard,
  validate(adminDepositListQuerySchema, "query"),
  getAdminDepositsHandler,
);

router.get(
  "/deposits/stats",
  adminLimiter,
  financeAdminGuard,
  getDepositStatsHandler,
);

router.get(
  "/deposits/pending",
  adminLimiter,
  financeAdminGuard,
  validate(adminDepositListQuerySchema, "query"),
  getPendingDepositsHandler,
);

router.get(
  "/deposits/:id",
  adminLimiter,
  financeAdminGuard,
  getDepositByIdHandler,
);

router.post(
  "/deposits/manual",
  adminLimiter,
  financeAdminGuard,
  validate(manualAdminDepositSchema, "body"),
  createManualAdminDepositHandler,
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

router.post(
  "/deposits/:id/mark-confirming",
  adminLimiter,
  financeAdminGuard,
  markDepositConfirmingHandler,
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

// ── Deposit idempotency audit — SUPER_ADMIN only ─────────────────────────────
router.get("/reports/deposit-audit",        adminLimiter, superAdminGuard, depositAuditHandler);

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

router.patch(
  "/users/:id",
  adminLimiter,
  superAdminGuard,
  updateUserHandler,
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

// ── Manual Wallet Credit — SUPER_ADMIN + FINANCE_ADMIN ───────────────────────
router.post(
  "/wallets/credit",
  adminLimiter,
  financeAdminGuard,
  validate(walletCreditSchema, "body"),
  creditUserWalletHandler,
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

// ── Plans & Compensation Configuration ───────────────────────────────────────
// Specific sub-paths before param routes to avoid collision
router.get( "/plans/config",              adminLimiter, superAdminGuard, getAllPlanConfigHandler);
router.get( "/plans/versions",            adminLimiter, superAdminGuard, getVersionsHandler);
router.get( "/plans/audit",               adminLimiter, superAdminGuard, getAuditHandler);
router.get( "/plans/level-config",        adminLimiter, superAdminGuard, getLevelConfigHandler);
router.put( "/plans/level-config",        adminLimiter, superAdminGuard, validate(saveLevelConfigSchema), saveLevelConfigHandler);
router.get( "/plans/salary-ranks",        adminLimiter, superAdminGuard, getSalaryRanksHandler);
router.get( "/plans",                     adminLimiter, superAdminGuard, getPlansHandler);
router.post("/plans",                     adminLimiter, superAdminGuard, validate(createPlanSchema), createPlanHandler);
router.patch(
  "/plans/config/:key",
  adminLimiter, superAdminGuard,
  validate(configKeyParamSchema, "params"),
  validate(saveConfigFieldSchema),
  saveConfigFieldHandler,
);
router.patch(
  "/plans/:id/status",
  adminLimiter, superAdminGuard,
  validate(planIdParamSchema, "params"),
  validate(updatePlanStatusSchema),
  updatePlanStatusHandler,
);
router.patch(
  "/plans/salary-ranks/:rankName",
  adminLimiter, superAdminGuard,
  validate(rankNameParamSchema, "params"),
  validate(updateSalaryRankSchema),
  updateSalaryRankHandler,
);
router.patch(
  "/plans/:id",
  adminLimiter, superAdminGuard,
  validate(planIdParamSchema, "params"),
  validate(updatePlanConfigSchema),
  updatePlanConfigHandler,
);

// ── Income Engine Control Center ──────────────────────────────────────────────
router.get("/engine/dashboard",           adminLimiter, superAdminGuard, engineDashboardHandler);
router.get("/engine/list",                adminLimiter, superAdminGuard, engineListHandler);
router.get("/engine/release-queue",       adminLimiter, superAdminGuard, releaseQueueHandler);
router.get(
  "/engine/:engineId/detail",
  adminLimiter,
  superAdminGuard,
  validate(engineIdParamSchema, "params"),
  engineDetailHandler,
);
router.patch(
  "/engine/:engineId/notes",
  adminLimiter,
  superAdminGuard,
  validate(engineIdParamSchema, "params"),
  validate(saveEngineNotesBodySchema),
  saveEngineNotesHandler,
);

// ── Company Wallet Management — SUPER_ADMIN only ─────────────────────────────
router.get(
  "/company-wallets",
  adminLimiter,
  superAdminGuard,
  listCompanyWalletsHandler,
);

router.patch(
  "/company-wallets/:id",
  adminLimiter,
  superAdminGuard,
  validate(updateCompanyWalletParamSchema, "params"),
  validate(updateCompanyWalletBodySchema),
  updateCompanyWalletHandler,
);

// ── Deposit Verification — SUPER_ADMIN and FINANCE_ADMIN ──────────────────────
router.use("/deposit-verifications", adminLimiter, financeAdminGuard, adminDepositVerificationRouter);

// ── Genesis Scripts — SUPER_ADMIN only ───────────────────────────────────────
router.post("/scripts/rd-activation",      adminLimiter, superAdminGuard, rdActivationHandler);
router.post("/scripts/reconcile-counters", adminLimiter, superAdminGuard, reconcileCountersHandler);

export default router;
