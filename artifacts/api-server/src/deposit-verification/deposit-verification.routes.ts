import { Router } from "express";
import { requireAuth, requireAdminAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  submitVerificationSchema,
  verificationStatusSchema,
  adminListVerificationsSchema,
  adminGetVerificationSchema,
  adminRetryVerificationSchema,
} from "./deposit-verification.schema";
import {
  submitVerification,
  getVerificationStatus,
  adminListVerifications,
  adminGetVerification,
  adminGetMetrics,
  adminRetryVerification,
} from "./deposit-verification.controller";

// ── User routes (/api/deposit-verifications) ──────────────────────────────────

const userRouter = Router();

userRouter.post(
  "/submit",
  requireAuth,
  validate(submitVerificationSchema),
  submitVerification,
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

adminRouter.get(
  "/:id",
  requireAdminAuth,
  validate(adminGetVerificationSchema, "params"),
  adminGetVerification,
);

export { userRouter as depositVerificationRouter, adminRouter as adminDepositVerificationRouter };
