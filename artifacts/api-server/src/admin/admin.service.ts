import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminLoginInput } from "./admin.schema";
import type { ChangeAdminPasswordInput } from "./admin.schema";
import type { AuthPayload } from "../shared/types";

function signAdminToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export async function loginAdmin(input: AdminLoginInput) {
  const { email, password } = input;

  const admin = await prisma.admin.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  if (!admin.isActive) {
    throw new AppError(
      "Admin account is disabled",
      HTTP_STATUS.FORBIDDEN,
      "ACCOUNT_DISABLED",
    );
  }

  const isValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isValid) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  const token = signAdminToken({
    sub: admin.id,
    email: admin.email,
    type: "admin",
    role: admin.role,
    adminUpdatedAt: admin.updatedAt.getTime(),
  });

  return {
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
    },
  };
}

export async function getAdminProfile(adminId: string) {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
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

  if (!admin) {
    throw new AppError("Admin not found", HTTP_STATUS.NOT_FOUND, "ADMIN_NOT_FOUND");
  }

  return admin;
}

export async function changeAdminPassword(
  adminId: string,
  input: ChangeAdminPasswordInput,
): Promise<void> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, passwordHash: true, isActive: true },
  });

  if (!admin || !admin.isActive) {
    throw new AppError("Unable to change password", HTTP_STATUS.UNAUTHORIZED, "PASSWORD_CHANGE_FAILED");
  }

  const isValid = await bcrypt.compare(input.currentPassword, admin.passwordHash);
  if (!isValid) {
    throw new AppError("Unable to change password", HTTP_STATUS.BAD_REQUEST, "PASSWORD_CHANGE_FAILED");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_ROUNDS ? Number(env.BCRYPT_ROUNDS) : 12);
  const updatedAt = new Date();

  await prisma.admin.update({
    where: { id: adminId },
    data: { passwordHash, updatedAt },
  });
}
