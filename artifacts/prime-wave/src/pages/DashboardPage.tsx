import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, Loader2, Copy, Check, Link2, ArrowLeft, ArrowRight } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import HeroCard from "@/components/dashboard/HeroCard";
import RankProgressCard from "@/components/dashboard/RankProgressCard";
import { PortfolioGrowthChart, EarningsTrendChart } from "@/components/dashboard/DashboardCharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DepositModal from "@/components/deposits/DepositModal";
import {
  ArrowUpFromLine, Wallet,
  PiggyBank, TrendingUp,
  Clock, CheckCircle, DollarSign,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/providers/AuthProvider";
import {
  getProfile, listInvestments, getWalletHistory, getActiveStatus,
  getSalaryQualifications, getSalarySummary, getLegBreakdown, getTeamBusiness,
  type ProfileData, type ApiInvestment, type Transaction, type ActiveStatus,
  type SalaryQualificationSummary, type SalarySummaryData, type LegBreakdown, type TeamBusiness,
} from "@/lib/api";

/* ── Inline toast ── */
interface ToastItem { id: number; message: string }
function Toast({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-xl"
          style={{ background: "#0E1B37", border: "1px solid rgba(52,211,153,0.35)", color: "#34d399" }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TX_TYPE_LABEL: Record<string, string> = {
  DEPOSIT:          "Deposit",
  INVESTMENT:       "Investment Created",
  ROI_CLAIM:        "Daily ROI Credit",
  PRINCIPAL_RELEASE:"Principal Released",
  INCOME_TRANSFER:  "Income Transfer",
  BINARY_MATCH:     "Binary Income",
  BINARY_ORBIT:     "Orbit Income",
  LEVEL_INCOME:     "Level Income",
  SALARY:           "Leadership Salary",
  WITHDRAWAL:       "Withdrawal",
};

const TX_TYPE_POSITIVE: Record<string, boolean> = {
  DEPOSIT: true, ROI_CLAIM: true, PRINCIPAL_RELEASE: true,
  BINARY_MATCH: true, BINARY_ORBIT: true, LEVEL_INCOME: true, SALARY: true,
  INCOME_TRANSFER: false, INVESTMENT: false, WITHDRAWAL: false,
};

export default function DashboardPage() {
  const greeting = getGreeting();
  const { user } = useAuth();
  const [depositOpen, setDepositOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [investments, setInvestments] = useState<ApiInvestment[]>([]);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [activeStatus, setActiveStatus] = useState<ActiveStatus | null>(null);
  const [salaryQual, setSalaryQual] = useState<SalaryQualificationSummary | null>(null);
  const [salarySummary, setSalarySummary] = useState<SalarySummaryData | null>(null);
  const [legBreakdown, setLegBreakdown] = useState<LegBreakdown | null>(null);
  const [teamBusiness, setTeamBusiness] = useState<TeamBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioTxs, setPortfolioTxs] = useState<Transaction[]>([]);
  const [earningsTxs, setEarningsTxs]   = useState<Transaction[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [profileData, invResult, historyResult, statusResult, qualResult, summaryResult, legResult, teamBusinessResult] =
          await Promise.all([
            getProfile(),
            listInvestments({ limit: 100 }),
            getWalletHistory({ limit: 5 }),
            getActiveStatus(),
            getSalaryQualifications(),
            getSalarySummary(),
            getLegBreakdown(),
            getTeamBusiness(),
          ]);
        setProfile(profileData);
        setInvestments(invResult.data);
        setRecentTxs(historyResult.data);
        setActiveStatus(statusResult);
        setSalaryQual(qualResult);
        setSalarySummary(summaryResult);
        setLegBreakdown(legResult);
        setTeamBusiness(teamBusinessResult);
      } catch {
        // silently fail — show zeros
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // ── Chart data (loaded after initial paint) ──────────────────────────────────
  useEffect(() => {
    async function loadCharts() {
      try {
        const INCOME_TYPES = ["ROI_CLAIM", "BINARY_MATCH", "BINARY_ORBIT", "LEVEL_INCOME", "SALARY"];
        const [portResult, earnResult] = await Promise.all([
          getWalletHistory({ types: ["INVESTMENT"], limit: 100 }),
          getWalletHistory({ types: INCOME_TYPES,  limit: 100 }),
        ]);
        setPortfolioTxs(portResult.data);
        setEarningsTxs(earnResult.data);
      } catch {
        // charts stay empty — not critical
      }
    }
    void loadCharts();
  }, []);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const depositWallet   = profile ? parseFloat(profile.wallet.depositWallet)    : 0;
  const incomeWallet    = profile ? parseFloat(profile.wallet.incomeWallet)     : 0;
  const withdrawalWallet = profile ? parseFloat(profile.wallet.withdrawalWallet) : 0;

  const totalInvested = investments
    .filter(i => i.status === "ACTIVE")
    .reduce((s, i) => s + parseFloat(i.currentPrincipal), 0);

  const dailyEarnings = investments
    .filter(i => i.status === "ACTIVE" && !i.autoCompound)
    .reduce((s, i) => s + parseFloat(i.currentPrincipal) * (parseFloat(i.dailyROI) / 100), 0);

  const activePlans = investments.filter(i => i.status === "ACTIVE").length;

  const firstName = user?.firstName ?? profile?.firstName ?? "User";

  // ── Salary-derived display values ───────────────────────────────────────────
  // Awarded ranks (from salary engine monthly cycle) take precedence over live
  // BV-based qualification. leftBV/rightBV reset to 0 after each binary flush,
  // so BV-only qualification would always show 0 between cycles.
  const activeRankSet   = new Set(salarySummary?.activeRanks ?? []);
  const orderedRankNames = salaryQual?.qualifications.map((q) => q.rankName) ?? [];

  // Highest awarded rank (ordered by compensation plan position)
  let highestAwardedIdx = -1;
  for (let i = orderedRankNames.length - 1; i >= 0; i--) {
    if (activeRankSet.has(orderedRankNames[i])) { highestAwardedIdx = i; break; }
  }

  // Fall back to live BV qualification if nothing has been awarded yet
  const currentRankDisplay = highestAwardedIdx >= 0
    ? orderedRankNames[highestAwardedIdx]
    : (salaryQual?.highestRank ?? "—");

  // Next rank is above the highest AWARDED rank (not BV-derived next)
  const nextRankName = highestAwardedIdx >= 0
    ? (orderedRankNames[highestAwardedIdx + 1] ?? null)
    : (salaryQual?.nextRank ?? null);

  const progressLabel = nextRankName
    ? `Progress to ${nextRankName}`
    : currentRankDisplay !== "—"
    ? "All Milestones Unlocked"
    : "Progress to Bronze";

  // Next required business threshold (for display)
  const nextRankEntry = salaryQual?.qualifications.find((q) => q.rankName === nextRankName);
  const nextSalaryTargetDisplay = nextRankEntry
    ? `$${parseFloat(nextRankEntry.requiredBusiness).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : salaryQual?.nextRequiredBusiness
    ? `$${parseFloat(salaryQual.nextRequiredBusiness).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : currentRankDisplay !== "—"
    ? "All Unlocked"
    : "$2,000";

  // Progress % is live BV progress; honest 0% between cycles is correct
  const salaryProgressPct = salaryQual?.progressPct ?? 0;

  const wallets = [
    { label: "Deposit Wallet",    value: fmt(depositWallet),    subtext: `${activePlans} active plan${activePlans !== 1 ? "s" : ""}`, icon: PiggyBank,      color: "#D4AF37", bg: "rgba(212,175,55,0.1)" },
    { label: "Income Wallet",     value: fmt(incomeWallet),     subtext: "Available to transfer",                                      icon: Wallet,         color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    { label: "Withdrawal Wallet", value: fmt(withdrawalWallet), subtext: "Pending processing",                                         icon: ArrowUpFromLine, color: "#c084fc", bg: "rgba(192,132,252,0.1)" },
    { label: "Today's ROI",       value: `+${fmt(dailyEarnings)}`, subtext: "Daily earnings",                                          icon: TrendingUp,     color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  ];

  return (
    <AppLayout notificationCount={0}>
      <PageContainer>
        {/* ── Greeting ── */}
        <div className="mb-5 lg:mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold font-heading text-foreground">
            {greeting}, {firstName}{" "}
            <span role="img" aria-label="wave">👋</span>
          </h1>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Beyond Limits. Beyond Growth.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
          </div>
        ) : (
          <>
            {/* ── Active Member Status ── */}
            <div
              className="rounded-2xl overflow-hidden mb-5 lg:mb-6"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            >
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                <div>
                  <h3 className="text-base font-semibold font-heading text-foreground">Member Status</h3>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Income eligibility — all three required for Binary, Orbit &amp; Salary
                  </p>
                </div>
                <div
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest"
                  style={
                    activeStatus?.isActive
                      ? { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }
                      : { background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }
                  }
                >
                  {activeStatus?.isActive ? "ACTIVE" : "INACTIVE"}
                </div>
              </div>
              <div className="px-5 py-4 space-y-2.5">
                {[
                  { label: "Min. $100 Active Investment", done: activeStatus?.hasInvestment  ?? false },
                  { label: "Left Leg Referral",           done: activeStatus?.hasLeftReferral  ?? false },
                  { label: "Right Leg Referral",          done: activeStatus?.hasRightReferral ?? false },
                ].map((req) => (
                  <div key={req.label} className="flex items-center gap-3">
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={req.done ? { background: "rgba(52,211,153,0.15)", color: "#34d399" } : { background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                    >
                      {req.done ? "✓" : "✗"}
                    </div>
                    <span className="text-sm flex-1" style={{ color: req.done ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                      {req.label}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: req.done ? "#34d399" : "#f87171" }}>
                      {req.done ? "Met" : "Required"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Hero Card ── */}
            <HeroCard
              totalInvestment={fmt(totalInvested)}
              todayEarnings={`+${fmt(dailyEarnings)}`}
              currentRank={currentRankDisplay}
              nextSalaryTarget={nextSalaryTargetDisplay}
              nextSalaryProgress={salaryProgressPct}
              progressLabel={progressLabel}
            />

            {/* ── Business Overview ── */}
            <BusinessOverviewCard legBreakdown={legBreakdown} teamBusiness={teamBusiness} loading={loading} />

            {/* ── Referral Cards ── */}
            <ReferralCards referralCode={profile?.referralCode ?? null} />

            {/* ── Rank Progress ── */}
            <RankProgressCard
              salaryQual={salaryQual}
              salarySummary={salarySummary}
            />

            {/* ── Wallet Summary ── */}
            <Section title="Wallet Summary" description="Your fund balances">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {wallets.map((w) => {
                  const Icon = w.icon;
                  return (
                    <div
                      key={w.label}
                      className="rounded-xl p-4 lg:p-5 transition-all duration-200 active:scale-[0.97]"
                      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: w.bg }}>
                          <Icon className="h-4 w-4" style={{ color: w.color }} />
                        </div>
                      </div>
                      <p className="text-lg lg:text-xl font-bold font-heading" style={{ color: w.value.startsWith("+") ? "#34d399" : "hsl(var(--foreground))" }}>
                        {w.value}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: "hsl(var(--muted-foreground))" }}>{w.label}</p>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(170,179,197,0.5)" }}>{w.subtext}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ── Charts ── */}
            <Section title="Performance Charts" description="Portfolio & earnings analytics">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PortfolioGrowthChart transactions={portfolioTxs} />
                <EarningsTrendChart transactions={earningsTxs} />
              </div>
            </Section>

            {/* ── Recent Activity ── */}
            <Section
              title="Recent Activity"
              action={<Button variant="ghost" size="sm" className="text-xs h-8 gap-1">View all</Button>}
            >
              <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
                {recentTxs.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No transactions yet</p>
                  </div>
                ) : (
                  recentTxs.map((tx, i) => {
                    const positive = TX_TYPE_POSITIVE[tx.type] ?? true;
                    const amount = parseFloat(tx.amount);
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: i < recentTxs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: positive ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)" }}>
                          {positive ? <CheckCircle className="h-4 w-4" style={{ color: "#34d399" }} /> : <DollarSign className="h-4 w-4" style={{ color: "#f87171" }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{TX_TYPE_LABEL[tx.type] ?? tx.type}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="h-2.5 w-2.5 shrink-0" style={{ color: "rgba(170,179,197,0.5)" }} />
                            <p className="text-xs truncate" style={{ color: "rgba(170,179,197,0.5)" }}>
                              {tx.description ?? tx.type} · {new Date(tx.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-sm font-semibold font-mono" style={{ color: positive ? "#34d399" : "#f87171" }}>
                            {positive ? "+" : "-"}{fmt(amount)}
                          </span>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                            {tx.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Section>
          </>
        )}
      </PageContainer>

      {depositOpen && (
        <DepositModal
          onClose={() => setDepositOpen(false)}
          onSuccess={(msg) => { setDepositOpen(false); showToast(msg); }}
        />
      )}

      <Toast toasts={toasts} />
    </AppLayout>
  );
}

function ReferralCards({ referralCode }: { referralCode: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(value: string, key: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const legs: { leg: "LEFT" | "RIGHT"; label: string; icon: React.ReactNode; color: string; bg: string; border: string }[] = [
    { leg: "LEFT",  label: "Left Leg",  icon: <ArrowLeft className="h-3.5 w-3.5" />,  color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.18)"  },
    { leg: "RIGHT", label: "Right Leg", icon: <ArrowRight className="h-3.5 w-3.5" />, color: "#c084fc", bg: "rgba(192,132,252,0.08)", border: "rgba(192,132,252,0.18)" },
  ];

  return (
    <>
      {/* ── Mobile: compact 2-col side by side ── */}
      <div className="grid grid-cols-2 gap-2.5 mb-5 lg:hidden">
        {legs.map(({ leg, label, icon, color, bg, border }) => {
          const shortLeg = leg === "LEFT" ? "L" : "R";
          const code    = referralCode ? `${referralCode}-${shortLeg}` : "—";
          const link    = referralCode ? `${window.location.origin}/register?ref=${referralCode}&leg=${shortLeg}` : "—";
          const codeKey = `code-${leg}`;
          const linkKey = `link-${leg}`;
          return (
            <div
              key={leg}
              className="rounded-xl overflow-hidden flex flex-col"
              style={{ background: "hsl(var(--card))", border: `1px solid ${border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}
            >
              {/* Compact header */}
              <div
                className="flex items-center gap-2 px-3 py-2.5"
                style={{ borderBottom: `1px solid ${border}`, background: bg }}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${color}1a`, color }}>
                  {icon}
                </div>
                <span className="text-xs font-bold font-heading" style={{ color }}>{label}</span>
              </div>

              {/* Code */}
              <div className="px-3 pt-2.5 pb-1.5">
                <p className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: "rgba(170,179,197,0.45)" }}>Code</p>
                <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span className="flex-1 text-[11px] font-mono font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>{code}</span>
                  <button
                    onClick={() => copyText(code, codeKey)}
                    className="shrink-0 flex items-center justify-center rounded p-1 transition-all"
                    style={{ background: copied === codeKey ? "rgba(52,211,153,0.15)" : `${color}15`, color: copied === codeKey ? "#34d399" : color }}
                  >
                    {copied === codeKey ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                  </button>
                </div>
              </div>

              {/* Link */}
              <div className="px-3 pb-3">
                <p className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: "rgba(170,179,197,0.45)" }}>Link</p>
                <button
                  onClick={() => copyText(link, linkKey)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition-all"
                  style={{
                    background: copied === linkKey ? "rgba(52,211,153,0.1)" : `${color}10`,
                    color: copied === linkKey ? "#34d399" : color,
                    border: `1px solid ${copied === linkKey ? "rgba(52,211,153,0.25)" : `${color}25`}`,
                  }}
                >
                  {copied === linkKey ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  <span>{copied === linkKey ? "Copied!" : "Copy Link"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop: full 2-col cards ── */}
      <div className="hidden lg:grid grid-cols-2 gap-4 mb-8">
        {legs.map(({ leg, label, icon, color, bg, border }) => {
          const shortLeg = leg === "LEFT" ? "L" : "R";
          const code    = referralCode ? `${referralCode}-${shortLeg}` : "—";
          const link    = referralCode ? `${window.location.origin}/register?ref=${referralCode}&leg=${shortLeg}` : "—";
          const codeKey = `code-${leg}`;
          const linkKey = `link-${leg}`;
          return (
            <div
              key={leg}
              className="rounded-2xl overflow-hidden"
              style={{ background: "hsl(var(--card))", border: `1px solid ${border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            >
              <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${border}`, background: bg }}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color }}>{icon}</div>
                <div>
                  <p className="text-sm font-semibold font-heading" style={{ color }}>{label} Referral</p>
                  <p className="text-[10px]" style={{ color: "rgba(170,179,197,0.6)" }}>Share to grow your {leg.toLowerCase()} team</p>
                </div>
              </div>
              <div className="px-4 pt-3 pb-2">
                <p className="text-[10px] font-medium uppercase tracking-widest mb-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>Referral Code</p>
                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span className="flex-1 text-sm font-mono font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>{code}</span>
                  <button
                    onClick={() => copyText(code, codeKey)}
                    className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all"
                    style={{ background: copied === codeKey ? "rgba(52,211,153,0.12)" : `${color}12`, color: copied === codeKey ? "#34d399" : color, border: `1px solid ${copied === codeKey ? "rgba(52,211,153,0.3)" : `${color}30`}` }}
                  >
                    {copied === codeKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copied === codeKey ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
              <div className="px-4 pb-4">
                <p className="text-[10px] font-medium uppercase tracking-widest mb-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>Referral Link</p>
                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(170,179,197,0.4)" }} />
                  <span className="flex-1 text-xs font-mono truncate" style={{ color: "rgba(170,179,197,0.7)" }}>{link}</span>
                  <button
                    onClick={() => copyText(link, linkKey)}
                    className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all"
                    style={{ background: copied === linkKey ? "rgba(52,211,153,0.12)" : `${color}12`, color: copied === linkKey ? "#34d399" : color, border: `1px solid ${copied === linkKey ? "rgba(52,211,153,0.3)" : `${color}30`}` }}
                  >
                    {copied === linkKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copied === linkKey ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function BusinessOverviewCard({ legBreakdown, teamBusiness, loading }: { legBreakdown: LegBreakdown | null; teamBusiness: TeamBusiness | null; loading: boolean }) {
  // Team Business (Sprint 30I) — cumulative APPROVED deposit volume, not investment/BV-derived.
  const leftBusiness  = Number(teamBusiness?.leftBusiness  ?? 0);
  const rightBusiness = Number(teamBusiness?.rightBusiness ?? 0);
  const totalBusiness = Number(teamBusiness?.totalBusiness ?? 0);
  const carryLeft  = Number(legBreakdown?.carryForwardLeft  ?? 0);
  const carryRight = Number(legBreakdown?.carryForwardRight ?? 0);
  const totalMax = Math.max(leftBusiness, rightBusiness, 1);

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden mb-5 lg:mb-8 p-5 lg:p-6"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.7)" }}>
            Team Business
          </p>
          <p className="font-heading font-bold text-3xl lg:text-4xl mt-1" style={{ color: "#F3D37A" }}>
            {loading ? "—" : fmt(totalBusiness)}
          </p>
        </div>
        <DollarSign className="h-8 w-8 shrink-0" style={{ color: "rgba(212,175,55,0.5)" }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#60a5fa" }}>Left Business</p>
          <p className="text-lg font-bold font-heading mt-1 text-foreground">{loading ? "—" : fmt(leftBusiness)}</p>
          <div className="h-1.5 w-full rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${(leftBusiness / totalMax) * 100}%`, background: "linear-gradient(90deg,#3b82f6,#60a5fa)" }} />
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Carry Fwd (BV): {loading ? "—" : carryLeft.toFixed(0)}
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#a78bfa" }}>Right Business</p>
          <p className="text-lg font-bold font-heading mt-1 text-foreground">{loading ? "—" : fmt(rightBusiness)}</p>
          <div className="h-1.5 w-full rounded-full overflow-hidden mt-2" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${(rightBusiness / totalMax) * 100}%`, background: "linear-gradient(90deg,#a78bfa,#7c3aed)" }} />
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Carry Fwd (BV): {loading ? "—" : carryRight.toFixed(0)}
          </p>
        </div>
      </div>

      <p className="text-[10px] mt-3" style={{ color: "hsl(var(--muted-foreground))" }}>
        Business reflects the sum of active investments in each leg. BV shown separately for matching income calculations.
      </p>
    </div>
  );
}

function Section({
  title, description, action, children,
}: {
  title: string; description?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="mb-6 lg:mb-8">
      <div className="flex items-start justify-between gap-4 mb-3 lg:mb-4">
        <div>
          <h2 className="text-lg lg:text-xl font-semibold font-heading text-foreground">{title}</h2>
          {description && <p className="text-xs lg:text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
