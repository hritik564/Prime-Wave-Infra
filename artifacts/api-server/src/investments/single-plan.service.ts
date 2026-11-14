import { Prisma, type SinglePlanAccount } from "@prisma/client";
import { prisma } from "../config/prisma";
import { allocateRoi, roiCapacity, SINGLE_PLAN_POLICY, singlePlanPolicySchema, settlementEligibility } from "./single-plan.policy";

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

export async function lockSinglePlanAccount(tx: Tx, userId: string) {
  // ON CONFLICT is safe even for simultaneous first investments.
  await tx.singlePlanAccount.createMany({ data: [{ userId }], skipDuplicates: true });
  await tx.$queryRaw`SELECT "userId" FROM "single_plan_accounts" WHERE "userId" = ${userId} FOR UPDATE`;
  const account = await tx.singlePlanAccount.findUniqueOrThrow({ where: { userId } });
  if (!account.roiAccrued.eq(account.roiClaimed.add(account.roiCompounded).add(account.claimableRoi))) {
    throw new Error("Single-plan accounting invariant violated");
  }
  return account;
}

// Walk actual placement, not cached direct-left/right counters.
export async function qualificationEvidence(tx: Tx, userId: string) {
  const directs = await tx.user.findMany({
    where: { sponsorId: userId, status: "ACTIVE",
      investments: { some: { status: "ACTIVE", amount: { gte: new Prisma.Decimal(100) } } } },
    select: { id: true, binaryParentId: true, position: true },
    orderBy: { id: "asc" },
  });
  const witnesses: { LEFT?: string; RIGHT?: string } = {};
  for (const direct of directs) {
    let node = direct;
    const seen = new Set<string>([userId]);
    while (node.binaryParentId) {
      if (seen.has(node.id)) throw new Error("Binary placement cycle detected");
      seen.add(node.id);
      if (node.binaryParentId === userId) {
        if (node.position) witnesses[node.position] ??= direct.id;
        break;
      }
      const parent = await tx.user.findUnique({ where: { id: node.binaryParentId },
        select: { id: true, binaryParentId: true, position: true } });
      if (!parent) throw new Error("Binary placement parent missing");
      node = parent;
    }
    if (witnesses.LEFT && witnesses.RIGHT) break;
  }
  return witnesses;
}

export async function qualifySinglePlanTx(tx: Tx, userId: string) {
  const account = await lockSinglePlanAccount(tx, userId);
  if (account.tier === 5) return account;
  const witnesses = await qualificationEvidence(tx, userId);
  if (!witnesses.LEFT || !witnesses.RIGHT) return account;
  const qualifiedAt = new Date();
  const updated = await tx.singlePlanAccount.update({
    where: { userId }, data: { tier: 5, qualifiedAt },
  });
  await tx.singlePlanEvent.create({ data: {
    userId, kind: "QUALIFIED", amount: ZERO, key: `qualified:${userId}`,
    metadata: { leftPersonalReferral: witnesses.LEFT, rightPersonalReferral: witnesses.RIGHT,
      activeInvestmentMinimum: "100", fromTier: 3, toTier: 5 },
  } });
  return updated;
}

export async function refreshSinglePlanQualification(userId: string) {
  return prisma.$transaction(tx => qualifySinglePlanTx(tx, userId), { timeout: 30_000 });
}

export async function contributeSinglePlan(tx: Tx, userId: string, investmentId: string, amount: Prisma.Decimal) {
  if (amount.lte(0)) throw new Error("Contribution must be positive");
  await lockSinglePlanAccount(tx, userId);
  await tx.singlePlanAccount.update({ where: { userId }, data: { originalCapital: { increment: amount } } });
  await tx.singlePlanEvent.create({ data: {
    userId, investmentId, kind: "CONTRIBUTION", amount, key: `contribution:${investmentId}`,
    metadata: { fundingWallet: "DEPOSIT", compoundedCapitalExcluded: true },
  } });
}

