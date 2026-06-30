import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { sendSuccess } from "../shared/response";

export async function resolveCode(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const code = (req.query as Record<string, string>)["code"]?.trim().toUpperCase();

    if (!code) {
      res.status(400).json({ message: "code query param is required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where:  { referralCode: code },
      select: { username: true, firstName: true, lastName: true },
    });

    if (!user) {
      res.status(404).json({ message: "Invalid referral code" });
      return;
    }

    sendSuccess(res, user, "Referral code resolved");
  } catch (err) {
    next(err);
  }
}
