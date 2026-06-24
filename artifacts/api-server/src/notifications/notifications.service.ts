import { Prisma, type NotificationType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { logger } from "../lib/logger";
import type { ListNotificationsQuery } from "./notifications.schema";

// ── Input type ────────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId:   string;
  type:     NotificationType;
  title:    string;
  message:  string;
  metadata?: Prisma.InputJsonValue;
}

// ── Notification service ──────────────────────────────────────────────────────

class NotificationService {
  /**
   * Creates a notification for a user.
   *
   * Errors are caught and logged — notification failures must never
   * interrupt business-critical flows. Callers may safely fire-and-forget:
   *   `void notificationService.create({...})`
   */
  async create(input: CreateNotificationInput): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId:   input.userId,
          type:     input.type,
          title:    input.title,
          message:  input.message,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      logger.warn({ err, type: input.type, userId: input.userId }, "Notification create failed");
    }
  }

  /**
   * Lists notifications for a user, newest first, with pagination.
   */
  async listForUser(userId: string, query: ListNotificationsQuery) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [records, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where:   { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take:    limit,
        select: {
          id:        true,
          type:      true,
          title:     true,
          message:   true,
          isRead:    true,
          metadata:  true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: records,
      meta: {
        total, page, limit, totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Marks a single notification as read. Throws if not found or wrong user.
   */
  async markRead(notificationId: string, userId: string): Promise<void> {
    const notification = await prisma.notification.findUnique({
      where:  { id: notificationId },
      select: { id: true, userId: true },
    });

    if (!notification || notification.userId !== userId) {
      throw new AppError(
        "Notification not found",
        HTTP_STATUS.NOT_FOUND,
        "NOTIFICATION_NOT_FOUND",
      );
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data:  { isRead: true },
    });
  }

  /**
   * Marks all of a user's notifications as read.
   */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true },
    });

    return { updated: result.count };
  }

  /**
   * Returns the count of unread notifications for a user.
   */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { count };
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const notificationService = new NotificationService();
