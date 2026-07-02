import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import { searchUsers, getAdminUserDetail, setUserStatus, adminUpdateUser, type AdminUpdateUserInput } from "./admin-users.service";
import type { UserSearchQuery } from "./admin-dashboard.schema";

export async function searchUsersHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<UserSearchQuery>(res, "query");
    const result = await searchUsers(query);
    sendSuccess(res, result, "Users retrieved");
  } catch (err) { next(err); }
}

export async function getUserDetailHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = String(req.params["id"] ?? "");
    const result = await getAdminUserDetail(userId);
    sendSuccess(res, result, "User detail retrieved");
  } catch (err) { next(err); }
}

export async function blockUserHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const result   = await setUserStatus(user.sub, userId, "block");
    sendSuccess(res, result, "User blocked");
  } catch (err) { next(err); }
}

export async function suspendUserHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const result   = await setUserStatus(user.sub, userId, "suspend");
    sendSuccess(res, result, "User suspended");
  } catch (err) { next(err); }
}

export async function activateUserHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const result   = await setUserStatus(user.sub, userId, "activate");
    sendSuccess(res, result, "User activated");
  } catch (err) { next(err); }
}

export async function updateUserHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const body     = req.body as AdminUpdateUserInput;
    const result   = await adminUpdateUser(user.sub, userId, body);
    sendSuccess(res, result, "User profile updated");
  } catch (err) { next(err); }
}
