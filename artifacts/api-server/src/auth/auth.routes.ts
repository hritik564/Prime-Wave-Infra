import { Router } from "express";
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  changeUserPassword,
  logout,
  exitImpersonation,
} from "./auth.controller";
import { validate } from "../middleware/validate.middleware";
import {
  requireAuth,
  requireAuthAllowingPasswordReset,
  requirePasswordChangeAuth,
} from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimiter.middleware";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "./auth.schema";

const router = Router();

// Public — strict rate limit on auth endpoints
router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), resetPassword);

// Protected
router.post(
  "/change-password",
  requirePasswordChangeAuth,
  authLimiter,
  validate(changePasswordSchema),
  changeUserPassword,
);
router.post("/logout", requireAuth, logout);

// Impersonation exit (called by the frontend using the impersonation JWT)
router.post("/impersonation/exit", requireAuthAllowingPasswordReset, exitImpersonation);

export default router;
