/**
 * Binary Placement Cache Integrity Audit
 *
 * GET  /api/dev/binary/audit         — scan every user, compare cached pointers
 *                                      against the actual binary tree, report mismatches
 * POST /api/dev/binary/audit/repair  — repair every stale cache pointer in-place
 *
 * Development-only.  Mounted under /api/dev which requires SUPER_ADMIN.
 */

import { Router }             from "express";
import { prisma }             from "../config/prisma";
import { rebuildPlacementCache } from "../binary/binary.service";
import { sendSuccess }        from "../shared/response";
import { logger }             from "../lib/logger";

const auditRouter = Router();

// ── Shared helper: compute the true deepest node outside a transaction ─────────
//
// Reuses rebuildPlacementCache by wrapping it in a read-only interactive
// transaction so we get consistent reads without acquiring write locks.

async function computeDeepest(
  nodeId: string,
  side:   "LEFT" | "RIGHT",
): Promise<string | null> {
  return prisma.$transaction((tx) => rebuildPlacementCache(tx, nodeId, side));
}

// ── Mismatch record type ───────────────────────────────────────────────────────

interface CacheMismatch {
  userId:       string;
  username:     string;
  leftCached:   string | null;
  leftActual:   string | null;
  rightCached:  string | null;
  rightActual:  string | null;
  leftStale:    boolean;
  rightStale:   boolean;
}

// ── GET /api/dev/binary/audit ─────────────────────────────────────────────────

auditRouter.get("/", async (_req, res, next) => {
  try {
    const startMs = Date.now();

    const users = await prisma.user.findMany({
      select: {
        id:                 true,
        username:           true,
        leftDeepestNodeId:  true,
        rightDeepestNodeId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    let correct    = 0;
    let stale      = 0;
    const mismatches: CacheMismatch[] = [];

    for (const user of users) {
      const [actualLeft, actualRight] = await Promise.all([
        computeDeepest(user.id, "LEFT"),
        computeDeepest(user.id, "RIGHT"),
      ]);

      const leftStale  = user.leftDeepestNodeId  !== actualLeft;
      const rightStale = user.rightDeepestNodeId !== actualRight;

      if (!leftStale && !rightStale) {
        correct++;
      } else {
        stale++;
        mismatches.push({
          userId:      user.id,
          username:    user.username,
          leftCached:  user.leftDeepestNodeId,
          leftActual:  actualLeft,
          rightCached: user.rightDeepestNodeId,
          rightActual: actualRight,
          leftStale,
          rightStale,
        });
      }
    }

    logger.info(
      { scanned: users.length, correct, stale, elapsedMs: Date.now() - startMs },
      "Dev binary audit: scan complete",
    );

    sendSuccess(res, {
      scanned:    users.length,
      correct,
      stale,
      consistent: stale === 0,
      elapsedMs:  Date.now() - startMs,
      mismatches,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/binary/audit/repair ─────────────────────────────────────────

auditRouter.post("/repair", async (_req, res, next) => {
  try {
    const startMs = Date.now();

    const users = await prisma.user.findMany({
      select: {
        id:                 true,
        username:           true,
        leftDeepestNodeId:  true,
        rightDeepestNodeId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    let scanned  = 0;
    let repaired = 0;
    const repairs: Array<{
      userId:      string;
      username:    string;
      leftFixed:   boolean;
      rightFixed:  boolean;
      leftBefore:  string | null;
      leftAfter:   string | null;
      rightBefore: string | null;
      rightAfter:  string | null;
    }> = [];

    for (const user of users) {
      scanned++;

      const [actualLeft, actualRight] = await Promise.all([
        computeDeepest(user.id, "LEFT"),
        computeDeepest(user.id, "RIGHT"),
      ]);

      const leftFixed  = user.leftDeepestNodeId  !== actualLeft;
      const rightFixed = user.rightDeepestNodeId !== actualRight;

      if (leftFixed || rightFixed) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(leftFixed  ? { leftDeepestNodeId:  actualLeft  } : {}),
            ...(rightFixed ? { rightDeepestNodeId: actualRight } : {}),
          },
        });

        repaired++;
        repairs.push({
          userId:      user.id,
          username:    user.username,
          leftFixed,
          rightFixed,
          leftBefore:  user.leftDeepestNodeId,
          leftAfter:   actualLeft,
          rightBefore: user.rightDeepestNodeId,
          rightAfter:  actualRight,
        });
      }
    }

    logger.info(
      { scanned, repaired, elapsedMs: Date.now() - startMs },
      "Dev binary audit: repair complete",
    );

    sendSuccess(res, {
      scanned,
      repaired,
      consistent: true,
      elapsedMs:  Date.now() - startMs,
      repairs,
    });
  } catch (err) {
    next(err);
  }
});

export default auditRouter;