export async function postSinglePlanMemberCycle(userId: string, boundary: Date) {
  singlePlanPolicySchema.parse(SINGLE_PLAN_POLICY); // fail closed on invalid policy
  return prisma.$transaction(async tx => {
    let account = await qualifySinglePlanTx(tx, userId);
    const cycleKey = boundary.toISOString();
    const prior = await tx.singlePlanCycle.findUnique({ where: { userId_cycleKey: { userId, cycleKey } } });
    if (prior) return 0;
    await tx.singlePlanCycle.create({ data: { userId, cycleKey } });
    const investments = await tx.investment.findMany({
      where: { userId, planType: "SINGLE", status: "ACTIVE", startedAt: { lte: boundary } },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    });
    let posted = 0;
    for (const inv of investments) {
      if (!inv.dailyROI.eq(SINGLE_PLAN_POLICY.dailyROI) || inv.maturesAt !== null || inv.durationDays !== null) {
        throw new Error("Single-plan investment configuration is invalid");
      }
      const amount = allocateRoi(inv.currentPrincipal.mul(inv.dailyROI).div(200),
        roiCapacity(account.originalCapital, account.roiAccrued, account.tier));
      if (amount.isZero()) continue;
      const ledger = await tx.roiLedger.create({ data: {
        userId, investmentId: inv.id, amount, cycleKey,
        cycleNumber: (await tx.roiLedger.count({ where: { investmentId: inv.id } })) + 1,
        wasCompounded: inv.autoCompound,
      } });
      await tx.investment.update({ where: { id: inv.id }, data: inv.autoCompound
        ? { currentPrincipal: { increment: amount } } : { claimableROI: { increment: amount } } });
      account = await tx.singlePlanAccount.update({ where: { userId }, data: {
        roiAccrued: { increment: amount },
        ...(inv.autoCompound ? { roiCompounded: { increment: amount } } : { claimableRoi: { increment: amount } }),
      } });
      await tx.singlePlanEvent.create({ data: {
        userId, investmentId: inv.id, kind: "ROI_ACCRUAL", amount, key: `roi:${inv.id}:${cycleKey}`,
        metadata: { cycleKey, roiLedgerId: ledger.id, compounded: inv.autoCompound,
          tier: account.tier, remainingRoi: roiCapacity(account.originalCapital, account.roiAccrued, account.tier).toFixed(8) },
      } });
      posted++;
    }
    return posted;
  }, { timeout: 30_000 });
}

export async function claimSinglePlanRoiTx(tx: Tx, userId: string, investmentId: string, amount: Prisma.Decimal) {
  const account = await lockSinglePlanAccount(tx, userId);
  if (amount.lte(0) || account.claimableRoi.lt(amount)) throw new Error("Single-plan claim balance is inconsistent");
  await tx.singlePlanAccount.update({ where: { userId }, data: {
    claimableRoi: { decrement: amount }, roiClaimed: { increment: amount },
  } });
  await tx.singlePlanEvent.create({ data: {
    userId, investmentId, kind: "ROI_CLAIM", amount,
    key: `claim:${investmentId}:${account.roiClaimed.toFixed(8)}`,
  } });
}

export async function getSinglePlanSummary(userId: string) {
  const [account, qualificationHistory, investmentCount] = await Promise.all([
    prisma.singlePlanAccount.findUnique({ where: { userId } }),
    prisma.singlePlanEvent.findMany({ where: { userId, kind: "QUALIFIED" },
      select: { createdAt: true, metadata: true }, orderBy: { createdAt: "asc" } }),
    prisma.investment.count({ where: { userId } }),
  ]);
  return { ...singlePlanAccountSummary(account), qualificationHistory, investmentCount };
}

export function singlePlanAccountSummary(account: SinglePlanAccount | null) {
  const capital = account?.originalCapital ?? ZERO;
  const accrued = account?.roiAccrued ?? ZERO;
  const tier = account?.tier ?? 3;
  return {
    policy: SINGLE_PLAN_POLICY, originalCapital: capital, tier, qualifiedAt: account?.qualifiedAt ?? null,
    roiAccrued: accrued, roiClaimed: account?.roiClaimed ?? ZERO, roiCompounded: account?.roiCompounded ?? ZERO,
    claimableRoi: account?.claimableRoi ?? ZERO, principalReturned: account?.principalReturned ?? ZERO,
    principalOwed: capital.minus(account?.principalReturned ?? ZERO),
    maxRoi: capital.mul(tier - 1), totalEntitlement: capital.mul(tier),
    remainingRoi: roiCapacity(capital, accrued, tier),
    settlement: settlementEligibility(),
  };
}
