import { getToken, fireUnauthorized } from "./auth";

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

  if (res.status === 401) {
    fireUnauthorized();
    throw new Error("Session expired. Please sign in again.");
  }

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

export interface AdminAuthResponse {
  token: string;
  admin: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export function adminLogin(email: string, password: string) {
  return request<AdminAuthResponse>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
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
  fee?: string | null;
  netAmount?: string | null;
  status: string;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export function getWalletHistory(params?: {
  page?: number;
  limit?: number;
  type?: string;
  types?: string[];
}) {
  const q = new URLSearchParams();
  if (params?.page)         q.set("page",  String(params.page));
  if (params?.limit)        q.set("limit", String(params.limit));
  if (params?.type)         q.set("type",  params.type);
  if (params?.types?.length) q.set("types", params.types.join(","));
  const qs = q.toString() ? `?${q}` : "";
  return request<{ data: Transaction[]; meta: ListMeta }>(`/api/wallets/history${qs}`);
}

/* ── Income Center ────────────────────────────────────────────── */

export interface IncomeBreakdown {
  type: string;
  total: string;
  today: string;
  week: string;
  percentage: string;
}

export interface IncomeSummary {
  periods: {
    today: string;
    week: string;
    month: string;
    lifetime: string;
  };
  breakdown: IncomeBreakdown[];
  analytics: {
    highestSource: string | null;
    largestReward: string;
    avgDailyIncome: string;
    avgMonthlyIncome: string;
    roiVsNetworkRoi: string;
    roiVsNetworkNet: string;
    totalTransactions: number;
  };
}

export interface TrendPoint {
  date: string;
  total: number;
}

export function getIncomeSummary() {
  return request<IncomeSummary>("/api/income/summary");
}

export function getIncomeTrend(period: "7d" | "30d" | "90d" | "1y" | "all") {
  return request<TrendPoint[]>(`/api/income/trend?period=${period}`);
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

export interface WithdrawalRequest {
  id: string;
  amount: string;
  walletAddress: string;
  network: string;
  status: "PENDING" | "APPROVED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  rejectedReason?: string | null;
  adminNotes?: string | null;
  createdAt: string;
}

export function createWithdrawal(data: { amount: number; walletAddress: string; network: string }) {
  return request<WithdrawalRequest>("/api/withdrawals", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getWithdrawalHistory(params?: { page?: number; limit?: number; status?: string }) {
  const q = new URLSearchParams();
  if (params?.page)   q.set("page",   String(params.page));
  if (params?.limit)  q.set("limit",  String(params.limit));
  if (params?.status) q.set("status", params.status);
  return request<{ data: WithdrawalRequest[]; meta: ListMeta }>(`/api/withdrawals/history?${q}`);
}

export function cancelWithdrawal(id: string) {
  return request<{ withdrawalId: string; status: string }>(`/api/withdrawals/${id}/cancel`, { method: "POST" });
}

/* ── Admin Dashboard ──────────────────────────────────────────────── */

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  suspendedUsers: number;
  totalDeposits: number;
  pendingDeposits: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  totalInvestments: number;
  totalRoiPaid: string;
  totalBinaryIncome: string;
  totalOrbitIncome: string;
  totalLevelIncome: string;
  totalSalaryIncome: string;
  todayNewUsers: number;
  todayDeposits: number;
  todayWithdrawals: number;
}

export function getAdminDashboard() {
  return request<AdminDashboardStats>("/api/admin/dashboard");
}

export interface AdminSystemHealth {
  lastRoiCronExecution: string | null;
  lastBinaryMatchingExecution: string | null;
  lastOrbitExecution: string | null;
  lastSalaryExecution: string | null;
  lastMonthlySalaryExecution: string | null;
  failedJobsCount: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
}

export function getAdminSystemHealth() {
  return request<AdminSystemHealth>("/api/admin/system-health");
}

export interface AdminPendingOps {
  pendingDeposits: number;
  pendingWithdrawals: number;
  failedJobs: number;
}

export function getAdminPendingOps() {
  return request<AdminPendingOps>("/api/admin/reports/pending");
}

export interface DailyBusinessRow {
  date: string;
  newUsers: number;
  deposits: number;
  investments: number;
  withdrawals: number;
}

export interface AdminDailyBusiness {
  period: { from: string; to: string };
  data: DailyBusinessRow[];
}

export function getAdminDailyBusiness(limit = 30) {
  return request<AdminDailyBusiness>(`/api/admin/reports/daily-business?limit=${limit}`);
}

export interface AdminUserListItem {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdAt: string;
}

export function adminSearchUsers(params?: { page?: number; limit?: number; status?: string }) {
  const q = new URLSearchParams();
  if (params?.page)   q.set("page",   String(params.page));
  if (params?.limit)  q.set("limit",  String(params.limit));
  if (params?.status) q.set("status", params.status);
  return request<{ data: AdminUserListItem[]; meta: ListMeta }>(`/api/admin/users/search?${q}`);
}

/* ── Dev Toolkit (development only) ──────────────────────────────── */

export interface DevStatus {
  environment: string;
  serverTime: string;
  timezone: string;
  activeInvestments: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalUsers: number;
  lastRoiCycle: string | null;
}

export interface DevRoiResult {
  cycles: number;
  investmentsUpdated: number;
  matured: number;
  roiGenerated: string;
  autoCompounded: string;
  claimableGenerated: string;
  executionMs: number;
}

export interface DevInvestment {
  id: string;
  status: string;
  currentPrincipal: string;
  dailyROI: string;
  autoCompound: boolean;
  maturesAt: string;
  claimableROI: string;
  claimablePrincipal: string;
  createdAt: string;
  planType: string;
  user: { email: string; username: string };
}

export interface DevDeposit {
  id: string;
  amount: string;
  network: string;
  status: string;
  createdAt: string;
  user: { email: string; username: string };
}

export interface DevWithdrawal {
  id: string;
  amount: string;
  network: string;
  status: string;
  walletAddress: string;
  createdAt: string;
  user: { email: string; username: string };
}

// ── Dev Network types ─────────────────────────────────────────────────────────

export interface NetOwnerStatus {
  id: string;
  username: string;
  leftBV: string;
  rightBV: string;
  matchedBV: string;
  carryForwardBV: string;
  powerLeg: string;
  weakLeg: string;
  directReferralCount: number;
  directLeft: string;
  directRight: string;
}

export interface NetQualification {
  binaryQualified: boolean;
  matchingQualified: boolean;
  orbitQualified: boolean;
  salaryQualified: boolean;
  salaryRank: string | null;
  salarySalary: string | null;
}

export interface NetTestUser {
  id: string;
  username: string;
  position: string | null;
  binaryParentId: string | null;
  leftBV: string;
  rightBV: string;
}

export interface NetStatus {
  owner: NetOwnerStatus;
  qualification: NetQualification;
  testNetwork: {
    exists: boolean;
    userCount: number;
    users: NetTestUser[];
  };
  lastResults: {
    matching: { incomeAmount: string; matchedBV: string; payableBV: string; at: string } | null;
    orbit: { incomeAmount: string; matchedBV: string; rewardCount: number; at: string } | null;
  };
}

export interface NetGenResult {
  message: string;
  usersCreated: number;
  users: { id: string; username: string; referralCode: string; role: string }[];
  investments: string;
}

export interface NetBvResult {
  message: string;
  preset: string;
  investments?: { side: string; userId: string; username: string; investmentId: string; bvAdded: number }[];
  rankName?: string;
  monthlyAmount?: string;
  expiresAt?: string;
  investmentId?: string;
  from?: string;
  amount?: string;
  bvGenerated?: number;
}

export interface NetRunResult {
  engine: string;
  usersProcessed?: number;
  usersSkipped?: number;
  newPayouts?: number;
  incomeGenerated?: string;
  matchedBV?: string;
  rewardedBV?: string;
  flushedBV?: string;
  carryFwdLeft?: string;
  carryFwdRight?: string;
  rewards?: number;
  walletUpdated?: number;
  executionMs: number;
}

export interface NetDeleteResult {
  message: string;
  deleted: number;
  deletedUsers: string[];
}

export const devApi = {
  getStatus: () => request<DevStatus>("/api/dev/status"),

  runRoi: (cycles: number) =>
    request<DevRoiResult>("/api/dev/roi/run", { method: "POST", body: JSON.stringify({ cycles }) }),

  getInvestments: () =>
    request<{ investments: DevInvestment[] }>("/api/dev/investments"),

  matureInvestment: (id: string) =>
    request<{ investmentId: string; status: string; claimablePrincipal: string }>(
      `/api/dev/investments/${id}/mature`, { method: "POST" }),

  resetInvestment: (id: string) =>
    request<{ investmentId: string; status: string; maturesAt: string }>(
      `/api/dev/investments/${id}/reset`, { method: "POST" }),

  getPendingDeposits: () =>
    request<{ deposits: DevDeposit[] }>("/api/dev/deposits/pending"),

  approveDeposit: (id: string) =>
    request<{ depositId: string; status: string }>(`/api/dev/deposits/${id}/approve`, { method: "POST" }),

  rejectDeposit: (id: string, reason?: string) =>
    request<{ depositId: string; status: string }>(`/api/dev/deposits/${id}/reject`, {
      method: "POST", body: JSON.stringify({ reason }),
    }),

  getPendingWithdrawals: () =>
    request<{ withdrawals: DevWithdrawal[] }>("/api/dev/withdrawals/pending"),

  approveWithdrawal: (id: string) =>
    request<{ withdrawalId: string; status: string }>(`/api/dev/withdrawals/${id}/approve`, { method: "POST" }),

  rejectWithdrawal: (id: string, reason?: string) =>
    request<{ withdrawalId: string; status: string }>(`/api/dev/withdrawals/${id}/reject`, {
      method: "POST", body: JSON.stringify({ reason }),
    }),

  cancelWithdrawal: (id: string) =>
    request<{ withdrawalId: string; status: string }>(`/api/dev/withdrawals/${id}/cancel`, { method: "POST" }),

  releaseTransfers: () =>
    request<{ transferred: number; totalNetAmount: string }>("/api/dev/transfers/release", { method: "POST" }),

  runBinaryMatching: () =>
    request<{
      executionMs: number; processed: number; skipped: number;
      incomeGenerated: string; matchedBV: string; rewardedBV: string;
      flushedBV: string; carryFwdLeft: string; carryFwdRight: string;
    }>("/api/dev/binary/matching", { method: "POST" }),

  runBinaryOrbit: () =>
    request<{
      executionMs: number; processed: number; skipped: number;
      incomeGenerated: string; matchedBV: string; flushedBV: string;
      carryFwdLeft: string; carryFwdRight: string; rewards: number;
    }>("/api/dev/binary/orbit", { method: "POST" }),

  runSalary: () =>
    request<{ executionMs: number }>("/api/dev/binary/salary", { method: "POST" }),

  generateNotification: (userId: string) =>
    request<{ userId: string; type: string }>("/api/dev/notifications/generate", {
      method: "POST", body: JSON.stringify({ userId }),
    }),

  markAllNotificationsRead: (userId: string) =>
    request<{ updated: number }>("/api/dev/notifications/mark-all-read", {
      method: "POST", body: JSON.stringify({ userId }),
    }),

  clearNotifications: (userId: string) =>
    request<{ deleted: number }>("/api/dev/notifications/clear", {
      method: "POST", body: JSON.stringify({ userId }),
    }),

  // ── Network & BV generator ──────────────────────────────────────────────────
  getNetworkStatus: (ownerId: string) =>
    request<NetStatus>(`/api/dev/network/status?ownerId=${encodeURIComponent(ownerId)}`),

  generateNetwork: (ownerId: string, planType?: string, amount?: number) =>
    request<NetGenResult>("/api/dev/network/generate", {
      method: "POST", body: JSON.stringify({ ownerId, planType, amount }),
    }),

  generateBV: (ownerId: string, preset: string) =>
    request<NetBvResult>("/api/dev/network/bv", {
      method: "POST", body: JSON.stringify({ ownerId, preset }),
    }),

  runNetworkEngine: (engine: string) =>
    request<NetRunResult>("/api/dev/network/run", {
      method: "POST", body: JSON.stringify({ engine }),
    }),

  deleteTestNetwork: (ownerId: string) =>
    request<NetDeleteResult>("/api/dev/network", {
      method: "DELETE", body: JSON.stringify({ ownerId }),
    }),
};

/* ── Binary Tree & BV ─────────────────────────────────────────────── */

export interface BinaryTreeNode {
  id:                  string;
  username:            string;
  firstName:           string;
  lastName:            string;
  status:              string;
  position:            "LEFT" | "RIGHT" | null;
  referralCode:        string;
  directReferralCount: number;
  placedAt:            string | null;
  left:                BinaryTreeNode | null;
  right:               BinaryTreeNode | null;
}

export interface BvSummary {
  leftBV:          string;
  rightBV:         string;
  matchedBV:       string;
  carryForwardBV:  string;
  binaryQualified: boolean;
}

export function getBinaryTree(depth = 3) {
  return request<BinaryTreeNode>(`/api/binary/tree?depth=${depth}`);
}

export function getBvSummary() {
  return request<BvSummary>("/api/binary/bv-summary");
}

/* ── Network Intelligence ─────────────────────────────────────────── */

export interface NetworkStats {
  totalTeam:        number;
  directReferrals:  number;
  leftTeam:         number;
  rightTeam:        number;
  activeMembers:    number;
  inactiveMembers:  number;
  weeklyNew:        number;
  leftBV:           string;
  rightBV:          string;
}

export interface NetworkInsight {
  type:    "success" | "warning" | "alert" | "info" | "gold";
  title:   string;
  message: string;
  metric:  string;
  action:  string;
}

export interface NetworkMember {
  id:               string;
  username:         string;
  firstName:        string;
  lastName:         string;
  status:           string;
  position:         "LEFT" | "RIGHT" | null;
  joinedAt:         string;
  directReferrals:  number;
  activeInvestments: number;
  investedAmount:   string;
  plans:            string[];
  isSponsored:      boolean;
}

export interface TopPerformer {
  rank:            number;
  id:              string;
  username:        string;
  firstName:       string;
  lastName:        string;
  status:          string;
  directReferrals: number;
  totalInvested:   string;
  joinedAt:        string;
  isSponsored?:    boolean;
}

export interface NetworkPulse {
  newMembersToday:     number;
  newInvestmentsToday: number;
  recentMatchCount:    number;
  recentMatchIncome:   string;
  lastActivityAt:      string | null;
  totalDownline:       number;
}

export interface LegBreakdown {
  leftMembers:      number;
  rightMembers:     number;
  leftActiveCount:  number;
  rightActiveCount: number;
  leftBV:           string;
  rightBV:          string;
  leftInvestments:  number;
  rightInvestments: number;
  leftWeeklyNew:    number;
  rightWeeklyNew:   number;
  powerLeg:         "LEFT" | "RIGHT";
  weakLeg:          "LEFT" | "RIGHT";
  carryForwardLeft:  string;
  carryForwardRight: string;
  directReferrals:  number;
}

export interface TeamActivityItem {
  id:          string;
  type:        "investment" | "join";
  username:    string;
  firstName:   string;
  description: string;
  at:          string;
}

export function getNetworkStats() {
  return request<NetworkStats>("/api/network/stats");
}

export function getNetworkInsights() {
  return request<{ insights: NetworkInsight[] }>("/api/network/insights");
}

export function getNetworkMembers(params: {
  page?:   number;
  limit?:  number;
  search?: string;
  filter?: "all" | "active" | "inactive" | "sponsored" | "no-plan" | "high-producers" | "recently-active";
}) {
  const q = new URLSearchParams({
    page:   String(params.page   ?? 1),
    limit:  String(params.limit  ?? 20),
    search: params.search ?? "",
    filter: params.filter ?? "all",
  });
  return request<{ members: NetworkMember[]; total: number; page: number; limit: number }>(
    `/api/network/members?${q}`,
  );
}

export function getTopPerformers() {
  return request<{ performers: TopPerformer[] }>("/api/network/top-performers");
}

export function getTeamActivity() {
  return request<{ activities: TeamActivityItem[] }>("/api/network/activity");
}

export function getNetworkPulse() {
  return request<NetworkPulse>("/api/network/pulse");
}

export function getLegBreakdown() {
  return request<LegBreakdown>("/api/network/leg-breakdown");
}
