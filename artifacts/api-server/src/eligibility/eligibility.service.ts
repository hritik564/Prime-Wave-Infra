import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

const MIN_INVESTMENT_AMOUNT = new Prisma.Decimal("100");

/**
 * Prime Wave — Binary Qualification Gate
 *
 * A member is Binary-Qualified only if ALL THREE conditions are met:
 *   1. Has at least one ACTIVE investment with amount >= $100
 *   2. Has ≥1 direct referral on the LEFT binary leg
 *   3. Has ≥1 direct referral on the RIGHT binary leg
 *
 * Used exclusively by: Binary Matching, Orbit, and Salary engines.
 * NOT used by Level Income (pure referral commission — Sprint 28J).
 */
export async function isBinaryQualified(
  userId: string,
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  const client = tx ?? prisma;

  const user = await client.user.findUnique({
    where:  { id: userId },
    select: {
      directLeftCount:  true,
      directRightCount: true,
      investments: {
        where: {
          status: "ACTIVE",
          amount: { gte: MIN_INVESTMENT_AMOUNT },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user) return false;

  return (
    user.directLeftCount  >= 1 &&
    user.directRightCount >= 1 &&
    user.investments.length > 0
  );
}

/** @deprecated Use isBinaryQualified. Alias kept for one-release migration safety — remove after Sprint 28K. */
export const isMemberActive = isBinaryQualified;

/**
 * Returns the full binary qualification breakdown for a user.
 * Exposed via GET /api/users/active-status.
 * The "isActive" field in the response reflects binary qualification status.
 */
export async function getMemberStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      directLeftCount:  true,
      directRightCount: true,
      investments: {
        where: {
          status: "ACTIVE",
          amount: { gte: MIN_INVESTMENT_AMOUNT },
        },
        select: { id: true, amount: true },
        take: 1,
      },
    },
  });

  if (!user) {
    return {
      isActive:         false,
      hasInvestment:    false,
      hasLeftReferral:  false,
      hasRightReferral: false,
      directLeftCount:  0,
      directRightCount: 0,
    };
  }

  const hasInvestment    = user.investments.length > 0;
  const hasLeftReferral  = user.directLeftCount  >= 1;
  const hasRightReferral = user.directRightCount >= 1;

  return {
    isActive:         hasInvestment && hasLeftReferral && hasRightReferral,
    hasInvestment,
    hasLeftReferral,
    hasRightReferral,
    directLeftCount:  user.directLeftCount,
    directRightCount: user.directRightCount,
  };
}
