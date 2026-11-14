import { useState, useEffect, useCallback, useRef } from "react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getFinancialTransparency,
  listInvestments,
  getInvestmentEarnings,
  getMatchingSummary,
  getOrbitSummary,
  getSalaryQualifications,
  getSalarySummary,
  getLevelIncomeSummary,
  getDepositHistory,
  getWithdrawalHistory,
  type FinancialTransparencyData,
  type ApiInvestment,
  type EarningsSummary,
  type MatchingSummary,
  type OrbitSummary,
  type SalaryQualificationSummary,
  type SalarySummaryData,
  type LevelIncomeSummary,
  type DepositRequest,
  type WithdrawalRequest,
  type ListMeta,
} from "@/lib/api";
import {
  RefreshCw,
  TrendingUp,
  GitMerge,
  CircleDollarSign,
  Users,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Info,
} from "lucide-react";

// ── Color tokens ──────────────────────────────────────────────────────────────
const GOLD    = "#D4AF37";
const NAVY    = "hsl(var(--card))";
const BORDER  = "rgba(212, 175, 55, 0.15)";
const BORDER2 = "rgba(255, 255, 255, 0.06)";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: string | number | undefined | null, decimals = 2): string {
  const v = parseFloat(String(n ?? "0"));
  return isNaN(v) ? "0.00" : v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function countdown(target: string | null | undefined): string {
  if (!target) return "—";
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "Due now";
  const totalS = Math.floor(ms / 1_000);
  const h = Math.floor(totalS / 3_600);
  const m = Math.floor((totalS % 3_600) / 60);
  const s = totalS % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusBadge(ok: boolean, yesLabel = "Active", noLabel = "Inactive") {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        padding: "2px 8px",
        borderRadius: 20,
        background: ok ? "rgba(52,211,153,0.12)" : "rgba(156,163,175,0.12)",
        color: ok ? "#34d399" : "#9ca3af",
        border: `1px solid ${ok ? "rgba(52,211,153,0.3)" : "rgba(156,163,175,0.2)"}`,
      }}
    >
      {ok ? yesLabel : noLabel}
    </span>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  engineEnabled = true,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  children: React.ReactNode;
  engineEnabled?: boolean;
}) {
  return (
    <div
      style={{
        background: NAVY,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 20px 14px",
          borderBottom: `1px solid ${BORDER2}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(212,175,55,0.04)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(212,175,55,0.10)",
            border: `1px solid rgba(212,175,55,0.20)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon style={{ width: 18, height: 18, color: GOLD }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "hsl(var(--foreground))" }}>
              {title}
            </span>
            {!engineEnabled && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 20,
                  background: "rgba(239,68,68,0.12)",
                  color: "#f87171",
                  border: "1px solid rgba(239,68,68,0.25)",
                  letterSpacing: "0.05em",
                }}
              >
                ENGINE PAUSED
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 1 }}>
            {description}
          </p>
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: "18px 20px" }}>{children}</div>
    </div>
  );
}

