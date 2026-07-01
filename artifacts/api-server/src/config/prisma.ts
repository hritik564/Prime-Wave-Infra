import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Returns the DATABASE_URL with connection pool parameters set if not already
 * present.  Defaults: connection_limit=20, pool_timeout=30 (seconds).
 *
 * Uses URL search-params so we never duplicate a param the caller has set.
 * Falls back to the raw URL string if URL parsing fails (non-standard format).
 */
function buildDatabaseUrl(): string {
  const base = process.env["DATABASE_URL"] ?? "";
  if (!base) return base;
  try {
    const url = new URL(base);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "20");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    return url.toString();
  } catch {
    return base;
  }
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalThis.__prisma = prisma;
}
