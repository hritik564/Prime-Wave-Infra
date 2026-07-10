import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";

// ── Team Business (Sprint 30I) ──────────────────────────────────────────────
//
// READ-ONLY reporting metric. Source of truth: DepositRequest.status = 'APPROVED'.
// Traversal: binaryParentId ONLY (never sponsorId).
// This engine must NEVER read Investment.amount, Wallet.depositWallet,
// WalletTransaction, leftBV, or rightBV, and must NEVER write anything —
// no income, no BV, no carry-forward, no qualification side effects.
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
    select: { id: true },
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

  const [leftBusiness, rightBusiness] = await Promise.all([
    sumApprovedDeposits(leftIds),
    sumApprovedDeposits(rightIds),
  ]);

  const totalBusiness = leftBusiness + rightBusiness;

  return {
    leftBusiness:  leftBusiness.toFixed(2),
    rightBusiness: rightBusiness.toFixed(2),
    totalBusiness: totalBusiness.toFixed(2),
  };
}
