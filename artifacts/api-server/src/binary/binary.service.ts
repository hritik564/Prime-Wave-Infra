import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { PlaceUserInput } from "./binary.schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_TREE_DEPTH = 5;

// ── Tree node type (returned by all tree/parent/children endpoints) ────────────

export interface BinaryTreeNode {
  id:                  string;
  username:            string;
  firstName:           string;
  lastName:            string;
  status:              string;
  position:            "LEFT" | "RIGHT" | null;
  referralCode:        string;
  directReferralCount: number;
  placedAt:            Date | null;
  left:                BinaryTreeNode | null;
  right:               BinaryTreeNode | null;
}

// ── Raw type from recursive Prisma select ────────────────────────────────────

interface RawNode {
  id:                  string;
  username:            string;
  firstName:           string;
  lastName:            string;
  status:              string;
  position:            string | null;
  referralCode:        string;
  directReferralCount: number;
  updatedAt:           Date;
  binaryChildren?:     RawNode[];
}

// ── Recursive Prisma select builder (depth-limited) ───────────────────────────

function buildTreeSelect(depth: number): Record<string, unknown> {
  const base = {
    id:                  true,
    username:            true,
    firstName:           true,
    lastName:            true,
    status:              true,
    position:            true,
    referralCode:        true,
    directReferralCount: true,
    updatedAt:           true,
  };
  if (depth <= 0) return base;
  return {
    ...base,
    binaryChildren: {
      select:  buildTreeSelect(depth - 1),
      orderBy: { createdAt: "asc" as const },
    },
  };
}

// ── Format flat Prisma result into nested LEFT / RIGHT tree ───────────────────

function formatNode(raw: RawNode): BinaryTreeNode {
  const children = raw.binaryChildren ?? [];
  const left     = children.find((c) => c.position === "LEFT")  ?? null;
  const right    = children.find((c) => c.position === "RIGHT") ?? null;

  return {
    id:                  raw.id,
    username:            raw.username,
    firstName:           raw.firstName,
    lastName:            raw.lastName,
    status:              raw.status,
    position:            raw.position as "LEFT" | "RIGHT" | null,
    referralCode:        raw.referralCode,
    directReferralCount: raw.directReferralCount,
    placedAt:            raw.updatedAt,
    left:                left  ? formatNode(left)  : null,
    right:               right ? formatNode(right) : null,
  };
}

// ── Placement helpers ─────────────────────────────────────────────────────────

/**
 * Walk the {side} greedy chain downward from nodeId and return the id of the
 * deepest node whose {side} slot is currently empty (= next valid placement
 * target for a {side} registration under nodeId).
 *
 * Returns null when nodeId itself has no {side} child — meaning nodeId's own
 * slot is available and no cache pointer is needed.
 *
 * Complexity: O(depth) — one DB read per level of the chain.
 *
 * Used for:
 *   • Self-healing when the cached pointer is found to be stale.
 *   • The dev audit/repair tool.
 */
export async function rebuildPlacementCache(
  tx: Prisma.TransactionClient,
  nodeId: string,
  side: "LEFT" | "RIGHT",
): Promise<string | null> {
  const root = await tx.user.findUnique({
    where:  { id: nodeId },
    select: {
      binaryChildren: {
        where:  { position: side },
        select: { id: true },
        take:   1,
      },
    },
  });

  if (!root || root.binaryChildren.length === 0) return null;

  let cursor = root.binaryChildren[0].id;

  for (;;) {
    const cur = await tx.user.findUnique({
      where:  { id: cursor },
      select: {
        binaryChildren: {
          where:  { position: side },
          select: { id: true },
          take:   1,
        },
      },
    });

    if (!cur || cur.binaryChildren.length === 0) return cursor;
    cursor = cur.binaryChildren[0].id;
  }
}

/**
 * After placing a new user, walk upward through every ancestor in the
 * same-direction chain and update each node's deepest-node pointer to the
 * new user.
 *
 * Stopping conditions (whichever comes first):
 *   1. binaryParentId is null — we have reached the tree root.
 *   2. The current node's `position` relative to its parent differs from
 *      `side` — we have crossed a subtree-direction boundary.  The parent's
 *      {side} chain runs through a different path and must not be touched.
 *
 * Why the direction check is correct:
 *   Every node on the {side} greedy chain of an ancestor has position={side}
 *   relative to its own parent (i.e., a left-chain node is always a LEFT child
 *   of its parent).  The moment we encounter a node whose position ≠ side we
 *   know we are in a cross-direction subtree; updating the ancestor's {side}
 *   cache here would corrupt it.
 *
 * Complexity: O(depth) — one read + one write per ancestor level.
 */
async function propagateCacheUp(
  tx: Prisma.TransactionClient,
  fromId: string,
  side: "LEFT" | "RIGHT",
  newUserId: string,
): Promise<void> {
  let currentId  = fromId;
  const field    = side === "LEFT" ? "leftDeepestNodeId" : "rightDeepestNodeId";

  for (;;) {
    await tx.user.update({
      where: { id: currentId },
      data:  { [field]: newUserId },
    });

    const cur = await tx.user.findUnique({
      where:  { id: currentId },
      select: { binaryParentId: true, position: true },
    });

    if (!cur?.binaryParentId) break;   // reached tree root
    if (cur.position !== side)  break; // crossed direction boundary

    currentId = cur.binaryParentId;
  }
}

