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

/* ── 401 interceptor hook ──────────────────────────────────────────────────── */

let _onUnauthorized: (() => void) | null = null;

export function setUnauthorizedCallback(cb: () => void): void {
  _onUnauthorized = cb;
}

export function fireUnauthorized(): void {
  _onUnauthorized?.();
}