function DataRow({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${BORDER2}`,
      }}
    >
      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: highlight ? 600 : 400,
            color: highlight ? GOLD : "hsl(var(--foreground))",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function NextRunBox({
  nextRunAt,
  lastRunAt,
  tick,
}: {
  nextRunAt: string;
  lastRunAt: string | null;
  tick: number;
}) {
  return (
    <div
      style={{
        background: "rgba(212,175,55,0.06)",
        border: `1px solid rgba(212,175,55,0.18)`,
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 16,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>
          NEXT RUN
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>
          {countdown(nextRunAt)}
        </div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
          {fmtDate(nextRunAt)}
        </div>
        {/* suppress "tick" unused warning */}
        <span style={{ display: "none" }}>{tick}</span>
      </div>
      {lastRunAt && (
        <div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>
            LAST RUN
          </div>
          <div style={{ fontSize: 13, color: "hsl(var(--foreground))" }}>
            {fmtDate(lastRunAt)}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.18)",
        marginTop: 12,
      }}
    >
      <Info style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0, marginTop: 1 }} />
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
        {children}
      </p>
    </div>
  );
}

function LoadingSection() {
  return (
    <div style={{ padding: "24px 0", display: "flex", justifyContent: "center" }}>
      <Loader2 style={{ width: 20, height: 20, color: GOLD, animation: "spin 1s linear infinite" }} />
    </div>
  );
}

function ErrorSection({ msg }: { msg: string }) {
  return (
    <div style={{ padding: "12px 0", display: "flex", gap: 8, alignItems: "center" }}>
      <XCircle style={{ width: 16, height: 16, color: "#f87171" }} />
      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{msg}</span>
    </div>
  );
}

// ── Deposit/Withdrawal status pill ────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    APPROVED:    { bg: "rgba(52,211,153,0.12)",  color: "#34d399", border: "rgba(52,211,153,0.3)" },
    COMPLETED:   { bg: "rgba(52,211,153,0.12)",  color: "#34d399", border: "rgba(52,211,153,0.3)" },
    PENDING:     { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24", border: "rgba(251,191,36,0.3)" },
    REJECTED:    { bg: "rgba(239,68,68,0.12)",   color: "#f87171", border: "rgba(239,68,68,0.3)" },
    CANCELLED:   { bg: "rgba(156,163,175,0.12)", color: "#9ca3af", border: "rgba(156,163,175,0.2)" },
  };
  const style = map[status] ?? map["PENDING"];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20, ...style, border: `1px solid ${style.border}` }}>
      {status}
    </span>
  );
}

// ── Page state type ───────────────────────────────────────────────────────────
interface PageData {
  transparency:    FinancialTransparencyData | null;
  investments:     ApiInvestment[];
  earnings:        EarningsSummary | null;
  matching:        MatchingSummary | null;
  orbit:           OrbitSummary | null;
  salaryQuals:     SalaryQualificationSummary | null;
  salarySummary:   SalarySummaryData | null;
  levelIncome:     LevelIncomeSummary | null;
  deposits:        DepositRequest[];
  depositMeta:     ListMeta | null;
  withdrawals:     WithdrawalRequest[];
  withdrawalMeta:  ListMeta | null;
  errors:          Record<string, string>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FinancialTransparencyPage() {
  const notifCount = 0;
  const [data, setData]       = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [tick, setTick]       = useState(0); // forces countdown re-render
  const intervalRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRefreshRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown tick
  useEffect(() => {
    intervalRef.current = setInterval(() => setTick(t => t + 1), 1_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const fetchAll = useCallback(async () => {
    const errors: Record<string, string> = {};

    const safe = async <T,>(key: string, fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); }
      catch (e) { errors[key] = e instanceof Error ? e.message : "Failed to load"; return null; }
    };

    const [
      transparencyRes,
      investmentsRes,
      matchingRes,
      orbitRes,
      salaryQualsRes,
      salarySummaryRes,
      levelIncomeRes,
      depositsRes,
      withdrawalsRes,
    ] = await Promise.all([
      safe("transparency",  () => getFinancialTransparency()),
      safe("investments",   () => listInvestments({ status: "ACTIVE", limit: 1 })),
      safe("matching",      () => getMatchingSummary()),
      safe("orbit",         () => getOrbitSummary()),
      safe("salaryQuals",   () => getSalaryQualifications()),
      safe("salarySummary", () => getSalarySummary()),
      safe("levelIncome",   () => getLevelIncomeSummary()),
      safe("deposits",      () => getDepositHistory({ limit: 5 })),
      safe("withdrawals",   () => getWithdrawalHistory({ limit: 5 })),
    ]);

    const activeInvestment = investmentsRes?.data?.[0] ?? null;
    let earningsRes: EarningsSummary | null = null;
    if (activeInvestment) {
      earningsRes = await safe("earnings", () => getInvestmentEarnings(activeInvestment.id));
    }

    setData({
      transparency:   transparencyRes,
      investments:    investmentsRes?.data ?? [],
      earnings:       earningsRes,
      matching:       matchingRes,
      orbit:          orbitRes,
      salaryQuals:    salaryQualsRes,
      salarySummary:  salarySummaryRes,
      levelIncome:    levelIncomeRes,
      deposits:       depositsRes?.data ?? [],
      depositMeta:    depositsRes?.meta ?? null,
      withdrawals:    withdrawalsRes?.data ?? [],
      withdrawalMeta: withdrawalsRes?.meta ?? null,
      errors,
    });
    setLastFetched(new Date());
  }, []);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    await fetchAll();
    setLoading(false);
  }, [fetchAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // Initial load
  useEffect(() => { void initialLoad(); }, [initialLoad]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => void fetchAll(), 60_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [fetchAll]);

  const flags = data?.transparency?.engineFlags;
  const sched = data?.transparency?.schedule;
  const activeInv = data?.investments?.[0] ?? null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout pageTitle="Financial Transparency" notificationCount={notifCount}>
      <PageContainer>
        {/* ── Page Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0 }}>
              Financial Transparency Center
            </h1>
            <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
              Read-only view of every financial process — schedules, balances, and credits.
            </p>
            {lastFetched && (
              <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                Last updated: {fmtDate(lastFetched.toISOString())} · Auto-refreshes every 60s
              </p>
            )}
          </div>
          <button
            onClick={() => void handleRefresh()}
            disabled={loading || refreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              background: "rgba(212,175,55,0.08)",
              color: GOLD,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || refreshing ? "not-allowed" : "pointer",
              opacity: loading || refreshing ? 0.6 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <RefreshCw
              style={{
                width: 14, height: 14,
                animation: refreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
            <Loader2 style={{ width: 32, height: 32, color: GOLD, animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ── Engine Status Overview ── */}
            <div
              style={{
                background: NAVY,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: "16px 20px",
                display: "flex",
                flexWrap: "wrap",
                gap: 20,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 8, fontWeight: 600, letterSpacing: "0.05em" }}>
                  ENGINE STATUS
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {[
                    { label: "ROI",          ok: flags?.roiEnabled ?? true },
                    { label: "Binary",       ok: flags?.binaryEnabled ?? true },
                    { label: "Salary",       ok: flags?.salaryEnabled ?? true },
                    { label: "Level Income", ok: flags?.levelIncomeEnabled ?? true },
                    { label: "Orbit",        ok: flags?.binaryEnabled ?? true },
                    { label: "Transfers",    ok: true },
                  ].map(({ label, ok }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? "#34d399" : "#6b7280", display: "inline-block" }} />
                      <span style={{ fontSize: 12, color: ok ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 1. ROI Engine ── */}
            <SectionCard
              icon={TrendingUp}
              title="ROI Engine"
              description="Accrues daily return on all active investments every 12 hours (00:00 & 12:00 London time)."
              engineEnabled={flags?.roiEnabled}
            >
              {data?.errors?.transparency ? (
                <ErrorSection msg={data.errors.transparency} />
              ) : sched?.roi ? (
                <NextRunBox nextRunAt={sched.roi.nextRunAt} lastRunAt={sched.roi.lastRunAt} tick={tick} />
              ) : null}

              {data?.errors?.investments ? (
                <ErrorSection msg={data.errors.investments} />
              ) : activeInv ? (
                <>
                  <div style={{ marginBottom: 8 }}>
                    {statusBadge(true, "Investment Active")}
                  </div>
                  <DataRow label="Plan" value={activeInv.planType.replace("_", " ")} />
                  <DataRow label="Invested Amount" value={`$${fmt(activeInv.amount)}`} />
                  <DataRow label="Daily ROI Rate" value={`${fmt(activeInv.dailyROI, 4)}%`} />
                  <DataRow label="Investment Duration" value={activeInv.durationDays === null ? "No fixed maturity" : `${activeInv.durationDays} days`} />
                  <DataRow label="Started" value={fmtDate(activeInv.startedAt)} />
                  <DataRow label="Matures" value={activeInv.maturesAt ? fmtDate(activeInv.maturesAt) : "No fixed maturity"} />
                  {earningsData(data)}
                  <DataRow
                    label="Claimable ROI Now"
                    value={`$${fmt(activeInv.claimableROI)}`}
                    highlight
                  />
                  <DataRow label="Auto-Compound" value={activeInv.autoCompound ? "Yes" : "No"} />
                  <InfoNote>
                    ROI is credited to your income wallet every 12 hours. If auto-compound is enabled,
                    claimable ROI is re-invested to grow your principal.
                  </InfoNote>
                </>
              ) : (
                <>
                  {statusBadge(false, "Active", "No Investment")}
                  <InfoNote>
                    You have no active investment. Deposit funds and create an investment to start
                    earning ROI every 12 hours.
                  </InfoNote>
                </>
              )}
            </SectionCard>

            {/* ── 2. Binary Matching ── */}
            <SectionCard
              icon={GitMerge}
              title="Binary Matching Income"
              description="Matches your weaker leg BV against your stronger leg every 12 hours and pays a percentage as income."
              engineEnabled={flags?.binaryEnabled}
            >
              {sched?.binary && (
                <NextRunBox nextRunAt={sched.binary.nextRunAt} lastRunAt={sched.binary.lastRunAt} tick={tick} />
              )}
              {data?.errors?.matching ? (
                <ErrorSection msg={data.errors.matching} />
              ) : data?.matching ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    {statusBadge(data.matching.isQualified, "Qualified", "Not Qualified")}
                  </div>
                  <DataRow label="Direct Referrals" value={data.matching.directReferralCount} />
                  <DataRow label="Left Leg BV" value={`$${fmt(data.matching.currentLeftBV)}`} />
                  <DataRow label="Right Leg BV" value={`$${fmt(data.matching.currentRightBV)}`} />
                  <DataRow label="Weaker Leg (Matchable BV)" value={`$${fmt(data.matching.pendingMatchBV)}`} />
                  <DataRow label="Est. Income This Cycle" value={`$${fmt(data.matching.pendingIncome)}`} highlight />
                  <DataRow label="All-Time Cycles Run" value={data.matching.allTime.cycles} />
                  <DataRow label="All-Time Income" value={`$${fmt(data.matching.allTime.incomeAmount)}`} />
                  {!data.matching.isQualified && (
                    <InfoNote>
                      To qualify for binary matching you need at least 2 direct referrals with active
                      investments on each leg. Matching income is calculated on the weaker leg BV and
                      paid to your income wallet.
                    </InfoNote>
                  )}
                  {data.matching.isQualified && (
                    <InfoNote>
                      Your weaker leg will be matched at the next 12-hour cycle. Unmatched BV carry-forwards
                      to the next cycle. Flushed BV is excess that exceeds the per-cycle cap.
                    </InfoNote>
                  )}
                </>
              ) : <LoadingSection />}
            </SectionCard>

            {/* ── 3. Binary Orbit ── */}
            <SectionCard
              icon={Layers}
              title="Binary Orbit Income"
              description="Rewards qualified members in fixed increments of $1 per orbit unit of BV matched, every 12 hours."
              engineEnabled={flags?.binaryEnabled}
            >
              {sched?.orbit && (
                <NextRunBox nextRunAt={sched.orbit.nextRunAt} lastRunAt={sched.orbit.lastRunAt} tick={tick} />
              )}
              {data?.errors?.orbit ? (
                <ErrorSection msg={data.errors.orbit} />
              ) : data?.orbit ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    {statusBadge(data.orbit.isQualified, "Qualified", "Not Qualified")}
                  </div>
                  <DataRow label="Direct Referrals" value={data.orbit.directReferralCount} />
                  <DataRow label="Left Leg BV" value={`$${fmt(data.orbit.currentLeftBV)}`} />
                  <DataRow label="Right Leg BV" value={`$${fmt(data.orbit.currentRightBV)}`} />
                  <DataRow label="BV Per Orbit Reward" value={`$${fmt(data.orbit.settings.bvPerReward)}`} />
                  <DataRow label="Income Per Orbit Reward" value={`$${fmt(data.orbit.settings.incomePerReward)}`} />
                  <DataRow label="Max Rewards Per Cycle" value={data.orbit.settings.maxRewardsPerCycle} />
                  <DataRow label="Pending Reward Units" value={data.orbit.pendingRewardCount} />
                  <DataRow label="Est. Orbit Income This Cycle" value={`$${fmt(data.orbit.pendingIncome)}`} highlight />
                  <DataRow label="All-Time Cycles" value={data.orbit.allTime.cycles} />
                  <DataRow label="All-Time Orbit Income" value={`$${fmt(data.orbit.allTime.incomeAmount)}`} />
                  <InfoNote>
                    Orbit income rewards every {fmt(data.orbit.settings.bvPerReward)} BV matched with{" "}
                    ${fmt(data.orbit.settings.incomePerReward)} per unit, capped at{" "}
                    {data.orbit.settings.maxRewardsPerCycle} rewards per cycle.
                  </InfoNote>
                </>
              ) : <LoadingSection />}
            </SectionCard>

            {/* ── 4. Salary Engine ── */}
            <SectionCard
              icon={CircleDollarSign}
              title="Monthly Salary"
              description="Pays qualified ranked members a fixed monthly salary on the 1st of each month at midnight London time."
              engineEnabled={flags?.salaryEnabled}
            >
              {sched?.salary && (
                <NextRunBox nextRunAt={sched.salary.nextRunAt} lastRunAt={sched.salary.lastRunAt} tick={tick} />
              )}
              {data?.errors?.salarySummary ? (
                <ErrorSection msg={data.errors.salarySummary} />
              ) : data?.salarySummary ? (
                <>
                  <DataRow label="Active Monthly Salary" value={`$${fmt(data.salarySummary.activeMonthlySalary)}`} highlight />
                  <DataRow label="Active Salary Ranks" value={data.salarySummary.activeRanks.join(", ") || "None"} />
                  <DataRow label="Lifetime Salary Earned" value={`$${fmt(data.salarySummary.lifetimeSalaryIncome)}`} />
                  {data.salarySummary.activeAchievements.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 8, fontWeight: 600 }}>
                        ACTIVE SALARY ACHIEVEMENTS
                      </div>
                      {data.salarySummary.activeAchievements.map(a => (
                        <div key={a.rankName} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER2}` }}>
                          <span style={{ fontSize: 13, color: "hsl(var(--foreground))" }}>{a.rankName}</span>
                          <span style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>${fmt(a.monthlyAmount)}/mo</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : <LoadingSection />}

              {data?.salaryQuals && (
                <>
                  <div style={{ height: 16 }} />
                  <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginBottom: 8, fontWeight: 600 }}>
                    RANK QUALIFICATION PROGRESS
                  </div>
                  <DataRow label="Total Business Volume" value={`$${fmt(data.salaryQuals.totalBusinessUSD)}`} />
                  <DataRow label="Left Business" value={`$${fmt(data.salaryQuals.leftBusinessUSD)}`} />
                  <DataRow label="Right Business" value={`$${fmt(data.salaryQuals.rightBusinessUSD)}`} />
                  {data.salaryQuals.nextRank && (
                    <>
                      <DataRow label="Next Rank" value={data.salaryQuals.nextRank} />
                      <DataRow label="Required Business" value={`$${fmt(data.salaryQuals.nextRequiredBusiness)}`} />
                      <DataRow label="Remaining" value={`$${fmt(data.salaryQuals.remaining)}`} />
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Progress to {data.salaryQuals.nextRank}</span>
                          <span style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{data.salaryQuals.progressPct.toFixed(1)}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(data.salaryQuals.progressPct, 100)}%`, background: GOLD, borderRadius: 99, transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    </>
                  )}
                  <InfoNote>
                    Salary is credited once per month on the 1st at midnight London time. Each qualifying
                    rank grants a fixed monthly salary as long as you maintain the required business volume.
                  </InfoNote>
                </>
              )}
            </SectionCard>

            {/* ── 5. Level Income ── */}
            <SectionCard
              icon={Users}
              title="Level Income"
              description="Credited instantly when anyone in your downline (up to configured levels) makes an investment. No schedule — fires in real-time."
              engineEnabled={flags?.levelIncomeEnabled}
            >
              {data?.errors?.levelIncome ? (
                <ErrorSection msg={data.errors.levelIncome} />
              ) : data?.levelIncome ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(52,211,153,0.06)",
                      border: "1px solid rgba(52,211,153,0.15)",
                      marginBottom: 14,
                      alignItems: "center",
                    }}
                  >
                    <CheckCircle2 style={{ width: 16, height: 16, color: "#34d399", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                      Credited <strong style={{ color: "hsl(var(--foreground))" }}>instantly</strong> — no waiting for a scheduled run.
                    </span>
                  </div>
                  <DataRow label="Total Level Income" value={`$${fmt(data.levelIncome.totalIncome)}`} highlight />
                  <DataRow label="Total Payouts Received" value={data.levelIncome.totalPayouts} />
                  {data.levelIncome.breakdown.length > 0 && (
                    <>
                      <div style={{ marginTop: 14, marginBottom: 8, fontSize: 12, color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>
                        BREAKDOWN BY LEVEL
                      </div>
                      {data.levelIncome.breakdown.map(row => (
                        <div
                          key={row.level}
                          style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${BORDER2}` }}
                        >
                          <div>
                            <span style={{ fontSize: 13, color: "hsl(var(--foreground))" }}>Level {row.level}</span>
                            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginLeft: 8 }}>{row.percentage}% commission</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>${fmt(row.incomeAmount)}</div>
                            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{row.count} payouts</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {data.levelIncome.breakdown.length === 0 && (
                    <InfoNote>
                      No level income received yet. Level income is earned automatically when your
                      downline members create investments.
                    </InfoNote>
                  )}
                </>
              ) : <LoadingSection />}
            </SectionCard>

            {/* ── 6. Income Transfer Engine ── */}
            <SectionCard
              icon={Clock}
              title="Income Transfer Engine"
              description="Processes scheduled income releases to your income wallet. Runs every hour automatically."
            >
              {sched?.incomeTransfer ? (
                <div
                  style={{
                    background: "rgba(212,175,55,0.06)",
                    border: `1px solid rgba(212,175,55,0.18)`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>NEXT TRANSFER SWEEP</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>
                    {countdown(sched.incomeTransfer.nextRunAt)}
                  </div>
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                    {fmtDate(sched.incomeTransfer.nextRunAt)}
                    <span style={{ display: "none" }}>{tick}</span>
                  </div>
                </div>
              ) : null}
              <InfoNote>
                The transfer engine runs every hour and releases any income that has been queued for
                your income wallet. Credits from ROI, binary matching, orbit, salary, and level income
                all flow through this engine before appearing in your income wallet balance.
              </InfoNote>
            </SectionCard>

            {/* ── 7. Deposits ── */}
            <SectionCard
              icon={ArrowDownToLine}
              title="Recent Deposits"
              description="Your 5 most recent deposit requests and their current status."
            >
              {data?.errors?.deposits ? (
                <ErrorSection msg={data.errors.deposits} />
              ) : data?.deposits && data.deposits.length > 0 ? (
                <>
                  {data.deposits.map(d => (
                    <div
                      key={d.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "9px 0",
                        borderBottom: `1px solid ${BORDER2}`,
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>
                          ${fmt(d.amount)}
                        </div>
                        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                          {d.network} · {fmtDate(d.createdAt)}
                        </div>
                      </div>
                      <StatusPill status={d.status} />
                    </div>
                  ))}
                  {data.depositMeta && data.depositMeta.total > 5 && (
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 10 }}>
                      Showing 5 of {data.depositMeta.total} deposits. View all in the Deposit Wallet page.
                    </p>
                  )}
                </>
              ) : (
                <InfoNote>No deposit requests found. Deposits are typically processed within 24 hours of submission.</InfoNote>
              )}
            </SectionCard>

            {/* ── 8. Withdrawals ── */}
            <SectionCard
              icon={ArrowUpFromLine}
              title="Recent Withdrawals"
              description="Your 5 most recent withdrawal requests and their processing status."
            >
              {data?.errors?.withdrawals ? (
                <ErrorSection msg={data.errors.withdrawals} />
              ) : data?.withdrawals && data.withdrawals.length > 0 ? (
                <>
                  {data.withdrawals.map(w => (
                    <div
                      key={w.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "9px 0",
                        borderBottom: `1px solid ${BORDER2}`,
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>
                          ${fmt(w.amount)}
                        </div>
                        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                          {w.network} · {fmtDate(w.createdAt)}
                        </div>
                        {w.adminNotes && (
                          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                            Note: {w.adminNotes}
                          </div>
                        )}
                      </div>
                      <StatusPill status={w.status} />
                    </div>
                  ))}
                  {data.withdrawalMeta && data.withdrawalMeta.total > 5 && (
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 10 }}>
                      Showing 5 of {data.withdrawalMeta.total} withdrawals. View all in the Withdrawal Wallet page.
                    </p>
                  )}
                </>
              ) : (
                <InfoNote>No withdrawal requests found.</InfoNote>
              )}
            </SectionCard>

          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}

// ── Helper to render earnings section inside ROI card ─────────────────────────
function earningsData(data: PageData | null) {
  if (!data?.earnings) return null;
  const e = data.earnings;
  return (
    <>
      <DataRow label="Cycles Completed" value={e.cyclesCompleted} />
      <DataRow label="Total ROI Generated" value={`$${fmt(e.totalGenerated)}`} />
      <DataRow label="Total Compounded" value={`$${fmt(e.totalCompounded)}`} />
      <DataRow label="Total Claimed" value={`$${fmt(e.totalClaimed)}`} />
    </>
  );
}
