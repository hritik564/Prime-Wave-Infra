import { prisma } from "../../config/prisma";

// ── Generic CSV builder ───────────────────────────────────────────────────────

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.join(",");
  const body   = rows.map((r) => columns.map((c) => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

// ── Users export ──────────────────────────────────────────────────────────────

export async function exportUsersAsCsv(): Promise<{ csv: string; filename: string }> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, username: true, email: true, phone: true,
      firstName: true, lastName: true, status: true,
      referralCode: true, directReferralCount: true,
      createdAt: true,
      wallet: { select: { depositWallet: true, incomeWallet: true, withdrawalWallet: true } },
    },
  });

  const rows = users.map((u) => ({
    id:                  u.id,
    username:            u.username,
    email:               u.email,
    phone:               u.phone,
    firstName:           u.firstName ?? "",
    lastName:            u.lastName  ?? "",
    status:              u.status,
    referralCode:        u.referralCode,
    directReferrals:     u.directReferralCount,
    depositWallet:       u.wallet?.depositWallet?.toString()  ?? "0",
    incomeWallet:        u.wallet?.incomeWallet?.toString()   ?? "0",
    withdrawalWallet:    u.wallet?.withdrawalWallet?.toString() ?? "0",
    createdAt:           u.createdAt.toISOString(),
  }));

  const columns = [
    "id","username","email","phone","firstName","lastName","status",
    "referralCode","directReferrals","depositWallet","incomeWallet","withdrawalWallet","createdAt",
  ];

  return { csv: toCsv(rows as Record<string, unknown>[], columns), filename: "users.csv" };
}

// ── Deposits export ───────────────────────────────────────────────────────────

export async function exportDepositsAsCsv(): Promise<{ csv: string; filename: string }> {
  const records = await prisma.depositRequest.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, amount: true, network: true, status: true, txHash: true,
      approvedAt: true, createdAt: true,
      user: { select: { username: true, email: true } },
    },
  });

  const rows = records.map((r) => ({
    id:         r.id,
    username:   r.user.username,
    email:      r.user.email,
    amount:     r.amount.toString(),
    network:    r.network,
    status:     r.status,
    txHash:     r.txHash ?? "",
    approvedAt: r.approvedAt?.toISOString() ?? "",
    createdAt:  r.createdAt.toISOString(),
  }));

  const columns = ["id","username","email","amount","network","status","txHash","approvedAt","createdAt"];
  return { csv: toCsv(rows as Record<string, unknown>[], columns), filename: "deposits.csv" };
}

// ── Withdrawals export ────────────────────────────────────────────────────────

export async function exportWithdrawalsAsCsv(): Promise<{ csv: string; filename: string }> {
  const records = await prisma.withdrawalRequest.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, amount: true, network: true, status: true, txHash: true,
      walletAddressSnapshot: true, approvedAt: true, completedAt: true,
      rejectedReason: true, createdAt: true,
      user: { select: { username: true, email: true } },
    },
  });

  const rows = records.map((r) => ({
    id:                    r.id,
    username:              r.user.username,
    email:                 r.user.email,
    amount:                r.amount.toString(),
    network:               r.network,
    status:                r.status,
    walletAddress:         r.walletAddressSnapshot ?? "",
    txHash:                r.txHash        ?? "",
    approvedAt:            r.approvedAt?.toISOString()  ?? "",
    completedAt:           r.completedAt?.toISOString() ?? "",
    rejectedReason:        r.rejectedReason ?? "",
    createdAt:             r.createdAt.toISOString(),
  }));

  const columns = [
    "id","username","email","amount","network","status","walletAddress",
    "txHash","approvedAt","completedAt","rejectedReason","createdAt",
  ];
  return { csv: toCsv(rows as Record<string, unknown>[], columns), filename: "withdrawals.csv" };
}

// ── Salary income export ──────────────────────────────────────────────────────

export async function exportSalaryIncomeAsCsv(): Promise<{ csv: string; filename: string }> {
  const records = await prisma.salaryIncome.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, rankName: true, month: true, year: true, amount: true, createdAt: true,
      user: { select: { username: true, email: true } },
    },
  });

  const rows = records.map((r) => ({
    id:        r.id,
    username:  r.user.username,
    email:     r.user.email,
    rankName:  r.rankName,
    month:     r.month,
    year:      r.year,
    amount:    r.amount.toString(),
    createdAt: r.createdAt.toISOString(),
  }));

  const columns = ["id","username","email","rankName","month","year","amount","createdAt"];
  return { csv: toCsv(rows as Record<string, unknown>[], columns), filename: "salary_income.csv" };
}

// ── Binary income export ──────────────────────────────────────────────────────

export async function exportBinaryIncomeAsCsv(): Promise<{ csv: string; filename: string }> {
  const records = await prisma.binaryMatchIncome.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, incomeAmount: true, matchedBV: true, createdAt: true,
      user: { select: { username: true, email: true } },
    },
  });

  const rows = records.map((r) => ({
    id:           r.id,
    username:     r.user.username,
    email:        r.user.email,
    incomeAmount: r.incomeAmount.toString(),
    matchedBV:    r.matchedBV.toString(),
    createdAt:    r.createdAt.toISOString(),
  }));

  const columns = ["id","username","email","incomeAmount","matchedBV","createdAt"];
  return { csv: toCsv(rows as Record<string, unknown>[], columns), filename: "binary_income.csv" };
}
