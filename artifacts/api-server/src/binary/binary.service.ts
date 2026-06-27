import type { Prisma } from "@prisma/client";
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

// ── Placement ─────────────────────────────────────────────────────────────────

/**
 * Place a referred user into the sponsor's binary tree.
 *
 * O(1): The sponsor's leftDeepestNodeId / rightDeepestNodeId cache always points
 * to the node whose slot in that direction is currently empty.  No tree traversal.
 *
 * Rules enforced:
 *  1. Caller must be the sponsor of the target user.
 *  2. Target user must not already be placed (binaryParentId must be null).
 *  3. Placement is permanent — no updates after commit.
 *  4. Entire operation runs inside a serializable Prisma transaction.
 */
/**
 * Core binary tree placement logic — runs inside an existing transaction.
 * Exported so that registration can call it within its own atomic transaction.
 *
 * Callers must guarantee:
 *   • newUser was just created with sponsorId already set
 *   • newUser.binaryParentId is null
 */
export async function placeUserTx(
  tx: Prisma.TransactionClient,
  sponsorId: string,
  userId: string,
  position: "LEFT" | "RIGHT",
): Promise<void> {
  // ── 1. Load target user ───────────────────────────────────────────────────
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

  // ── 2. Load sponsor with deepest-node cache ──────────────────────────────
  const sponsor = await tx.user.findUnique({
    where:  { id: sponsorId },
    select: { id: true, leftDeepestNodeId: true, rightDeepestNodeId: true },
  });

  if (!sponsor) {
    throw new AppError("Sponsor not found", HTTP_STATUS.NOT_FOUND, "SPONSOR_NOT_FOUND");
  }

  // ── 3. Resolve placement target (O(1) via cache) ─────────────────────────
  //
  // The cache pointer holds the id of the node whose slot in that direction
  // is guaranteed to be empty.  null means the sponsor's own slot is empty.
  const cacheId =
    position === "LEFT" ? sponsor.leftDeepestNodeId : sponsor.rightDeepestNodeId;

  const placementTargetId = cacheId ?? sponsorId;

  // ── 4. Guard: verify the cache is consistent (slot really is empty) ───────
  if (cacheId !== null) {
    const cacheNode = await tx.user.findUnique({
      where:  { id: cacheId },
      select: { binaryChildren: { select: { position: true } } },
    });

    if (cacheNode) {
      const childPositions = cacheNode.binaryChildren.map((c) => c.position);
      if (childPositions.includes(position)) {
        // Cache is stale — this should not happen in normal operation.
        throw new AppError(
          "Binary placement cache inconsistency detected. Contact support.",
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          "CACHE_INCONSISTENCY",
        );
      }
    }
  }

  // ── 5. Place the user ────────────────────────────────────────────────────
  await tx.user.update({
    where: { id: userId },
    data:  { binaryParentId: placementTargetId, position },
  });

  // ── 6. Update the placement target's deepest-node cache ──────────────────
  //   (The new user's own slot is empty → it becomes the deepest node.)
  if (position === "LEFT") {
    await tx.user.update({
      where: { id: placementTargetId },
      data:  { leftDeepestNodeId: userId },
    });
  } else {
    await tx.user.update({
      where: { id: placementTargetId },
      data:  { rightDeepestNodeId: userId },
    });
  }

  // ── 7. Update sponsor's top-level deepest-node cache ─────────────────────
  //   Skip if sponsor IS the placement target (already updated above).
  if (placementTargetId !== sponsorId) {
    if (position === "LEFT") {
      await tx.user.update({
        where: { id: sponsorId },
        data:  { leftDeepestNodeId: userId },
      });
    } else {
      await tx.user.update({
        where: { id: sponsorId },
        data:  { rightDeepestNodeId: userId },
      });
    }
  }
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
