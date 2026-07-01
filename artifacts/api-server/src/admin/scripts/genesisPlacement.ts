/**
 * Genesis Placement — Sprint 28H
 *
 * A dedicated, genesis-only account creation path that bypasses the
 * runtime placement engine entirely.
 *
 * Responsibilities:
 *   genesisInsertUser   — atomically create one user + wallet + sponsor
 *                         counts + referral history with binaryParentId
 *                         already known.  3 DB calls, no cache ops.
 *   repairAllBinaryCache — after ALL genesis accounts are inserted,
 *                         compute every node's leftDeepestNodeId and
 *                         rightDeepestNodeId from authoritative
 *                         binaryParentId + position columns using two
 *                         recursive SQL passes.  2 SQL statements total
 *                         in place of ~326,000 individual DB calls.
 *
 * What this file deliberately does NOT touch:
 *   • placeUserTx       — runtime placement engine, untouched
 *   • updateBinaryCache — runtime cache propagation, untouched
 *   • registerUser      — production registration flow, untouched
 *   • Any other business logic
 *
 * Why a separate file instead of flags on existing APIs:
 *   The generator has fundamentally different knowledge than the runtime:
 *   it pre-computes the exact binary parent for every account and has no
 *   need for cache reads, FOR UPDATE locks, stale-cache self-healing, or
 *   per-account cache propagation.  Encoding that knowledge into the
 *   runtime API via skipCacheUpdate / forcedPlacementTargetId flags would
 *   add generator-specific complexity to production code that handles
 *   real concurrent registrations.  A dedicated path keeps both concerns
 *   clean and independently maintainable.
 */

import { prisma } from "../../config/prisma.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenesisInsertParams {
  username:       string;
  email:          string;
  passwordHash:   string;
  firstName:      string;
  lastName:       string;
  referralCode:   string;
  sponsorId:      string;     // direct sponsor's user ID (pre-resolved by caller)
  binaryParentId: string;     // exact binary parent (pre-computed by generator)
  position:       "LEFT" | "RIGHT";
}

export interface GenesisInsertResult {
  id:           string;
  username:     string;
  referralCode: string;
}

export interface CacheRepairResult {
  leftUpdated:  number;   // rows updated for leftDeepestNodeId
  rightUpdated: number;   // rows updated for rightDeepestNodeId
}

// ── Account creation ──────────────────────────────────────────────────────────

/**
 * Insert one genesis account atomically.
 *
 * DB calls inside the transaction:
 *   1. user.create  (with nested wallet.create)
 *   2. user.update  (sponsor's directReferralCount + directLeft/RightCount)
 *   3. referralHistory.create
 *
 * Total: 3 DB calls.  No FOR UPDATE locks, no cache reads, no cache writes.
 *
 * The caller is responsible for:
 *   • Pre-computing binaryParentId (from in-memory chain tracking)
 *   • Pre-resolving sponsorId
 *   • Calling repairAllBinaryCache() after all accounts are inserted
 */
export async function genesisInsertUser(
  params: GenesisInsertParams,
): Promise<GenesisInsertResult> {
  const {
    username, email, passwordHash, firstName, lastName,
    referralCode, sponsorId, binaryParentId, position,
  } = params;

  return prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        status:        "INACTIVE",
        referralCode,
        referredBy:    sponsorId,
        sponsorId,
        binaryParentId,
        position,
        wallet: {
          create: { depositWallet: 0, incomeWallet: 0, withdrawalWallet: 0 },
        },
      },
      select: { id: true, username: true, referralCode: true },
    });

    await tx.user.update({
      where: { id: sponsorId },
      data: {
        directReferralCount: { increment: 1 },
        ...(position === "LEFT"
          ? { directLeftCount:  { increment: 1 } }
          : { directRightCount: { increment: 1 } }),
      },
    });

    await tx.referralHistory.create({
      data: { sponsorId, userId: newUser.id, leg: position },
    });

    return newUser;
  }, { timeout: 30000 });
}

// ── Bulk cache repair ─────────────────────────────────────────────────────────

/**
 * Compute and write every node's leftDeepestNodeId and rightDeepestNodeId
 * from the authoritative binaryParentId + position columns.
 *
 * Algorithm (LEFT pass, RIGHT is symmetric):
 *   For every node X that has at least one LEFT-positioned child:
 *     Walk down the LEFT chain (each step: follow the child whose
 *     position = LEFT) until reaching a leaf with no further LEFT child.
 *     Set X.leftDeepestNodeId = that leaf's ID.
 *
 *   Nodes with no LEFT child keep leftDeepestNodeId = NULL, which is the
 *   correct sentinel meaning "my own LEFT slot is available".
 *
 * Why this is correct without the direction-boundary check used by
 * updateBinaryCache (which stops when cur.position ≠ side):
 *   updateBinaryCache walks UP and uses the check to avoid updating an
 *   ancestor whose LEFT chain does not pass through the current subtree.
 *   repairAllBinaryCache walks DOWN — it starts from X's LEFT child and
 *   follows only LEFT children, so it naturally stays inside X's LEFT
 *   subtree and never crosses into a RIGHT subtree.
 *
 * Two recursive SQL CTEs replace the ~326,000 individual DB calls that
 * the per-account propagation loop would otherwise perform.
 *
 * Runtime on 6,528 accounts: < 1 second on PostgreSQL.
 */
export async function repairAllBinaryCache(): Promise<CacheRepairResult> {
  const leftUpdated = await prisma.$executeRawUnsafe(`
    WITH RECURSIVE lchain(root_id, current_id, depth) AS (
      SELECT "binaryParentId", id, 1
      FROM   users
      WHERE  position = 'LEFT' AND "binaryParentId" IS NOT NULL
      UNION ALL
      SELECT lc.root_id, u.id, lc.depth + 1
      FROM   lchain lc
      JOIN   users u ON u."binaryParentId" = lc.current_id AND u.position = 'LEFT'
    ),
    deepest AS (
      SELECT DISTINCT ON (root_id) root_id, current_id AS deepest_id
      FROM   lchain
      ORDER  BY root_id, depth DESC
    )
    UPDATE users
    SET    "leftDeepestNodeId" = d.deepest_id
    FROM   deepest d
    WHERE  users.id = d.root_id
  `);

  const rightUpdated = await prisma.$executeRawUnsafe(`
    WITH RECURSIVE rchain(root_id, current_id, depth) AS (
      SELECT "binaryParentId", id, 1
      FROM   users
      WHERE  position = 'RIGHT' AND "binaryParentId" IS NOT NULL
      UNION ALL
      SELECT rc.root_id, u.id, rc.depth + 1
      FROM   rchain rc
      JOIN   users u ON u."binaryParentId" = rc.current_id AND u.position = 'RIGHT'
    ),
    deepest AS (
      SELECT DISTINCT ON (root_id) root_id, current_id AS deepest_id
      FROM   rchain
      ORDER  BY root_id, depth DESC
    )
    UPDATE users
    SET    "rightDeepestNodeId" = d.deepest_id
    FROM   deepest d
    WHERE  users.id = d.root_id
  `);

  return { leftUpdated, rightUpdated };
}
