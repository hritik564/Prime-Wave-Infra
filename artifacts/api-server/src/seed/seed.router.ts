// Sprint 24: investment creation migrated to canonical createInvestment() service.
// Direct prisma.investment.createMany() removed — all investment rows now flow
// through the single business service (BV propagation, level income, salary
// evaluation, notifications all execute per-investment identically to live traffic).
//
// COMPLETED investments are not reproduced: createInvestment() only creates ACTIVE
// investments, and matured/closed positions carry no financial obligation forward.
// Their absence does not affect wallet or BV integrity.
//
// Wallet depositWallet amounts in the snapshot already include investment principal
// (they represent the net state after all operations), so no additional funding is
// required before calling createInvestment().

import { Router } from "express";
import { prisma } from "../config/prisma";
import { createInvestment } from "../investments/investments.service";
import type { Prisma } from "@prisma/client";

const SEED_TOKEN = "pw-seed-3f8a7b92c4d54e6fa1b29c0d1e2f3a4b";

const seedRouter = Router();

seedRouter.post("/seed", async (req, res) => {
  if (req.headers["x-seed-token"] !== SEED_TOKEN) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  // Always run — skipDuplicates makes this idempotent

  // ── Users (ordered by FK dependency: parents before children) ─────────────
  // Batch 1: no sponsorId / binaryParentId deps
  const batch1 = [
    {
      id: "cmqrh2dhe0000g5n5ocrx0jq1",
      email: "tco",
      username: "testuser",
      passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
      firstName: "Test", lastName: "User",
      referralCode: "FW0MELCZ",
      directReferralCount: 3,
      leftBV: "10.00000000", rightBV: "0.00000000",
    },
    {
      id: "cmqrkdd3c000e11q4twjn8fk7",
      email: "organic@primewave.io",
      username: "organic1",
      passwordHash: "$2b$12$H9vieAf8W8G.TI6F8xHdNeNWnbxltAe/zr5qkkNfBjTbjjIEEnaLm",
      firstName: "Dave", lastName: "Free",
      referralCode: "853M1DDN",
      directReferralCount: 0,
      leftBV: "0.00000000", rightBV: "0.00000000",
    },
    {
      id: "cmqrro9hm00011ntfojeqhd8n",
      email: "testuser@example.com",
      phone: "1234567890",
      username: "testuser17",
      passwordHash: "$2b$12$WFVd/siRuaObmK2WNhrm/OSb5uXmV1sQ/HJIrK79NsXqLFrS7bGhm",
      firstName: "Test", lastName: "User",
      referralCode: "XZ3USTC9",
      directReferralCount: 0,
      leftBV: "0.00000000", rightBV: "0.00000000",
    },
    {
      id: "cmqt6mum4000185pmjdh29iyy",
      email: "john@primewave.io",
      username: "john",
      passwordHash: "$2b$12$G/a17LSxanD0xA.v4bnHme0OHjROeeu9D6umgqN1R.zcPvxWi2rxK",
      firstName: "John", lastName: "Prime",
      referralCode: "SXF6G74Z",
      directReferralCount: 0,
      leftBV: "0.00000000", rightBV: "0.00000000",
    },
  ];

  // Batch 2: depend only on testuser (cmqrh2dhe0000g5n5ocrx0jq1)
  const batch2 = [
    {
      id: "cmqrkdcip000311q44oh1g6pb",
      email: "ref1@primewave.io",
      username: "refuser1",
      passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
      firstName: "Alice", lastName: "Smith",
      referralCode: "1EV2AQAT",
      referredBy: "cmqrh2dhe0000g5n5ocrx0jq1",
      sponsorId: "cmqrh2dhe0000g5n5ocrx0jq1",
      binaryParentId: "cmqrh2dhe0000g5n5ocrx0jq1",
      directReferralCount: 2,
      position: "LEFT" as const,
      leftBV: "15.00000000", rightBV: "0.00000000",
    },
    {
      id: "cmqrkdctn000911q42zbt1vd1",
      email: "ref2@primewave.io",
      username: "refuser2",
      passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
      firstName: "Bob", lastName: "Jones",
      referralCode: "7IVZ76RZ",
      referredBy: "cmqrh2dhe0000g5n5ocrx0jq1",
      sponsorId: "cmqrh2dhe0000g5n5ocrx0jq1",
      binaryParentId: "cmqrh2dhe0000g5n5ocrx0jq1",
      directReferralCount: 0,
      position: "RIGHT" as const,
      leftBV: "10.00000000", rightBV: "10.00000000",
    },
    {
      id: "l1id",
      email: "l1@test.io",
      username: "l1user",
      passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
      firstName: "L1", lastName: "User",
      referralCode: "L1CODE",
      sponsorId: "cmqrh2dhe0000g5n5ocrx0jq1",
      directReferralCount: 0,
      leftBV: "0.00000000", rightBV: "0.00000000",
    },
  ];

  // Batch 3: depend on refuser1 or l1id
  const batch3 = [
    {
      id: "cmqrlp28400036bnvsrxbaaxa",
      email: "ref3@primewave.io",
      username: "charlie",
      passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
      firstName: "Charlie", lastName: "Brown",
      referralCode: "6FC7IX74",
      referredBy: "cmqrh2dhe0000g5n5ocrx0jq1",
      sponsorId: "cmqrh2dhe0000g5n5ocrx0jq1",
      binaryParentId: "cmqrkdcip000311q44oh1g6pb",
      directReferralCount: 0,
      position: "LEFT" as const,
      leftBV: "0.00000000", rightBV: "0.00000000",
    },
    {
      id: "l2id",
      email: "l2@test.io",
      username: "l2user",
      passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
      firstName: "L2", lastName: "User",
      referralCode: "L2CODE",
      sponsorId: "l1id",
      directReferralCount: 0,
      leftBV: "0.00000000", rightBV: "0.00000000",
    },
  ];

  const batch4 = [{
    id: "l3id", email: "l3@test.io", username: "l3user",
    passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
    firstName: "L3", lastName: "User", referralCode: "L3CODE",
    sponsorId: "l2id", directReferralCount: 0,
    leftBV: "0.00000000", rightBV: "0.00000000",
  }];

  const batch5 = [{
    id: "l4id", email: "l4@test.io", username: "l4user",
    passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
    firstName: "L4", lastName: "User", referralCode: "L4CODE",
    sponsorId: "l3id", directReferralCount: 0,
    leftBV: "0.00000000", rightBV: "0.00000000",
  }];

  const batch6 = [{
    id: "l5id", email: "l5@test.io", username: "l5user",
    passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm",
    firstName: "L5", lastName: "User", referralCode: "L5CODE",
    sponsorId: "l4id", directReferralCount: 0,
    leftBV: "0.00000000", rightBV: "0.00000000",
  }];

  // ── Wallets ────────────────────────────────────────────────────────────────
  // Deposit wallet amounts represent the snapshot balance after all historical
  // operations (deposits, income, etc.). createInvestment() will deduct the
  // investment principal from depositWallet when each investment is created.
  const wallets = [
    { id: "cmqrh2dhe0001g5n5ef9xzj97", userId: "cmqrh2dhe0000g5n5ocrx0jq1", depositWallet: "850.00000000", incomeWallet: "290.75000000", withdrawalWallet: "550.00000000" },
    { id: "cmqrkdcip000411q42fzeqkva", userId: "cmqrkdcip000311q44oh1g6pb", depositWallet: "500.00000000", incomeWallet: "0.00000000",   withdrawalWallet: "540.00000000" },
    { id: "cmqrkdctn000a11q4dshyunp8", userId: "cmqrkdctn000911q42zbt1vd1", depositWallet: "0.00000000",   incomeWallet: "0.00000000",   withdrawalWallet: "0.00000000"   },
    { id: "cmqrkdd3c000f11q4mjp7h42o", userId: "cmqrkdd3c000e11q4twjn8fk7", depositWallet: "0.00000000",   incomeWallet: "0.00000000",   withdrawalWallet: "0.00000000"   },
    { id: "cmqrlp28400046bnvbe8osavx", userId: "cmqrlp28400036bnvsrxbaaxa", depositWallet: "4000.00000000",incomeWallet: "0.00000000",   withdrawalWallet: "0.00000000"   },
    { id: "wl1id",                     userId: "l1id",                     depositWallet: "0.00000000",   incomeWallet: "0.00000000",   withdrawalWallet: "20.00000000"  },
    { id: "wl2id",                     userId: "l2id",                     depositWallet: "0.00000000",   incomeWallet: "0.00000000",   withdrawalWallet: "20.00000000"  },
    { id: "wl3id",                     userId: "l3id",                     depositWallet: "0.00000000",   incomeWallet: "0.00000000",   withdrawalWallet: "20.00000000"  },
    { id: "wl4id",                     userId: "l4id",                     depositWallet: "0.00000000",   incomeWallet: "0.00000000",   withdrawalWallet: "20.00000000"  },
    { id: "wl5id",                     userId: "l5id",                     depositWallet: "3000.00000000",incomeWallet: "0.00000000",   withdrawalWallet: "0.00000000"   },
    { id: "cmqrro9hm00021ntfzweml26j", userId: "cmqrro9hm00011ntfojeqhd8n",depositWallet: "0.00000000",   incomeWallet: "0.00000000",   withdrawalWallet: "0.00000000"   },
    { id: "cmqt6mum4000285pm8khjfutb", userId: "cmqt6mum4000185pmjdh29iyy", depositWallet: "1400.00000000",incomeWallet: "372.50000000", withdrawalWallet: "89.25000000"  },
  ];

  // ── Admins ─────────────────────────────────────────────────────────────────
  const admins = [
    { id: "6f67dde8-f7c6-4fff-8042-b28dd50191d7", email: "admin@primewave.io",  passwordHash: "$2b$10$VZ/QnfXVd08l/Bv0FHpXbus8C8L7TE.uw8UlAaRw0UvNZZF7OJQxm", firstName: "Super",   lastName: "Admin", role: "SUPER_ADMIN"   as const },
    { id: "support1",                              email: "support@primewave.io", passwordHash: "$2b$10$QwlgDFu4z8tYP.Kg7oAs..edwd6FRVvG4XAuqiOJAjjPXeVe1xLWm", firstName: "Support", lastName: "Admin", role: "SUPPORT_ADMIN" as const },
    { id: "cmqt4boj5000022p27cavzwi9",             email: "admin@admin1.com",     passwordHash: "$2b$12$oOKvV9mGDYWNRgNb/a6dxOHWoaZCP5EoQJDw0lS8XaDjB3/TVnX6C", firstName: "Super",   lastName: "Admin", role: "SUPER_ADMIN"   as const },
  ];

  // ── Users, wallets, and admins in a single atomic transaction ─────────────
  // Investment creation is intentionally outside this transaction: createInvestment()
  // opens its own Prisma interactive transaction and cannot be nested.
  // One SalaryBusinessSummary row per seeded user.
  // Mirrors the Wallet seed pattern — skipDuplicates makes this idempotent.
  const allBatches = [...batch1, ...batch2, ...batch3, ...batch4, ...batch5, ...batch6];
  const now = new Date();
  const salaryBusinessSummaries = allBatches.map((u) => ({
    userId:           u.id,
    directBusiness:   "0.00000000",
    downlineBusiness: "0.00000000",
    powerBusiness:    "0.00000000",
    version:          1,
    updatedAt:        now,
  }));

  const txResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.createMany({ data: batch1, skipDuplicates: true });
    await tx.user.createMany({ data: batch2, skipDuplicates: true });
    await tx.user.createMany({ data: batch3, skipDuplicates: true });
    await tx.user.createMany({ data: batch4, skipDuplicates: true });
    await tx.user.createMany({ data: batch5, skipDuplicates: true });
    await tx.user.createMany({ data: batch6, skipDuplicates: true });
    const { count: walletCount }               = await tx.wallet.createMany({ data: wallets,                  skipDuplicates: true });
    const { count: adminCount }                = await tx.admin.createMany({  data: admins,                   skipDuplicates: true });
    const { count: salaryBusinessSummaryCount} = await tx.salaryBusinessSummary.createMany({ data: salaryBusinessSummaries, skipDuplicates: true });
    const userCount                            = await tx.user.count();
    return { userCount, walletCount, adminCount, salaryBusinessSummaryCount };
  });

  // ── Investments via canonical service ──────────────────────────────────────
  // Each entry = one ACTIVE investment to create, ordered so multi-investment
  // users satisfy the progressive minimum ($100, $200, $300 …) correctly.
  //
  // COMPLETED investments (PLAN_270/$300 for testuser, PLAN_180/$400 for john)
  // are deliberately omitted: createInvestment() only creates ACTIVE positions,
  // and historical closed investments carry no ongoing financial obligation.
  //
  // The seeded depositWallet amounts already include the investment principal,
  // so createInvestment() deducts directly from the existing balance — no
  // additional wallet credit is needed.
  const investmentPlan: Array<{ userId: string; amount: number; planType: "PLAN_90" | "PLAN_180" | "PLAN_270" | "PLAN_360"; autoCompound: boolean }> = [
    // testuser — two ACTIVE investments, smallest first (progressive minimum)
    { userId: "cmqrh2dhe0000g5n5ocrx0jq1", amount: 100,  planType: "PLAN_90",  autoCompound: false },
    { userId: "cmqrh2dhe0000g5n5ocrx0jq1", amount: 200,  planType: "PLAN_180", autoCompound: true  },
    // refuser1
    { userId: "cmqrkdcip000311q44oh1g6pb", amount: 500,  planType: "PLAN_90",  autoCompound: false },
    // charlie — two investments, original order preserved
    { userId: "cmqrlp28400036bnvsrxbaaxa", amount: 300,  planType: "PLAN_90",  autoCompound: false },
    { userId: "cmqrlp28400036bnvsrxbaaxa", amount: 1000, planType: "PLAN_90",  autoCompound: false },
    // l5user
    { userId: "l5id",                      amount: 2000, planType: "PLAN_90",  autoCompound: false },
    // john — one ACTIVE investment (PLAN_180/$400 was COMPLETED, omitted)
    { userId: "cmqt6mum4000185pmjdh29iyy", amount: 500,  planType: "PLAN_90",  autoCompound: true  },
  ];

  let investmentCount = 0;
  for (const inv of investmentPlan) {
    const existing = await prisma.investment.count({
      where: { userId: inv.userId, amount: inv.amount, planType: inv.planType },
    });
    if (existing > 0) continue;

    await createInvestment(inv.userId, {
      amount:       inv.amount,
      planType:     inv.planType,
      autoCompound: inv.autoCompound,
    });
    investmentCount++;
  }

  res.json({
    success: true,
    message: "Production database seeded successfully",
    seeded: {
      ...txResult,
      investmentCount,
    },
  });
});

export default seedRouter;
