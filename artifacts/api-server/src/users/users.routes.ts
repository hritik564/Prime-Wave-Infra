import { Router } from "express";
import { getProfile } from "./users.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/profile", requireAuth, getProfile);

export default router;
