import { Router } from "express";
import {
  getProfile,
  updateProfile,
  getDirectReferralsHandler,
  getSponsorHandler,
  getReferralLinkHandler,
  getActiveStatusHandler,
} from "./users.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { directReferralsQuerySchema, updateProfileSchema } from "./users.service";

const router = Router();

// All user routes require authentication
router.use(requireAuth);

// GET /api/users/profile
router.get("/profile", getProfile);

// PATCH /api/users/profile
router.patch("/profile", validate(updateProfileSchema), updateProfile);

// GET /api/users/referral-link
router.get("/referral-link", getReferralLinkHandler);

// GET /api/users/sponsor
router.get("/sponsor", getSponsorHandler);

// GET /api/users/active-status — active member qualification status + requirements
router.get("/active-status", getActiveStatusHandler);

// GET /api/users/direct-referrals — paginated list of users sponsored by caller
router.get(
  "/direct-referrals",
  validate(directReferralsQuerySchema, "query"),
  getDirectReferralsHandler,
);

export default router;
