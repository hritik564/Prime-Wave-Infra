import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
  },
}));

import { signUserToken } from "../auth-token";

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