import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";

// ── Shared DTOs ───────────────────────────────────────────────────────────────

/** Public referral-tree DTO — no email, no passwordHash, no wallet data */
const referralUserSelect = {
  id:                  true,
  username:            true,
  firstName:           true,
  lastName:            true,
  status:              true,
  referralCode:        true,
  directReferralCount: true,
  createdAt:           true,
} as const;

// ── Query schema ──────────────────────────────────────────────────────────────

export const directReferralsQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DirectReferralsQuery = z.infer<typeof directReferralsQuerySchema>;

// ── Full profile ──────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id:                  true,
      email:               true,
      username:            true,
      firstName:           true,
      lastName:            true,
      phone:               true,
      status:              true,
      referralCode:        true,
      referredBy:          true,
      directReferralCount: true,
      createdAt:           true,
      wallet: {
        select: {
          id:               true,
          depositWallet:    true,
          incomeWallet:     true,
          withdrawalWallet: true,
          updatedAt:        true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  return user;
}

// ── Direct referrals ──────────────────────────────────────────────────────────

export async function getDirectReferrals(userId: string, query: DirectReferralsQuery) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [referrals, total] = await prisma.$transaction([
    prisma.user.findMany({
      where:   { sponsorId: userId },
      select:  referralUserSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
    }),
    prisma.user.count({ where: { sponsorId: userId } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: referrals,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

// ── Sponsor info ──────────────────────────────────────────────────────────────

export async function getSponsor(userId: string) {
  // Find via the ReferralHistory relation (the permanent FK record)
  const history = await prisma.referralHistory.findUnique({
    where:  { userId },
    select: { sponsor: { select: referralUserSelect } },
  });

  // No referral history = organic registration with no sponsor
  return history?.sponsor ?? null;
}

// ── Referral link ─────────────────────────────────────────────────────────────

export async function getReferralLink(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { referralCode: true, directReferralCount: true },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  // Use REPLIT_DOMAINS (comma-separated) in production, empty string in dev
  const rawDomains = process.env["REPLIT_DOMAINS"] ?? "";
  const primaryDomain = rawDomains.split(",")[0]?.trim() ?? "";
  const baseUrl = primaryDomain ? `https://${primaryDomain}` : "";

  return {
    referralCode:        user.referralCode,
    referralLink:        `${baseUrl}/register?ref=${user.referralCode}`,
    directReferralCount: user.directReferralCount,
  };
}
