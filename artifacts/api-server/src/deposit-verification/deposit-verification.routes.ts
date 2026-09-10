import { Router } from "express";
import { requireAuth, requireAdminRoles } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  submitVerificationSchema,
  verificationStatusSchema,
  userHistorySchema,
  adminListVerificationsSchema,
  adminGetVerificationSchema,
  adminRetryVerificationSchema,
  adminRevalidateParamsSchema,
  adminManualApproveParamsSchema,
  adminManualApproveBodySchema,
  adminRejectParamsSchema,
  adminRejectBodySchema,
} from "./deposit-verification.schema";
import {
  submitVerification,
  getVerificationStatus,
  getUserVerificationHistory,
  adminListVerifications,
  adminGetVerification,
  adminGetMetrics,
  adminRetryVerification,
  adminRevalidateVerification,
  adminManualApproveVerification,
  adminRejectVerification,
} from "./deposit-verification.controller";

// ── User routes (/api/deposit-verifications) ──────────────────────────────────

const userRouter = Router();

userRouter.post(
  "/submit",
  requireAuth,
  validate(submitVerificationSchema),
  submitVerification,
);

// /history must be before /:id so Express does not match "history" as an id param
userRouter.get(
  "/history",
  requireAuth,
  validate(userHistorySchema, "query"),
  getUserVerificationHistory,
);

userRouter.get(
  "/:id/status",
  requireAuth,
  validate(verificationStatusSchema, "params"),
  getVerificationStatus,
);

// ── Admin routes (/api/admin/deposit-verifications) ───────────────────────────

const adminRouter = Router();
const adminReadGuard = requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN", "STAFF_OPERATIONS");
const adminMutationGuard = requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN");

adminRouter.get(
  "/",
  adminReadGuard,
  validate(adminListVerificationsSchema, "query"),
  adminListVerifications,
);

// /metrics must be declared BEFORE /:id so Express doesn't match "metrics" as an id param
adminRouter.get(
  "/metrics",
  adminReadGuard,
  adminGetMetrics,
);

adminRouter.post(
  "/:id/retry",
  adminMutationGuard,
  validate(adminRetryVerificationSchema, "params"),
  adminRetryVerification,
);

adminRouter.post(
  "/:id/re-validate",
  adminMutationGuard,
  validate(adminRevalidateParamsSchema, "params"),
  adminRevalidateVerification,
);

adminRouter.post(
  "/:id/manual-approve",
  adminMutationGuard,
  validate(adminManualApproveParamsSchema, "params"),
  validate(adminManualApproveBodySchema, "body"),
  adminManualApproveVerification,
);

adminRouter.post(
  "/:id/reject",
  adminMutationGuard,
  validate(adminRejectParamsSchema, "params"),
  validate(adminRejectBodySchema, "body"),
  adminRejectVerification,
);

adminRouter.get(
  "/:id",
  adminReadGuard,
  validate(adminGetVerificationSchema, "params"),
  adminGetVerification,
);

export { userRouter as depositVerificationRouter, adminRouter as adminDepositVerificationRouter };
