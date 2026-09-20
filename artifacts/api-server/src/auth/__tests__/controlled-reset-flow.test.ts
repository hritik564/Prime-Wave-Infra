import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: {
    id: "controlled-user-1",
    email: "controlled-user@example.test",
    username: "controlled-user",
    passwordHash: "",
    passwordResetRequired: false,
    authVersion: 2,
    firstName: "Controlled",
    lastName: "User",
    referralCode: "CONTROLLED",
    status: "ACTIVE",
  },
  token: null as null | {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
  },
  financial: {
    walletBalance: "100.00",
    lockedWithdrawalBalance: "25.00",
    investments: ["investment-1"],
    roi: "12.50",
    deposits: ["deposit-1"],
    withdrawals: ["withdrawal-1"],
    income: "7.50",
    referrals: ["referral-1"],
  },
}));

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
    NODE_ENV: "test",
    BCRYPT_ROUNDS: "4",
    JWT_SECRET: "controlled-test-secret",
    JWT_EXPIRES_IN: "7d",
    PASSWORD_RESET_BASE_URL: "https://trusted.example.test/prime-wave",
  },
}));

import { requireAuth } from "../../middleware/auth.middleware";
import { signUserToken } from "../auth-token";
import {
  completePasswordReset,
  createPasswordResetRequest,
} from "../password-reset.service";
import { createTestPasswordResetDelivery } from "./password-reset.test-adapter";

function transactionClient() {
  return {
    passwordResetToken: {
      updateMany: vi.fn(async (args: {
        where: { tokenHash?: string; id?: string; userId?: string };
        data: { usedAt: Date };
      }) => {
        const matches = state.token !== null
          && (args.where.id === undefined || state.token.id === args.where.id)
          && (args.where.tokenHash === undefined || state.token.tokenHash === args.where.tokenHash)
          && (args.where.userId === undefined || state.token.userId === args.where.userId)
          && state.token.usedAt === null
          && state.token.expiresAt > new Date();
        if (matches) {
          state.token!.usedAt = args.data.usedAt;
          return { count: 1 };
        }
        return { count: 0 };
      }),
      create: vi.fn(async (args: {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      }) => {
        state.token = {
          id: "controlled-reset-1",
          userId: args.data.userId,
          tokenHash: args.data.tokenHash,
          expiresAt: args.data.expiresAt,
          usedAt: null,
        };
        return { id: state.token.id };
      }),
    },
    user: {
      update: vi.fn(async (args: {
        where: { id: string };
        data: {
          passwordHash: string;
          passwordResetRequired: boolean;
          authVersion: { increment: number };
          passwordChangedAt: Date;
        };
      }) => {
        expect(args.where.id).toBe(state.user.id);
        state.user.passwordHash = args.data.passwordHash;
        state.user.passwordResetRequired = args.data.passwordResetRequired;
        state.user.authVersion += args.data.authVersion.increment;
        return { ...state.user };
      }),
    },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  state.user.passwordHash = await bcrypt.hash("OldPassword1", 4);
  state.user.passwordResetRequired = false;
  state.user.authVersion = 2;
  state.token = null;
  prisma.user.findFirst.mockImplementation(async () => ({ ...state.user }));
  prisma.user.findUnique.mockImplementation(async () => ({
    authVersion: state.user.authVersion,
    passwordResetRequired: state.user.passwordResetRequired,
  }));
  prisma.passwordResetToken.findUnique.mockImplementation(async (args: {
    where: { tokenHash: string };
  }) => state.token?.tokenHash === args.where.tokenHash
    ? { ...state.token }
    : null);
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient()),
  );
});

function callAuth(token: string) {
  const next = vi.fn();
  requireAuth(
    { headers: { authorization: `Bearer ${token}` } } as never,
    {} as never,
    next,
  );
  return next;
}

describe("controlled non-admin reset lifecycle", () => {
  it("invalidates stale JWTs, completes one reset, and preserves financial invariants", async () => {
    const financialBefore = structuredClone(state.financial);
    const oldJwt = signUserToken({
      sub: state.user.id,
      email: state.user.email,
      type: "user",
      authVersion: state.user.authVersion,
    });

    state.user.authVersion += 1;
    const staleNext = callAuth(oldJwt);
    await vi.waitFor(() =>
      expect(staleNext).toHaveBeenCalledWith(expect.objectContaining({ code: "USER_SESSION_STALE" })),
    );

    state.user.passwordResetRequired = true;
    const resetRequiredJwt = signUserToken({
      sub: state.user.id,
      email: state.user.email,
      type: "user",
      authVersion: state.user.authVersion,
    });
    const blockedNext = callAuth(resetRequiredJwt);
    await vi.waitFor(() =>
      expect(blockedNext).toHaveBeenCalledWith(expect.objectContaining({ code: "PASSWORD_RESET_REQUIRED" })),
    );

    const testDelivery = createTestPasswordResetDelivery();
    const request = await createPasswordResetRequest(
      { identifier: state.user.username },
      testDelivery.deliver,
    );
    expect(request?.deliveryFailed).toBe(false);

    const resetUrl = testDelivery.sent[0]?.resetUrl;
    const rawToken = new URL(resetUrl ?? "").searchParams.get("token");
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(state.token?.tokenHash).toBe(
      createHash("sha256").update(rawToken ?? "", "utf8").digest("hex"),
    );
    expect(resetUrl).not.toContain(state.user.passwordHash);

    const newJwtResult = await completePasswordReset({
      token: rawToken ?? "",
      newPassword: "NewPassword2",
      confirmPassword: "NewPassword2",
    });

    expect(state.user.passwordResetRequired).toBe(false);
    expect(state.user.authVersion).toBe(4);
    expect(state.token?.usedAt).toBeInstanceOf(Date);
    await expect(bcrypt.compare("NewPassword2", state.user.passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare("OldPassword1", state.user.passwordHash)).resolves.toBe(false);
    expect(state.financial).toEqual(financialBefore);

    const newJwtNext = callAuth(newJwtResult.token);
    await vi.waitFor(() => expect(newJwtNext).toHaveBeenCalledWith());

    const previousJwtNext = callAuth(resetRequiredJwt);
    await vi.waitFor(() =>
      expect(previousJwtNext).toHaveBeenCalledWith(expect.objectContaining({ code: "USER_SESSION_STALE" })),
    );

    await expect(completePasswordReset({
      token: rawToken ?? "",
      newPassword: "NewPassword3",
      confirmPassword: "NewPassword3",
    })).rejects.toMatchObject({ code: "RESET_TOKEN_INVALID" });
  });
});