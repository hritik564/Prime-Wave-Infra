import { prisma } from "./prisma";

// ── Settings cache ────────────────────────────────────────────────────────────
// A simple in-process TTL cache so the orbit/matching engines don't hit the
// DB on every single user iteration inside a cycle.

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

interface CacheEntry {
  value:     string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read a setting by key.
 * Returns the DB value if present, otherwise `defaultValue`.
 * Results are cached for 5 minutes.
 */
export async function getSetting(key: string, defaultValue: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const row = await prisma.systemSettings.findUnique({
    where:  { key },
    select: { value: true },
  });

  const value = row?.value ?? defaultValue;
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Read a numeric (integer or float) setting by key.
 * If the DB value cannot be parsed as a number, `defaultValue` is returned.
 */
export async function getNumericSetting(key: string, defaultValue: number): Promise<number> {
  const raw = await getSetting(key, String(defaultValue));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Read all settings and return them as a plain object.
 * Useful for admin "list settings" endpoints.
 */
export async function getAllSettings(): Promise<Array<{ key: string; value: string; description: string | null }>> {
  return prisma.systemSettings.findMany({
    select:  { key: true, value: true, description: true },
    orderBy: { key: "asc" },
  });
}

/**
 * Update a setting value. Clears the local cache entry for that key.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.systemSettings.upsert({
    where:  { key },
    update: { value },
    create: { key, value },
  });
  cache.delete(key);
}

/** Evict all cached entries (call after bulk updates). */
export function clearSettingsCache(): void {
  cache.clear();
}
