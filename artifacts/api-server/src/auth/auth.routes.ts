import { Router } from "express";
import { register, login, changeUserPassword, logout } from "./auth.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimiter.middleware";
import { registerSchema, loginSchema, changePasswordSchema } from "./auth.schema";

const router = Router();

// Public — strict rate limit on auth endpoints
router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);

// Protected
router.post(
  "/change-password",
  requireAuth,
  authLimiter,
  validate(changePasswordSchema),
  changeUserPassword,
);
router.post("/logout", requireAuth, logout);

export default router;
