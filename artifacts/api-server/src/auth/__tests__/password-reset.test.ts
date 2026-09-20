import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../config/prisma", () => ({ prisma }));
vi.mock("../../config/env", () => ({
  env: {
    BCRYPT_ROUNDS: "4",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
  },
}));
vi.mock("../auth-token", () => ({
  signUserToken: vi.fn(() => "new-user-token"),
}));

import {
  completePasswordReset,
  createPasswordResetRequest,
} from "../password-reset.service";
import { signUserToken } from "../auth-token";

const user = {
  id: "user-1",
  email: "user@example.com",
  username: "user1",
};

function transactionClient() {
  return {
    passwordResetToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: "reset-1" }),
    },
    user: {
      update: vi.fn().mockResolvedValue({
        ...user,
        firstName: "Test",
        lastName: "User",
        referralCode: "REF",
        status: "ACTIVE",
        authVersion: 4,
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient()),
  );
});

describe("createPasswordResetRequest", () => {
  it("stores only a hash", async () => {
    prisma.user.findFirst.mockResolvedValue(user);
    let createdData: Record<string, unknown> | undefined;
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const client = transactionClient();
      client.passwordResetToken.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        createdData = args.data;
        return { id: "reset-1" };
      });
      return callback(client);
    });

    const request = await createPasswordResetRequest({ identifier: "USER1" });

    expect(request?.token).toMatch(/^[a-f0-9]{64}$/);
    expect(createdData?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdData?.tokenHash).not.toBe(request?.token);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ email: "user1" }, { username: "user1" }] },
      select: { id: true, email: true, username: true },
    });
  });

  it("does not create a token for an unknown account", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(createPasswordResetRequest({ identifier: "missing" })).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("completePasswordReset", () => {
  it("hashes the new password, clears the flag, increments authVersion, and issues a new JWT", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    let updatedData: Record<string, unknown> | undefined;
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const client = transactionClient();
      client.user.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        updatedData = args.data;
        return {
          ...user,
          firstName: "Test",
          lastName: "User",
          referralCode: "REF",
          status: "ACTIVE",
          authVersion: 4,
        };
      });
      return callback(client);
    });

    const result = await completePasswordReset({
      token: "a".repeat(64),
      newPassword: "NewPassword1",
      confirmPassword: "NewPassword1",
    });

    const client = transactionClient();
    expect(result.token).toBe("new-user-token");
    expect(signUserToken).toHaveBeenCalledWith(expect.objectContaining({
      sub: "user-1",
      authVersion: 4,
    }));
    expect(result.user).not.toHaveProperty("authVersion");
    expect(updatedData).toMatchObject({
      passwordResetRequired: false,
      authVersion: { increment: 1 },
    });
    expect(updatedData?.passwordHash).toEqual(expect.any(String));
    await expect(bcrypt.compare("NewPassword1", updatedData?.passwordHash as string)).resolves.toBe(true);
  });

  it("rejects expired tokens", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(completePasswordReset({
      token: "b".repeat(64),
      newPassword: "NewPassword1",
      confirmPassword: "NewPassword1",
    })).rejects.toMatchObject({ code: "RESET_TOKEN_INVALID" });
  });

  it("allows only one concurrent consumer to win the conditional update", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    let attempt = 0;
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      attempt += 1;
      const client = transactionClient();
      client.passwordResetToken.updateMany.mockResolvedValue({ count: attempt === 1 ? 1 : 0 });
      return callback(client);
    });

    const results = await Promise.allSettled([
      completePasswordReset({
        token: "c".repeat(64),
        newPassword: "NewPassword1",
        confirmPassword: "NewPassword1",
      }),
      completePasswordReset({
        token: "c".repeat(64),
        newPassword: "NewPassword1",
        confirmPassword: "NewPassword1",
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});