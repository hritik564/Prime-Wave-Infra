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
      create: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { requireAdminRoles } from "../../middleware/auth.middleware";
import { createStaffAdmin } from "../admin.service";
import { createStaffAdminSchema } from "../admin.schema";

const adminFindUnique = prisma.admin.findUnique as ReturnType<typeof vi.fn>;
const adminCreate = prisma.admin.create as ReturnType<typeof vi.fn>;
const bcryptHash = bcrypt.hash as ReturnType<typeof vi.fn>;

const validInput = {
  email: " Staff@example.com ",
  password: "InitialPassword1",
  confirmPassword: "InitialPassword1",
};

describe("createStaffAdminSchema", () => {
  it("accepts an email and strong matching initial password", () => {
    const result = createStaffAdminSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("staff@example.com");
    }
  });

  it("rejects weak or mismatched initial passwords", () => {
    expect(createStaffAdminSchema.safeParse({
      ...validInput,
      password: "weak",
      confirmPassword: "weak",
    }).success).toBe(false);
    expect(createStaffAdminSchema.safeParse({
      ...validInput,
      confirmPassword: "DifferentPassword1",
    }).success).toBe(false);
  });

  it("does not allow a request body to select an elevated role", () => {
    const parsed = createStaffAdminSchema.parse({
      ...validInput,
      role: "SUPER_ADMIN",
      isActive: false,
    });

    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("isActive");
  });
});

describe("createStaffAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an active STAFF_OPERATIONS Admin without returning a password hash", async () => {
    adminFindUnique.mockResolvedValue(null);
    bcryptHash.mockResolvedValue("hashed-initial-password");
    adminCreate.mockResolvedValue({
      id: "admin-staff",
      email: "staff@example.com",
      firstName: "Staff",
      lastName: "Operations",
      role: "STAFF_OPERATIONS",
      isActive: true,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    const result = await createStaffAdmin({
      ...validInput,
      email: "staff@example.com",
    });

    expect(bcryptHash).toHaveBeenCalledWith("InitialPassword1", 12);
    expect(adminCreate).toHaveBeenCalledWith({
      data: {
        email: "staff@example.com",
        passwordHash: "hashed-initial-password",
        firstName: "Staff",
        lastName: "Operations",
        role: "STAFF_OPERATIONS",
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    expect(result).toMatchObject({
      email: "staff@example.com",
      role: "STAFF_OPERATIONS",
      isActive: true,
    });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("rejects duplicate Admin email addresses before hashing or creating", async () => {
    adminFindUnique.mockResolvedValue({ id: "existing-admin" });

    await expect(createStaffAdmin({
      ...validInput,
      email: "staff@example.com",
    })).rejects.toMatchObject({
      code: "DUPLICATE_ADMIN_EMAIL",
      statusCode: 409,
    });

    expect(bcryptHash).not.toHaveBeenCalled();
    expect(adminCreate).not.toHaveBeenCalled();
  });
});

describe("Staff account creation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["STAFF_OPERATIONS", "FINANCE_ADMIN", "SUPPORT_ADMIN"])(
    "rejects %s from the Super Admin-only creation guard",
    async (role) => {
      adminFindUnique.mockResolvedValue({
        isActive: true,
        role,
        updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      });
      const token = jwt.sign({
        sub: `admin-${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@example.com`,
        type: "admin",
        role,
        adminUpdatedAt: new Date("2026-09-10T00:00:00.000Z").getTime(),
      }, "test-secret");
      const next = vi.fn();

      requireAdminRoles("SUPER_ADMIN")(
        { headers: { authorization: `Bearer ${token}` } } as never,
        {} as never,
        next,
      );

      await vi.waitFor(() => {
        expect(next).toHaveBeenCalledWith(expect.objectContaining({
          code: "FORBIDDEN",
          statusCode: 403,
        }));
      });
    },
  );
});