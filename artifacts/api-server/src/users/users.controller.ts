import type { Request, Response, NextFunction } from "express";
import {
  getUserProfile,
  updateUserProfile,
  getDirectReferrals,
  getSponsor,
  getReferralLink,
} from "./users.service";
import { getMemberStatus } from "../eligibility/eligibility.service";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { DirectReferralsQuery, UpdateProfileInput } from "./users.service";

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const profile = await getUserProfile(user.sub);
    sendSuccess(res, profile, "Profile fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input = req.body as UpdateProfileInput;
    const profile = await updateUserProfile(user.sub, input);
    sendSuccess(res, profile, "Profile updated successfully");
  } catch (err) {
    next(err);
  }
}

export async function getDirectReferralsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query  = getParsed<DirectReferralsQuery>(res, "query");
    const result = await getDirectReferrals(user.sub, query);
    sendSuccess(res, result, "Direct referrals fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getSponsorHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user }  = req as AuthenticatedRequest;
    const sponsor   = await getSponsor(user.sub);
    sendSuccess(res, { sponsor }, "Sponsor fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getReferralLinkHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result   = await getReferralLink(user.sub);
    sendSuccess(res, result, "Referral link fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getActiveStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const status   = await getMemberStatus(user.sub);
    sendSuccess(res, status, "Active status fetched successfully");
  } catch (err) {
    next(err);
  }
}
