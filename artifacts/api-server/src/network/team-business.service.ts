import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";

// ── Team Business (Sprint 30I, updated Sprint 34A.1) ────────────────────────
//
// READ-ONLY reporting metric.
//
// Total Team Business = Organic Business + Power Business
//   Organic Business = sum of APPROVED DepositRequest amounts in binary downline
//   Power Business   = (powerLeftBV + powerRightBV) × 100  (1 BV = $100)
//
// Traversal: binaryParentId ONLY (never sponsorId).
// This service must NEVER write anything — no income, no BV, no carry-forward.
//
// Genesis-funded SP accounts already have valid APPROVED DepositRequest rows
// (see networkFunder.ts) and are included here exactly like any other
// approved deposit — this is intentional per the business rule.

async function getBinaryDownlineIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE bd AS (
      SELECT id FROM users WHERE "binaryParentId" = ${userId}::text
      UNION ALL
      SELECT u.id FROM users u
      INNER JOIN bd ON u."binaryParentId" = bd.id
    )
    SELECT id FROM bd
  `;
  return rows.map((r) => r.id);
}

async function sumApprovedDeposits(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const agg = await prisma.depositRequest.aggregate({
    where:  { userId: { in: userIds }, status: "APPROVED" },
    _sum:   { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

export async function getTeamBusiness(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, powerLeftBV: true, powerRightBV: true },
  });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

  const [leftChild, rightChild] = await Promise.all([
    prisma.user.findFirst({ where: { binaryParentId: userId, position: "LEFT"  }, select: { id: true } }),
    prisma.user.findFirst({ where: { binaryParentId: userId, position: "RIGHT" }, select: { id: true } }),
  ]);

  const [leftDescIds, rightDescIds] = await Promise.all([
    leftChild  ? getBinaryDownlineIds(leftChild.id)  : Promise.resolve([]),
    rightChild ? getBinaryDownlineIds(rightChild.id) : Promise.resolve([]),
  ]);

  const leftIds  = leftChild  ? [leftChild.id,  ...leftDescIds]  : [];
  const rightIds = rightChild ? [rightChild.id, ...rightDescIds] : [];

  const [leftOrganicBusiness, rightOrganicBusiness] = await Promise.all([
    sumApprovedDeposits(leftIds),
    sumApprovedDeposits(rightIds),
  ]);

  // Power Business: remaining Power BV × $100 per BV
  const leftPowerBV  = Number(user.powerLeftBV);
  const rightPowerBV = Number(user.powerRightBV);
  const leftPowerBusiness  = leftPowerBV  * 100;
  const rightPowerBusiness = rightPowerBV * 100;

  // Combined totals
  const leftBusiness  = leftOrganicBusiness  + leftPowerBusiness;
  const rightBusiness = rightOrganicBusiness + rightPowerBusiness;
  const totalBusiness = leftBusiness + rightBusiness;

  return {
    // Breakdown — organic (approved deposits only)
    leftOrganicBusiness:  leftOrganicBusiness.toFixed(2),
    rightOrganicBusiness: rightOrganicBusiness.toFixed(2),
    totalOrganicBusiness: (leftOrganicBusiness + rightOrganicBusiness).toFixed(2),
    // Breakdown — power (remaining BV × $100)
    leftPowerBusiness:    leftPowerBusiness.toFixed(2),
    rightPowerBusiness:   rightPowerBusiness.toFixed(2),
    totalPowerBusiness:   (leftPowerBusiness + rightPowerBusiness).toFixed(2),
    leftPowerBV:          leftPowerBV.toFixed(2),
    rightPowerBV:         rightPowerBV.toFixed(2),
    // Combined totals — what every Team Business display must show
    leftBusiness:  leftBusiness.toFixed(2),
    rightBusiness: rightBusiness.toFixed(2),
    totalBusiness: totalBusiness.toFixed(2),
  };
}
