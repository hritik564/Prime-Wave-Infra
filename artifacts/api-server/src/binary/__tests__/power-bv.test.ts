/**
 * Sprint 33B — Power BV flush: unit tests
 *
 * Tests the pure `computeBVFlush` function against all 5 spec cases.
 * No DB, no Prisma mock, no env stub — purely computational.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { computeBVFlush, effectiveLegBV } from "../bv-flush";

// ── Helpers ───────────────────────────────────────────────────────────────────

const D = (n: number | string) => new Prisma.Decimal(n);
const N = (d: Prisma.Decimal)  => d.toNumber();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("computeBVFlush — Sprint 33B Power BV integration", () => {

  // ── Case 1: Organic only ──────────────────────────────────────────────────
  describe("Case 1 — organic only", () => {
    it("behaviour is identical to the pre-Power-BV version", () => {
      const left  = { organicBV: D(100), powerBV: D(0) };
      const right = { organicBV: D(80),  powerBV: D(0) };

      const f = computeBVFlush(left, right);

      expect(N(f.matchedBV)).toBe(80);           // min(100, 80)
      expect(N(f.organicLeftConsumed)).toBe(80);  // organic consumed
      expect(N(f.powerLeftConsumed)).toBe(0);     // no power consumed
      expect(N(f.organicRightConsumed)).toBe(80);
      expect(N(f.powerRightConsumed)).toBe(0);
      expect(N(f.carryForwardLeft)).toBe(20);     // 100 - 80
      expect(N(f.carryForwardRight)).toBe(0);     // 80  - 80
      expect(N(f.powerCarryForwardLeft)).toBe(0);
      expect(N(f.powerCarryForwardRight)).toBe(0);
    });

    it("symmetric legs with no power", () => {
      const both = { organicBV: D(50), powerBV: D(0) };
      const f    = computeBVFlush(both, both);

      expect(N(f.matchedBV)).toBe(50);
      expect(N(f.organicLeftConsumed)).toBe(50);
      expect(N(f.powerLeftConsumed)).toBe(0);
      expect(N(f.carryForwardLeft)).toBe(0);
      expect(N(f.powerCarryForwardLeft)).toBe(0);
    });
  });

  // ── Case 2: Power only ────────────────────────────────────────────────────
  describe("Case 2 — power only", () => {
    it("matching works when both legs have only Power BV", () => {
      const left  = { organicBV: D(0), powerBV: D(100) };
      const right = { organicBV: D(0), powerBV: D(80)  };

      const f = computeBVFlush(left, right);

      expect(N(f.matchedBV)).toBe(80);           // min(100, 80)
      expect(N(f.organicLeftConsumed)).toBe(0);   // no organic
      expect(N(f.powerLeftConsumed)).toBe(80);    // power consumed
      expect(N(f.organicRightConsumed)).toBe(0);
      expect(N(f.powerRightConsumed)).toBe(80);
      expect(N(f.carryForwardLeft)).toBe(0);
      expect(N(f.carryForwardRight)).toBe(0);
      expect(N(f.powerCarryForwardLeft)).toBe(20);  // 100 - 80
      expect(N(f.powerCarryForwardRight)).toBe(0);  // 80  - 80
    });
  });

  // ── Case 3: Organic + Power — organic consumed first ─────────────────────
  describe("Case 3 — organic + power mixed", () => {
    it("spec example: organic=100, power=50 left; organic=120 right → power_left_remaining=30", () => {
      // Spec: "Organic Left 100, Power Left 50, Matched 120 → Organic Left 0, Power Left 30"
      const left  = { organicBV: D(100), powerBV: D(50) };  // effective 150
      const right = { organicBV: D(120), powerBV: D(0)  };  // effective 120

      const f = computeBVFlush(left, right);

      expect(N(f.matchedBV)).toBe(120);            // min(150, 120)
      expect(N(f.organicLeftConsumed)).toBe(100);   // all organic consumed first
      expect(N(f.powerLeftConsumed)).toBe(20);      // 120 - 100 = 20 from power
      expect(N(f.organicRightConsumed)).toBe(120);  // all organic consumed
      expect(N(f.powerRightConsumed)).toBe(0);      // right has no power
      expect(N(f.carryForwardLeft)).toBe(0);        // 100 - 100
      expect(N(f.carryForwardRight)).toBe(0);       // 120 - 120
      expect(N(f.powerCarryForwardLeft)).toBe(30);  // 50 - 20 ← spec says "Power Left = 30"
      expect(N(f.powerCarryForwardRight)).toBe(0);
    });

    it("symmetric legs: organic fully consumed before power is touched", () => {
      const left  = { organicBV: D(100), powerBV: D(50) };  // effective 150
      const right = { organicBV: D(100), powerBV: D(50) };

      const f = computeBVFlush(left, right);

      expect(N(f.matchedBV)).toBe(150);
      expect(N(f.organicLeftConsumed)).toBe(100);   // organic exhausted first
      expect(N(f.powerLeftConsumed)).toBe(50);      // remainder from power
      expect(N(f.carryForwardLeft)).toBe(0);
      expect(N(f.powerCarryForwardLeft)).toBe(0);
    });

    it("partial power consumption: organic partially exhausted", () => {
      const left  = { organicBV: D(60), powerBV: D(40) };  // effective 100
      const right = { organicBV: D(80), powerBV: D(20) };  // effective 100

      const f = computeBVFlush(left, right);

      expect(N(f.matchedBV)).toBe(100);
      // LEFT: 60 organic consumed, then 40 power consumed
      expect(N(f.organicLeftConsumed)).toBe(60);
      expect(N(f.powerLeftConsumed)).toBe(40);
      expect(N(f.carryForwardLeft)).toBe(0);
      expect(N(f.powerCarryForwardLeft)).toBe(0);
      // RIGHT: 80 organic consumed, then 20 power consumed
      expect(N(f.organicRightConsumed)).toBe(80);
      expect(N(f.powerRightConsumed)).toBe(20);
      expect(N(f.carryForwardRight)).toBe(0);
      expect(N(f.powerCarryForwardRight)).toBe(0);
    });
  });

  // ── Case 4: Power only on one leg — no matching ──────────────────────────
  describe("Case 4 — power only on one leg", () => {
    it("effective right = 0 → matchedBV = 0 (cycle should skip this user)", () => {
      const left  = { organicBV: D(0), powerBV: D(50) };  // effective 50
      const right = { organicBV: D(0), powerBV: D(0)  };  // effective 0

      const f = computeBVFlush(left, right);

      // min(50, 0) = 0 → the cycle skips (matchedBV.lte(0) check)
      expect(N(f.matchedBV)).toBe(0);
      expect(N(f.organicLeftConsumed)).toBe(0);
      expect(N(f.powerLeftConsumed)).toBe(0);
      expect(N(f.carryForwardLeft)).toBe(0);
      expect(N(f.powerCarryForwardLeft)).toBe(50);   // power intact — nothing consumed
      expect(N(f.powerCarryForwardRight)).toBe(0);
    });

    it("organic on one leg + power on other leg — matchedBV = 0 if one effective leg is 0", () => {
      const left  = { organicBV: D(100), powerBV: D(0) };  // effective 100
      const right = { organicBV: D(0),   powerBV: D(0) };  // effective 0

      const f = computeBVFlush(left, right);

      expect(N(f.matchedBV)).toBe(0);
      expect(N(f.powerCarryForwardLeft)).toBe(0);
      expect(N(f.carryForwardLeft)).toBe(100);  // organic intact
    });
  });

  // ── Case 5: Power removed — effective BV immediately recalculates ─────────
  describe("Case 5 — power removed", () => {
    it("effective BV drops immediately; next flush uses updated values", () => {
      // Before: left has organic=50 + power=100 (effective 150), right same
      const before = computeBVFlush(
        { organicBV: D(50), powerBV: D(100) },
        { organicBV: D(50), powerBV: D(100) },
      );
      expect(N(before.matchedBV)).toBe(150);  // full effective match

      // Admin removes ALL power from left leg → powerLeftBV = 0
      const after = computeBVFlush(
        { organicBV: D(50), powerBV: D(0)   },  // power removed
        { organicBV: D(50), powerBV: D(100) },  // right unchanged
      );
      // effectiveLeft now = 50, effectiveRight = 150 → matched = 50
      expect(N(after.matchedBV)).toBe(50);
      expect(N(after.organicLeftConsumed)).toBe(50);   // organic covers the match
      expect(N(after.powerLeftConsumed)).toBe(0);      // no power consumed
      expect(N(after.organicRightConsumed)).toBe(50);
      expect(N(after.powerRightConsumed)).toBe(0);     // organic on right covered
      expect(N(after.powerCarryForwardRight)).toBe(100); // right power unaffected
    });

    it("partial power removal reduces matchedBV proportionally", () => {
      // Full state: organic=100, power=100 both legs → matched = 200
      const full = computeBVFlush(
        { organicBV: D(100), powerBV: D(100) },
        { organicBV: D(100), powerBV: D(100) },
      );
      expect(N(full.matchedBV)).toBe(200);

      // After removing 50 power from left: effective_left = 150
      const partial = computeBVFlush(
        { organicBV: D(100), powerBV: D(50)  },  // power halved
        { organicBV: D(100), powerBV: D(100) },
      );
      expect(N(partial.matchedBV)).toBe(150);  // limited by left effective
    });
  });

  // ── effectiveLegBV helper ─────────────────────────────────────────────────
  describe("effectiveLegBV", () => {
    it("sums organic + power", () => {
      expect(N(effectiveLegBV({ organicBV: D(100), powerBV: D(50) }))).toBe(150);
      expect(N(effectiveLegBV({ organicBV: D(0),   powerBV: D(75) }))).toBe(75);
      expect(N(effectiveLegBV({ organicBV: D(80),  powerBV: D(0)  }))).toBe(80);
      expect(N(effectiveLegBV({ organicBV: D(0),   powerBV: D(0)  }))).toBe(0);
    });
  });
});
