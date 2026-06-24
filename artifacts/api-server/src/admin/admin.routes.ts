import { Router } from "express";
import { adminLogin, adminGetProfile } from "./admin.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAdminAuth } from "../middleware/auth.middleware";
import { authLimiter, adminLimiter } from "../middleware/rateLimiter.middleware";
import { adminLoginSchema } from "./admin.schema";

const router = Router();

// Public
router.post("/login", authLimiter, validate(adminLoginSchema), adminLogin);

// Protected — any authenticated admin
router.get("/profile", adminLimiter, requireAdminAuth, adminGetProfile);

export default router;
