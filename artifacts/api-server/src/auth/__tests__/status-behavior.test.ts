import { beforeEach, describe, expect, it, vi } from "vitest";

const { userFindFirst } = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
}));
const { userUpdateMany } = vi.hoisted(() => ({
  userUpdateMany: vi.fn(),
}));
const { fullReplacementRunFindUnique } = vi.hoisted(() => ({
  fullReplacementRunFindUnique: vi.fn(),
}));
const { bcryptCompare } = vi.hoisted(() => ({
  bcryptCompare: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findFirst: userFindFirst, updateMany: userUpdateMany },
    commonTemporaryPasswordResetRun: { findUnique: fullReplacementRunFindUnique },
  },
}));
vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
    BCRYPT_ROUNDS: "4",
  },
}));
vi.mock("bcryptjs", () => ({
  default: {
    compare: bcryptCompare,
    hash: vi.fn(),
  },
}));
vi.mock("../auth-token", () => ({
  signUserToken: vi.fn(() => "user-token"),
  signPasswordChangeToken: vi.fn(() => "password-change-token"),
}));
vi.mock("../../notifications/notifications.service", () => ({
  notificationService: { create: vi.fn() },
}));
vi.mock("../../binary/binary.service", () => ({
  placeUserTx: vi.fn(),
}));

import { loginUser } from "../auth.service";
import { signUserToken } from "../auth-token";

const baseUser = {
  id: "user-1",
  email: "user@example.com",
  username: "user1",
  passwordHash: "bcrypt-hash",
  passwordResetRequired: false,
  fullReplacementPasswordResetRunId: null,
  authVersion: 0,
  firstName: "Test",
  lastName: "User",
  referralCode: "REF",
};

beforeEach(() => {
  vi.clearAllMocks();
  bcryptCompare.mockResolvedValue(true);
  fullReplacementRunFindUnique.mockResolvedValue(null);
  userUpdateMany.mockResolvedValue({ count: 1 });
});

describe("preserved user status login behavior", () => {
  it.each(["ACTIVE", "INACTIVE", "SUSPENDED"] as const)(
    "allows valid credentials for %s, preserving current behavior",
    async (status) => {
      userFindFirst.mockResolvedValue({ ...baseUser, status });

      await expect(loginUser({
        identifier: "user1",
        password: "OldPassword1",
      })).resolves.toMatchObject({ token: "user-token" });
    },
  );

  it("rejects BLOCKED users before password verification", async () => {
    userFindFirst.mockResolvedValue({ ...baseUser, status: "BLOCKED" });

    await expect(loginUser({
      identifier: "user1",
      password: "OldPassword1",
    })).rejects.toMatchObject({ code: "ACCOUNT_BLOCKED" });
    expect(bcryptCompare).not.toHaveBeenCalled();
  });

  it("verifies the temporary password before returning the restricted reset response", async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      passwordResetRequired: true,
      authVersion: 3,
    });

    const error = await loginUser({
      identifier: "user1",
      password: "TemporaryPassword1",
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "PASSWORD_RESET_REQUIRED",
      data: undefined,
    });
    expect(error).toHaveProperty("resetToken", "password-change-token");
    expect(Object.keys(error as object)).not.toContain("resetToken");
    expect(bcryptCompare).toHaveBeenCalledWith("TemporaryPassword1", "bcrypt-hash");
  });

  it("logs a FULL_REPLACEMENT user in normally and clears only the reset flag", async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      passwordResetRequired: true,
      authVersion: 6,
      fullReplacementPasswordResetRunId: "full-replacement-run",
    });
    fullReplacementRunFindUnique.mockResolvedValue({ id: "full-replacement-run" });

    await expect(loginUser({
      identifier: "user1",
      password: "ReplacementPassword1",
    })).resolves.toMatchObject({
      token: "user-token",
      user: { id: "user-1" },
    });

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        authVersion: 6,
        passwordResetRequired: true,
        fullReplacementPasswordResetRunId: "full-replacement-run",
      },
      data: {
        passwordResetRequired: false,
        authVersion: { increment: 1 },
      },
    });
    expect(userUpdateMany.mock.calls[0]?.[0].data).not.toHaveProperty("passwordHash");
    expect(vi.mocked(signUserToken)).toHaveBeenCalledWith(expect.objectContaining({
      type: "user",
      authVersion: 7,
    }));
    expect(fullReplacementRunFindUnique).toHaveBeenCalledWith({
      where: {
        id: "full-replacement-run",
        operationType: "FULL_REPLACEMENT",
        status: "COMPLETED",
      },
      select: { id: true },
    });
    expect(vi.mocked((await import("../auth-token")).signPasswordChangeToken))
      .not.toHaveBeenCalled();
  });

  it("does not authenticate a FULL_REPLACEMENT user when the replacement password is wrong", async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      passwordResetRequired: true,
      fullReplacementPasswordResetRunId: "full-replacement-run",
    });
    bcryptCompare.mockResolvedValue(false);

    await expect(loginUser({
      identifier: "user1",
      password: "WrongPassword1",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(fullReplacementRunFindUnique).not.toHaveBeenCalled();
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("fails closed if the reset flag changes before FULL_REPLACEMENT login consumes it", async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      passwordResetRequired: true,
      authVersion: 6,
      fullReplacementPasswordResetRunId: "full-replacement-run",
    });
    fullReplacementRunFindUnique.mockResolvedValue({ id: "full-replacement-run" });
    userUpdateMany.mockResolvedValue({ count: 0 });

    await expect(loginUser({
      identifier: "user1",
      password: "ReplacementPassword1",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("keeps a missing or invalid FULL_REPLACEMENT marker on the restricted reset path", async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      passwordResetRequired: true,
      authVersion: 6,
      fullReplacementPasswordResetRunId: "missing-run",
    });
    fullReplacementRunFindUnique.mockResolvedValue(null);

    const error = await loginUser({
      identifier: "user1",
      password: "TemporaryPassword1",
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "PASSWORD_RESET_REQUIRED" });
    expect(error).toHaveProperty("resetToken", "password-change-token");
    expect(userUpdateMany).not.toHaveBeenCalled();
  });

  it("does not put the restricted token in the error response data", async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      passwordResetRequired: true,
    });

    const error = await loginUser({
      identifier: "user1",
      password: "TemporaryPassword1",
    }).catch((caught: unknown) => caught);

    expect((error as { data?: unknown }).data).toBeUndefined();
  });

  it("keeps incorrect temporary passwords on the normal invalid-credentials path", async () => {
    userFindFirst.mockResolvedValue({
      ...baseUser,
      passwordResetRequired: true,
    });
    bcryptCompare.mockResolvedValue(false);

    await expect(loginUser({
      identifier: "user1",
      password: "WrongPassword1",
    })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});