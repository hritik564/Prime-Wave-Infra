export interface StoredUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  type: "user" | "admin";
  role?: string;
}

const TOKEN_KEY       = "pw:token";
const ADMIN_TOKEN_KEY = "pw:admin:token";
const USER_KEY        = "pw:user";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function getAdminToken(): string | null {
  try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
}

export function setAdminToken(token: string): void {
  try { localStorage.setItem(ADMIN_TOKEN_KEY, token); } catch {}
}

export function clearAdminToken(): void {
  try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch {}
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch { return null; }
}

export function setStoredUser(user: StoredUser): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}

/** Decode the stored admin JWT to extract the role claim (no secret needed on the client). */
export function getAdminRole(): string | null {
  try {
    const token = getAdminToken();
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded  = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as { role?: string };
    return payload.role ?? null;
  } catch { return null; }
}

/* ── Impersonation helpers ─────────────────────────────────────────────────── */

const IMP_PREV_USER_KEY = "pw:imp:prev:user";

export function savePrevUser(user: StoredUser): void {
  try { localStorage.setItem(IMP_PREV_USER_KEY, JSON.stringify(user)); } catch {}
}

export function getPrevUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(IMP_PREV_USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch { return null; }
}

/** Remove the impersonation JWT and the saved admin-user backup, but leave pw:admin:token intact. */
export function clearImpersonationState(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(IMP_PREV_USER_KEY);
  } catch {}
}

export function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch { return null; }
}

export function isImpersonationToken(token: string): boolean {
  const p = decodeTokenPayload(token);
  return !!p && p["impersonated"] === true;
}

/* ── 401 interceptor hook ──────────────────────────────────────────────────── */

let _onUnauthorized: (() => void) | null = null;

export function setUnauthorizedCallback(cb: () => void): void {
  _onUnauthorized = cb;
}

export function fireUnauthorized(): void {
  _onUnauthorized?.();
}
