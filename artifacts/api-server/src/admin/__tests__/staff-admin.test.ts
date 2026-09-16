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
import {
  requireAdminRoles,
  requireTemporaryManualDepositWalletScope,
  requireTemporaryStaffOperationsAccess,
} from "../../middleware/auth.middleware";
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

function adminRequest(role: string) {
  const updatedAt = new Date("2026-09-10T00:00:00.000Z");
  const token = jwt.sign({
    sub: `admin-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@example.com`,
    type: "admin",
    role,
    adminUpdatedAt: updatedAt.getTime(),
  }, "test-secret");

  return {
    headers: { authorization: `Bearer ${token}` },
    body: { walletType: "depositWallet" } as Record<string, unknown>,
  };
}

async function runGuard(
  guard: ReturnType<typeof requireAdminRoles>,
  role: string,
  body: Record<string, unknown> = { walletType: "depositWallet" },
) {
  adminFindUnique.mockResolvedValue({
    isActive: true,
    role,
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
  });
  const req = adminRequest(role);
  req.body = body;
  const next = vi.fn();

  guard(req as never, {} as never, next);
  await vi.waitFor(() => expect(next).toHaveBeenCalled());
  return next;
}

describe("Temporary Staff Operations feature authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["SUPER_ADMIN", "FINANCE_ADMIN", "STAFF_OPERATIONS"])(
    "allows %s to use the temporary Manual Deposit guard",
    async (role) => {
      const next = await runGuard(
        requireTemporaryStaffOperationsAccess("MANUAL_DEPOSIT"),
        role,
      );
      expect(next).toHaveBeenCalledWith();
    },
  );

  it.each(["SUPPORT_ADMIN", "REWARD_MANAGER"])(
    "denies %s from the temporary Manual Deposit guard",
    async (role) => {
      const next = await runGuard(
        requireTemporaryStaffOperationsAccess("MANUAL_DEPOSIT"),
        role,
      );
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        code: "FORBIDDEN",
        statusCode: 403,
      }));
    },
  );

  it.each(["SUPER_ADMIN", "STAFF_OPERATIONS"])(
    "allows %s to use the temporary Power Business guard",
    async (role) => {
      const next = await runGuard(
        requireTemporaryStaffOperationsAccess("POWER_BUSINESS"),
        role,
      );
      expect(next).toHaveBeenCalledWith();
    },
  );

  it.each(["FINANCE_ADMIN", "SUPPORT_ADMIN", "REWARD_MANAGER"])(
    "denies %s from the temporary Power Business guard",
    async (role) => {
      const next = await runGuard(
        requireTemporaryStaffOperationsAccess("POWER_BUSINESS"),
        role,
      );
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        code: "FORBIDDEN",
        statusCode: 403,
      }));
    },
  );

  it("rejects an unauthenticated request before role evaluation", async () => {
    const next = vi.fn();
    requireTemporaryStaffOperationsAccess("MANUAL_DEPOSIT")(
      { headers: {} } as never,
      {} as never,
      next,
    );

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: "TOKEN_MISSING",
      statusCode: 401,
    })));
    expect(adminFindUnique).not.toHaveBeenCalled();
  });

  it("limits Staff Operations on the shared wallet-credit endpoint to depositWallet", async () => {
    await runGuard(
      requireTemporaryStaffOperationsAccess("MANUAL_DEPOSIT"),
      "STAFF_OPERATIONS",
    );
    const next = vi.fn();
    requireTemporaryManualDepositWalletScope(
      {
        user: { role: "STAFF_OPERATIONS" },
        body: { walletType: "incomeWallet" },
      } as never,
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: "FORBIDDEN",
      statusCode: 403,
    }));
  });

  it("preserves Finance Admin access to income and withdrawal wallet credits", async () => {
    const incomeNext = await runGuard(
      requireTemporaryStaffOperationsAccess("MANUAL_DEPOSIT"),
      "FINANCE_ADMIN",
      { walletType: "incomeWallet" } as Record<string, unknown>,
    );
    expect(incomeNext).toHaveBeenCalledWith();

    const withdrawalNext = vi.fn();
    requireTemporaryManualDepositWalletScope(
      {
        user: { role: "FINANCE_ADMIN" },
        body: { walletType: "withdrawalWallet" },
      } as never,
      {} as never,
      withdrawalNext,
    );
    expect(withdrawalNext).toHaveBeenCalledWith();
  });

  it.each([
    ["admin account management", ["SUPER_ADMIN"]],
    ["staff account creation", ["SUPER_ADMIN"]],
    ["deposit wallet management", ["SUPER_ADMIN"]],
    ["company wallet and address changes", ["SUPER_ADMIN"]],
    ["saved QR management", ["SUPER_ADMIN"]],
    ["withdrawal approval", ["SUPER_ADMIN", "FINANCE_ADMIN"]],
    ["withdrawal rejection", ["SUPER_ADMIN", "FINANCE_ADMIN"]],
    ["withdrawal reprocessing", ["SUPER_ADMIN", "FINANCE_ADMIN"]],
    ["withdrawal completion", ["SUPER_ADMIN", "FINANCE_ADMIN"]],
    ["withdrawal hold, release, and reconciliation", ["SUPER_ADMIN", "FINANCE_ADMIN"]],
    ["withdrawal engine controls", ["SUPER_ADMIN"]],
    ["withdrawal settings", ["SUPER_ADMIN", "FINANCE_ADMIN"]],
    ["role management", ["SUPER_ADMIN"]],
    ["system settings", ["SUPER_ADMIN"]],
    ["blockchain configuration", ["SUPER_ADMIN"]],
  ])("keeps Staff Operations denied from %s", async (_label, roles) => {
    const next = await runGuard(
      requireAdminRoles(...roles),
      "STAFF_OPERATIONS",
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      code: "FORBIDDEN",
      statusCode: 403,
    }));
  });

  it.each(["SUPER_ADMIN", "STAFF_OPERATIONS"])(
    "allows %s to change a member withdrawal wallet",
    async (role) => {
      const next = await runGuard(
        requireAdminRoles("SUPER_ADMIN", "STAFF_OPERATIONS"),
        role,
      );
      expect(next).toHaveBeenCalledWith();
    },
  );

  it.each(["SUPER_ADMIN", "SUPPORT_ADMIN", "STAFF_OPERATIONS"])(
    "allows %s to edit member profiles",
    async (role) => {
      const next = await runGuard(
        requireAdminRoles("SUPER_ADMIN", "SUPPORT_ADMIN", "STAFF_OPERATIONS"),
        role,
      );
      expect(next).toHaveBeenCalledWith();
    },
  );

  it.each(["SUPER_ADMIN", "STAFF_OPERATIONS"])("allows %s to use user impersonation", async (role) => {
    const next = await runGuard(
      requireAdminRoles("SUPER_ADMIN", "STAFF_OPERATIONS"),
      role,
    );
    expect(next).toHaveBeenCalledWith();
  });
});