import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import { notificationService } from "./notifications.service";
import type { ListNotificationsQuery } from "./notifications.schema";

export async function listNotificationsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<ListNotificationsQuery>(res, "query");
    const result   = await notificationService.listForUser(user.sub, query);
    sendSuccess(res, result, "Notifications retrieved");
  } catch (err) { next(err); }
}

export async function markNotificationReadHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const id       = String(req.params["id"] ?? "");
    await notificationService.markRead(id, user.sub);
    sendSuccess(res, null, "Notification marked as read");
  } catch (err) { next(err); }
}

export async function markAllReadHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result   = await notificationService.markAllRead(user.sub);
    sendSuccess(res, result, "All notifications marked as read");
  } catch (err) { next(err); }
}

export async function unreadCountHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result   = await notificationService.unreadCount(user.sub);
    sendSuccess(res, result, "Unread count retrieved");
  } catch (err) { next(err); }
}
