import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, userUpdate, adminLogCreate } = vi.hoisted(() => {
  const userUpdate = vi.fn();
  const adminLogCreate = vi.fn();
  return {
    userUpdate,
    adminLogCreate,
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (
        callback: (transaction: {
          user: { update: typeof userUpdate };
          adminLog: { create: typeof adminLogCreate };
        }) => Promise<unknown>,
      ) => callback({
        user: { update: userUpdate },
        adminLog: { create: adminLogCreate },
      })),
    },
  };
});

vi.mock("../../config/prisma", () => ({ prisma }));
vi.mock("../../notifications/notifications.service", () => ({
  notificationService: { create: vi.fn() },
}));
vi.mock("../../eligibility/eligibility.service", () => ({
  computeOperationalStatus: vi.fn(),
}));
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { adminResetUserPassword } from "../admin-users.service";

describe("admin individual password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "user-one",
    });
    userUpdate.mockResolvedValue({ id: "user-1" });
    adminLogCreate.mockResolvedValue({ id: "log-1" });
  });

  it("clears FULL_REPLACEMENT ownership atomically with the password write", async () => {
    await adminResetUserPassword("admin-1", "user-1", "NewPassword-42!");

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        passwordHash: expect.any(String),
        passwordResetRequired: false,
        authVersion: { increment: 1 },
        passwordChangedAt: expect.any(Date),
        fullReplacementPasswordResetRunId: null,
      },
    });
    expect(adminLogCreate).toHaveBeenCalledWith({
      data: {
        adminId: "admin-1",
        action: "USER_PASSWORD_RESET",
        targetUserId: "user-1",
        details: {
          username: "user-one",
          resetBy: "admin-1",
        },
      },
    });
  });
});