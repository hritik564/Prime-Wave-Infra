import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../config/prisma", () => ({ prisma }));
vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "test-secret",
  },
}));

import {
  requireAuth,
  requireAuthAllowingPasswordReset,
  requirePasswordChangeAuth,
} from "../../middleware/auth.middleware";

function requestFor(payload: Record<string, unknown>) {
  const token = jwt.sign(payload, "test-secret");
  return { headers: { authorization: `Bearer ${token}` } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normal user auth-version middleware", () => {
  it("accepts a current authVersion", async () => {
    prisma.user.findUnique.mockResolvedValue({
      authVersion: 3,
      passwordResetRequired: false,
    });
    const next = vi.fn();

    requireAuth(
      requestFor({ sub: "user-1", email: "u@example.com", type: "user", authVersion: 3 }),
      {} as never,
      next,
    );

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });

  it("accepts legacy versionless tokens while the database version is still zero", async () => {
    prisma.user.findUnique.mockResolvedValue({
      authVersion: 0,
      passwordResetRequired: false,
    });
    const next = vi.fn();

    requireAuth(
      requestFor({ sub: "user-1", email: "u@example.com", type: "user" }),
      {} as never,
      next,
    );

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });

  it("rejects stale authVersion values", async () => {
    prisma.user.findUnique.mockResolvedValue({
      authVersion: 4,
      passwordResetRequired: false,
    });
    const next = vi.fn();

    requireAuth(
      requestFor({ sub: "user-1", email: "u@example.com", type: "user", authVersion: 3 }),
      {} as never,
      next,
    );

    await vi.waitFor(() =>
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "USER_SESSION_STALE" })),
    );
  });

  it("blocks normal routes while passwordResetRequired is true", async () => {
    prisma.user.findUnique.mockResolvedValue({
      authVersion: 0,
      passwordResetRequired: true,
    });
    const next = vi.fn();

    requireAuth(
      requestFor({ sub: "user-1", email: "u@example.com", type: "user", authVersion: 0 }),
      {} as never,
      next,
    );

    await vi.waitFor(() =>
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "PASSWORD_RESET_REQUIRED" })),
    );
  });

  it("allows explicitly permitted reset-related routes through", async () => {
    prisma.user.findUnique.mockResolvedValue({
      authVersion: 0,
      passwordResetRequired: true,
    });
    const next = vi.fn();

    requireAuthAllowingPasswordReset(
      requestFor({ sub: "user-1", email: "u@example.com", type: "user", authVersion: 0 }),
      {} as never,
      next,
    );

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });

  it("rejects the restricted password-change token from normal routes", async () => {
    const next = vi.fn();

    requireAuth(
      requestFor({
        sub: "user-1",
        email: "u@example.com",
        type: "password_reset",
        purpose: "password_change",
        authVersion: 0,
      }),
      {} as never,
      next,
    );

    await vi.waitFor(() =>
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "PASSWORD_CHANGE_TOKEN_ONLY" })),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("allows the restricted token only through password change", async () => {
    prisma.user.findUnique.mockResolvedValue({
      authVersion: 0,
      passwordResetRequired: true,
      status: "ACTIVE",
    });
    const next = vi.fn();

    requirePasswordChangeAuth(
      requestFor({
        sub: "user-1",
        email: "u@example.com",
        type: "password_reset",
        purpose: "password_change",
        authVersion: 0,
      }),
      {} as never,
      next,
    );

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });

  it("invalidates the restricted token after the user auth version changes", async () => {
    prisma.user.findUnique.mockResolvedValue({
      authVersion: 1,
      passwordResetRequired: false,
      status: "ACTIVE",
    });
    const next = vi.fn();

    requirePasswordChangeAuth(
      requestFor({
        sub: "user-1",
        email: "u@example.com",
        type: "password_reset",
        purpose: "password_change",
        authVersion: 0,
      }),
      {} as never,
      next,
    );

    await vi.waitFor(() =>
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "PASSWORD_CHANGE_TOKEN_INVALID" })),
    );
  });
});