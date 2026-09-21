import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
  },
}));

import { signPasswordChangeToken, signUserToken } from "../auth-token";

describe("signUserToken", () => {
  it("includes the current user authVersion in the JWT", () => {
    const token = signUserToken({
      sub: "user-1",
      email: "user@example.com",
      type: "user",
      authVersion: 7,
    });

    expect(jwt.verify(token, "test-secret")).toMatchObject({
      sub: "user-1",
      type: "user",
      authVersion: 7,
    });
  });
});

describe("signPasswordChangeToken", () => {
  it("is purpose-bound and expires after ten minutes", () => {
    const token = signPasswordChangeToken({
      sub: "user-1",
      email: "user@example.com",
      authVersion: 7,
    });

    const payload = jwt.verify(token, "test-secret") as jwt.JwtPayload;
    expect(payload).toMatchObject({
      sub: "user-1",
      type: "password_reset",
      purpose: "password_change",
      authVersion: 7,
    });
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(10 * 60);
  });
});