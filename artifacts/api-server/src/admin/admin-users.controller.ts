import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import { searchUsers, getAdminUserDetail, setUserStatus, adminUpdateUser, adminResetUserPassword, adminUpdateUserWallet, getWalletAuditLogs, deleteUser, type AdminUpdateUserInput } from "./admin-users.service";
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

export async function resetUserPasswordHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const { password } = req.body as { password: string };
    if (!password || password.length < 8) {
      res.status(400).json({ success: false, message: "Password must be at least 8 characters", code: "INVALID_PASSWORD" });
      return;
    }
    const result = await adminResetUserPassword(user.sub, userId, password);
    sendSuccess(res, result, "Password reset successfully");
  } catch (err) { next(err); }
}

export async function updateUserWalletHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const { newWallet, reason } = req.body as { newWallet: string; reason: string };
    const ipAddress =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;
    const result = await adminUpdateUserWallet(user.sub, userId, newWallet, reason, ipAddress);
    sendSuccess(res, result, "Withdrawal wallet updated successfully");
  } catch (err) { next(err); }
}

export async function deleteUserHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const result   = await deleteUser(user.sub, userId);
    sendSuccess(res, result, `User @${result.username} permanently deleted`);
  } catch (err) { next(err); }
}

export async function getWalletAuditLogsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = String(req.params["id"] ?? "");
    const logs   = await getWalletAuditLogs(userId);
    sendSuccess(res, { logs }, "Wallet audit logs retrieved");
  } catch (err) { next(err); }
}
