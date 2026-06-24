import { Router } from "express";
import { adminLogin, adminGetProfile, triggerMatchingCycle } from "./admin.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAdminAuth } from "../middleware/auth.middleware";
import { authLimiter, adminLimiter } from "../middleware/rateLimiter.middleware";
import { adminLoginSchema } from "./admin.schema";

const router = Router();

// Public
router.post("/login", authLimiter, validate(adminLoginSchema), adminLogin);

// Protected — any authenticated admin
router.get("/profile", adminLimiter, requireAdminAuth, adminGetProfile);

// Manual cycle triggers — any authenticated admin
router.post("/trigger/matching", adminLimiter, requireAdminAuth, triggerMatchingCycle);

export default router;
