import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPasswordResetRequest, genericPasswordResetMessage } = vi.hoisted(() => ({
  createPasswordResetRequest: vi.fn(),
  genericPasswordResetMessage: vi.fn(() => "generic reset response"),
}));
const { logger } = vi.hoisted(() => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));
const { PasswordResetRequiredError } = vi.hoisted(() => {
  class MockPasswordResetRequiredError extends Error {
    readonly statusCode = 403;
    readonly code = "PASSWORD_RESET_REQUIRED";
    readonly resetToken = "reset-token-not-in-json";
    readonly data = undefined;

    constructor() {
      super("Password reset required before normal access is restored");
    }
  }

  return { PasswordResetRequiredError: MockPasswordResetRequiredError };
});
const { setPasswordChangeCookies, clearPasswordChangeCookies } = vi.hoisted(() => ({
  setPasswordChangeCookies: vi.fn(),
  clearPasswordChangeCookies: vi.fn(),
}));

vi.mock("../password-reset.service", () => ({
  createPasswordResetRequest,
  genericPasswordResetMessage,
  completePasswordReset: vi.fn(),
}));
vi.mock("../../lib/logger", () => ({ logger }));
vi.mock("../auth.service", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  changePassword: vi.fn(),
  endImpersonation: vi.fn(),
  PasswordResetRequiredError,
}));
vi.mock("../password-change-cookie", () => ({
  setPasswordChangeCookies,
  clearPasswordChangeCookies,
}));

import { changeUserPassword, forgotPassword, login } from "../auth.controller";
import { errorMiddleware } from "../../middleware/error.middleware";

function response() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

async function runForgot(identifier: string) {
  const res = response();
  const next = vi.fn();
  await forgotPassword(
    { body: { identifier } } as never,
    res as never,
    next,
  );
  return { res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("forgot-password controller", () => {
  it("returns the same generic response for an unknown account", async () => {
    createPasswordResetRequest.mockResolvedValue(null);

    const { res, next } = await runForgot("missing@example.com");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "generic reset response",
      data: null,
    });
  });

  it("returns the same generic response when delivery fails and does not log secrets", async () => {
    createPasswordResetRequest.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      username: "user1",
      expiresAt: new Date(),
      deliveryFailed: true,
    });

    const { res, next } = await runForgot("user@example.com");

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "generic reset response",
      data: null,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: "user-1", deliveryFailed: true },
      "password-reset delivery unavailable",
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("raw-reset-token");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("NewPassword1");
  });
});

describe("password-change authentication delivery", () => {
  it("does not return the restricted token in the login JSON response", async () => {
    const { loginUser } = await import("../auth.service");
    vi.mocked(loginUser).mockRejectedValue(new PasswordResetRequiredError());
    const res = response();
    const next = vi.fn();

    await login({ body: {} } as never, res as never, next);

    expect(setPasswordChangeCookies).toHaveBeenCalledWith(
      res,
      "reset-token-not-in-json",
      undefined,
    );
    expect(next).toHaveBeenCalledTimes(1);

    errorMiddleware(next.mock.calls[0][0], {} as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Password reset required before normal access is restored",
      code: "PASSWORD_RESET_REQUIRED",
    });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("reset-token-not-in-json");
  });

  it("returns the normal session after a successful password change", async () => {
    const { changePassword } = await import("../auth.service");
    const result = {
      token: "normal-user-token",
      user: {
        id: "user-1",
        email: "user@example.com",
        username: "user1",
        firstName: "Test",
        lastName: "User",
        referralCode: "REF",
        status: "ACTIVE" as const,
        authVersion: 7,
      },
    };
    vi.mocked(changePassword).mockResolvedValue(result);
    const res = response();
    const next = vi.fn();

    await changeUserPassword(
      {
        body: {
          currentPassword: "TemporaryPassword1",
          newPassword: "NewPassword2",
          confirmPassword: "NewPassword2",
        },
        user: {
          sub: "user-1",
          email: "user@example.com",
          type: "password_reset",
          purpose: "password_change",
          authVersion: 6,
        },
      } as never,
      res as never,
      next,
    );

    expect(vi.mocked(changePassword)).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ currentPassword: "TemporaryPassword1" }),
      { restricted: true, authVersion: 6 },
    );
    expect(clearPasswordChangeCookies).toHaveBeenCalledWith(res);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Password changed successfully",
      data: result,
    });
    expect(next).not.toHaveBeenCalled();
  });
});