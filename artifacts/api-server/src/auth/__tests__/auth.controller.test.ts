import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPasswordResetRequest, genericPasswordResetMessage } = vi.hoisted(() => ({
  createPasswordResetRequest: vi.fn(),
  genericPasswordResetMessage: vi.fn(() => "generic reset response"),
}));
const { logger } = vi.hoisted(() => ({
  logger: { warn: vi.fn() },
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
}));

import { forgotPassword } from "../auth.controller";

function response() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
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