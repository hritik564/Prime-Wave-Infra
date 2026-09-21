import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: {
    id: "reset-user-1",
    email: "reset-user@example.test",
    username: "reset-user",
    firstName: "Reset",
    lastName: "User",
    referralCode: "RESETUSER",
    status: "ACTIVE",
    passwordHash: "",
    passwordResetRequired: true,
    authVersion: 6,
    fullReplacementPasswordResetRunId: "full-replacement-run" as string | null,
  },
}));

const { prisma, signUserToken } = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  signUserToken: vi.fn(() => "normal-user-token"),
}));

vi.mock("../../config/prisma", () => ({ prisma }));
vi.mock("../../config/env", () => ({
  env: {
    BCRYPT_ROUNDS: "4",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
  },
}));
vi.mock("../../notifications/notifications.service", () => ({
  notificationService: { create: vi.fn() },
}));
vi.mock("../auth-token", () => ({ signUserToken }));

import { changePassword } from "../auth.service";

beforeEach(async () => {
  vi.clearAllMocks();
  state.user.passwordHash = await bcrypt.hash("TemporaryPassword1", 4);
  state.user.passwordResetRequired = true;
  state.user.authVersion = 6;
  prisma.user.findUnique.mockResolvedValue({
    id: state.user.id,
    email: state.user.email,
    passwordHash: state.user.passwordHash,
    status: state.user.status,
    passwordResetRequired: state.user.passwordResetRequired,
  });
  const transactionUser = {
    updateMany: vi.fn().mockImplementation(async (args: {
      where: { authVersion: number; passwordResetRequired: boolean };
    data: {
      passwordResetRequired: boolean;
      authVersion: { increment: number };
      passwordChangedAt: Date;
      passwordHash: string;
      fullReplacementPasswordResetRunId: null;
    };
    }) => {
      if (
        args.where.authVersion !== state.user.authVersion
        || args.where.passwordResetRequired !== state.user.passwordResetRequired
      ) {
        return { count: 0 };
      }
      state.user.passwordHash = args.data.passwordHash;
      state.user.passwordResetRequired = args.data.passwordResetRequired;
      state.user.fullReplacementPasswordResetRunId =
        args.data.fullReplacementPasswordResetRunId;
      state.user.authVersion += args.data.authVersion.increment;
      return { count: 1 };
    }),
    findUnique: vi.fn().mockImplementation(async () => ({
      id: state.user.id,
      email: state.user.email,
      username: state.user.username,
      firstName: state.user.firstName,
      lastName: state.user.lastName,
      referralCode: state.user.referralCode,
      status: state.user.status,
      authVersion: state.user.authVersion,
    })),
  };
  prisma.$transaction.mockImplementation(async (
    callback: (tx: { user: typeof transactionUser }) => Promise<unknown>,
  ) =>
    callback({ user: transactionUser }),
  );
});

describe("restricted first-login password change", () => {
  it("clears the reset flag, increments authVersion, and returns a normal session", async () => {
    const result = await changePassword(state.user.id, {
      currentPassword: "TemporaryPassword1",
      newPassword: "NewPassword2",
      confirmPassword: "NewPassword2",
    }, { restricted: true, authVersion: 6 });

    expect(result.token).toBe("normal-user-token");
    expect(state.user.passwordResetRequired).toBe(false);
    expect(state.user.authVersion).toBe(7);
    expect(state.user.fullReplacementPasswordResetRunId).toBeNull();
    await expect(bcrypt.compare("NewPassword2", state.user.passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare("TemporaryPassword1", state.user.passwordHash)).resolves.toBe(false);
    expect(signUserToken).toHaveBeenCalledWith(expect.objectContaining({
      type: "user",
      authVersion: 7,
    }));
  });

  it("does not update the account when the temporary password is wrong", async () => {
    await expect(changePassword(state.user.id, {
      currentPassword: "WrongPassword1",
      newPassword: "NewPassword2",
      confirmPassword: "NewPassword2",
    }, { restricted: true, authVersion: 6 })).rejects.toMatchObject({
      code: "INVALID_CURRENT_PASSWORD",
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(state.user.passwordResetRequired).toBe(true);
    expect(state.user.authVersion).toBe(6);
  });

  it("allows exactly one concurrent request to consume the restricted authentication", async () => {
    const attempts = await Promise.allSettled([
      changePassword(state.user.id, {
        currentPassword: "TemporaryPassword1",
        newPassword: "NewPassword2",
        confirmPassword: "NewPassword2",
      }, { restricted: true, authVersion: 6 }),
      changePassword(state.user.id, {
        currentPassword: "TemporaryPassword1",
        newPassword: "AnotherPassword3",
        confirmPassword: "AnotherPassword3",
      }, { restricted: true, authVersion: 6 }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) =>
      attempt.status === "rejected"
      && (attempt.reason as { code?: string }).code === "PASSWORD_CHANGE_TOKEN_INVALID",
    )).toHaveLength(1);
    expect(signUserToken).toHaveBeenCalledTimes(1);
    expect(state.user.passwordResetRequired).toBe(false);
    expect(state.user.authVersion).toBe(7);
  });
});