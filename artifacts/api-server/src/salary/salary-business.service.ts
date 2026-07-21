/**
 * Sprint 33E — Salary Business Service
 *
 * Maintains SalaryBusinessSummary counters and writes immutable
 * SalaryBusinessEvent records.  No qualification logic lives here.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *  applyPoolDelta()          private — atomic idempotency-check + upsert + event
 *  creditDirectBusiness()    exported — INVESTMENT_CREATED,  pool=DIRECT
 *  debitDirectBusiness()     exported — INVESTMENT_CANCELLED/REFUNDED, pool=DIRECT
 *  creditDownlineBusiness()  exported — INVESTMENT_CREATED,  pool=DOWNLINE
 *  debitDownlineBusiness()   exported — INVESTMENT_CANCELLED/REFUNDED, pool=DOWNLINE
 *  creditPowerBusiness()     exported — POWER_BV_ADDED,   pool=POWER
 *  debitPowerBusiness()      exported — POWER_BV_REMOVED, pool=POWER
 *
 *  propagateInvestmentBusiness()  exported — walks sponsor chain, calls credit/debit
 *  updatePowerBusiness()          exported — credits/debits POWER for a single user
 *
 * ── Per-user atomicity ───────────────────────────────────────────────────────
 *
 *  Each named function opens a single prisma.$transaction.
 *  Either (SalaryBusinessSummary update + SalaryBusinessEvent create) both
 *  commit, or neither does.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 *
 *  @@unique(userId, pool, referenceId, eventType) on SalaryBusinessEvent.
 *  Before any write we check for an existing event and skip gracefully on
 *  duplicate.  Re-running propagation for the same investmentId is always safe.
 *
 * ── Negative-balance guard ────────────────────────────────────────────────────
 *
 *  Debit operations read the current counter and clamp the delta so the
 *  balance never goes below 0.  An anomaly is logged when clamping occurs.
 */

