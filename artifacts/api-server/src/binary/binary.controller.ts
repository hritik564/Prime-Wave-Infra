import type { Request, Response, NextFunction } from "express";
import { placeUser, getBinaryTree, getBinaryParent, getBinaryChildren } from "./binary.service";
import { getBvSummary, getBvHistory } from "./bv.service";
import { getMatchingHistory, getMatchingSummary } from "./matching.service";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { PlaceUserInput, TreeQuery, NodeQuery } from "./binary.schema";
import type { BvSummaryQuery, BvHistoryQuery } from "./bv.schema";
import type { MatchingHistoryQuery, MatchingSummaryQuery } from "./matching.schema";

// ── Placement ─────────────────────────────────────────────────────────────────

export async function placeUserHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as PlaceUserInput;
    await placeUser(user.sub, input);
    sendSuccess(res, { placed: true }, "User placed in binary tree successfully");
  } catch (err) {
    next(err);
  }
}

// ── Tree queries ──────────────────────────────────────────────────────────────

export async function getBinaryTreeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<TreeQuery>(res, "query");
    const rootId   = query.userId ?? user.sub;
    const tree     = await getBinaryTree(rootId, query.depth);
    sendSuccess(res, tree, "Binary tree fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getBinaryParentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<NodeQuery>(res, "query");
    const result   = await getBinaryParent(query.userId ?? user.sub);
    sendSuccess(res, result, "Binary parent fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getBinaryChildrenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<NodeQuery>(res, "query");
    const result   = await getBinaryChildren(query.userId ?? user.sub);
    sendSuccess(res, result, "Binary children fetched successfully");
  } catch (err) {
    next(err);
  }
}

// ── BV queries ────────────────────────────────────────────────────────────────

export async function getBvSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<BvSummaryQuery>(res, "query");
    const result   = await getBvSummary(query.userId ?? user.sub);
    sendSuccess(res, result, "BV summary fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getBvHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<BvHistoryQuery>(res, "query");
    const result   = await getBvHistory(query.userId ?? user.sub, query);
    sendSuccess(res, result, "BV history fetched successfully");
  } catch (err) {
    next(err);
  }
}

// ── Matching income queries ───────────────────────────────────────────────────

export async function getMatchingHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<MatchingHistoryQuery>(res, "query");
    const result   = await getMatchingHistory(query.userId ?? user.sub, query);
    sendSuccess(res, result, "Matching history fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getMatchingSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<MatchingSummaryQuery>(res, "query");
    const result   = await getMatchingSummary(query.userId ?? user.sub);
    sendSuccess(res, result, "Matching summary fetched successfully");
  } catch (err) {
    next(err);
  }
}
