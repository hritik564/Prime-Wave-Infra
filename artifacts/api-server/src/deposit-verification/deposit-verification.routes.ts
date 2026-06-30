import { Router } from "express";
import { requireAuth, requireAdminAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  submitVerificationSchema,
  verificationStatusSchema,
  userHistorySchema,
  adminListVerificationsSchema,
  adminGetVerificationSchema,
  adminRetryVerificationSchema,
  adminManualApproveParamsSchema,
  adminManualApproveBodySchema,
} from "./deposit-verification.schema";
import {
  submitVerification,
  getVerificationStatus,
  getUserVerificationHistory,
  adminListVerifications,
  adminGetVerification,
  adminGetMetrics,
  adminRetryVerification,
  adminManualApproveVerification,
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

adminRouter.get(
  "/",
  requireAdminAuth,
  validate(adminListVerificationsSchema, "query"),
  adminListVerifications,
);

// /metrics must be declared BEFORE /:id so Express doesn't match "metrics" as an id param
adminRouter.get(
  "/metrics",
  requireAdminAuth,
  adminGetMetrics,
);

adminRouter.post(
  "/:id/retry",
  requireAdminAuth,
  validate(adminRetryVerificationSchema, "params"),
  adminRetryVerification,
);

adminRouter.post(
  "/:id/manual-approve",
  requireAdminAuth,
  validate(adminManualApproveParamsSchema, "params"),
  validate(adminManualApproveBodySchema, "body"),
  adminManualApproveVerification,
);

adminRouter.get(
  "/:id",
  requireAdminAuth,
  validate(adminGetVerificationSchema, "params"),
  adminGetVerification,
);

export { userRouter as depositVerificationRouter, adminRouter as adminDepositVerificationRouter };
