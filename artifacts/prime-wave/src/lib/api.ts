import { getToken, getAdminToken, fireUnauthorized } from "./auth";

const BASE = "";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isAdminPath = path.startsWith("/api/admin/") && path !== "/api/admin/login";
  const token = isAdminPath ? (getAdminToken() ?? getToken()) : getToken();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (!(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...init, headers });

  let body: unknown;
  try { body = await res.json(); } catch { body = null; }

  if (res.status === 401 || res.status === 403) {
    const data = body as { code?: string; message?: string; error?: string } | null;
    if (data?.code !== "PASSWORD_RESET_REQUIRED") {
      fireUnauthorized();
    }
    throw new ApiRequestError(
      data?.message ?? data?.error ?? "Session expired. Please sign in again.",
      res.status,
      data?.code,
      (body as { data?: unknown } | null)?.data,
    );
  }

  if (!res.ok) {
    const data = body as { message?: string; error?: string; code?: string; data?: unknown } | null;
    throw new ApiRequestError(
      data?.message ?? data?.error ?? `Request failed (${res.status})`,
      res.status,
      data?.code,
      data?.data,
    );
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

export function forgotPassword(identifier: string) {
  return request<null>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export function resetPassword(token: string, newPassword: string) {
  return request<AuthResponse>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token,
      newPassword,
      confirmPassword: newPassword,
    }),
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

export function changeAdminPassword(currentPassword: string, newPassword: string) {
  return request<null>("/api/admin/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword,
      newPassword,
      confirmPassword: newPassword,
    }),
  });
}

export interface CreatedStaffAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "STAFF_OPERATIONS";
  isActive: true;
  createdAt: string;
}

export function createStaffAdmin(email: string, password: string, confirmPassword: string) {
  return request<CreatedStaffAdmin>("/api/admin/staff", {
    method: "POST",
    body: JSON.stringify({ email, password, confirmPassword }),
  });
}

export interface BulkPasswordResetPreview {
  totalNormalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  blockedUsers: number;
  suspendedUsers: number;
  expectedResetCount: number;
  adminCount: number;
  usersExcluded: number;
  unexpectedAuthVersionCount: number;
  passwordResetRequiredCount: number;
}

export interface BulkPasswordResetRunResult {
  runId: string;
  status: "PREPARING" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED";
  totalEligible: number;
  processedCount: number;
  failedCount: number;
  artifactAvailable: boolean;
}

