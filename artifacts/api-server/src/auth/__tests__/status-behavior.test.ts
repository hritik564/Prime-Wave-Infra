import { beforeEach, describe, expect, it, vi } from "vitest";

const { userFindFirst } = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
}));
const { bcryptCompare } = vi.hoisted(() => ({
  bcryptCompare: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: { user: { findFirst: userFindFirst } },
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
}));
vi.mock("../../notifications/notifications.service", () => ({
  notificationService: { create: vi.fn() },
}));
vi.mock("../../binary/binary.service", () => ({
  placeUserTx: vi.fn(),
}));

import { loginUser } from "../auth.service";

const baseUser = {
  id: "user-1",
  email: "user@example.com",
  username: "user1",
  passwordHash: "bcrypt-hash",
  passwordResetRequired: false,
  authVersion: 0,
  firstName: "Test",
  lastName: "User",
  referralCode: "REF",
};

beforeEach(() => {
  vi.clearAllMocks();
  bcryptCompare.mockResolvedValue(true);
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
});