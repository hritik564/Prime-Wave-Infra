import { Router } from "express";
import {
  adminLogin,
  adminGetProfile,
  triggerMatchingCycle,
  triggerOrbitCycle,
  listSettings,
  updateSetting,
} from "./admin.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAdminAuth } from "../middleware/auth.middleware";
import { authLimiter, adminLimiter } from "../middleware/rateLimiter.middleware";
import { adminLoginSchema } from "./admin.schema";

const router = Router();

// Public
router.post("/login", authLimiter, validate(adminLoginSchema), adminLogin);

// Protected — any authenticated admin
router.get("/profile", adminLimiter, requireAdminAuth, adminGetProfile);

// Manual cycle triggers — any authenticated admin (error recovery)
router.post("/trigger/matching", adminLimiter, requireAdminAuth, triggerMatchingCycle);
router.post("/trigger/orbit",    adminLimiter, requireAdminAuth, triggerOrbitCycle);

// System settings
router.get("/settings",      adminLimiter, requireAdminAuth, listSettings);
router.patch("/settings/:key", adminLimiter, requireAdminAuth, updateSetting);

export default router;
