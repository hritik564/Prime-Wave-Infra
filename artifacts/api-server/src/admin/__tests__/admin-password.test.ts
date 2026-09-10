import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
    BCRYPT_ROUNDS: "12",
    NODE_ENV: "test",
    PORT: "5000",
  },
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    admin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { requireAdminAuth } from "../../middleware/auth.middleware";
import { changeAdminPassword } from "../admin.service";
import { changeAdminPasswordSchema } from "../admin.schema";

const adminFindUnique = prisma.admin.findUnique as ReturnType<typeof vi.fn>;
const adminUpdate = prisma.admin.update as ReturnType<typeof vi.fn>;
const bcryptCompare = bcrypt.compare as ReturnType<typeof vi.fn>;
const bcryptHash = bcrypt.hash as ReturnType<typeof vi.fn>;

const validInput = {
  currentPassword: "CurrentPassword1",
  newPassword: "NewPassword2",
  confirmPassword: "NewPassword2",
};

describe("changeAdminPasswordSchema", () => {
  it("rejects a weak new password", () => {
    const result = changeAdminPasswordSchema.safeParse({
      ...validInput,
      newPassword: "short",
      confirmPassword: "short",
    });

    expect(result.success).toBe(false);
  });
});

describe("changeAdminPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("changes only the Admin identified by the authenticated subject", async () => {
    const previousUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    adminFindUnique.mockResolvedValue({
      id: "admin-self",
      passwordHash: "old-hash",
      isActive: true,
      updatedAt: previousUpdatedAt,
    });
    bcryptCompare.mockResolvedValue(true);
    bcryptHash.mockResolvedValue("new-hash");
    adminUpdate.mockResolvedValue({ id: "admin-self" });

    await changeAdminPassword("admin-self", validInput);

    expect(adminFindUnique).toHaveBeenCalledWith({
      where: { id: "admin-self" },
      select: { id: true, passwordHash: true, isActive: true },
    });
    expect(adminUpdate).toHaveBeenCalledTimes(1);
    expect(adminUpdate).toHaveBeenCalledWith({
      where: { id: "admin-self" },
      data: {
        passwordHash: "new-hash",
        updatedAt: expect.any(Date),
      },
    });
    const updateData = adminUpdate.mock.calls[0][0].data as { updatedAt: Date };
    expect(updateData.updatedAt.getTime()).toBeGreaterThan(previousUpdatedAt.getTime());
  });

  it("rejects an incorrect current password without updating the Admin", async () => {
    adminFindUnique.mockResolvedValue({
      id: "admin-self",
      passwordHash: "old-hash",
      isActive: true,
    });
    bcryptCompare.mockResolvedValue(false);

    await expect(changeAdminPassword("admin-self", validInput)).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_FAILED",
    });
    expect(adminUpdate).not.toHaveBeenCalled();
  });

  it("does not accept a target Admin identifier from the password input", async () => {
    adminFindUnique.mockResolvedValue({
      id: "admin-self",
      passwordHash: "old-hash",
      isActive: true,
    });
    bcryptCompare.mockResolvedValue(true);
    bcryptHash.mockResolvedValue("new-hash");
    adminUpdate.mockResolvedValue({ id: "admin-self" });

    await changeAdminPassword("admin-self", {
      ...validInput,
      adminId: "admin-other",
    } as typeof validInput & { adminId: string });

    expect(adminUpdate.mock.calls[0][0].where).toEqual({ id: "admin-self" });
  });
});

describe("requireAdminAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request", async () => {
    const next = vi.fn();

    requireAdminAuth(
      { headers: {} } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_MISSING" }));
  });

  it("rejects an existing Admin JWT after updatedAt changes", async () => {
    const previousUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    const currentUpdatedAt = new Date("2026-01-01T00:00:01.000Z");
    adminFindUnique.mockResolvedValue({
      isActive: true,
      role: "SUPER_ADMIN",
      updatedAt: currentUpdatedAt,
    });

    const token = jwt.sign({
      sub: "admin-self",
      email: "admin@example.com",
      type: "admin",
      role: "SUPER_ADMIN",
      adminUpdatedAt: previousUpdatedAt.getTime(),
    }, "test-secret");
    const next = vi.fn();

    requireAdminAuth(
      { headers: { authorization: `Bearer ${token}` } } as never,
      {} as never,
      next,
    );

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "ADMIN_SESSION_STALE" }));
    });
  });
});