/**
 * Power BV flush utilities — pure functions, no DB or side effects.
 *
 * Sprint 33B: Organic-first BV consumption rule.
 *
 *   When the matching or orbit engine flushes BV from a leg:
 *     1. Consume Organic BV first (up to the matched amount).
 *     2. Consume Power BV only after Organic BV is exhausted.
 *
 * These are tested directly in __tests__/power-bv.test.ts without any mocks.
 */

import { Prisma } from "@prisma/client";

// ── Input types ───────────────────────────────────────────────────────────────

export interface LegBV {
  organicBV: Prisma.Decimal;
  powerBV:   Prisma.Decimal;
}

// ── Output type ───────────────────────────────────────────────────────────────

export interface FlushResult {
  /** min(effectiveLeft, effectiveRight) */
  matchedBV:             Prisma.Decimal;
  /** Organic BV consumed from the LEFT leg */
  organicLeftConsumed:   Prisma.Decimal;
  /** Power BV consumed from the LEFT leg (non-zero only after organic exhausted) */
  powerLeftConsumed:     Prisma.Decimal;
  /** Organic BV consumed from the RIGHT leg */
  organicRightConsumed:  Prisma.Decimal;
  /** Power BV consumed from the RIGHT leg (non-zero only after organic exhausted) */
  powerRightConsumed:    Prisma.Decimal;
  /** Organic BV remaining on LEFT leg after flush */
  carryForwardLeft:      Prisma.Decimal;
  /** Organic BV remaining on RIGHT leg after flush */
  carryForwardRight:     Prisma.Decimal;
  /** Power BV remaining on LEFT leg after flush */
  powerCarryForwardLeft: Prisma.Decimal;
  /** Power BV remaining on RIGHT leg after flush */
  powerCarryForwardRight: Prisma.Decimal;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Effective BV for a single leg: organic + power.
 */
export function effectiveLegBV(leg: LegBV): Prisma.Decimal {
  return leg.organicBV.plus(leg.powerBV);
}

// ── Core flush function ───────────────────────────────────────────────────────

/**
 * Computes the BV flush for one matching/orbit cycle using organic-first priority.
 *
 * matchedBV = min(organic_L + power_L,  organic_R + power_R)
 *
 * For each leg:
 *   organicConsumed = min(matchedBV, organicBV)   — organic consumed first
 *   powerConsumed   = matchedBV − organicConsumed — power fills the remainder
 *
 * This is a pure function with no DB calls or external state.
 */
export function computeBVFlush(left: LegBV, right: LegBV): FlushResult {
  const effectiveLeft  = effectiveLegBV(left);
  const effectiveRight = effectiveLegBV(right);
  const matchedBV      = Prisma.Decimal.min(effectiveLeft, effectiveRight);

  // Organic-first consumption — left leg
  const organicLeftConsumed  = Prisma.Decimal.min(matchedBV, left.organicBV);
  const powerLeftConsumed    = matchedBV.minus(organicLeftConsumed);

  // Organic-first consumption — right leg
  const organicRightConsumed = Prisma.Decimal.min(matchedBV, right.organicBV);
  const powerRightConsumed   = matchedBV.minus(organicRightConsumed);

  // Carry-forward: what remains after consumption
  const carryForwardLeft       = left.organicBV.minus(organicLeftConsumed);
  const carryForwardRight      = right.organicBV.minus(organicRightConsumed);
  const powerCarryForwardLeft  = left.powerBV.minus(powerLeftConsumed);
  const powerCarryForwardRight = right.powerBV.minus(powerRightConsumed);

  return {
    matchedBV,
    organicLeftConsumed,
    powerLeftConsumed,
    organicRightConsumed,
    powerRightConsumed,
    carryForwardLeft,
    carryForwardRight,
    powerCarryForwardLeft,
    powerCarryForwardRight,
  };
}
