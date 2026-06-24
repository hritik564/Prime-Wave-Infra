import rateLimit from "express-rate-limit";

const rateLimitResponse = (message: string) => ({
  success: false,
  message,
  code: "RATE_LIMITED",
});

/**
 * Global limiter — applied to all API routes.
 * 100 requests per 15-minute window per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse("Too many requests. Please try again later."),
});

/**
 * Auth limiter — applied to login / register / change-password.
 * 10 attempts per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(
    "Too many authentication attempts. Please try again later.",
  ),
});

/**
 * Admin limiter — tighter limit for admin routes.
 * 60 requests per 15-minute window per IP.
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse("Too many admin requests. Please try again later."),
});
