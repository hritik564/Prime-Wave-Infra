import { getToken } from "./auth";

const BASE = "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...init, headers });

  let body: unknown;
  try { body = await res.json(); } catch { body = null; }

  if (!res.ok) {
    const data = body as { message?: string; error?: string } | null;
    throw new Error(data?.message ?? data?.error ?? `Request failed (${res.status})`);
  }

  return (body as { data: T }).data;
}

/* ── Auth ─────────────────────────────────────────────────────────── */

export interface AuthResponse {
  token: string;
  user: StoredAuthUser;
}

export interface StoredAuthUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
}

export function login(identifier: string, password: string) {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export function register(data: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  referralCode?: string;
  binaryPlacement: "LEFT" | "RIGHT";
}) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<null>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword }),
  });
}

/* ── Profile ──────────────────────────────────────────────────────── */

export interface ProfileData {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
  referralCode: string;
  referredBy: string | null;
  directReferralCount: number;
  createdAt: string;
  wallet: {
    id: string;
    depositWallet: string;
    incomeWallet: string;
    withdrawalWallet: string;
    updatedAt: string;
  };
}

export function getProfile() {
  return request<ProfileData>("/api/users/profile");
}

export function updateProfile(data: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  walletAddress?: string;
}) {
  return request<ProfileData>("/api/users/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/* ── Investments ──────────────────────────────────────────────────── */

export interface ApiInvestment {
  id: string;
  planType: "PLAN_90" | "PLAN_180" | "PLAN_270" | "PLAN_360";
  amount: string;
  currentPrincipal: string;
  dailyROI: string;
  durationDays: number;
  autoCompound: boolean;
  claimableROI: string;
  claimablePrincipal: string;
  status: "ACTIVE" | "MATURED" | "COMPLETED";
  startedAt: string;
  maturesAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface ListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function listInvestments(params?: { page?: number; limit?: number; status?: string }) {
  const q = new URLSearchParams();
  if (params?.page)   q.set("page",   String(params.page));
  if (params?.limit)  q.set("limit",  String(params.limit));
  if (params?.status) q.set("status", params.status);
  const qs = q.toString() ? `?${q}` : "";
  return request<{ data: ApiInvestment[]; meta: ListMeta }>(`/api/investments${qs}`);
}

export function createInvestment(data: {
  amount: number;
  planType: string;
  autoCompound?: boolean;
}) {
  return request<ApiInvestment>("/api/investments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function claimRoi(id: string) {
  return request<{ amountClaimed: string; ledgerEntriesClaimed: number; incomeWalletBalance: string }>(
    `/api/investments/${id}/claim-roi`,
    { method: "POST" },
  );
}

export function claimPrincipal(id: string) {
  return request<{ investment: ApiInvestment; principalCredited: string; incomeWalletBalance: string }>(
    `/api/investments/${id}/claim-principal`,
    { method: "POST" },
  );
}

export function toggleAutoCompound(id: string, autoCompound: boolean) {
  return request<ApiInvestment>(
    `/api/investments/${id}/auto-compound`,
    { method: "PATCH", body: JSON.stringify({ autoCompound }) },
  );
}

export function getInvestmentEarnings(id: string) {
  return request<{ data: EarningsEntry[]; meta: ListMeta }>(`/api/investments/${id}/earnings`);
}

export interface EarningsEntry {
  id: string;
  type: string;
  amount: string;
  principalSnapshot: string;
  dailyROIApplied: string;
  compounded: boolean;
  creditedToWallet: boolean;
  createdAt: string;
}

/* ── Wallets ──────────────────────────────────────────────────────── */

export interface WalletBalances {
  depositWallet: string;
  incomeWallet: string;
  withdrawalWallet: string;
}

export function getWallets() {
  return request<WalletBalances>("/api/wallets");
}

export function transfer(amount: number) {
  return request<{ incomeWalletBalance: string; withdrawalWalletBalance: string }>(
    "/api/wallets/transfer",
    { method: "POST", body: JSON.stringify({ amount }) },
  );
}

export interface Transaction {
  id: string;
  type: string;
  amount: string;
  status: string;
  description: string | null;
  createdAt: string;
}

export function getWalletHistory(params?: { page?: number; limit?: number; type?: string }) {
  const q = new URLSearchParams();
  if (params?.page)  q.set("page",  String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.type)  q.set("type",  params.type);
  const qs = q.toString() ? `?${q}` : "";
  return request<{ data: Transaction[]; meta: ListMeta }>(`/api/wallets/history${qs}`);
}

/* ── Notifications ────────────────────────────────────────────────── */

export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function getNotifications(params?: { page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.page)  q.set("page",  String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q}` : "";
  return request<{ data: ApiNotification[]; meta: ListMeta }>(`/api/notifications${qs}`);
}

export function getUnreadNotificationCount() {
  return request<{ count: number }>("/api/notifications/unread-count");
}

export function markAllNotificationsRead() {
  return request<null>("/api/notifications/read-all", { method: "POST" });
}

export function markNotificationRead(id: string) {
  return request<null>(`/api/notifications/${id}/read`, { method: "POST" });
}

export interface DepositRequest {
  id: string;
  amount: string;
  network: string;
  txHash: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectedReason?: string | null;
  createdAt: string;
}

export function createDepositRequest(data: {
  amount: number;
  network: string;
  txHash: string;
  companyWallet: string;
  screenshotUrl?: string;
}) {
  return request<DepositRequest>("/api/deposits", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getDepositHistory(params?: { page?: number; limit?: number; status?: string }) {
  const q = new URLSearchParams();
  if (params?.page)   q.set("page",   String(params.page));
  if (params?.limit)  q.set("limit",  String(params.limit));
  if (params?.status) q.set("status", params.status);
  return request<{ data: DepositRequest[]; meta: ListMeta }>(`/api/deposits/history?${q}`);
}
