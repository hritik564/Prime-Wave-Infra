import { Router } from "express";
import { resolveCode } from "./referrals.controller";

const router = Router();

// GET /api/referrals/resolve?code=ABCD1234
// Public — used during registration to show sponsor name
router.get("/resolve", resolveCode);

export default router;