export function previewBulkPasswordReset() {
  return request<BulkPasswordResetPreview>("/api/admin/security/bulk-password-reset/preview", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function executeBulkPasswordReset(confirmation: string, expectedUserCount: number, runId?: string) {
  return request<BulkPasswordResetRunResult>("/api/admin/security/bulk-password-reset/execute", {
    method: "POST",
    body: JSON.stringify({ confirmation, expectedUserCount, ...(runId ? { runId } : {}) }),
  });
}

export async function downloadBulkPasswordResetArtifact(runId: string): Promise<Blob> {
  const token = getAdminToken() ?? getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api/admin/security/bulk-password-reset/${encodeURIComponent(runId)}/artifact`, {
    headers,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json() as { message?: string };
      message = body.message ?? message;
    } catch {
      // Keep the status-derived message when the response is not JSON.
    }
    if (res.status === 401 || res.status === 403) fireUnauthorized();
    throw new ApiRequestError(message, res.status);
  }
  return res.blob();
}

export function register(data: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  referralCode: string;
  leg: "L" | "R";
  walletAddress?: string;
}) {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function resolveReferralCode(code: string) {
  return request<{ username: string; firstName: string; lastName: string }>(
    `/api/referrals/resolve?code=${encodeURIComponent(code)}`,
  );
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
  walletAddress: string | null;
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

/* ── Salary ──────────────────────────────────────────────────────── */

export interface SalaryQualificationEntry {
  rankName:         string;
  requiredBusiness: string;
  monthlySalary:    string;
  qualifies:        boolean;
}

export interface SalaryQualificationSummary {
  totalBusinessUSD:     string;
  leftBusinessUSD:      string;
  rightBusinessUSD:     string;
  qualifications:       SalaryQualificationEntry[];
  highestRank:          string | null;
  nextRank:             string | null;
  nextRequiredBusiness: string | null;
  remaining:            string;
  progressPct:          number;
  directBusiness:       string;
  downlineBusiness:     string;
  powerBusiness:        string;
  effectiveBusiness:    string;
  isGoldUnlocked:       boolean;
}

export interface SalarySummaryData {
  activeMonthlySalary:  string;
  lifetimeSalaryIncome: string;
  activeRanks:          string[];
  activeAchievements: Array<{
    rankName:      string;
    monthlyAmount: string;
    expiresAt:     string | null;
  }>;
}

export function getSalaryQualifications() {
  return request<SalaryQualificationSummary>("/api/salary/qualifications");
}

export function getSalarySummary() {
  return request<SalarySummaryData>("/api/salary/summary");
}

export interface SalaryAchievementItem {
  id:            string;
  rankName:      string;
  achievedAt:    string;
  expiresAt:     string | null;
  monthlyAmount: string;
  isActive:      boolean;
  createdAt:     string;
}

export function getSalaryAchievements(params?: { isActive?: boolean }) {
  const q = params?.isActive !== undefined ? `?isActive=${params.isActive}` : "";
  return request<SalaryAchievementItem[]>(`/api/salary/achievements${q}`);
}

export interface MemberSalaryHistoryItem {
  id:            string;
  rankName:      string;
  month:         number;
  year:          number;
  amount:        string;
  status:        string;
  reference:     string | null;
  approvedAt:    string | null;
  approvedBy:    string | null;
  paidAt:        string | null;
  transactionId: string | null;
  createdAt:     string;
}

export function getSalaryHistoryMember(params?: { page?: number; limit?: number; rankName?: string; year?: number; month?: number }) {
  const q = new URLSearchParams();
  if (params?.page)     q.set("page",     String(params.page));
  if (params?.limit)    q.set("limit",    String(params.limit));
  if (params?.rankName) q.set("rankName", params.rankName);
  if (params?.year)     q.set("year",     String(params.year));
  if (params?.month)    q.set("month",    String(params.month));
  const qs = q.toString();
  return request<{ data: MemberSalaryHistoryItem[]; meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean } }>(`/api/salary/history${qs ? `?${qs}` : ""}`);
}

export interface SalaryUpcomingRun {
  runId:           string;
  month:           number;
  year:            number;
  status:          string;
  startedAt:       string | null;
  generatedCount:  number;
  estimatedAmount: string | null;
  incomeStatus:    string | null;
  rankName:        string | null;
  paidAt:          string | null;
}

export function getSalaryUpcomingRun() {
  return request<SalaryUpcomingRun | null>("/api/salary/upcoming-run");
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
  return request<EarningsSummary>(`/api/investments/${id}/earnings`);
}

export interface EarningsSummary {
  planType:        string;
  dailyROI:        string;
  durationDays:    number;
  status:          string;
  autoCompound:    boolean;
  cyclesCompleted: number;
  totalGenerated:  string;
  totalCompounded: string;
  totalClaimed:    string;
  pendingClaimable: string;
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

export interface IncomeTransferRelease {
  id:         string;
  hourNumber: number;
  amount:     string;
  createdAt:  string;
}

export interface IncomeTransfer {
  id:                    string;
  totalAmount:           string;
  transferFee:           string | null;
  netAmount:             string | null;
  releasedAmount:        string;
  remainingAmount:       string;
  hourlySlice:           string;
  hoursCompleted:        number;
  hoursRemaining:        number;
  completionPercent:     number;
  status:                "ACTIVE" | "COMPLETED";
  nextReleaseAt:         string;
  estimatedCompletionAt: string | null;
  createdAt:             string;
  completedAt:           string | null;
  releases:              IncomeTransferRelease[];
}

export function transfer(amount: number) {
  return request<{
    transfer:                IncomeTransfer;
    incomeWalletBalance:     string;
    withdrawalWalletBalance: string;
  }>(
    "/api/wallets/transfer",
    { method: "POST", body: JSON.stringify({ amount }) },
  );
}

export function listTransfers(params?: { page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.page)  q.set("page",  String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q}` : "";
  return request<{ data: IncomeTransfer[]; meta: ListMeta }>(`/api/wallets/transfers${qs}`);
}

export interface ActiveStatus {
  isActive:         boolean;
  hasInvestment:    boolean;
  hasLeftReferral:  boolean;
  hasRightReferral: boolean;
  directLeftCount:  number;
  directRightCount: number;
}

export function getActiveStatus() {
  return request<ActiveStatus>("/api/users/active-status");
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
  wallet?: "DEPOSIT_WALLET" | "INCOME_WALLET" | "WITHDRAWAL_WALLET";
}) {
  const q = new URLSearchParams();
  if (params?.page)          q.set("page",   String(params.page));
  if (params?.limit)         q.set("limit",  String(params.limit));
  if (params?.type)          q.set("type",   params.type);
  if (params?.types?.length) q.set("types",  params.types.join(","));
  if (params?.wallet)        q.set("wallet", params.wallet);
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

export interface DepositWallet {
  id: string;
  network: string;
  walletAddress: string;
  qrUrl: string | null;
}

export function getDepositWallets(): Promise<DepositWallet[]> {
  return request<DepositWallet[]>("/api/deposits/wallets");
}

export type WithdrawalStatus =
  | "PENDING" | "VALIDATING" | "QUEUED" | "PROCESSING"
  | "SIGNED" | "BROADCASTING" | "BROADCAST_UNKNOWN" | "CONFIRMING"
  | "APPROVED" | "UNDER_REVIEW" | "MANUAL_REVIEW"
  | "COMPLETED" | "FAILED" | "REJECTED" | "CANCELLED";

export interface WithdrawalRequest {
  id:                    string;
  withdrawalId:          string | null;
  currency:              string;
  amount:                string;
  fee:                   string;
  netAmount:             string;
  walletAddress:         string;
  walletAddressSnapshot: string;
  network:               string;
  status:                WithdrawalStatus;
  failureReason:         string | null;
  rejectedReason:        string | null;
  adminNotes:            string | null;
  cancelledAt:           string | null;
  approvedAt:            string | null;
  processedAt:           string | null;
  completedAt:           string | null;
  txHash:                string | null;
  requestedAt:           string;
  createdAt:             string;
}

export interface WalletAddress {
  id:         string;
  network:    string;
  address:    string;
  label:      string | null;
  isVerified: boolean;
  isPrimary:  boolean;
  createdAt:  string;
}

export function listWalletAddresses(network?: string) {
  const q = network ? `?network=${network}` : "";
  return request<WalletAddress[]>(`/api/wallet-addresses${q}`);
}

export function addWalletAddress(data: { network: string; address: string; label?: string }) {
  return request<WalletAddress>("/api/wallet-addresses", {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export function deleteWalletAddress(id: string) {
  return request<{ id: string; deleted: boolean }>(`/api/wallet-addresses/${id}`, {
    method: "DELETE",
  });
}

export function setPrimaryWalletAddress(id: string) {
  return request<WalletAddress>(`/api/wallet-addresses/${id}/primary`, {
    method: "PUT",
  });
}

export interface WithdrawalSettings {
  holdMinutes: number;
  network: string;
  minimumAmount: string;
  maximumAmount: string;
  isEnabled: boolean;
}

export function getWithdrawalSettings() {
  return request<WithdrawalSettings>("/api/withdrawals/settings");
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

/* ── Financial Transparency ────────────────────────────────────────── */

export interface FinancialTransparencySchedule {
  nextRunAt: string;
  lastRunAt: string | null;
}

export interface FinancialTransparencyData {
  fetchedAt: string;
  schedule: {
    roi:            FinancialTransparencySchedule;
    binary:         FinancialTransparencySchedule;
    orbit:          FinancialTransparencySchedule;
    salary:         FinancialTransparencySchedule;
    incomeTransfer: { nextRunAt: string };
  };
  engineFlags: {
    roiEnabled:         boolean;
    binaryEnabled:      boolean;
    salaryEnabled:      boolean;
    levelIncomeEnabled: boolean;
  };
}

export function getFinancialTransparency() {
  return request<FinancialTransparencyData>("/api/financial-transparency");
}

/* ── Binary Matching & Orbit Summaries ────────────────────────────── */

export interface MatchingSummary {
  userId:              string;
  username:            string;
  directReferralCount: number;
  isQualified:         boolean;
  currentLeftBV:       string;
  currentRightBV:      string;
  pendingMatchBV:      string;
  pendingIncome:       string;
  allTime: {
    cycles:            number;
    matchedBV:         string;
    rewardedBV:        string;
    destroyedBV:       string;
    flushedBV:         string;
    carryForwardLeft:  string;
    carryForwardRight: string;
    incomeAmount:      string;
  };
}

export function getMatchingSummary() {
  return request<MatchingSummary>("/api/binary/matching-summary");
}

export interface OrbitSummary {
  userId:              string;
  username:            string;
  directReferralCount: number;
  isQualified:         boolean;
  currentLeftBV:       string;
  currentRightBV:      string;
  pendingRewardCount:  number;
  pendingIncome:       string;
  settings: {
    bvPerReward:        number;
    maxRewardsPerCycle: number;
    incomePerReward:    number;
    minReferrals:       number;
  };
  allTime: {
    cycles:      number;
    matchedBV:   string;
    flushedBV:   string;
    incomeAmount: string;
  };
}

export function getOrbitSummary() {
  return request<OrbitSummary>("/api/binary/orbit-summary");
}

/* ── Level Income Summary ─────────────────────────────────────────── */

export interface LevelIncomeBreakdownRow {
  level:        number;
  count:        number;
  incomeAmount: string;
  percentage:   number;
}

export interface LevelIncomeSummary {
  userId:       string;
  username:     string;
  totalIncome:  string;
  totalPayouts: number;
  breakdown:    LevelIncomeBreakdownRow[];
}

export function getLevelIncomeSummary() {
  return request<LevelIncomeSummary>("/api/level-income/summary");
}

/* ── Income Dashboard (aggregated) ────────────────────────────────── */

export interface IncomeDashboard {
  snapshot: {
    todayEarnings:     string;
    pendingThisCycle:  string;
    isQualifiedForAny: boolean;
    nextCreditAt:      string;
    salaryNextAt:      string;
    monthlySalary:     string;
    activeRanks:       string[];
    currentRank:       string | null;
    nextRank:          string | null;
    rankProgressPct:   number;
  };
  sources: {
    roi: {
      todayEarnings:    string;
      lifetimeEarnings: string;
      nextCreditAt:     string;
    };
    binary: {
      todayEarnings:       string;
      lifetimeEarnings:    string;
      isQualified:         boolean;
      estimatedNextPayout: string;
      nextCycleAt:         string;
    };
    orbit: {
      todayEarnings:       string;
      lifetimeEarnings:    string;
      isQualified:         boolean;
      estimatedNextPayout: string;
      nextCycleAt:         string;
    };
    salary: {
      todayEarnings:    string;
      lifetimeEarnings: string;
      monthlySalary:    string;
      activeRanks:      string[];
      nextSalaryAt:     string;
      isQualified:      boolean;
    };
    levelIncome: {
      todayEarnings:     string;
      thisMonthEarnings: string;
      lifetimeEarnings:  string;
      totalPayouts:      number;
    };
  };
  timeline: Array<{
    engine:          string;
    label:           string;
    scheduledAt:     string;
    estimatedAmount: string | null;
    isEstimated:     boolean;
    isQualified:     boolean | null;
  }>;
  recentIncome: Array<{
    id:          string;
    type:        string;
    amount:      string;
    createdAt:   string;
    description: string | null;
    status:      string;
  }>;
}

export function getIncomeDashboard() {
  return request<IncomeDashboard>("/api/income/dashboard");
}

/* ── Income Detail Types ──────────────────────────────────────────── */

export interface RoiDetail {
  nextCreditAt:         string;
  todayROI:             string;
  lifetimeROI:          string;
  claimableROI:         string;
  totalActivePrincipal: string;
  hasAutoCompound:      boolean;
  activeCount:          number;
  investments: Array<{
    id:          string;
    planType:    string;
    principal:   string;
    dailyROI:    string;
    durationDays: number;
    autoCompound: boolean;
    claimableROI: string;
    status:      string;
    startedAt:   string;
    maturesAt:   string;
  }>;
}

export interface BinaryDetail {
  isQualified:          boolean;
  directReferralCount:  number;
  nextCreditAt:         string;
  estimatedPayout:      string;
  currentLeftBV:        string;
  currentRightBV:       string;
  matchedBV:            string;
  carryForward:         string;
  todayEarnings:        string;
  lifetimeEarnings:     string;
  allTimeCycles:        number;
  allTimeIncome:        string;
  incomePerBV:          string;
  maxPayableBVPerCycle: string;
}

export interface OrbitDetail {
  isQualified:         boolean;
  directReferralCount: number;
  nextCreditAt:        string;
  estimatedReward:     string;
  pendingRewardCount:  number;
  currentLeftBV:       string;
  currentRightBV:      string;
  matchedBV:           string;
  rewardThreshold:     string;
  incomePerReward:     string;
  bvProgress:          string;
  bvRemaining:         string;
  todayEarnings:       string;
  lifetimeEarnings:    string;
  allTimeCycles:       number;
  allTimeIncome:       string;
}

export interface SalaryDetail {
  isQualified:       boolean;
  nextSalaryAt:      string;
  monthlySalary:     string;
  lifetimeSalary:    string;
  activeRanks:       string[];
  currentRank:       string | null;
  nextRank:          string | null;
  progressPct:       number;
  remainingBusiness: string;
  leftBusinessUSD:   string;
  rightBusinessUSD:  string;
  totalBusinessUSD:  string;
  todayEarnings:     string;
}

export interface LevelDetail {
  todayEarnings:       string;
  thisMonthEarnings:   string;
  lifetimeEarnings:    string;
  totalPayouts:        number;
  directReferralCount: number;
  breakdown: Array<{
    level:        number;
    count:        number;
    percentage:   number;
    incomeAmount: string;
  }>;
}

export function getRoiDetail()    { return request<RoiDetail>("/api/income/roi"); }
export function getBinaryDetail() { return request<BinaryDetail>("/api/income/binary"); }
export function getOrbitDetail()  { return request<OrbitDetail>("/api/income/orbit"); }
export function getSalaryDetail() { return request<SalaryDetail>("/api/income/salary"); }
export function getLevelDetail()  { return request<LevelDetail>("/api/income/level"); }

/* ── Admin Dashboard ──────────────────────────────────────────────── */

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
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
  phone: string | null;
  firstName: string;
  lastName: string;
  status: string;
  operationalStatus: "ACTIVE" | "INACTIVE";
  referralCode: string;
  directReferralCount: number;
  createdAt: string;
  wallet: {
    depositWallet: string;
    incomeWallet: string;
    withdrawalWallet: string;
    lockedWithdrawalBalance: string;
  } | null;
}

export interface AdminUserDetail {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  status: string;
  referralCode: string;
  directReferralCount: number;
  position: "LEFT" | "RIGHT" | null;
  leftBV: string;
  rightBV: string;
  walletAddress: string | null;
  telegramId: string | null;
  createdAt: string;
  updatedAt: string;
  wallet: {
    depositWallet: string;
    incomeWallet: string;
    withdrawalWallet: string;
    lockedWithdrawalBalance: string;
    updatedAt: string;
  } | null;
  sponsor: {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  directReferrals: Array<{
    id: string;
    username: string;
    email: string;
    createdAt: string;
    status: string;
  }>;
  binaryParent: {
    id: string;
    username: string;
    position: string;
  } | null;
  investments: Array<{
    id: string;
    planType: string;
    amount: string;
    status: string;
    dailyROI: string;
    claimableROI: string;
    startedAt: string | null;
    maturesAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  depositRequests: Array<{
    id: string;
    amount: string;
    network: string;
    status: string;
    txHash: string | null;
    approvedAt: string | null;
    createdAt: string;
  }>;
  withdrawalRequests: Array<{
    id: string;
    amount: string;
    network: string;
    status: string;
    walletAddressSnapshot: string;
    txHash: string | null;
    approvedAt: string | null;
    completedAt: string | null;
    rejectedReason: string | null;
    createdAt: string;
  }>;
  salaryAchievements: Array<{
    rankName: string;
    monthlyAmount: string;
    achievedAt: string;
    expiresAt: string | null;
    isActive: boolean;
  }>;
}

export function adminSearchUsers(params?: {
  page?: number; limit?: number; status?: string;
  username?: string; email?: string; phone?: string; referralCode?: string;
}) {
  const q = new URLSearchParams();
  if (params?.page)         q.set("page",         String(params.page));
  if (params?.limit)        q.set("limit",        String(params.limit));
  if (params?.status)       q.set("status",       params.status);
  if (params?.username)     q.set("username",     params.username);
  if (params?.email)        q.set("email",        params.email);
  if (params?.phone)        q.set("phone",        params.phone);
  if (params?.referralCode) q.set("referralCode", params.referralCode);
  return request<{ data: AdminUserListItem[]; meta: ListMeta }>(`/api/admin/users/search?${q}`);
}

export function getAdminUserDetail(id: string) {
  return request<AdminUserDetail>(`/api/admin/users/${id}`);
}

/* ── Admin — Impersonation ────────────────────────────────────────── */

export interface ImpersonationResponse {
  token: string;
  sessionId: string;
  user: {
    id:        string;
    email:     string;
    username:  string;
    firstName: string;
    lastName:  string;
  };
}

export function adminImpersonateUser(userId: string, reason?: string): Promise<ImpersonationResponse> {
  return request<ImpersonationResponse>(`/api/admin/users/${userId}/impersonate`, {
    method: "POST",
    body:   JSON.stringify({ reason }),
  });
}

export function adminSuspendUser(id: string) {
  return request<{ id: string; status: string }>(`/api/admin/users/${id}/suspend`, { method: "POST" });
}

export function adminActivateUser(id: string) {
  return request<{ id: string; status: string }>(`/api/admin/users/${id}/activate`, { method: "POST" });
}

export function adminBlockUser(id: string) {
  return request<{ id: string; status: string }>(`/api/admin/users/${id}/block`, { method: "POST" });
}

export interface AdminUpdateUserPayload {
  username?:  string;
  email?:     string;
  phone?:     string;
  firstName?: string;
  lastName?:  string;
}

export function adminUpdateUser(id: string, data: AdminUpdateUserPayload) {
  return request<{ id: string; username: string; email: string; phone: string | null; firstName: string; lastName: string }>(
    `/api/admin/users/${id}`,
    { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } },
  );
}

export function adminResetUserPassword(id: string, password: string) {
  return request<{ userId: string; username: string }>(
    `/api/admin/users/${id}/reset-password`,
    { method: "POST", body: JSON.stringify({ password }), headers: { "Content-Type": "application/json" } },
  );
}

export function adminDeleteUser(id: string) {
  return request<{ id: string; username: string }>(
    `/api/admin/users/${id}`,
    { method: "DELETE" },
  );
}

export interface RegisterPayload {
  email: string; username: string; password: string;
  firstName: string; lastName: string;
  phone?: string; referralCode?: string; binaryPlacement?: "LEFT" | "RIGHT";
}

export function registerUser(payload: RegisterPayload) {
  return request<{ token: string; user: StoredAuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
  directReferrals: number;
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
  id:                string;
  username:          string;
  firstName:         string;
  lastName:          string;
  status:            string;
  operationalStatus: "ACTIVE" | "INACTIVE";
  position:          "LEFT" | "RIGHT" | null;
  joinedAt:          string;
  directReferrals:   number;
  activeInvestments: number;
  investedAmount:    string;
  plans:             string[];
  isSponsored:       boolean;
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
  // Power BV — admin-assigned; included in all bonus engines (Sprint 34A)
  powerLeftBV:      string;
  powerRightBV:     string;
  // Effective BV = Organic + Power (what the bonus engines actually use)
  effectiveLeftBV:  string;
  effectiveRightBV: string;
  leftInvestments:  number;
  rightInvestments: number;
  leftWeeklyNew:    number;
  rightWeeklyNew:   number;
  powerLeg:         "LEFT" | "RIGHT";
  weakLeg:          "LEFT" | "RIGHT";
  carryForwardLeft:  string;
  carryForwardRight: string;
  directReferrals:  number;
  // Business ($) — sum of ACTIVE investment amounts per leg (Sprint 30D)
  totalBusiness:        string;
  leftBusiness:         string;
  rightBusiness:        string;
  leftInvestedMembers:  number;
  rightInvestedMembers: number;
  businessStrongLeg: "LEFT" | "RIGHT";
  businessWeakLeg:   "LEFT" | "RIGHT";
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

// Team Business (Sprint 30I) — cumulative APPROVED deposit volume per binary leg.
// Read-only reporting metric, sourced independently of BV/investment/wallet data.
export interface TeamBusiness {
  // Organic — sum of approved deposits in binary downline
  leftOrganicBusiness:  string;
  rightOrganicBusiness: string;
  totalOrganicBusiness: string;
  // Power Business — remaining Power BV × $100 (Sprint 34A.1)
  leftPowerBusiness:    string;
  rightPowerBusiness:   string;
  totalPowerBusiness:   string;
  leftPowerBV:          string;
  rightPowerBV:         string;
  // Combined totals (organic + power) — use these for all Team Business displays
  leftBusiness:  string;
  rightBusiness: string;
  totalBusiness: string;
}

export function getTeamBusiness() {
  return request<TeamBusiness>("/api/network/team-business");
}

/* ── Admin Power Business (Sprint 35) ─────────────────────────────────────── */

export interface PowerGlobalStats {
  totalActivePowerBV:             string;
  totalPowerBusiness:             string;
  totalMembersWithPowerBV:        number;
  totalPowerBVAssigned:           string;
  totalPowerBVAdminRemoved:       string;
  totalPowerBVConsumedByMatching: string;
  totalLedgerEntries:             number;
  todayAssignments:               number;
  last7DaysAssignments:           number;
}

export interface PowerLedgerEntry {
  id:            string;
  createdAt:     string;
  userId:        string;
  adminId:       string;
  side:          "LEFT" | "RIGHT";
  operation:     "ADD" | "REMOVE";
  bv:            string;
  balanceBefore: string;
  balanceAfter:  string;
  reason:        string;
  user:  { id: string; username: string; email: string; firstName: string | null; lastName: string | null };
  admin: { id: string; email: string; role: string; firstName: string | null; lastName: string | null };
}

export interface PowerGlobalLedgerResponse {
  records:    PowerLedgerEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PowerTopMember {
  id:           string;
  username:     string;
  email:        string;
  powerLeftBV:  string;
  powerRightBV: string;
  totalPowerBV: string;
}

export interface PowerGlobalAnalytics {
  topByPowerBV:         PowerTopMember[];
  largestAssignments:   (PowerLedgerEntry & { user: { id: string; username: string }; admin: { email: string } })[];
  dailyTrend:           { date: string; count: number; bv: string }[];
  todayAssignedBV:      string;
  todayAssignmentCount: number;
}

export interface PowerMemberSearchResult {
  id:            string;
  username:      string;
  email:         string;
  firstName:     string | null;
  lastName:      string | null;
  powerLeftBV:   string;
  powerRightBV:  string;
  totalPowerBV:  string;
  powerBusiness: string;
}

export interface AdminPowerSummary {
  userId:           string;
  username:         string;
  organicLeftBV:    string;
  organicRightBV:   string;
  powerLeftBV:      string;
  powerRightBV:     string;
  effectiveLeftBV:  string;
  effectiveRightBV: string;
}

export function getPowerGlobalStats() {
  return request<PowerGlobalStats>("/api/admin/power-bv/stats");
}

export function getPowerGlobalLedger(params: {
  page?: number; limit?: number; side?: string; operation?: string; search?: string;
} = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
  const q = qs.toString();
  return request<PowerGlobalLedgerResponse>(`/api/admin/power-bv/ledger${q ? `?${q}` : ""}`);
}

export function getPowerGlobalAnalytics() {
  return request<PowerGlobalAnalytics>("/api/admin/power-bv/analytics");
}

export function searchPowerMembers(q: string) {
  return request<PowerMemberSearchResult[]>(`/api/admin/power-bv/search?q=${encodeURIComponent(q)}`);
}

export function adminGetPowerSummary(userId: string) {
  return request<AdminPowerSummary>(`/api/admin/power-bv/${userId}`);
}

export function adminGetPowerLedger(userId: string, params: { page?: number; limit?: number; side?: string } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
  const q = qs.toString();
  return request<PowerGlobalLedgerResponse>(`/api/admin/power-bv/${userId}/ledger${q ? `?${q}` : ""}`);
}

export function adminAddPowerBV(userId: string, body: { side: "LEFT" | "RIGHT"; bv: number; reason: string }) {
  return request<{ userId: string }>(`/api/admin/power-bv/${userId}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function adminRemovePowerBV(userId: string, body: { side: "LEFT" | "RIGHT"; bv: number; reason: string }) {
  return request<{ userId: string }>(`/api/admin/power-bv/${userId}/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ── Admin Investments ─────────────────────────────────────────────────────── */

export type AdminInvStatus = "ACTIVE" | "MATURED" | "COMPLETED";
export type AdminPlanType  = "PLAN_90" | "PLAN_180" | "PLAN_270" | "PLAN_360";

export interface AdminInvestmentItem {
  id:                string;
  userId:            string;
  username:          string;
  firstName:         string;
  lastName:          string;
  email:             string;
  sponsorUsername:   string | null;
  planType:          AdminPlanType;
  amount:            string;
  currentPrincipal:  string;
  dailyROI:          string;
  durationDays:      number;
  autoCompound:      boolean;
  claimableROI:      string;
  claimablePrincipal: string;
  status:            AdminInvStatus;
  startedAt:         string;
  maturesAt:         string;
  completedAt:       string | null;
  createdAt:         string;
}

export interface AdminInvestmentStats {
  totalCount:        number;
  activeCount:       number;
  maturedCount:      number;
  completedCount:    number;
  totalCapital:      string;
  totalClaimableROI: string;
}

export interface AdminInvestmentPlanDist {
  planType: AdminPlanType;
  count:    number;
}

export interface AdminInvestmentListResponse {
  investments:      AdminInvestmentItem[];
  meta:             { total: number; page: number; limit: number; totalPages: number };
  stats:            AdminInvestmentStats;
  planDistribution: AdminInvestmentPlanDist[];
}

export function getAdminInvestments(params: {
  page?:      number;
  limit?:     number;
  status?:    AdminInvStatus;
  planType?:  AdminPlanType;
  search?:    string;
  sortBy?:    "createdAt" | "amount";
  sortOrder?: "asc" | "desc";
}) {
  const q = new URLSearchParams({
    page:  String(params.page  ?? 1),
    limit: String(params.limit ?? 20),
  });
  if (params.status)    q.set("status",    params.status);
  if (params.planType)  q.set("planType",  params.planType);
  if (params.search)    q.set("search",    params.search);
  if (params.sortBy)    q.set("sortBy",    params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return request<AdminInvestmentListResponse>(`/api/admin/investments?${q}`);
}

export function getAdminInvestment(id: string) {
  return request<AdminInvestmentItem & { updatedAt: string }>(`/api/admin/investments/${id}`);
}

/* ── Admin Withdrawals ─────────────────────────────────────────────────────── */

export type AdminWithdrawalStatus = WithdrawalStatus;

export function getAdminWithdrawalDisplayStatus(status: string): string {
  return ["VALIDATING", "QUEUED", "PROCESSING", "SIGNED", "BROADCASTING"].includes(status)
    ? "PROCESSING"
    : status;
}

export interface AdminWithdrawalUser {
  id:        string;
  username:  string;
  email:     string;
  firstName: string;
  lastName:  string;
  status:    string;
  sponsor:   { username: string } | null;
}

export interface AdminWithdrawalAdmin {
  id:        string;
  email:     string;
  firstName: string;
  lastName:  string;
}

export interface AdminWithdrawalItem {
  id:                    string;
  withdrawalId:          string | null;
  amount:                string;
  walletAddress:         string;
  walletAddressSnapshot: string;
  network:               string;
  status:                AdminWithdrawalStatus;
  adminNotes:            string | null;
  txHash:                string | null;
  signedAt:              string | null;
  broadcastAt:           string | null;
  rejectedReason:        string | null;
  approvedAt:            string | null;
  completedAt:           string | null;
  cancelledAt:           string | null;
  createdAt:             string;
  updatedAt:             string;
  user:                  AdminWithdrawalUser;
  approver:              AdminWithdrawalAdmin | null;
  completer:             AdminWithdrawalAdmin | null;
}

export interface AdminWithdrawalDetail extends AdminWithdrawalItem {
  user: AdminWithdrawalUser & {
    wallet: {
      depositWallet:           string;
      incomeWallet:            string;
      withdrawalWallet:        string;
      lockedWithdrawalBalance: string;
    } | null;
  };
  adminLogs: Array<{
    id:        string;
    action:    string;
    details:   Record<string, unknown>;
    createdAt: string;
    admin:     { email: string; firstName: string; lastName: string };
  }>;
  events: Array<{
    id: string;
    eventType: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export interface AdminWithdrawalStats {
  totalCount:          number;
  pendingCount:        number;
  pendingAmount:       string;
  approvedCount:       number;
  completedCount:      number;
  completedAmount:     string;
  rejectedCount:       number;
  cancelledCount:      number;
  approvedToday:       number;
  approvedTodayAmount: string;
  rejectedToday:       number;
  successRate:         string;
}

export interface AdminWithdrawalListResponse {
  withdrawals: AdminWithdrawalItem[];
  meta:        { total: number; page: number; limit: number; totalPages: number };
}

export function getAdminWithdrawals(params: {
  page?:      number;
  limit?:     number;
  status?:    AdminWithdrawalStatus;
  search?:    string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?:  string;
  dateTo?:    string;
  sortBy?:    "createdAt" | "amount" | "status";
  sortOrder?: "asc" | "desc";
}) {
  const q = new URLSearchParams({
    page:  String(params.page  ?? 1),
    limit: String(params.limit ?? 25),
  });
  if (params.status)               q.set("status",    params.status);
  if (params.search)               q.set("search",    params.search);
  if (params.minAmount !== undefined) q.set("minAmount", String(params.minAmount));
  if (params.maxAmount !== undefined) q.set("maxAmount", String(params.maxAmount));
  if (params.dateFrom)             q.set("dateFrom",  params.dateFrom);
  if (params.dateTo)               q.set("dateTo",    params.dateTo);
  if (params.sortBy)               q.set("sortBy",    params.sortBy);
  if (params.sortOrder)            q.set("sortOrder", params.sortOrder);
  return request<AdminWithdrawalListResponse>(`/api/admin/withdrawals?${q}`);
}

export function getAdminWithdrawalStats() {
  return request<AdminWithdrawalStats>("/api/admin/withdrawals/stats");
}

export function getAdminWithdrawalById(id: string) {
  return request<AdminWithdrawalDetail>(`/api/admin/withdrawals/${id}`);
}

export function adminCompleteWithdrawal(id: string, txHash: string, adminNotes?: string) {
  return request<{ withdrawalId: string; status: string; completedAt: string; txHash: string }>(
    `/api/admin/withdrawals/${id}/complete`,
    { method: "POST", body: JSON.stringify({ txHash, adminNotes }) },
  );
}

export function adminRejectWithdrawal(id: string, rejectedReason: string, adminNotes?: string) {
  return request<{ withdrawalId: string; status: string }>(
    `/api/admin/withdrawals/${id}/reject`,
    { method: "POST", body: JSON.stringify({ rejectedReason, adminNotes }) },
  );
}

export function adminRejectAndRefundBroadcastUnknown(id: string, rejectedReason: string) {
  return request<{
    withdrawalId: string;
    status: "REJECTED";
    alreadyReconciled: boolean;
    refundedAmount: string;
  }>(
    `/api/admin/withdrawals/${id}/reject-and-refund`,
    { method: "POST", body: JSON.stringify({ rejectedReason }) },
  );
}

export function adminMoveWithdrawalToManualReview(id: string, reason: string) {
  return request<{
    withdrawalId: string;
    status: "MANUAL_REVIEW";
    alreadyReconciled: boolean;
  }>(
    `/api/admin/withdrawals/${id}/move-to-manual-review`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function adminCorrectFalsePositiveWithdrawalStage(id: string, reason: string) {
  return request<{
    withdrawalId: string;
    status: "MANUAL_REVIEW";
    alreadyReconciled: boolean;
  }>(
    `/api/admin/withdrawals/${id}/correct-false-positive-stage`,
    {
      method: "POST",
      body: JSON.stringify({
        incidentId: "PW-WD-000130",
        evidenceConfirmed: true,
        reason,
      }),
    },
  );
}

export function adminUpdateWithdrawalNotes(id: string, adminNotes: string) {
  return request<{ withdrawalId: string; adminNotes: string }>(
    `/api/admin/withdrawals/${id}/notes`,
    { method: "PATCH", body: JSON.stringify({ adminNotes }) },
  );
}

export interface WithdrawalQueueItem {
  id:                    string;
  withdrawalId:          string | null;
  currency:              string;
  amount:                string;
  fee:                   string;
  netAmount:             string;
  network:               string;
  walletAddressSnapshot: string;
  status:                string;
  txHash:                string | null;
  signedAt:              string | null;
  broadcastAt:           string | null;
  requestedAt:           string;
  processedAt:           string | null;
  confirmationBlock:     number | null;
  confirmationCount:     number | null;
  failureReason:         string | null;
  explorerUrl:           string | null;
  createdAt:             string;
  user: { id: string; username: string; email: string; firstName: string; lastName: string };
}

export interface WithdrawalEvent {
  id:        string;
  eventType: string;
  details:   Record<string, unknown> | null;
  createdAt: string;
}

export function getWithdrawalEvents(withdrawalId: string) {
  return request<WithdrawalEvent[]>(`/api/admin/withdrawals/${withdrawalId}/events`);
}

export interface ProcessQueueResult {
  processed: number;
  failed:    number;
  errors:    string[];
}

export function getWithdrawalQueue() {
  return request<WithdrawalQueueItem[]>("/api/admin/withdrawals/queue");
}

export function triggerProcessQueue() {
  return request<ProcessQueueResult>("/api/admin/withdrawals/process-queue", { method: "POST" });
}

/* ── Withdrawal Engine & Operational Health (Sprint 31E) ──────────── */

export interface WithdrawalEngineStatus {
  enabled:     boolean;
  description: string;
}

export function getWithdrawalEngineStatus() {
  return request<WithdrawalEngineStatus>("/api/admin/withdrawals/engine");
}

export function setWithdrawalEngineStatus(enabled: boolean) {
  return request<WithdrawalEngineStatus>("/api/admin/withdrawals/engine", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export interface HotWalletStatus {
  configured:      boolean;
  address:         string | null;
  bnbBalance:      string | null;
  usdtBalance:     string | null;
  gasPriceGwei:    string | null;
  bnbSufficient:   boolean;
  usdtSufficient:  boolean;
  isSufficient:    boolean;
  minBnbRequired:  string;
  minUsdtRequired: string;
  alerts:          string[];
  checkedAt:       string;
}

export interface WithdrawalQueueStats {
  waiting:      number;
  eligible:     number;
  validating:   number;
  queued:       number;
  processing:   number;
  signed:       number;
  broadcasting: number;
  confirming:   number;
  manualReview: number;
  total:        number;
}

export interface OperationalHealthAlert {
  level:   "error" | "warning" | "info";
  code:    string;
  message: string;
}

export interface QueueWorkerStatus {
  started:             boolean;
  lockHeld:            boolean;
  pollIntervalSeconds: number;
  lastPollAt:          string | null;
  lastSuccessAt:       string | null;
}

export interface OperationalHealth {
  engine:        WithdrawalEngineStatus;
  hotWallet:     HotWalletStatus;
  queue:         WithdrawalQueueStats;
  worker:        QueueWorkerStatus;
  lastProcessed: { id: string; withdrawalId: string | null; amount: string; completedAt: string } | null;
  alerts:        OperationalHealthAlert[];
  snapshotAt:    string;
}

export function getOperationalHealth() {
  return request<OperationalHealth>("/api/admin/withdrawals/operational-health");
}

/* ── Admin Wallet Control Center ──────────────────────────────────── */

export type AdminUserStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "SUSPENDED";

export interface AdminWalletUser {
  id:           string;
  username:     string;
  email:        string;
  firstName:    string;
  lastName:     string;
  status:       AdminUserStatus;
  referralCode: string;
  sponsor:      { username: string } | null;
  investments:  Array<{ planType: AdminPlanType }>;
  transactions: Array<{ createdAt: string }>;
}

export interface AdminWalletItem {
  id:                      string;
  userId:                  string;
  depositWallet:           string;
  incomeWallet:            string;
  withdrawalWallet:        string;
  lockedWithdrawalBalance: string;
  updatedAt:               string;
  user:                    AdminWalletUser;
}

export interface AdminWalletListResponse {
  wallets: AdminWalletItem[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
}

export interface AdminWalletStats {
  totalDepositWallet:      string;
  totalIncomeWallet:       string;
  totalWithdrawalWallet:   string;
  totalLockedBalance:      string;
  totalPlatformValue:      string;
  avgWalletBalance:        string;
  totalWallets:            number;
  activeCount:             number;
  lockedCount:             number;
  frozenCount:             number;
  flaggedCount:            number;
  completedTransfersToday: number;
}

export interface AdminWalletTx {
  id:          string;
  type:        string;
  status:      string;
  amount:      string;
  fee:         string | null;
  netAmount:   string | null;
  description: string | null;
  metadata:    unknown;
  createdAt:   string;
}

export interface AdminWalletLog {
  id:        string;
  action:    string;
  details:   unknown;
  createdAt: string;
  admin: { email: string; firstName: string; lastName: string };
}

export interface AdminWalletDetail {
  wallet:          AdminWalletItem;
  transactions:    AdminWalletTx[];
  adminLogs:       AdminWalletLog[];
  adminNotes:      string;
  lastTx:          string;
  lifetimeCredits: string;
  lifetimeDebits:  string;
}

export function getAdminWallets(params: {
  page?:      number;
  limit?:     number;
  search?:    string;
  status?:    "ACTIVE" | "LOCKED" | "FROZEN" | "FLAGGED";
  sortBy?:    "depositWallet" | "incomeWallet" | "withdrawalWallet" | "updatedAt";
  sortOrder?: "asc" | "desc";
}) {
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 25) });
  if (params.search)    q.set("search",    params.search);
  if (params.status)    q.set("status",    params.status);
  if (params.sortBy)    q.set("sortBy",    params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return request<AdminWalletListResponse>(`/api/admin/wallets?${q}`);
}

export function getAdminWalletStats() {
  return request<AdminWalletStats>("/api/admin/wallets/stats");
}

export function getAdminWalletById(userId: string) {
  return request<AdminWalletDetail>(`/api/admin/wallets/${userId}`);
}

export function adminSaveWalletNotes(userId: string, notes: string) {
  return request<{ userId: string; username: string; notes: string }>(
    `/api/admin/wallets/${userId}/notes`,
    { method: "PATCH", body: JSON.stringify({ notes }) },
  );
}

export function adminWalletAdjustment(
  userId:     string,
  walletType: "DEPOSIT" | "INCOME" | "WITHDRAWAL",
  amount:     number,
  reason:     string,
) {
  return request<{ userId: string; walletType: string; adjustment: string; direction: string; reason: string }>(
    "/api/admin/wallet-adjustments",
    { method: "POST", body: JSON.stringify({ userId, walletType, amount, reason }) },
  );
}

export interface WalletCreditResult {
  userId:     string;
  username:   string;
  walletType: "depositWallet" | "incomeWallet" | "withdrawalWallet";
  amount:     string;
  reason:     string;
  creditedAt: string;
}

export function adminCreditUserWallet(
  userId:     string,
  walletType: "depositWallet" | "incomeWallet" | "withdrawalWallet",
  amount:     number,
  reason:     string,
  notes?:     string,
  idempotencyKey?: string,
) {
  const body: Record<string, unknown> = { userId, walletType, amount, reason };
  if (notes?.trim()) body.notes = notes.trim();
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return request<WalletCreditResult>("/api/admin/wallets/credit", {
    method: "POST",
    body:   JSON.stringify(body),
    headers,
  });
}

/* ── Admin — Deposit Center ───────────────────────────────────────── */

export type AdminDepositStatus = "PENDING" | "CONFIRMING" | "APPROVED" | "REJECTED";

export interface AdminDepositItem {
  id:             string;
  amount:         string;
  network:        "BEP20" | "ERC20" | "TRC20" | "SOL";
  txHash:         string;
  screenshotUrl:  string | null;
  companyWallet:  string;
  status:         AdminDepositStatus;
  approvedAt:     string | null;
  rejectedReason: string | null;
  createdAt:      string;
  user: {
    id:        string;
    username:  string;
    email:     string;
    firstName: string;
    lastName:  string;
  };
  approver: {
    id:        string;
    email:     string;
    firstName: string;
    lastName:  string;
  } | null;
}

export interface AdminDepositDetail extends AdminDepositItem {
  user: AdminDepositItem["user"] & {
    status:       string;
    referralCode: string;
    wallet: {
      depositWallet:    string;
      incomeWallet:     string;
      withdrawalWallet: string;
    } | null;
  };
}

export interface AdminDepositStats {
  pendingCount:        number;
  confirmingCount:     number;
  approvedToday:       number;
  rejectedToday:       number;
  totalApprovedAmount: string;
  avgDepositAmount:    string;
  largestDeposit:      string;
  pendingDepositValue: string;
}

export function adminGetDeposits(params?: {
  page?:      number;
  limit?:     number;
  status?:    AdminDepositStatus;
  network?:   string;
  search?:    string;
  sortBy?:    "createdAt" | "amount";
  sortOrder?: "asc" | "desc";
}) {
  const q = new URLSearchParams();
  if (params?.page)      q.set("page",      String(params.page));
  if (params?.limit)     q.set("limit",     String(params.limit));
  if (params?.status)    q.set("status",    params.status);
  if (params?.network)   q.set("network",   params.network);
  if (params?.search)    q.set("search",    params.search);
  if (params?.sortBy)    q.set("sortBy",    params.sortBy);
  if (params?.sortOrder) q.set("sortOrder", params.sortOrder);
  return request<{ data: AdminDepositItem[]; meta: ListMeta }>(`/api/admin/deposits?${q}`);
}

export function adminGetDepositStats() {
  return request<AdminDepositStats>("/api/admin/deposits/stats");
}

export function adminGetDepositById(id: string) {
  return request<AdminDepositDetail>(`/api/admin/deposits/${id}`);
}

export function adminApproveDeposit(id: string) {
  return request<{ depositId: string; status: string; approvedAt: string }>(
    `/api/admin/deposits/${id}/approve`,
    { method: "POST" },
  );
}

export function adminRejectDeposit(id: string, rejectedReason: string) {
  return request<{ depositId: string; status: string }>(
    `/api/admin/deposits/${id}/reject`,
    { method: "POST", body: JSON.stringify({ rejectedReason }) },
  );
}

export function adminMarkDepositConfirming(id: string) {
  return request<{ depositId: string; status: string }>(
    `/api/admin/deposits/${id}/mark-confirming`,
    { method: "POST" },
  );
}

/* ── Admin — Binary Network Control Center ────────────────────────── */

export type AdminBinaryStatus   = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type AdminBinaryRank     = "UNRANKED" | "STARTER" | "GROWTH" | "PRO" | "ELITE" | "PLATINUM" | "DIAMOND";
export type AdminBinaryPosition = "LEFT" | "RIGHT";

export interface AdminBinaryMatchEvent {
  id:          string;
  timestamp:   string;
  leftBV:      number;
  rightBV:     number;
  matched:     number;
  reward:      number;
  carryForward:number;
}

export interface AdminBinaryEvent {
  id:          string;
  type:        "JOIN" | "MATCH" | "RANK_UP" | "CARRY_RESET" | "BV_CREDIT" | "PLACEMENT";
  description: string;
  timestamp:   string;
  value?:      number;
}

export interface AdminBinaryWarning {
  id:       string;
  type:     "WEAK_LEFT" | "WEAK_RIGHT" | "INACTIVE_SPONSOR" | "NO_REFERRALS" | "HIGH_CARRY" | "LARGE_IMBALANCE";
  message:  string;
  severity: "warn" | "error";
}

export interface AdminBinaryAuditEntry {
  id:        string;
  timestamp: string;
  admin:     string;
  action:    string;
  detail:    string;
}

export interface AdminBinaryNode {
  id:                 string;
  memberId:           string;
  username:           string;
  firstName:          string;
  lastName:           string;
  sponsor:            string;
  sponsorUsername:    string;
  position:           AdminBinaryPosition;
  leftBV:             number;
  rightBV:            number;
  carryForward:       number;
  rank:               AdminBinaryRank;
  todayMatch:         number;
  weeklyMatch:        number;
  monthlyMatch:       number;
  lifetimeMatch:      number;
  status:             AdminBinaryStatus;
  plan:               string | null;
  directReferrals:    number;
  parentUsername:     string | null;
  leftChildUsername:  string | null;
  rightChildUsername: string | null;
  matchingHistory:    AdminBinaryMatchEvent[];
  recentEvents:       AdminBinaryEvent[];
  warnings:           AdminBinaryWarning[];
  auditLog:           AdminBinaryAuditEntry[];
  nextRank:           AdminBinaryRank | null;
  rankProgress:       number;
  rankRequirements:   { label: string; current: number; required: number }[];
  adminNotes?:        string;
}

export interface AdminBinaryListResponse {
  data: AdminBinaryNode[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminBinaryStats {
  totalMembers:   number;
  activeMembers:  number;
  totalLeftBV:    number;
  totalRightBV:   number;
  todayMatchedBV: number;
  todayRewards:   number;
  carryForwardBV: number;
  networkHealth:  number;
}

export function getAdminBinaryNetwork(params: {
  page?:      number;
  limit?:     number;
  search?:    string;
  status?:    AdminBinaryStatus;
  position?:  AdminBinaryPosition;
  rank?:      string;
  sortBy?:    "leftBV" | "rightBV" | "createdAt" | "directReferralCount";
  sortOrder?: "asc" | "desc";
}) {
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 20) });
  if (params.search)    q.set("search",    params.search);
  if (params.status)    q.set("status",    params.status);
  if (params.position)  q.set("position",  params.position);
  if (params.rank)      q.set("rank",      params.rank);
  if (params.sortBy)    q.set("sortBy",    params.sortBy);
  if (params.sortOrder) q.set("sortOrder", params.sortOrder);
  return request<AdminBinaryListResponse>(`/api/admin/binary/network?${q}`);
}

export function getAdminBinaryStats() {
  return request<AdminBinaryStats>("/api/admin/binary/stats");
}

export function getAdminBinaryDetail(userId: string) {
  return request<AdminBinaryNode>(`/api/admin/binary/${userId}`);
}

export function saveAdminBinaryNotes(userId: string, notes: string) {
  return request<{ userId: string; username: string; notes: string }>(
    `/api/admin/binary/${userId}/notes`,
    { method: "PATCH", body: JSON.stringify({ notes }) },
  );
}

export function adminTriggerMatching() {
  return request<{ triggered: boolean }>(
    "/api/admin/trigger/matching",
    { method: "POST" },
  );
}

export function adminTriggerOrbit() {
  return request<{ triggered: boolean }>(
    "/api/admin/trigger/orbit",
    { method: "POST" },
  );
}

/* ── Admin — Income Engine Control Center ────────────────────────── */

export type EngineId = "roi" | "binary" | "orbit" | "salary" | "level" | "release" | "notify";
export type EngineApiStatus = "RUNNING" | "IDLE" | "PAUSED" | "ERROR";

export interface EngineDashboard {
  todayTotal:      number;
  todayRoi:        number;
  todayBinary:     number;
  todayOrbit:      number;
  todayLevel:      number;
  todaySalary:     number;
  pendingReleases: number;
  activeEngines:   number;
  engineHealth:    number;
}

export interface EngineListItem {
  id:             EngineId;
  status:         EngineApiStatus;
  lastRun:        string | null;
  nextRun:        string | null;
  avgRuntime:     number;
  todayPayout:    number;
  weekPayout:     number;
  monthPayout:    number;
  beneficiaries:  number;
  successfulJobs: number;
  failedJobs:     number;
  adminNotes:     string;
  cpu:            number;
  memoryMB:       number;
  queueSize:      number;
  workers:        number;
  maxWorkers:     number;
  cronActive:     boolean;
  dbOk:           boolean;
}

export interface EngineRunRow {
  id:               string;
  startedAt:        string;
  completedAt:      string;
  duration:         number;
  membersProcessed: number;
  totalPaid:        number;
  status:           "SUCCESS" | "PARTIAL" | "FAILED";
}

export interface EnginePayoutRow {
  id:         string;
  username:   string;
  incomeType: string;
  amount:     number;
  timestamp:  string;
  status:     "PAID";
}

export interface EngineWarningRow {
  id:       string;
  type:     string;
  message:  string;
  severity: "warn" | "error";
}

export interface EngineAuditRow {
  id:        string;
  timestamp: string;
  admin:     string;
  action:    string;
  detail:    string;
}

export interface EngineDetail extends EngineListItem {
  runHistory:    EngineRunRow[];
  recentPayouts: EnginePayoutRow[];
  warnings:      EngineWarningRow[];
  auditLog:      EngineAuditRow[];
}

export interface ReleaseQueueItem {
  id:           string;
  username:     string;
  amount:       number;
  hoursElapsed: number;
  status:       "PROCESSING" | "COMPLETED" | "PENDING";
}

export function getEngineDashboard() {
  return request<EngineDashboard>("/api/admin/engine/dashboard");
}

export function getEngineList() {
  return request<{ engines: EngineListItem[] }>("/api/admin/engine/list");
}

export function getEngineDetail(engineId: EngineId) {
  return request<EngineDetail>(`/api/admin/engine/${engineId}/detail`);
}

export function saveEngineNotes(engineId: EngineId, notes: string) {
  return request<{ engineId: string; notes: string }>(
    `/api/admin/engine/${engineId}/notes`,
    { method: "PATCH", body: JSON.stringify({ notes }) },
  );
}

export function getEngineReleaseQueue() {
  return request<{ items: ReleaseQueueItem[] }>("/api/admin/engine/release-queue");
}

/* ── Admin — Plans & Compensation Configuration ───────────────────── */

export type PlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface PlanItem {
  id:           string;
  name:         string;
  color:        string;
  minInvest:    number;
  maxInvest:    number | null;
  roi:          number;
  duration:     number;
  autoCompound: boolean;
  status:       PlanStatus;
  members:      number;
  benefits:     string[];
  notes:        string;
  claimWindow:  string;
}

export interface PlanConfigField {
  key:          string;
  label:        string;
  value:        string;
  unit?:        string;
  type:         "text" | "number" | "toggle";
  description?: string;
}

export interface PlanConfigSections {
  roi:    PlanConfigField[];
  binary: PlanConfigField[];
  orbit:  PlanConfigField[];
  wallet: PlanConfigField[];
  limits: PlanConfigField[];
  global: PlanConfigField[];
}

export interface PlanVersionEntry {
  id:          string;
  version:     string;
  publishedBy: string;
  publishedAt: string;
  changeCount: number;
}

export interface PlanAuditEntry {
  id:         string;
  timestamp:  string;
  admin:      string;
  configName: string;
  oldValue:   string;
  newValue:   string;
  reason:     string;
}

export interface LevelConfigItem {
  level:         number;
  rate:          number;
  qualification: string;
  status:        "ACTIVE" | "INACTIVE";
}

export interface SalaryRankItem {
  id:                 string;
  rankName:           string;
  monthlySalary:      number;
  requiredBusiness:   number;
  durationMonths:     number;
  requiresDualDirects: boolean;
  allowSpill:         boolean;
  isActive:           boolean;
}

export function adminGetPlans() {
  return request<{ plans: PlanItem[] }>("/api/admin/plans");
}

export function adminCreatePlan(data: Omit<PlanItem, "id" | "members">) {
  return request<PlanItem>("/api/admin/plans", {
    method: "POST",
    body:   JSON.stringify(data),
  });
}

export function adminUpdatePlanStatus(id: string, status: PlanStatus) {
  return request<PlanItem>(`/api/admin/plans/${id}/status`, {
    method: "PATCH",
    body:   JSON.stringify({ status }),
  });
}

export function adminGetPlanConfig() {
  return request<PlanConfigSections>("/api/admin/plans/config");
}

export function adminSaveConfigField(
  key:      string,
  value:    string,
  oldValue: string,
  reason:   string,
  label:    string,
) {
  return request<{ key: string; value: string }>(
    `/api/admin/plans/config/${encodeURIComponent(key)}`,
    { method: "PATCH", body: JSON.stringify({ value, oldValue, reason, label }) },
  );
}

export function adminGetConfigVersions() {
  return request<{ versions: PlanVersionEntry[] }>("/api/admin/plans/versions");
}

export function adminGetConfigAudit() {
  return request<{ entries: PlanAuditEntry[] }>("/api/admin/plans/audit");
}

export function adminGetLevelConfig() {
  return request<{ levels: LevelConfigItem[] }>("/api/admin/plans/level-config");
}

export function adminSaveLevelConfig(levels: LevelConfigItem[]) {
  return request<{ levels: LevelConfigItem[] }>("/api/admin/plans/level-config", {
    method: "PUT",
    body:   JSON.stringify({ levels }),
  });
}

export function adminGetSalaryRanks() {
  return request<{ ranks: SalaryRankItem[] }>("/api/admin/plans/salary-ranks");
}

export function adminUpdatePlanConfig(
  id:   string,
  data: { roi?: number; minInvest?: number; maxInvest?: number | null },
) {
  return request<PlanItem>(`/api/admin/plans/${id}`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

export function adminUpdateSalaryRank(
  rankName: string,
  data:     { monthlySalary?: number; requiredBusiness?: number; requiresDualDirects?: boolean; isActive?: boolean },
) {
  return request<SalaryRankItem>(`/api/admin/plans/salary-ranks/${encodeURIComponent(rankName)}`, {
    method: "PATCH",
    body:   JSON.stringify(data),
  });
}

// ── Deposit Verification ──────────────────────────────────────────────────────

export type DepositVerificationStatus =
  | "CREATED" | "TX_SUBMITTED" | "VERIFYING" | "VERIFICATION_DELAYED"
  | "WAITING_CONFIRMATIONS" | "CONFIRMED" | "CREDITED" | "COMPLETED"
  | "FAILED" | "REJECTED" | "EXPIRED";

export interface DepositVerificationSubmitResult {
  verificationId: string;
  status:         DepositVerificationStatus;
  txHash:         string;
  network:        string;
  createdAt:      string;
  message:        string;
}

export interface DepositVerificationStatusResult {
  id:                    string;
  txHash:                string;
  network:               string;
  verificationStatus:    DepositVerificationStatus;
  confirmations:         number;
  requiredConfirmations: number;
  blockchainAmount:      string | null;
  senderAddress:         string | null;
  recipientAddress:      string | null;
  failureReason:         string | null;
  verificationAttempts:  number;
  firstSeenAt:           string | null;
  lastCheckedAt:         string | null;
  nextCheckAt:           string | null;
  confirmedAt:           string | null;
  creditedAt:            string | null;
  completedAt:           string | null;
  createdAt:             string;
  isTerminal:            boolean;
  isActive:              boolean;
}

export function submitDepositVerification(txHash: string, network: string) {
  return request<DepositVerificationSubmitResult>("/api/deposit-verifications/submit", {
    method: "POST",
    body:   JSON.stringify({ txHash, network }),
  });
}

export function getDepositVerificationStatus(id: string) {
  return request<DepositVerificationStatusResult>(`/api/deposit-verifications/${id}/status`);
}

// ── Admin Deposit Verifications ───────────────────────────────────────────────

export interface AdminDepositVerificationItem {
  id:                    string;
  txHash:                string;
  network:               string;
  verificationStatus:    DepositVerificationStatus;
  blockchainAmount:      string | null;
  confirmations:         number;
  requiredConfirmations: number;
  verificationAttempts:  number;
  failureReason:         string | null;
  senderAddress:         string | null;
  recipientAddress:      string | null;
  lastCheckedAt:         string | null;
  nextCheckAt:           string | null;
  confirmedAt:           string | null;
  creditedAt:            string | null;
  createdAt:             string;
  user: {
    id:        string;
    username:  string;
    email:     string;
    firstName: string | null;
    lastName:  string | null;
  };
}

export function adminListDepositVerifications(params?: {
  page?:    number;
  limit?:   number;
  status?:  string;
  network?: string;
  search?:  string;
}) {
  const q = new URLSearchParams();
  if (params?.page)    q.set("page",    String(params.page));
  if (params?.limit)   q.set("limit",   String(params.limit));
  if (params?.status)  q.set("status",  params.status);
  if (params?.network) q.set("network", params.network);
  if (params?.search)  q.set("search",  params.search);
  return request<{ data: AdminDepositVerificationItem[]; meta: ListMeta }>(`/api/admin/deposit-verifications?${q}`);
}

export function adminGetDepositVerification(id: string) {
  return request<AdminDepositVerificationItem>(`/api/admin/deposit-verifications/${id}`);
}

// ── User Deposit Verification History ────────────────────────────────────────

export interface DepositVerificationHistoryItem {
  id:                    string;
  depositId:             string | null;
  txHash:                string;
  network:               string;
  verificationStatus:    DepositVerificationStatus;
  blockchainAmount:      string | null;
  confirmations:         number;
  requiredConfirmations: number;
  senderAddress:         string | null;
  recipientAddress:      string | null;
  tokenContract:         string | null;
  failureReason:         string | null;
  verificationAttempts:  number;
  firstSeenAt:           string | null;
  lastCheckedAt:         string | null;
  nextCheckAt:           string | null;
  confirmedAt:           string | null;
  creditedAt:            string | null;
  completedAt:           string | null;
  createdAt:             string;
}

export function getUserDepositVerificationHistory(params?: { page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.page)  q.set("page",  String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  return request<{ data: DepositVerificationHistoryItem[]; meta: ListMeta }>(
    `/api/deposit-verifications/history?${q}`,
  );
}

export function adminRetryDepositVerification(id: string) {
  return request<{ id: string; verificationStatus: string; nextCheckAt: string; message: string }>(
    `/api/admin/deposit-verifications/${id}/retry`,
    { method: "POST" },
  );
}

export function adminManualApproveVerification(
  id:   string,
  data: { creditAmount: string; reason: string },
) {
  return request<{
    verificationId:   string;
    depositRequestId: string;
    status:           string;
    blockchainAmount: string | null;
    creditedAmount:   string;
    difference:       string | null;
    message:          string;
  }>(
    `/api/admin/deposit-verifications/${id}/manual-approve`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export function adminRevalidateDepositVerification(id: string) {
  return request<{ verificationId: string; previousStatus: string; newStatus: string; nextCheckAt: string; message: string }>(
    `/api/admin/deposit-verifications/${id}/re-validate`,
    { method: "POST" },
  );
}

export function adminRejectDepositVerification(id: string, data: { reason: string }) {
  return request<{ verificationId: string; status: string; reason: string; message: string }>(
    `/api/admin/deposit-verifications/${id}/reject`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export interface CompanyWallet {
  id: string;
  network: string;
  walletAddress: string;
  qrObjectPath: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  qrUrl: string | null;
}

export async function adminGetCompanyWallets(): Promise<CompanyWallet[]> {
  const res = await request<{ wallets: CompanyWallet[] }>("/api/admin/company-wallets");
  return res.wallets;
}

export async function adminUpdateCompanyWallet(id: string, data: { walletAddress: string }): Promise<CompanyWallet> {
  const res = await request<{ wallet: CompanyWallet }>(`/api/admin/company-wallets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.wallet;
}

export async function adminUploadCompanyWalletQr(file: File, walletAddress: string): Promise<string> {
  const form = new FormData();
  form.append("walletAddress", walletAddress);
  form.append("qrImage", file, file.name);
  try {
    const response = await request<{ objectPath: string }>("/api/admin/company-wallets/qr-upload", {
      method: "POST",
      body: form,
    });
    return response.objectPath;
  } catch (error) {
    if (
      error instanceof TypeError ||
      (error instanceof Error && /^(Load failed|Failed to fetch|NetworkError)$/i.test(error.message))
    ) {
      throw new Error("QR upload failed. Please try again.");
    }
    throw error;
  }
}

export function adminCreateCompanyWallet(data: {
  walletAddress: string;
  qrObjectPath: string;
}) {
  return request<{ wallet: CompanyWallet }>("/api/admin/company-wallets", {
    method: "POST",
    body: JSON.stringify(data),
  }).then((res) => res.wallet);
}

export function adminUpdateCompanyWalletProfile(
  id: string,
  data: { walletAddress?: string; qrObjectPath?: string },
) {
  return request<{ wallet: CompanyWallet }>(`/api/admin/company-wallets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then((res) => res.wallet);
}

export function adminActivateCompanyWallet(id: string) {
  return request<{ wallet: CompanyWallet }>(`/api/admin/company-wallets/${id}/activate`, {
    method: "POST",
  }).then((res) => res.wallet);
}

export function adminDeleteCompanyWallet(id: string) {
  return request<null>(`/api/admin/company-wallets/${id}`, { method: "DELETE" });
}

// ── Admin: Withdrawal Wallet Management (SUPER_ADMIN only) ───────────────────

export interface WalletChangeAuditLogEntry {
  id:             string;
  adminId:        string;
  adminUsername:  string;
  userId:         string;
  userUsername:   string;
  previousWallet: string | null;
  newWallet:      string;
  reason:         string;
  ipAddress:      string | null;
  createdAt:      string;
}

export async function adminUpdateUserWallet(
  userId: string,
  data:   { newWallet: string; reason: string },
): Promise<{ userId: string; username: string; previousWallet: string | null; newWallet: string }> {
  return request<{ userId: string; username: string; previousWallet: string | null; newWallet: string }>(
    `/api/admin/users/${userId}/wallet`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
}

export async function getWalletAuditLogs(userId: string): Promise<{ logs: WalletChangeAuditLogEntry[] }> {
  return request<{ logs: WalletChangeAuditLogEntry[] }>(`/api/admin/users/${userId}/wallet-audit`);
}

// ── Blockchain Gateway ────────────────────────────────────────────────────────

export interface BlockchainNetworkHealth {
  connected:        boolean;
  network:          string;
  chainId:          number;
  latestBlock:      number | null;
  hotWalletAddress: string | null;
  bnbBalance:       string | null;
  usdtBalance:      string | null;
  gasPriceGwei:     string | null;
  rpcLatencyMs:     number | null;
  dryRunMode:       boolean;
  checkedAt:        string;
  error?:           string;
}

export interface BlockchainHealth {
  configured: boolean;
  message?:   string;
  networks:   BlockchainNetworkHealth[];
}

export async function getBlockchainHealth(): Promise<BlockchainHealth> {
  return request<BlockchainHealth>("/api/admin/blockchain/health");
}

export interface BlockchainAddressValidation {
  address:    string;
  valid:      boolean;
  checksumOk: boolean;
  reason?:    string;
}

export async function blockchainValidateAddress(
  address: string,
  network = "BEP20",
): Promise<BlockchainAddressValidation> {
  return request<BlockchainAddressValidation>("/api/admin/blockchain/validate-address", {
    method: "POST",
    body: JSON.stringify({ address, network }),
  });
}

export interface BlockchainTokenBalance { raw: string; formatted: string; symbol: string }
export interface BlockchainBalanceResult {
  address: string;
  network: string;
  native:  BlockchainTokenBalance;
  token:   BlockchainTokenBalance;
}

export async function blockchainCheckBalance(
  address: string,
  network = "BEP20",
): Promise<BlockchainBalanceResult> {
  return request<BlockchainBalanceResult>("/api/admin/blockchain/check-balance", {
    method: "POST",
    body: JSON.stringify({ address, network }),
  });
}

export interface BlockchainGasEstimate {
  to:              string;
  amount:          string;
  network:         string;
  estimatedGas:    string;
  gasPriceGwei:    string;
  estimatedFeeBnb: string;
  estimatedFeeUsd: string;
}

export async function blockchainEstimateGas(
  to: string,
  amount: string,
  network = "BEP20",
): Promise<BlockchainGasEstimate> {
  return request<BlockchainGasEstimate>("/api/admin/blockchain/estimate-gas", {
    method: "POST",
    body: JSON.stringify({ to, amount, network }),
  });
}

export interface BlockchainSimulateResult {
  network:         string;
  from:            string;
  to:              string;
  tokenContract:   string;
  amount:          string;
  calldata:        string;
  estimatedGas:    string;
  gasPriceGwei:    string;
  estimatedFeeBnb: string;
  chainId:         number;
  nonce:           number;
  dryRun:          true;
}

export async function blockchainSimulate(
  to: string,
  amount: string,
  withdrawalId?: string,
  network = "BEP20",
): Promise<BlockchainSimulateResult> {
  return request<BlockchainSimulateResult>("/api/admin/blockchain/simulate", {
    method: "POST",
    body: JSON.stringify({ to, amount, withdrawalId, network }),
  });
}

// ─── Treasury & Integrity ──────────────────────────────────────────────────────

export interface TreasuryDashboard {
  health: {
    ledgerHealth:       string;
    openDiscrepancies:  number;
    lastScanAt:         string | null;
    lastReconcileAt:    string | null;
  };
  reconciliation: {
    status:             string;
    lastRunAt:          string | null;
    discrepancyCount:   number;
    isManual:           boolean;
  };
  walletTotals: {
    depositWallet:    string;
    incomeWallet:     string;
    withdrawalWallet: string;
    lockedBalance:    string;
  };
  ledger: {
    totalEntries:                number;
    totalDeposits:               string;
    totalInvestments:            string;
    totalWithdrawalsCompleted:   string;
    totalRoi:                    string;
    totalIncomeDistributed:      string;
    totalManualAdjustments:      string;
  };
}

export async function getTreasuryDashboard(): Promise<TreasuryDashboard> {
  return request<TreasuryDashboard>("/api/admin/treasury/dashboard");
}

export interface LedgerEntry {
  id:              string;
  createdAt:       string;
  memberId:        string;
  username:        string;
  transactionType: string;
  debitCredit:     "CREDIT" | "DEBIT";
  walletType:      string;
  amount:          string;
  openingBalance:  string;
  closingBalance:  string;
  referenceId:     string;
  referenceType:   string;
  withdrawalId:    string | null;
  investmentId:    string | null;
  blockchainTxHash: string | null;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  total:   number;
  page:    number;
  pages:   number;
}

export async function getLedgerEntries(params?: {
  page?: number;
  limit?: number;
  search?: string;
  transactionType?: string;
  walletType?: string;
  debitCredit?: string;
  from?: string;
  to?: string;
}): Promise<LedgerPage> {
  const q = new URLSearchParams();
  if (params?.page)            q.set("page",            String(params.page));
  if (params?.limit)           q.set("limit",           String(params.limit));
  if (params?.search)          q.set("search",          params.search);
  if (params?.transactionType) q.set("transactionType", params.transactionType);
  if (params?.walletType)      q.set("walletType",      params.walletType);
  if (params?.debitCredit)     q.set("debitCredit",     params.debitCredit);
  if (params?.from)            q.set("from",            params.from);
  if (params?.to)              q.set("to",              params.to);
  return request<LedgerPage>(`/api/admin/treasury/ledger?${q.toString()}`);
}

export interface ReconciliationReportRow {
  id:               string;
  runAt:            string;
  status:           string;
  discrepancyCount: number;
  isManual:         boolean;
  triggeredBy:      string | null;
}

export async function getReconciliationReports(): Promise<ReconciliationReportRow[]> {
  return request<ReconciliationReportRow[]>("/api/admin/treasury/reconciliation");
}

export async function triggerReconciliation(): Promise<{ discrepancyCount: number; status: string }> {
  return request<{ discrepancyCount: number; status: string }>("/api/admin/treasury/reconciliation/run", {
    method: "POST",
  });
}

export async function triggerIntegrityScan(): Promise<{ discrepancyCount: number; health: string }> {
  return request<{ discrepancyCount: number; health: string }>("/api/admin/treasury/integrity-scan", {
    method: "POST",
  });
}

export interface DiscrepancyRow {
  id:              string;
  type:            string;
  severity:        string;
  description:     string;
  status:          string;
  detectedAt:      string;
  resolvedAt:      string | null;
  resolvedBy:      string | null;
  resolutionNotes: string | null;
  referenceId:     string | null;
}

export async function getDiscrepancies(params?: { status?: string; severity?: string; type?: string }): Promise<DiscrepancyRow[]> {
  const q = new URLSearchParams();
  if (params?.status)   q.set("status",   params.status);
  if (params?.severity) q.set("severity", params.severity);
  if (params?.type)     q.set("type",     params.type);
  return request<DiscrepancyRow[]>(`/api/admin/treasury/discrepancies?${q.toString()}`);
}

// ── Admin Salary Management ───────────────────────────────────────────────────

export interface SalaryRunListItem {
  id:             string;
  month:          number;
  year:           number;
  status:         string;
  generatedCount: number;
  approvedCount:  number;
  paidCount:      number;
  failedCount:    number;
  totalAmount:    string;
  createdBy:      string | null;
  notes:          string | null;
  startedAt:      string;
  completedAt:    string | null;
  createdAt:      string;
}

export interface SalaryRunListResponse {
  data: SalaryRunListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SalaryRunAuditItem {
  id:          string;
  action:      string;
  performedBy: string | null;
  metadata:    unknown;
  createdAt:   string;
}

export interface SalaryRunDetail {
  run:     SalaryRunListItem;
  summary: unknown;
  audits:  SalaryRunAuditItem[];
}

export interface RunIncomeItem {
  id:            string;
  userId:        string;
  username:      string | null;
  rankName:      string;
  amount:        string;
  status:        string;
  approvedAt:    string | null;
  paidAt:        string | null;
  transactionId: string | null;
  createdAt:     string;
}

export interface RunIncomeListResponse {
  data: RunIncomeItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SalaryHistoryItem {
  id:            string;
  rankName:      string;
  month:         number;
  year:          number;
  amount:        string;
  status:        string;
  approvedAt:    string | null;
  paidAt:        string | null;
  transactionId: string | null;
  createdAt:     string;
}

export interface PayrollTotals {
  month:         number;
  year:          number;
  memberCount:   number;
  totalPayroll:  string;
  averageSalary: string;
  highestSalary: string;
  lowestSalary:  string;
  pendingCount:  number;
  approvedCount: number;
  paidCount:     number;
}

export async function adminListSalaryRuns(params?: {
  month?: number; year?: number; status?: string; page?: number; limit?: number;
}): Promise<SalaryRunListResponse> {
  const q = new URLSearchParams();
  if (params?.month  !== undefined) q.set("month",  String(params.month));
  if (params?.year   !== undefined) q.set("year",   String(params.year));
  if (params?.status)               q.set("status", params.status);
  if (params?.page   !== undefined) q.set("page",   String(params.page));
  if (params?.limit  !== undefined) q.set("limit",  String(params.limit));
  return request<SalaryRunListResponse>(`/api/admin/salary/runs?${q}`);
}

export async function adminGetSalaryRunDetail(runId: string): Promise<SalaryRunDetail> {
  return request<SalaryRunDetail>(`/api/admin/salary/runs/${runId}`);
}

export async function adminCreateSalaryRun(month: number, year: number, notes?: string): Promise<{ status: string; run: SalaryRunListItem }> {
  return request<{ status: string; run: SalaryRunListItem }>("/api/admin/salary/runs", {
    method: "POST",
    body: JSON.stringify({ month, year, notes }),
  });
}

export async function adminTriggerSalaryGeneration(runId: string): Promise<unknown> {
  return request<unknown>(`/api/admin/salary/runs/${runId}/generate`, { method: "POST" });
}

export async function adminTriggerSalaryApproval(runId: string): Promise<unknown> {
  return request<unknown>(`/api/admin/salary/runs/${runId}/approve`, { method: "POST" });
}

export async function adminTriggerSalaryPayout(runId: string): Promise<unknown> {
  return request<unknown>(`/api/admin/salary/runs/${runId}/pay`, { method: "POST" });
}

export async function adminFailSalaryRun(runId: string, reason?: string): Promise<unknown> {
  return request<unknown>(`/api/admin/salary/runs/${runId}/fail`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function adminListRunIncomes(runId: string, params?: {
  search?: string; status?: string; rank?: string; page?: number; limit?: number;
}): Promise<RunIncomeListResponse> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.rank)   q.set("rank",   params.rank);
  if (params?.page  !== undefined) q.set("page",  String(params.page));
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  return request<RunIncomeListResponse>(`/api/admin/salary/runs/${runId}/incomes?${q}`);
}

export async function adminRetryIncomePayment(incomeId: string): Promise<unknown> {
  return request<unknown>(`/api/admin/salary/incomes/${incomeId}/retry`, { method: "POST" });
}

export async function adminGetMemberSalaryHistory(userId: string): Promise<{ data: SalaryHistoryItem[] }> {
  return request<{ data: SalaryHistoryItem[] }>(`/api/admin/salary/members/${userId}/history`);
}

export async function adminSearchSalaryMembers(search: string, page?: number, limit?: number): Promise<{ data: { id: string; username: string }[] }> {
  const q = new URLSearchParams({ search });
  if (page  !== undefined) q.set("page",  String(page));
  if (limit !== undefined) q.set("limit", String(limit));
  return request<{ data: { id: string; username: string }[] }>(`/api/admin/salary/members/search?${q}`);
}

export async function adminGetPayrollTotals(month: number, year: number): Promise<PayrollTotals> {
  const q = new URLSearchParams({ month: String(month), year: String(year) });
  return request<PayrollTotals>(`/api/admin/salary/totals?${q}`);
}

export function adminSalaryExportSummaryUrl(month: number, year: number): string {
  const q = new URLSearchParams({ month: String(month), year: String(year) });
  return `/api/admin/salary/export/summary?${q}`;
}

export function adminSalaryExportDetailUrl(month: number, year: number): string {
  const q = new URLSearchParams({ month: String(month), year: String(year) });
  return `/api/admin/salary/export/detail?${q}`;
}

export function adminSalaryExportMemberHistoryUrl(userId: string): string {
  return `/api/admin/salary/export/member-history?userId=${encodeURIComponent(userId)}`;
}

export function adminSalaryExportRankDistributionUrl(month: number, year: number): string {
  const q = new URLSearchParams({ month: String(month), year: String(year) });
  return `/api/admin/salary/export/rank-distribution?${q}`;
}

export async function updateDiscrepancy(
  id: string,
  status: "UNDER_REVIEW" | "RESOLVED",
  notes?: string,
): Promise<DiscrepancyRow> {
  return request<DiscrepancyRow>(`/api/admin/treasury/discrepancies/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, resolutionNotes: notes }),
  });
}

/* ── Withdrawal Hold ──────────────────────────────────────────────── */

export interface WithdrawalHoldStatus {
  userId:               string;
  username:             string;
  withdrawalHold:       boolean;
  withdrawalHoldReason: string | null;
  withdrawalHoldBy:     string | null;
  withdrawalHoldAt:     string | null;
  auditHistory: Array<{
    id:        string;
    action:    string;
    createdAt: string;
    details:   Record<string, unknown>;
    admin:     { id: string; email: string; firstName: string; lastName: string } | null;
  }>;
}

export function getWithdrawalHoldStatus(userId: string): Promise<WithdrawalHoldStatus> {
  return request<WithdrawalHoldStatus>(`/api/admin/users/${userId}/withdrawal-hold`);
}

export function setWithdrawalHoldFlag(
  userId: string,
  body:   { hold: boolean; reason: string },
): Promise<Omit<WithdrawalHoldStatus, "auditHistory">> {
  return request<Omit<WithdrawalHoldStatus, "auditHistory">>(`/api/admin/users/${userId}/withdrawal-hold`, {
    method: "POST",
    body:   JSON.stringify(body),
  });
}
