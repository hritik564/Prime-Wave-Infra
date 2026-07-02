/**
 * Admin Script Endpoints — Sprint 28N
 *
 * Exposes the one-time genesis scripts as authenticated HTTP endpoints so they
 * can be triggered against the production database without direct shell access.
 *
 * Both endpoints are idempotent:
 *   • rd-activation   — skips any RD that already has an ACTIVE investment.
 *   • reconcile-fix   — only UPDATEs rows where stored value ≠ actual count.
 *
 * Access: SUPER_ADMIN only (enforced by route guard in admin.routes.ts).
 */

import type { Response } from "express";
import { Prisma } from "@prisma/client";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { prisma } from "../config/prisma";
import { createManualAdminDeposit } from "./admin-deposits.service";
import { createInvestment } from "../investments/investments.service";

// ─────────────────────────────────────────────────────────────────────────────
// RD Activation
// ─────────────────────────────────────────────────────────────────────────────

const DEPOSIT_AMOUNT = 100;
const INVEST_AMOUNT  = 100;
const PLAN_TYPE      = "PLAN_360" as const;
const ACTIVATION_REASON = "RD Activation — Sprint 28N: First qualifying investment";

export async function rdActivationHandler(req: AuthenticatedRequest, res: Response) {
  const adminId = req.user.sub;

  // Fetch all rd#### users
  const allRd = await prisma.user.findMany({
    where: { username: { startsWith: "rd" } },
    select: {
      id:               true,
      username:         true,
      directLeftCount:  true,
      directRightCount: true,
      investments: {
        where:  { status: "ACTIVE" },
        select: { id: true, amount: true },
        take:   1,
      },
    },
    orderBy: { username: "asc" },
  });

  const rds = allRd.filter(u => /^rd\d{4}$/.test(u.username));

  let activated = 0;
  let skipped   = 0;
  const errors: Array<{ username: string; error: string }> = [];

  for (const rd of rds) {
    if (rd.investments.length > 0) {
      skipped++;
      continue;
    }

    try {
      await createManualAdminDeposit(adminId, {
        userId:  rd.id,
        amount:  DEPOSIT_AMOUNT,
        network: "BEP20",
        reason:  ACTIVATION_REASON,
        notes:   "Automated RD activation — Sprint 28N",
      });

      await createInvestment(rd.id, {
        amount:       INVEST_AMOUNT,
        planType:     PLAN_TYPE,
        autoCompound: false,
      });

      activated++;
    } catch (err) {
      errors.push({
        username: rd.username,
        error:    err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Post-activation verification
  const verifyInv = await prisma.investment.count({
    where: {
      user:   { username: { startsWith: "rd" } },
      status: "ACTIVE",
    },
  });

  const verifyTotal = await prisma.investment.aggregate({
    where: {
      user:   { username: { startsWith: "rd" } },
      status: "ACTIVE",
    },
    _sum: { amount: true },
  });

  sendSuccess(res, {
    rdTotal:            rds.length,
    activated,
    skipped,
    errors:             errors.length,
    errorDetail:        errors,
    postVerification: {
      activeInvestments: verifyInv,
      totalInvested:     verifyTotal._sum.amount?.toFixed(2) ?? "0.00",
    },
  }, "RD activation complete");
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter Reconciliation (fix mode)
// ─────────────────────────────────────────────────────────────────────────────

async function countMismatches(): Promise<number> {
  const result = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
    SELECT COUNT(*) AS cnt
    FROM users u
    LEFT JOIN (
      SELECT "binaryParentId", COUNT(*) AS c
      FROM users WHERE position = 'LEFT' AND "binaryParentId" IS NOT NULL
      GROUP BY "binaryParentId"
    ) lc ON lc."binaryParentId" = u.id
    LEFT JOIN (
      SELECT "binaryParentId", COUNT(*) AS c
      FROM users WHERE position = 'RIGHT' AND "binaryParentId" IS NOT NULL
      GROUP BY "binaryParentId"
    ) rc ON rc."binaryParentId" = u.id
    LEFT JOIN (
      SELECT "sponsorId", COUNT(*) AS c
      FROM users WHERE "sponsorId" IS NOT NULL
      GROUP BY "sponsorId"
    ) rf ON rf."sponsorId" = u.id
    WHERE u."directLeftCount"     != COALESCE(lc.c, 0)
       OR u."directRightCount"    != COALESCE(rc.c, 0)
       OR u."directReferralCount" != COALESCE(rf.c, 0)
  `;
  return Number(result[0]?.cnt ?? 0);
}

export async function reconcileCountersHandler(_req: AuthenticatedRequest, res: Response) {
  const before = await countMismatches();

  const leftFixed = await prisma.$executeRaw`
    UPDATE users u
    SET "directLeftCount" = COALESCE(sub.cnt, 0)
    FROM (
      SELECT u2.id, COALESCE(lc.cnt, 0) AS cnt
      FROM users u2
      LEFT JOIN (
        SELECT "binaryParentId", COUNT(*) AS cnt
        FROM users WHERE position = 'LEFT' AND "binaryParentId" IS NOT NULL
        GROUP BY "binaryParentId"
      ) lc ON lc."binaryParentId" = u2.id
    ) sub
    WHERE u.id = sub.id AND u."directLeftCount" != sub.cnt
  `;

  const rightFixed = await prisma.$executeRaw`
    UPDATE users u
    SET "directRightCount" = COALESCE(sub.cnt, 0)
    FROM (
      SELECT u2.id, COALESCE(rc.cnt, 0) AS cnt
      FROM users u2
      LEFT JOIN (
        SELECT "binaryParentId", COUNT(*) AS cnt
        FROM users WHERE position = 'RIGHT' AND "binaryParentId" IS NOT NULL
        GROUP BY "binaryParentId"
      ) rc ON rc."binaryParentId" = u2.id
    ) sub
    WHERE u.id = sub.id AND u."directRightCount" != sub.cnt
  `;

  const referralFixed = await prisma.$executeRaw`
    UPDATE users u
    SET "directReferralCount" = COALESCE(sub.cnt, 0)
    FROM (
      SELECT u2.id, COALESCE(rf.cnt, 0) AS cnt
      FROM users u2
      LEFT JOIN (
        SELECT "sponsorId", COUNT(*) AS cnt
        FROM users WHERE "sponsorId" IS NOT NULL
        GROUP BY "sponsorId"
      ) rf ON rf."sponsorId" = u2.id
    ) sub
    WHERE u.id = sub.id AND u."directReferralCount" != sub.cnt
  `;

  const after = await countMismatches();

  sendSuccess(res, {
    mismatchesBefore: before,
    mismatchesAfter:  after,
    rowsFixed: {
      directLeftCount:     leftFixed,
      directRightCount:    rightFixed,
      directReferralCount: referralFixed,
      total:               leftFixed + rightFixed + referralFixed,
    },
    pass: after === 0,
  }, "Counter reconciliation complete");
}
