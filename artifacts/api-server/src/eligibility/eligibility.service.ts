import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

const MIN_INVESTMENT_AMOUNT = new Prisma.Decimal("100");

/**
 * Prime Wave — Active Member Qualification (LOCKED)
 *
 * A member is ACTIVE only if BOTH conditions are met:
 *   1. Has at least one ACTIVE investment with amount >= $100
 *   2. Has ≥1 direct referral on the LEFT leg
 *      AND ≥1 direct referral on the RIGHT leg
 *
 * Inactive members receive ONLY ROI and Principal Return.
 * All other income engines (Binary, Orbit, Salary, Level) must call
 * this service before crediting any income.
 */
export async function isMemberActive(
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

/**
 * Returns full breakdown of why a user is active/inactive.
 * Used by the active-status API endpoint and dashboard display.
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
