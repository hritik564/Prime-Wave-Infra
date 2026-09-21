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
  },
}));

const { prisma, signUserToken } = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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
    passwordHash: state.user.passwordHash,
    status: state.user.status,
  });
  prisma.user.update.mockImplementation(async (args: {
    data: {
      passwordResetRequired: boolean;
      authVersion: { increment: number };
      passwordChangedAt: Date;
      passwordHash: string;
    };
  }) => {
    state.user.passwordHash = args.data.passwordHash;
    state.user.passwordResetRequired = args.data.passwordResetRequired;
    state.user.authVersion += args.data.authVersion.increment;
    return {
      id: state.user.id,
      email: state.user.email,
      username: state.user.username,
      firstName: state.user.firstName,
      lastName: state.user.lastName,
      referralCode: state.user.referralCode,
      status: state.user.status,
      authVersion: state.user.authVersion,
    };
  });
});

describe("restricted first-login password change", () => {
  it("clears the reset flag, increments authVersion, and returns a normal session", async () => {
    const result = await changePassword(state.user.id, {
      currentPassword: "TemporaryPassword1",
      newPassword: "NewPassword2",
      confirmPassword: "NewPassword2",
    });

    expect(result.token).toBe("normal-user-token");
    expect(state.user.passwordResetRequired).toBe(false);
    expect(state.user.authVersion).toBe(7);
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
    })).rejects.toMatchObject({ code: "INVALID_CURRENT_PASSWORD" });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(state.user.passwordResetRequired).toBe(true);
    expect(state.user.authVersion).toBe(6);
  });
});