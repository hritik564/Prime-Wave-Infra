import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminInvestmentListQuery } from "./admin-investments.schema";
import { singlePlanAccountSummary } from "../investments/single-plan.service";

const investmentSelect = {
  id:               true,
  userId:           true,
  amount:           true,
  currentPrincipal: true,
  planType:         true,
  dailyROI:         true,
  durationDays:     true,
  autoCompound:     true,
  claimableROI:     true,
  claimablePrincipal: true,
  status:           true,
  startedAt:        true,
  maturesAt:        true,
  completedAt:      true,
  createdAt:        true,
  user: {
    select: {
      username:  true,
      firstName: true,
      lastName:  true,
      email:     true,
      sponsor: { select: { username: true } },
      singlePlanAccount: true,
    },
  },
} as const;

function serializeInvestment(
  r: NonNullable<Awaited<ReturnType<typeof prisma.investment.findFirst<{ select: typeof investmentSelect }>>>>
) {
  return {
    id:                 r.id,
    userId:             r.userId,
    username:           r.user.username,
    firstName:          r.user.firstName,
    lastName:           r.user.lastName,
    email:              r.user.email,
    sponsorUsername:    r.user.sponsor?.username ?? null,
    planType:           r.planType,
    amount:             r.amount.toFixed(2),
    currentPrincipal:   r.currentPrincipal.toFixed(2),
    dailyROI:           r.dailyROI.toFixed(4),
    durationDays:       r.durationDays,
    autoCompound:       r.autoCompound,
    claimableROI:       r.claimableROI.toFixed(2),
    claimablePrincipal: r.claimablePrincipal.toFixed(2),
    status:             r.status,
    startedAt:          r.startedAt.toISOString(),
    maturesAt:          r.maturesAt?.toISOString() ?? null,
    completedAt:        r.completedAt?.toISOString() ?? null,
    createdAt:          r.createdAt.toISOString(),
    capAccount: singlePlanAccountSummary(r.user.singlePlanAccount),
  };
}

export async function adminListInvestments(query: AdminInvestmentListQuery) {
  const { page, limit, status, planType, search, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.InvestmentWhereInput = {
    ...(status   && { status }),
    ...(planType && { planType }),
    ...(search   && {
      OR: [
        { id:   { contains: search, mode: "insensitive" } },
        { user: { username: { contains: search, mode: "insensitive" } } },
        { user: { email:    { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const orderBy: Prisma.InvestmentOrderByWithRelationInput =
    sortBy === "amount" ? { amount: sortOrder } : { createdAt: sortOrder };

  // Run paginated query + filtered total in one transaction
  const [records, total] = await prisma.$transaction([
    prisma.investment.findMany({ where, orderBy, skip, take: limit, select: investmentSelect }),
    prisma.investment.count({ where }),
  ]);

  // Global aggregates (no filter) — run in parallel
  const [statusAggr, planAggr, capitalAggr] = await Promise.all([
    prisma.investment.groupBy({
      by:      ["status"],
      _count:  { _all: true },
      orderBy: { _count: { status: "desc" } },
    }),
    prisma.investment.groupBy({
      by:      ["planType"],
      _count:  { _all: true },
      orderBy: { _count: { planType: "desc" } },
    }),
    prisma.investment.aggregate({
      where: { status: "ACTIVE" },
      _sum:  { amount: true, claimableROI: true },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of statusAggr) statusMap[s.status] = s._count._all;

  const stats = {
    totalCount:        statusAggr.reduce((acc, s) => acc + s._count._all, 0),
    activeCount:       statusMap["ACTIVE"]    ?? 0,
    maturedCount:      statusMap["MATURED"]   ?? 0,
    completedCount:    statusMap["COMPLETED"] ?? 0,
    totalCapital:      capitalAggr._sum.amount?.toFixed(2)       ?? "0.00",
    totalClaimableROI: capitalAggr._sum.claimableROI?.toFixed(2) ?? "0.00",
  };

  const planDistribution = planAggr.map((p) => ({
    planType: p.planType,
    count:    p._count._all,
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    investments:      records.map(serializeInvestment),
    meta:             { total, page, limit, totalPages },
    stats,
    planDistribution,
  };
}

export async function adminGetInvestment(id: string) {
  const inv = await prisma.investment.findUnique({
    where:  { id },
    select: { ...investmentSelect, updatedAt: true },
  });

  if (!inv) {
    throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "INVESTMENT_NOT_FOUND");
  }

  return {
    ...serializeInvestment(inv),
    updatedAt: inv.updatedAt.toISOString(),
  };
}
