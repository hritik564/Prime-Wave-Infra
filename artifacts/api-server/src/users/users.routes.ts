import { Router } from "express";
import {
  getProfile,
  getDirectReferralsHandler,
  getSponsorHandler,
  getReferralLinkHandler,
} from "./users.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { directReferralsQuerySchema } from "./users.service";

const router = Router();

// All user routes require authentication
router.use(requireAuth);

// GET /api/users/profile
router.get("/profile", getProfile);

// GET /api/users/referral-link
router.get("/referral-link", getReferralLinkHandler);

// GET /api/users/sponsor
router.get("/sponsor", getSponsorHandler);

// GET /api/users/direct-referrals — paginated list of users sponsored by caller
router.get(
  "/direct-referrals",
  validate(directReferralsQuerySchema, "query"),
  getDirectReferralsHandler,
);

export default router;