import { Prisma } from "@prisma/client";
import type { SalaryPool, SalaryEventType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_SPONSOR_DEPTH = 50;
const ZERO = new Prisma.Decimal(0);

// ── applyPoolDelta (private) ──────────────────────────────────────────────────
//
// Core atomic unit: idempotency-check → clamp-if-debit → upsert summary →
// write event.  Must be called inside a Prisma.$transaction callback.

type ApplyResult = "applied" | "duplicate" | "clamped";

async function applyPoolDelta(
  tx: Prisma.TransactionClient,
  opts: {
    userId:        string;
    sourceUserId:  string;
    pool:          SalaryPool;
    eventType:     SalaryEventType;
    delta:         Prisma.Decimal;  // positive = credit, negative = debit
    referenceId:   string;
    referenceType: string;
    depth:         number | null;
    metadata?:     Prisma.InputJsonValue;
  },
): Promise<ApplyResult> {
  const {
    userId, sourceUserId, pool, eventType,
    delta, referenceId, referenceType, depth, metadata,
  } = opts;

  // ── Idempotency: check for existing event ─────────────────────────────────
  const existing = await tx.salaryBusinessEvent.findUnique({
    where: {
      userId_pool_referenceId_eventType: { userId, pool, referenceId, eventType },
    },
    select: { id: true },
  });

  if (existing) {
    logger.debug(
      { userId, pool, referenceId, eventType },
      "salary-business: duplicate event detected — skipping",
    );
    return "duplicate";
  }

  // ── Clamp debit to available balance ─────────────────────────────────────
  let effectiveDelta = delta;
  let status: ApplyResult = "applied";

  if (delta.isNegative()) {
    const summary = await tx.salaryBusinessSummary.findUnique({
      where:  { userId },
      select: { directBusiness: true, downlineBusiness: true, powerBusiness: true },
    });

    const current: Prisma.Decimal =
      pool === "DIRECT"   ? (summary?.directBusiness   ?? ZERO)
    : pool === "DOWNLINE" ? (summary?.downlineBusiness  ?? ZERO)
    :                        (summary?.powerBusiness     ?? ZERO);

    if (current.plus(delta).lessThan(ZERO)) {
      effectiveDelta = current.negated();   // floor: deduct only what exists
      status = "clamped";
      logger.warn(
        {
          userId, pool, referenceId,
          requested: delta.toFixed(8),
          applied:   effectiveDelta.toFixed(8),
          current:   current.toFixed(8),
        },
        "salary-business: negative balance prevented — delta clamped to zero",
      );
    }
  }

  // ── Update summary counter ────────────────────────────────────────────────
  const field =
    pool === "DIRECT"   ? "directBusiness"
  : pool === "DOWNLINE" ? "downlineBusiness"
  :                        "powerBusiness";

  await tx.salaryBusinessSummary.upsert({
    where:  { userId },
    create: {
      userId,
      // Only the affected pool gets the initial delta; others default to 0
      ...(pool === "DIRECT"   && { directBusiness:   effectiveDelta.isNegative() ? ZERO : effectiveDelta }),
      ...(pool === "DOWNLINE" && { downlineBusiness:  effectiveDelta.isNegative() ? ZERO : effectiveDelta }),
      ...(pool === "POWER"    && { powerBusiness:     effectiveDelta.isNegative() ? ZERO : effectiveDelta }),
      version: 1,
    },
    update: effectiveDelta.isNegative()
      ? { [field]: { decrement: effectiveDelta.abs() }, version: { increment: 1 } }
      : { [field]: { increment: effectiveDelta },        version: { increment: 1 } },
  });

  // ── Write immutable event record ─────────────────────────────────────────
  await tx.salaryBusinessEvent.create({
    data: {
      userId,
      sourceUserId,
      pool,
      eventType,
      delta:         effectiveDelta,
      referenceId,
      referenceType,
      depth,
      ...(metadata !== undefined && { metadata }),
    },
  });

  logger.info(
    {
      userId, sourceUserId, pool, eventType,
      delta: effectiveDelta.toFixed(8),
      depth: depth ?? "n/a",
    },
    `salary-business: ${delta.isNegative() ? "debit" : "credit"} applied`,
  );

  return status;
}

// ── buildSponsorChain (private) ───────────────────────────────────────────────
//
// Walks from investorUserId up through sponsorId links, up to MAX_SPONSOR_DEPTH.
// Returns one entry per ancestor (depth 1 = DIRECT, depth ≥ 2 = DOWNLINE).

interface SponsorChainEntry {
  userId: string;
  pool:   SalaryPool;
  depth:  number;
}

async function buildSponsorChain(
  investorUserId: string,
): Promise<SponsorChainEntry[]> {
  const chain: SponsorChainEntry[] = [];
  let currentId: string = investorUserId;

  for (let depth = 1; depth <= MAX_SPONSOR_DEPTH; depth++) {
    const user = await prisma.user.findUnique({
      where:  { id: currentId },
      select: { sponsorId: true },
    });

    if (!user?.sponsorId) break;

    currentId = user.sponsorId;
    chain.push({
      userId: currentId,
      pool:   depth === 1 ? "DIRECT" : "DOWNLINE",
      depth,
    });

    if (depth === MAX_SPONSOR_DEPTH) {
      logger.warn(
        { investorUserId, depth },
        "salary-business: sponsor chain depth limit (50) reached — propagation stopped",
      );
    }
  }

  return chain;
}

// ── Named credit functions ────────────────────────────────────────────────────

export async function creditDirectBusiness(
  userId:       string,
  sourceUserId: string,
  investmentId: string,
  amount:       Prisma.Decimal,
  depth:        number,
): Promise<ApplyResult> {
  return prisma.$transaction((tx) =>
    applyPoolDelta(tx, {
      userId, sourceUserId,
      pool:          "DIRECT",
      eventType:     "INVESTMENT_CREATED",
      delta:         amount,
      referenceId:   investmentId,
      referenceType: "investment",
      depth,
      metadata: { investmentId, amount: amount.toFixed(8) },
    }),
  );
}

export async function creditDownlineBusiness(
  userId:       string,
  sourceUserId: string,
  investmentId: string,
  amount:       Prisma.Decimal,
  depth:        number,
): Promise<ApplyResult> {
  return prisma.$transaction((tx) =>
    applyPoolDelta(tx, {
      userId, sourceUserId,
      pool:          "DOWNLINE",
      eventType:     "INVESTMENT_CREATED",
      delta:         amount,
      referenceId:   investmentId,
      referenceType: "investment",
      depth,
      metadata: { investmentId, amount: amount.toFixed(8) },
    }),
  );
}

export async function creditPowerBusiness(
  userId:           string,
  powerBvLedgerId:  string,
  bv:               Prisma.Decimal,
): Promise<ApplyResult> {
  return prisma.$transaction((tx) =>
    applyPoolDelta(tx, {
      userId, sourceUserId: userId,
      pool:          "POWER",
      eventType:     "POWER_BV_ADDED",
      delta:         bv,
      referenceId:   powerBvLedgerId,
      referenceType: "power_bv_ledger",
      depth:         null,
      metadata: { bv: bv.toFixed(8) },
    }),
  );
}

// ── Named debit functions ─────────────────────────────────────────────────────

export async function debitDirectBusiness(
  userId:       string,
  sourceUserId: string,
  investmentId: string,
  amount:       Prisma.Decimal,
  depth:        number,
  eventType:    Extract<SalaryEventType, "INVESTMENT_CANCELLED" | "INVESTMENT_REFUNDED">,
): Promise<ApplyResult> {
  return prisma.$transaction((tx) =>
    applyPoolDelta(tx, {
      userId, sourceUserId,
      pool:          "DIRECT",
      eventType,
      delta:         amount.negated(),
      referenceId:   investmentId,
      referenceType: "investment",
      depth,
      metadata: { investmentId, amount: amount.toFixed(8) },
    }),
  );
}

export async function debitDownlineBusiness(
  userId:       string,
  sourceUserId: string,
  investmentId: string,
  amount:       Prisma.Decimal,
  depth:        number,
  eventType:    Extract<SalaryEventType, "INVESTMENT_CANCELLED" | "INVESTMENT_REFUNDED">,
): Promise<ApplyResult> {
  return prisma.$transaction((tx) =>
    applyPoolDelta(tx, {
      userId, sourceUserId,
      pool:          "DOWNLINE",
      eventType,
      delta:         amount.negated(),
      referenceId:   investmentId,
      referenceType: "investment",
      depth,
      metadata: { investmentId, amount: amount.toFixed(8) },
    }),
  );
}

export async function debitPowerBusiness(
  userId:          string,
  powerBvLedgerId: string,
  bv:              Prisma.Decimal,
): Promise<ApplyResult> {
  return prisma.$transaction((tx) =>
    applyPoolDelta(tx, {
      userId, sourceUserId: userId,
      pool:          "POWER",
      eventType:     "POWER_BV_REMOVED",
      delta:         bv.negated(),
      referenceId:   powerBvLedgerId,
      referenceType: "power_bv_ledger",
      depth:         null,
      metadata: { bv: bv.toFixed(8) },
    }),
  );
}

// ── High-level orchestrators ──────────────────────────────────────────────────

/**
 * Walk the sponsor chain from investorUserId and credit or debit DIRECT
 * (depth = 1) and DOWNLINE (depth ≥ 2) pools for each ancestor.
 *
 * Each ancestor's update is an independent atomic transaction so a failure
 * for one ancestor does not roll back already-committed ancestors.  Because
 * every operation is idempotent, partial runs can always be safely retried.
 */
export async function propagateInvestmentBusiness(
  investorUserId: string,
  investmentId:   string,
  amount:         Prisma.Decimal,
  eventType:      Extract<SalaryEventType, "INVESTMENT_CREATED" | "INVESTMENT_CANCELLED" | "INVESTMENT_REFUNDED">,
): Promise<void> {
  const chain = await buildSponsorChain(investorUserId);

  if (chain.length === 0) {
    logger.debug(
      { investorUserId, investmentId },
      "salary-business: no sponsor chain — no business credited",
    );
    return;
  }

  for (const { userId, pool, depth } of chain) {
    try {
      let result: ApplyResult;

      if (eventType === "INVESTMENT_CREATED") {
        result = await (pool === "DIRECT"
          ? creditDirectBusiness(userId, investorUserId, investmentId, amount, depth)
          : creditDownlineBusiness(userId, investorUserId, investmentId, amount, depth));
      } else {
        result = await (pool === "DIRECT"
          ? debitDirectBusiness(userId, investorUserId, investmentId, amount, depth, eventType)
          : debitDownlineBusiness(userId, investorUserId, investmentId, amount, depth, eventType));
      }

      if (result === "duplicate") {
        logger.debug(
          { userId, pool, investmentId, eventType, depth },
          "salary-business: propagation step already recorded — skipped",
        );
      }
    } catch (err) {
      logger.error(
        { err, userId, pool, investmentId, eventType, depth },
        "salary-business: propagation step failed — continuing to next ancestor",
      );
    }
  }
}

/**
 * Credit or debit the POWER pool for a single user.
 * No propagation — Power Business is a direct admin grant only.
 */
export async function updatePowerBusiness(
  userId:          string,
  powerBvLedgerId: string,
  bv:              Prisma.Decimal,
  eventType:       Extract<SalaryEventType, "POWER_BV_ADDED" | "POWER_BV_REMOVED">,
): Promise<void> {
  try {
    const result = eventType === "POWER_BV_ADDED"
      ? await creditPowerBusiness(userId, powerBvLedgerId, bv)
      : await debitPowerBusiness(userId, powerBvLedgerId, bv);

    if (result === "duplicate") {
      logger.debug(
        { userId, powerBvLedgerId, eventType },
        "salary-business: power event already recorded — skipped",
      );
    }
  } catch (err) {
    logger.error(
      { err, userId, powerBvLedgerId, eventType, bv: bv.toFixed(8) },
      "salary-business: power business update failed",
    );
  }
}
