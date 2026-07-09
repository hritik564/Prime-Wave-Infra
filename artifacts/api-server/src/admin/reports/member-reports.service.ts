import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { computeOperationalStatus } from "../../eligibility/eligibility.service";
import type { MemberReportQuery, MemberExportQuery } from "./member-reports.schema";

// ── Date preset resolver ──────────────────────────────────────────────────────

function resolvePreset(preset: MemberReportQuery["preset"]): { from?: Date; to?: Date } {
  if (!preset) return {};
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { from: today, to: new Date(today.getTime() + 86400000 - 1) };
    case "yesterday": {
      const yest = new Date(today.getTime() - 86400000);
      return { from: yest, to: new Date(today.getTime() - 1) };
    }
    case "last7":
      return { from: new Date(today.getTime() - 7 * 86400000), to: new Date(now.getTime()) };
    case "last30":
      return { from: new Date(today.getTime() - 30 * 86400000), to: new Date(now.getTime()) };
    case "thisMonth":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getTime()) };
    case "lastMonth": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstOfLast  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: firstOfLast, to: new Date(firstOfMonth.getTime() - 1) };
    }
    default:
      return {};
  }
}

// ── Account-type username prefix filter ───────────────────────────────────────

function accountTypeFilter(accountType?: MemberReportQuery["accountType"]): Prisma.UserWhereInput {
  if (!accountType) return {};
  switch (accountType) {
    case "master":
      return { username: { equals: "master", mode: "insensitive" } };
    case "mi":
      return { username: { startsWith: "mi", mode: "insensitive" } };
    case "rd":
      return { username: { startsWith: "rd", mode: "insensitive" } };
    case "sp":
      return { username: { startsWith: "sp", mode: "insensitive" } };
    case "normal":
      return {
        AND: [
          { username: { not: { equals: "master" } } },
          { username: { not: { startsWith: "mi" } } },
          { username: { not: { startsWith: "rd" } } },
          { username: { not: { startsWith: "sp" } } },
        ],
      };
    default:
      return {};
  }
}

// ── Shared WHERE builder ──────────────────────────────────────────────────────

export function buildMemberWhere(
  q: MemberReportQuery | MemberExportQuery,
): Prisma.UserWhereInput {
  const { from: qFrom, to: qTo, preset, status, placement, hasInvestment, accountType, search } = q;

  const { from: pFrom, to: pTo } = resolvePreset(preset as MemberReportQuery["preset"]);
  const dateFrom = qFrom ?? pFrom;
  const dateTo   = qTo   ?? pTo;

  const where: Prisma.UserWhereInput = {
    ...(status    && { status }),
    ...(placement && { position: placement }),

    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo   && { lte: dateTo }),
      },
    }),

    ...accountTypeFilter(accountType),

    ...(search && {
      OR: [
        { username:  { contains: search, mode: "insensitive" } },
        { email:     { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName:  { contains: search, mode: "insensitive" } },
      ],
    }),

    ...(hasInvestment === "yes" && {
      investments: { some: { status: "ACTIVE" } },
    }),
    ...(hasInvestment === "no" && {
      investments: { none: { status: "ACTIVE" } },
    }),
  };

  return where;
}

// ── Operational-status DB push-down helper ────────────────────────────────────

function applyOpStatusFilter(
  base: Prisma.UserWhereInput,
  opStatus?: "ACTIVE" | "INACTIVE",
): Prisma.UserWhereInput {
  if (opStatus === "ACTIVE") {
    return {
      ...base,
      investments:      { some: { status: "ACTIVE" } },
      directLeftCount:  { gte: 1 },
      directRightCount: { gte: 1 },
    };
  }
  if (opStatus === "INACTIVE") {
    return {
      ...base,
      OR: [
        { investments:     { none: { status: "ACTIVE" } } },
        { directLeftCount: { lt: 1 } },
        { directRightCount:{ lt: 1 } },
      ],
    };
  }
  return base;
}

// ── Shared SELECT ─────────────────────────────────────────────────────────────