/**
 * Same walk as propagateCacheUp but runs outside any transaction, using the
 * main prisma client.  Safe to call after a transaction commits — there is no
 * open lock to conflict with live traffic.
 */
export async function updateBinaryCache(
  fromId: string,
  side: "LEFT" | "RIGHT",
  newUserId: string,
): Promise<void> {
  // Single recursive CTE — runs OUTSIDE any transaction so there are no open
  // row locks that could conflict with live traffic.  This replaces the old
  // per-row loop (16+ round-trips) with one DB call regardless of tree depth.
  // Two explicit branches avoid the need for dynamic column names in the
  // tagged-template form of $executeRaw (Prisma.raw() is not supported there).
  // Step 1 — SELECT: collect ancestor IDs via recursive CTE (text-cast throughout
  // to avoid UUID vs text operator mismatch in recursive CTE column inference).
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE chain AS (
      SELECT id::text, "binaryParentId"::text, position::text AS pos
      FROM   users
      WHERE  id = ${fromId}::uuid

      UNION ALL

      SELECT u.id::text, u."binaryParentId"::text, u.position::text
      FROM   users u
      JOIN   chain  c ON u.id::text = c."binaryParentId"
      WHERE  c.pos  = ${side}
        AND  c."binaryParentId" IS NOT NULL
    )
    SELECT id FROM chain
  `;

  // Step 2 — UPDATE: one batch write for all collected IDs.
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;

  if (side === "LEFT") {
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data:  { leftDeepestNodeId: newUserId },
    });
  } else {
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data:  { rightDeepestNodeId: newUserId },
    });
  }
}

// ── Placement ─────────────────────────────────────────────────────────────────

/**
 * Core binary tree placement logic — runs inside an existing transaction.
 * Exported so that registration can call it within its own atomic transaction.
 *
 * Guarantees:
 *   1. Only the direct sponsor may place the user.
 *   2. A user can be placed at most once (ALREADY_PLACED guard).
 *   3. A PostgreSQL FOR UPDATE lock on the sponsor row serialises concurrent
 *      registrations under the same sponsor — no two transactions can claim
 *      the same placement slot simultaneously.
 *   4. If the cached deepest-node pointer is stale the cache is repaired
 *      automatically; no CACHE_INCONSISTENCY error is surfaced to the caller.
 *   5. After placement, every ancestor in the same-direction chain has its
 *      cache pointer updated to the new user (full propagation, not just
 *      the immediate sponsor).
 */
export async function placeUserTx(
  tx: Prisma.TransactionClient,
  sponsorId: string,
  userId: string,
  position: "LEFT" | "RIGHT",
  options?: { skipCacheUpdate?: boolean },
): Promise<{ placementTargetId: string }> {

  // ── 1. Validate target user ────────────────────────────────────────────────
  const target = await tx.user.findUnique({
    where:  { id: userId },
    select: { id: true, sponsorId: true, binaryParentId: true },
  });

  if (!target) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }
  if (target.sponsorId !== sponsorId) {
    throw new AppError(
      "You can only place users you directly sponsored",
      HTTP_STATUS.FORBIDDEN,
      "NOT_YOUR_REFERRAL",
    );
  }
  if (target.binaryParentId !== null) {
    throw new AppError(
      "User is already placed in the binary tree",
      HTTP_STATUS.CONFLICT,
      "ALREADY_PLACED",
    );
  }

  // ── 2. Acquire row-level lock on sponsor (serialises concurrent placements) ─
  //
  // SELECT … FOR UPDATE prevents any other transaction from reading or writing
  // this row until we commit.  Under READ COMMITTED isolation this is sufficient
  // to ensure that two concurrent registrations under the same sponsor cannot
  // both read the same cached pointer and race to claim the same slot.
  //
  // The second registration blocks here until the first commits, then re-reads
  // the (now-updated) cache and targets the next available slot.
  type SponsorRow = {
    id:                  string;
    leftDeepestNodeId:   string | null;
    rightDeepestNodeId:  string | null;
  };

  const rows = await tx.$queryRaw<SponsorRow[]>`
    SELECT id, "leftDeepestNodeId", "rightDeepestNodeId"
    FROM   users
    WHERE  id = ${sponsorId}
    FOR UPDATE
  `;
  const sponsor = rows[0];

  if (!sponsor) {
    throw new AppError("Sponsor not found", HTTP_STATUS.NOT_FOUND, "SPONSOR_NOT_FOUND");
  }

  // ── 3. Resolve placement target — O(1) happy path via cache ───────────────
  const cachedId =
    position === "LEFT" ? sponsor.leftDeepestNodeId : sponsor.rightDeepestNodeId;

  let placementTargetId: string;

  if (cachedId !== null) {
    // Verify the cached slot is actually available
    const cacheNode = await tx.user.findUnique({
      where:  { id: cachedId },
      select: { binaryChildren: { where: { position }, select: { id: true }, take: 1 } },
    });

    if (cacheNode && cacheNode.binaryChildren.length > 0) {
      // ── Self-healing: cache is stale — walk tree to find true deepest node ──
      //
      // This path is taken only when the cache diverged from the tree (e.g. the
      // seed populated the tree without full ancestor propagation, or a prior
      // transaction left the cache partially updated).  It is O(depth) instead
      // of O(1), but it fires at most once per stale pointer and permanently
      // repairs the cache so all subsequent registrations use the O(1) path.
      const repairedId = await rebuildPlacementCache(tx, sponsorId, position);

      await tx.user.update({
        where: { id: sponsorId },
        data:  position === "LEFT"
          ? { leftDeepestNodeId:  repairedId }
          : { rightDeepestNodeId: repairedId },
      });

      placementTargetId = repairedId ?? sponsorId;
    } else {
      placementTargetId = cachedId;
    }
  } else {
    placementTargetId = sponsorId;
  }

  // ── 4. Lock placement target slot (prevents concurrent dual-placement) ─────
  //
  // A second concurrent registration that somehow targets the same node
  // (e.g. via a stale cache read before the sponsor lock was acquired) must
  // wait here until the first transaction commits and updates the slot.
  if (placementTargetId !== sponsorId) {
    await tx.$executeRaw`
      SELECT id FROM users WHERE id = ${placementTargetId} FOR UPDATE
    `;
  }

  // ── 5. Place the user ──────────────────────────────────────────────────────
  await tx.user.update({
    where: { id: userId },
    data:  { binaryParentId: placementTargetId, position },
  });

  // ── 6. Propagate cache up all ancestors in the same-direction chain ────────
  //
  // When skipCacheUpdate is true the caller takes responsibility for running
  // updateBinaryCache() after the transaction commits — this keeps the
  // transaction short and avoids lock conflicts with live traffic on the
  // ancestor rows.  The regular user-facing placeUser() always runs the
  // cache update inside the transaction so the O(1) invariant is preserved
  // atomically for concurrent registrations.
  if (!options?.skipCacheUpdate) {
    await propagateCacheUp(tx, placementTargetId, position, userId);
  }

  return { placementTargetId };
}

export async function placeUser(sponsorId: string, input: PlaceUserInput): Promise<void> {
  const { userId, position } = input;

  if (userId === sponsorId) {
    throw new AppError("Cannot place yourself", HTTP_STATUS.BAD_REQUEST, "SELF_PLACEMENT");
  }

  await prisma.$transaction((tx) => placeUserTx(tx, sponsorId, userId, position));
}

// ── Tree ──────────────────────────────────────────────────────────────────────

/**
 * Return the binary tree rooted at `rootId`, up to `depth` levels deep.
 * Suitable for React-tree visualization.
 */
export async function getBinaryTree(
  rootId: string,
  depth: number = MAX_TREE_DEPTH,
): Promise<BinaryTreeNode> {
  const clampedDepth = Math.min(depth, MAX_TREE_DEPTH);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (await prisma.user.findUnique({
    where:  { id: rootId },
    select: buildTreeSelect(clampedDepth) as any,
  })) as RawNode | null;

  if (!raw) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  return formatNode(raw);
}

// ── Parent ────────────────────────────────────────────────────────────────────

const parentSelect = {
  id:                  true,
  username:            true,
  firstName:           true,
  lastName:            true,
  status:              true,
  position:            true,
  referralCode:        true,
  directReferralCount: true,
  updatedAt:           true,
  binaryParent: {
    select: {
      id:                  true,
      username:            true,
      firstName:           true,
      lastName:            true,
      status:              true,
      position:            true,
      referralCode:        true,
      directReferralCount: true,
      updatedAt:           true,
    },
  },
} as const;

export async function getBinaryParent(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: parentSelect,
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const parent = user.binaryParent;

  return {
    userId:   user.id,
    username: user.username,
    position: user.position,
    parent:   parent
      ? {
          id:                  parent.id,
          username:            parent.username,
          firstName:           parent.firstName,
          lastName:            parent.lastName,
          status:              parent.status,
          position:            parent.position,
          referralCode:        parent.referralCode,
          directReferralCount: parent.directReferralCount,
        }
      : null,
  };
}

// ── Children ──────────────────────────────────────────────────────────────────

const childSelect = {
  id:                  true,
  username:            true,
  firstName:           true,
  lastName:            true,
  status:              true,
  position:            true,
  referralCode:        true,
  directReferralCount: true,
  updatedAt:           true,
} as const;

export async function getBinaryChildren(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:       true,
      username: true,
      binaryChildren: {
        select:  childSelect,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const children = user.binaryChildren;

  const left  = children.find((c) => c.position === "LEFT")  ?? null;
  const right = children.find((c) => c.position === "RIGHT") ?? null;

  return {
    userId:   user.id,
    username: user.username,
    left,
    right,
  };
}
