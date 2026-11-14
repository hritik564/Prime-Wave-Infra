import { Prisma } from "@prisma/client";
import type { InvestmentAccountingEventType, InvestmentCapTier } from "@prisma/client";
import { prisma } from "../config/prisma";

const ZERO = new Prisma.Decimal(0);
const HALF_DAY_DIVISOR = new Prisma.Decimal(200);

type Tx = Prisma.TransactionClient;
type AccountRow = {
  userId: string;
  originalCapital: Prisma.Decimal;
  cumulativeRoiAccrued: Prisma.Decimal;
  cumulativeRoiClaimed: Prisma.Decimal;
  cumulativeRoiCompounded: Prisma.Decimal;
  claimableRoi: Prisma.Decimal;
  originalPrincipalReturned: Prisma.Decimal;
  principalOwed: Prisma.Decimal;
  capTier: InvestmentCapTier;
  qualifiedAt: Date | null;
};

export function capMultiple(tier: InvestmentCapTier): Prisma.Decimal {
  return tier === "WORKING" ? new Prisma.Decimal(4) : new Prisma.Decimal(2);
}

export function remainingRoi(account: Pick<AccountRow, "originalCapital" | "cumulativeRoiAccrued" | "capTier">) {
  return Prisma.Decimal.max(
    account.originalCapital.mul(capMultiple(account.capTier)).minus(account.cumulativeRoiAccrued),
    ZERO,
  );
}

export async function ensureCapAccount(tx: Tx, userId: string): Promise<AccountRow> {
  await tx.investmentCapAccount.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const rows = await tx.$queryRaw<AccountRow[]>`
    SELECT "userId", "originalCapital", "cumulativeRoiAccrued",
           "cumulativeRoiClaimed", "cumulativeRoiCompounded", "claimableRoi",
           "originalPrincipalReturned", "principalOwed", "capTier", "qualifiedAt"
    FROM "investment_cap_accounts"
    WHERE "userId" = ${userId}
    FOR UPDATE
  `;
  if (!rows[0]) throw new Error("Investment cap account lock failed");
  return rows[0];
}

async function isWorkingQualified(tx: Tx, userId: string): Promise<boolean> {
  const directs = await tx.user.findMany({
    where: {
      sponsorId: userId,
      status: "ACTIVE",
      investments: {
        some: { status: "ACTIVE", amount: { gte: new Prisma.Decimal(100) } },
      },
    },
    select: { id: true, binaryParentId: true, position: true },
  });
  const legs = new Set<string>();
  for (const direct of directs) {
    let node = direct;
    const visited = new Set<string>();
    while (node.binaryParentId && !visited.has(node.id)) {
      visited.add(node.id);
      if (node.binaryParentId === userId) {
        if (node.position === "LEFT") legs.add("LEFT");
        if (node.position === "RIGHT") legs.add("RIGHT");
        break;
      }
      const parent = await tx.user.findUnique({
        where: { id: node.binaryParentId },
        select: { id: true, binaryParentId: true, position: true },
      });
      if (!parent) break;
      node = parent;
    }
    if (legs.has("LEFT") && legs.has("RIGHT")) return true;
  }
  return false;
}

export async function upgradeQualificationIfEligible(tx: Tx, userId: string): Promise<AccountRow> {
  const account = await ensureCapAccount(tx, userId);
  if (account.capTier === "WORKING" || !(await isWorkingQualified(tx, userId))) return account;

  const qualifiedAt = new Date();
  await tx.investmentCapAccount.update({
    where: { userId },
    data: { capTier: "WORKING", qualifiedAt },
  });
  await tx.investmentAccountingEvent.create({
    data: {
      userId,
      eventType: "TIER_UPGRADE",
      amount: ZERO,
      referenceKey: `tier-upgrade:${userId}`,
      metadata: { from: "NON_WORKING", to: "WORKING", qualifiedAt: qualifiedAt.toISOString() },
    },
  });
  return { ...account, capTier: "WORKING", qualifiedAt };
}

export async function recordContribution(
  tx: Tx,
  userId: string,
  investmentId: string,
  amount: Prisma.Decimal,
): Promise<void> {
  await ensureCapAccount(tx, userId);
  await tx.investmentCapAccount.update({
    where: { userId },
    data: { originalCapital: { increment: amount }, principalOwed: { increment: amount } },
  });
  await tx.investmentAccountingEvent.create({
    data: {
      userId,
      investmentId,
      eventType: "CONTRIBUTION",
      amount,
      referenceKey: `contribution:${investmentId}`,
    },
  });
  await upgradeQualificationIfEligible(tx, userId);
}