const memberSelect = {
  id:                  true,
  username:            true,
  email:               true,
  phone:               true,
  firstName:           true,
  lastName:            true,
  status:              true,
  position:            true,
  directLeftCount:     true,
  directRightCount:    true,
  directReferralCount: true,
  leftBV:              true,
  rightBV:             true,
  createdAt:           true,
  sponsor: {
    select: { username: true },
  },
  binaryParent: {
    select: { username: true },
  },
  wallet: {
    select: {
      depositWallet:    true,
      incomeWallet:     true,
      withdrawalWallet: true,
    },
  },
  investments: {
    where:  { status: "ACTIVE" as const },
    select: { id: true, planType: true, amount: true },
    take:   1,
  },
} as const;

// ── Row mapper ────────────────────────────────────────────────────────────────

export function mapMemberRow(r: Prisma.UserGetPayload<{ select: typeof memberSelect }>) {
  const hasInvestment = r.investments.length > 0;
  const opStatus = computeOperationalStatus({
    hasActiveInvestment: hasInvestment,
    directLeftCount:     r.directLeftCount,
    directRightCount:    r.directRightCount,
  });

  return {
    id:                  r.id,
    name:                [r.firstName, r.lastName].filter(Boolean).join(" ") || r.username,
    username:            r.username,
    email:               r.email,
    phone:               r.phone ?? "",
    joinedAt:            r.createdAt.toISOString(),
    accountType:         deriveAccountType(r.username),
    sponsor:             r.sponsor?.username ?? "",
    binaryParent:        r.binaryParent?.username ?? "",
    placement:           r.position ?? "",
    accountStatus:       r.status,
    operationalStatus:   opStatus,
    hasInvestment,
    investmentPlan:      r.investments[0]?.planType ?? "",
    investmentAmount:    r.investments[0]?.amount?.toString() ?? "",
    depositWallet:       r.wallet?.depositWallet?.toString()    ?? "0",
    incomeWallet:        r.wallet?.incomeWallet?.toString()     ?? "0",
    withdrawalWallet:    r.wallet?.withdrawalWallet?.toString() ?? "0",
    directReferrals:     r.directReferralCount,
    leftBV:              r.leftBV?.toString() ?? "0",
    rightBV:             r.rightBV?.toString() ?? "0",
  };
}

function deriveAccountType(username: string): string {
  if (username.toLowerCase() === "master") return "Master";
  const lower = username.toLowerCase();
  if (lower.startsWith("mi") && /^mi\d/.test(lower)) return "MI";
  if (lower.startsWith("rd") && /^rd\d/.test(lower)) return "RD";
  if (lower.startsWith("sp") && /^sp\d/.test(lower)) return "SP";
  return "Normal";
}

// ── Paginated query ───────────────────────────────────────────────────────────

export async function getMemberReport(q: MemberReportQuery) {
  const { page, limit } = q;
  const skip = (page - 1) * limit;

  const baseWhere    = buildMemberWhere(q);
  const effectiveWhere = applyOpStatusFilter(baseWhere, q.operationalStatus as "ACTIVE" | "INACTIVE" | undefined);

  const [records, total] = await prisma.$transaction([
    prisma.user.findMany({
      where:   effectiveWhere,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  memberSelect,
    }),
    prisma.user.count({ where: effectiveWhere }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records.map(mapMemberRow),
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Summary stats ─────────────────────────────────────────────────────────────

export async function getMemberReportSummary() {
  const now        = new Date();
  const today      = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday  = new Date(today.getTime() - 86400000);
  const weekAgo    = new Date(today.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, joinedToday, joinedYesterday, joinedThisWeek, joinedThisMonth] =
    await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    ]);

  return { total, joinedToday, joinedYesterday, joinedThisWeek, joinedThisMonth };
}

// ── Full export (no pagination) ───────────────────────────────────────────────

export async function getAllMembersForExport(q: MemberExportQuery) {
  const baseWhere      = buildMemberWhere(q);
  const effectiveWhere = applyOpStatusFilter(baseWhere, q.operationalStatus as "ACTIVE" | "INACTIVE" | undefined);

  const records = await prisma.user.findMany({
    where:   effectiveWhere,
    orderBy: { createdAt: "desc" },
    select:  memberSelect,
  });

  return records.map(mapMemberRow);
}
