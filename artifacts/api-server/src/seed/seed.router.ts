import { Router } from "express";
import { prisma } from "../config/prisma";
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
      email: "test@primewave.io",
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

  // ── Investments ────────────────────────────────────────────────────────────
  const investments = [
    { id: "cmqrjbl0j0004ldt7yzo42yfj", userId: "cmqrh2dhe0000g5n5ocrx0jq1", amount: "100.00000000", currentPrincipal: "100.00000000", planType: "PLAN_90"  as const, dailyROI: "0.5000", durationDays: 90,  autoCompound: false, claimableROI: "19.50000000", claimablePrincipal: "0.00000000", status: "ACTIVE"    as const, startedAt: new Date("2026-06-24T03:49:50.754Z"), maturesAt: new Date("2026-09-22T03:49:50.754Z") },
    { id: "cmqrjbl5d000aldt7kujanaoz", userId: "cmqrh2dhe0000g5n5ocrx0jq1", amount: "200.00000000", currentPrincipal: "254.92097471", planType: "PLAN_180" as const, dailyROI: "0.6000", durationDays: 180, autoCompound: true,  claimableROI: "0.00000000",  claimablePrincipal: "0.00000000", status: "ACTIVE"    as const, startedAt: new Date("2026-06-24T03:49:50.929Z"), maturesAt: new Date("2026-12-21T03:49:50.929Z") },
    { id: "test-matured-inv-001",        userId: "cmqrh2dhe0000g5n5ocrx0jq1", amount: "300.00000000", currentPrincipal: "300.00000000", planType: "PLAN_270" as const, dailyROI: "0.7000", durationDays: 270, autoCompound: false, claimableROI: "12.50000000", claimablePrincipal: "0.00000000", status: "COMPLETED" as const, startedAt: new Date("2025-09-27T03:50:03.896Z"), maturesAt: new Date("2026-06-23T03:50:03.896Z") },
    { id: "cmqrmaszd00024z6f4nawebg3", userId: "cmqrkdcip000311q44oh1g6pb", amount: "500.00000000", currentPrincipal: "500.00000000", planType: "PLAN_90"  as const, dailyROI: "0.5000", durationDays: 90,  autoCompound: false, claimableROI: "97.50000000", claimablePrincipal: "0.00000000", status: "ACTIVE"    as const, startedAt: new Date("2026-06-24T05:13:13.273Z"), maturesAt: new Date("2026-09-22T05:13:13.273Z") },
    { id: "cmqrmat2m000b4z6fidwzf7xd", userId: "cmqrlp28400036bnvsrxbaaxa", amount: "300.00000000", currentPrincipal: "300.00000000", planType: "PLAN_90"  as const, dailyROI: "0.5000", durationDays: 90,  autoCompound: false, claimableROI: "58.50000000", claimablePrincipal: "0.00000000", status: "ACTIVE"    as const, startedAt: new Date("2026-06-24T05:13:13.390Z"), maturesAt: new Date("2026-09-22T05:13:13.390Z") },
    { id: "cmqrok7z00002bydqh9qvpe3i", userId: "cmqrlp28400036bnvsrxbaaxa", amount: "1000.00000000",currentPrincipal: "1000.00000000",planType: "PLAN_90"  as const, dailyROI: "0.5000", durationDays: 90,  autoCompound: false, claimableROI: "195.00000000",claimablePrincipal: "0.00000000", status: "ACTIVE"    as const, startedAt: new Date("2026-06-24T06:16:31.836Z"), maturesAt: new Date("2026-09-22T06:16:31.836Z") },
    { id: "cmqrolq4l000jbydqetd4i1og", userId: "l5id",                      amount: "2000.00000000",currentPrincipal: "2000.00000000",planType: "PLAN_90"  as const, dailyROI: "0.5000", durationDays: 90,  autoCompound: false, claimableROI: "390.00000000",claimablePrincipal: "0.00000000", status: "ACTIVE"    as const, startedAt: new Date("2026-06-24T06:17:42.020Z"), maturesAt: new Date("2026-09-22T06:17:42.020Z") },
    { id: "cmqt7ponm000288guq27ftrmq", userId: "cmqt6mum4000185pmjdh29iyy", amount: "500.00000000", currentPrincipal: "519.08170652", planType: "PLAN_90"  as const, dailyROI: "0.5000", durationDays: 90,  autoCompound: true,  claimableROI: "0.00000000",  claimablePrincipal: "0.00000000", status: "ACTIVE"    as const, startedAt: new Date("2026-06-25T08:00:25.618Z"), maturesAt: new Date("2026-09-23T08:00:25.618Z") },
    { id: "cmqt8ysn8000988gu3hx6unnq", userId: "cmqt6mum4000185pmjdh29iyy", amount: "400.00000000", currentPrincipal: "400.00000000", planType: "PLAN_180" as const, dailyROI: "0.6000", durationDays: 180, autoCompound: true,  claimableROI: "0.00000000",  claimablePrincipal: "0.00000000", status: "COMPLETED" as const, startedAt: new Date("2026-06-25T08:35:30.307Z"), maturesAt: new Date("2026-06-25T08:46:56.296Z") },
  ];

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.createMany({ data: batch1, skipDuplicates: true });
    await tx.user.createMany({ data: batch2, skipDuplicates: true });
    await tx.user.createMany({ data: batch3, skipDuplicates: true });
    await tx.user.createMany({ data: batch4, skipDuplicates: true });
    await tx.user.createMany({ data: batch5, skipDuplicates: true });
    await tx.user.createMany({ data: batch6, skipDuplicates: true });
    const { count: walletCount }     = await tx.wallet.createMany({ data: wallets, skipDuplicates: true });
    const { count: adminCount }      = await tx.admin.createMany({ data: admins, skipDuplicates: true });
    const { count: investmentCount } = await tx.investment.createMany({ data: investments, skipDuplicates: true });
    const userCount                  = await tx.user.count();
    return { userCount, walletCount, adminCount, investmentCount };
  });

  res.json({
    success: true,
    message: "Production database seeded successfully",
    seeded: result,
  });
});

export default seedRouter;
