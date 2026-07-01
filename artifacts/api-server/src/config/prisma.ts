import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Append connection pool parameters to DATABASE_URL if not already present.
// Mutating process.env before PrismaClient is instantiated means both the
// runtime client and the Prisma CLI (if called later) see the same settings.
// Simple string concatenation avoids URL-encoding issues with new URL().
const _dbUrl = process.env["DATABASE_URL"];
if (_dbUrl && !_dbUrl.includes("connection_limit=")) {
  process.env["DATABASE_URL"] =
    _dbUrl + (_dbUrl.includes("?") ? "&" : "?") + "connection_limit=20&pool_timeout=30";
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalThis.__prisma = prisma;
}