export async function getCapSummary(userId: string) {
  const account = await prisma.investmentCapAccount.findUnique({ where: { userId } });
  const originalCapital = account?.originalCapital ?? ZERO;
  const accrued = account?.cumulativeRoiAccrued ?? ZERO;
  const tier = account?.capTier ?? "NON_WORKING";
  const maxRoiEntitlement = originalCapital.mul(capMultiple(tier));
  return {
    originalCapital,
    cumulativeRoiAccrued: accrued,
    cumulativeRoiClaimed: account?.cumulativeRoiClaimed ?? ZERO,
    cumulativeRoiCompounded: account?.cumulativeRoiCompounded ?? ZERO,
    claimableRoi: account?.claimableRoi ?? ZERO,
    originalPrincipalReturned: account?.originalPrincipalReturned ?? ZERO,
    principalOwed: account?.principalOwed ?? ZERO,
    capTier: tier,
    qualifiedAt: account?.qualifiedAt ?? null,
    maxRoiEntitlement,
    remainingRoiEntitlement: Prisma.Decimal.max(maxRoiEntitlement.minus(accrued), ZERO),
    capMultiple: tier === "WORKING" ? 5 : 3,
  };
}

export async function postSinglePlanRoiCycle(userId: string, cycleKey: string): Promise<number> {
  return prismaTransaction(async (tx) => {
    let account = await upgradeQualificationIfEligible(tx, userId);
    const investments = await tx.investment.findMany({
      where: { userId, planType: "SINGLE", status: "ACTIVE" },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      select: {
        id: true, currentPrincipal: true, dailyROI: true, autoCompound: true, claimableROI: true,
      },
    });

    let posted = 0;
    for (const investment of investments) {
      if (remainingRoi(account).lte(ZERO)) break;
      const prior = await tx.roiLedger.findFirst({
        where: { investmentId: investment.id, cycleKey },
        select: { id: true },
      });
      if (prior) continue;

      const proposed = investment.currentPrincipal.mul(investment.dailyROI).div(HALF_DAY_DIVISOR);
      const amount = Prisma.Decimal.min(proposed, remainingRoi(account));
      if (amount.lte(ZERO)) continue;
      const cycleNumber = (await tx.roiLedger.count({ where: { investmentId: investment.id } })) + 1;

      await tx.roiLedger.create({
        data: {
          userId, investmentId: investment.id, amount, cycleNumber, cycleKey,
          wasCompounded: investment.autoCompound, wasClaimed: false,
        },
      });
      await tx.investmentAccountingEvent.create({
        data: {
          userId, investmentId: investment.id, eventType: "ROI_ACCRUAL", amount,
          referenceKey: `roi:${investment.id}:${cycleKey}`,
        },
      });
      if (investment.autoCompound) {
        await tx.investment.update({
          where: { id: investment.id },
          data: { currentPrincipal: { increment: amount } },
        });
        await tx.investmentAccountingEvent.create({
          data: {
            userId, investmentId: investment.id, eventType: "ROI_COMPOUND", amount,
            referenceKey: `compound:${investment.id}:${cycleKey}`,
          },
        });
        await tx.investmentCapAccount.update({
          where: { userId },
          data: {
            cumulativeRoiAccrued: { increment: amount },
            cumulativeRoiCompounded: { increment: amount },
          },
        });
        account = { ...account, cumulativeRoiAccrued: account.cumulativeRoiAccrued.add(amount) };
      } else {
        await tx.investment.update({
          where: { id: investment.id },
          data: { claimableROI: { increment: amount } },
        });
        await tx.investmentCapAccount.update({
          where: { userId },
          data: {
            cumulativeRoiAccrued: { increment: amount },
            claimableRoi: { increment: amount },
          },
        });
        account = {
          ...account,
          cumulativeRoiAccrued: account.cumulativeRoiAccrued.add(amount),
          claimableRoi: account.claimableRoi.add(amount),
        };
      }
      posted++;
    }
    return posted;
  });
}

async function prismaTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { timeout: 30_000 });
}

export async function recordRoiClaim(
  tx: Tx, userId: string, investmentId: string, amount: Prisma.Decimal,
): Promise<void> {
  const account = await ensureCapAccount(tx, userId);
  if (account.claimableRoi.lt(amount)) throw new Error("Member cap account claimable ROI is inconsistent");
  await tx.investmentCapAccount.update({
    where: { userId },
    data: {
      claimableRoi: { decrement: amount },
      cumulativeRoiClaimed: { increment: amount },
    },
  });
  await tx.investmentAccountingEvent.create({
    data: {
      userId, investmentId, eventType: "ROI_CLAIM", amount,
      referenceKey: `claim:${investmentId}:${account.cumulativeRoiClaimed.toFixed(8)}`,
    },
  });
}
