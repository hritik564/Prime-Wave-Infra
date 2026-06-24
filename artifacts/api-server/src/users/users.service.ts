import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      referralCode: true,
      referredBy: true,
      createdAt: true,
      wallet: {
        select: {
          id: true,
          depositWallet: true,
          incomeWallet: true,
          withdrawalWallet: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  return user;
}
