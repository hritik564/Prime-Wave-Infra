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
  ArrowDownToLine, ArrowUpFromLine, GitFork, Bell, Wallet,
  PiggyBank, Banknote, TrendingUp, GitBranch, Globe, Layers3,
  Clock, CheckCircle, DollarSign,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/providers/AuthProvider";
import { getProfile, listInvestments, getWalletHistory, getActiveStatus, type ProfileData, type ApiInvestment, type Transaction, type ActiveStatus } from "@/lib/api";

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

const quickActions = [
  { label: "New Deposit",    icon: ArrowDownToLine, primary: true,  href: "/wallets/deposit"    },
  { label: "Withdraw Funds", icon: ArrowUpFromLine, primary: false, href: "/wallets/withdrawal" },
  { label: "My Network",     icon: GitFork,         primary: false, href: "/team"               },
  { label: "Notifications",  icon: Bell,            primary: false, href: "/notifications"      },
];

export default function DashboardPage() {
  const greeting = getGreeting();
  const { user } = useAuth();
  const [depositOpen, setDepositOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [investments, setInvestments] = useState<ApiInvestment[]>([]);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [activeStatus, setActiveStatus] = useState<ActiveStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [profileData, invResult, historyResult, statusResult] = await Promise.all([
          getProfile(),
          listInvestments({ limit: 100 }),
          getWalletHistory({ limit: 5 }),
          getActiveStatus(),
        ]);
        setProfile(profileData);
        setInvestments(invResult.data);
        setRecentTxs(historyResult.data);
        setActiveStatus(statusResult);
      } catch {
        // silently fail — show zeros
      } finally {
        setLoading(false);
      }
    }
    void load();
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

  const wallets = [
    { label: "Deposit Wallet",    value: fmt(depositWallet),    subtext: `${activePlans} active plan${activePlans !== 1 ? "s" : ""}`, icon: PiggyBank,      color: "#D4AF37", bg: "rgba(212,175,55,0.1)" },
    { label: "Income Wallet",     value: fmt(incomeWallet),     subtext: "Available to transfer",                                      icon: Wallet,         color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    { label: "Withdrawal Wallet", value: fmt(withdrawalWallet), subtext: "Pending processing",                                         icon: ArrowUpFromLine, color: "#c084fc", bg: "rgba(192,132,252,0.1)" },
    { label: "Today's ROI",       value: `+${fmt(dailyEarnings)}`, subtext: "Daily earnings",                                          icon: TrendingUp,     color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  ];

  const earnings = [
    { label: "Binary Income", value: "$0.00", subtext: "Coming soon", icon: GitBranch, color: "#60a5fa", bg: "rgba(96,165,250,0.08)" },
    { label: "Orbit Income",  value: "$0.00", subtext: "Coming soon", icon: Globe,     color: "#c084fc", bg: "rgba(192,132,252,0.08)" },
    { label: "Level Income",  value: "$0.00", subtext: "Coming soon", icon: Layers3,   color: "#22d3ee", bg: "rgba(34,211,238,0.08)" },
    { label: "Salary Income", value: "$0.00", subtext: "Coming soon", icon: Banknote,  color: "#D4AF37", bg: "rgba(212,175,55,0.08)"  },
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
              currentRank="Silver"
              nextSalaryTarget="$25,000"
              nextSalaryProgress={Math.min(Math.round((totalInvested / 25000) * 100), 100)}
            />

            {/* ── Referral Cards ── */}
            <ReferralCards referralCode={profile?.referralCode ?? null} />

            {/* ── Rank Progress ── */}
            <RankProgressCard
              currentRank="Silver"
              nextRank="Gold"
              progress={Math.min(Math.round((totalInvested / 25000) * 100), 100)}
              remaining={fmt(Math.max(0, 25000 - totalInvested))}
              teamVolume={fmt(totalInvested)}
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

            {/* ── Quick Actions ── */}
            <Section title="Quick Actions">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  const sharedClass = "flex items-center justify-center gap-2.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.97] min-h-[52px]";
                  const primaryStyle = { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", border: "none", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" };
                  const secondaryStyle = { background: "hsl(var(--card))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" };
                  if (action.label === "New Deposit") {
                    return (
                      <button
                        key={action.label}
                        onClick={() => setDepositOpen(true)}
                        className={sharedClass}
                        style={primaryStyle}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{action.label}</span>
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={action.label}
                      href={action.href}
                      className={sharedClass}
                      style={secondaryStyle}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{action.label}</span>
                    </Link>
                  );
                })}
              </div>
            </Section>

            {/* ── Earnings Overview ── */}
            <Section title="Earnings Overview" description="Passive income across all channels">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {earnings.map((e) => {
                  const Icon = e.icon;
                  return (
                    <div
                      key={e.label}
                      className="rounded-xl p-4 lg:p-5"
                      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl mb-3" style={{ background: e.bg }}>
                        <Icon className="h-4 w-4" style={{ color: e.color }} />
                      </div>
                      <p className="text-lg lg:text-xl font-bold font-heading text-foreground">{e.value}</p>
                      <p className="text-xs mt-0.5 font-medium truncate" style={{ color: "hsl(var(--muted-foreground))" }}>{e.label}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "rgba(170,179,197,0.45)" }}>{e.subtext}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ── Charts ── */}
            <Section title="Performance Charts" description="Portfolio & earnings analytics">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PortfolioGrowthChart />
                <EarningsTrendChart />
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
    {
      leg: "LEFT",
      label: "Left Leg",
      icon: <ArrowLeft className="h-4 w-4" />,
      color: "#60a5fa",
      bg: "rgba(96,165,250,0.08)",
      border: "rgba(96,165,250,0.18)",
    },
    {
      leg: "RIGHT",
      label: "Right Leg",
      icon: <ArrowRight className="h-4 w-4" />,
      color: "#c084fc",
      bg: "rgba(192,132,252,0.08)",
      border: "rgba(192,132,252,0.18)",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:gap-4 mb-5 lg:mb-8">
      {legs.map(({ leg, label, icon, color, bg, border }) => {
        const code = referralCode ? `${referralCode}-${leg}` : "—";
        const link = referralCode
          ? `${window.location.origin}/register?ref=${referralCode}&leg=${leg}`
          : "—";
        const codeKey = `code-${leg}`;
        const linkKey = `link-${leg}`;

        return (
          <div
            key={leg}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "hsl(var(--card))",
              border: `1px solid ${border}`,
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: `1px solid ${border}`, background: bg }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${color}1a`, color }}
              >
                {icon}
              </div>
              <div>
                <p className="text-sm font-semibold font-heading" style={{ color }}>
                  {label} Referral
                </p>
                <p className="text-[10px]" style={{ color: "rgba(170,179,197,0.6)" }}>
                  Share to grow your {leg.toLowerCase()} team
                </p>
              </div>
            </div>

            {/* Code row */}
            <div className="px-4 pt-3 pb-2">
              <p className="text-[10px] font-medium uppercase tracking-widest mb-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>
                Referral Code
              </p>
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <span className="flex-1 text-sm font-mono font-semibold truncate" style={{ color: "hsl(var(--foreground))" }}>
                  {code}
                </span>
                <button
                  onClick={() => copyText(code, codeKey)}
                  className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all"
                  style={{
                    background: copied === codeKey ? "rgba(52,211,153,0.12)" : `${color}12`,
                    color: copied === codeKey ? "#34d399" : color,
                    border: `1px solid ${copied === codeKey ? "rgba(52,211,153,0.3)" : `${color}30`}`,
                  }}
                >
                  {copied === codeKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{copied === codeKey ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            {/* Link row */}
            <div className="px-4 pb-4">
              <p className="text-[10px] font-medium uppercase tracking-widest mb-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>
                Referral Link
              </p>
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(170,179,197,0.4)" }} />
                <span className="flex-1 text-xs font-mono truncate" style={{ color: "rgba(170,179,197,0.7)" }}>
                  {link}
                </span>
                <button
                  onClick={() => copyText(link, linkKey)}
                  className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all"
                  style={{
                    background: copied === linkKey ? "rgba(52,211,153,0.12)" : `${color}12`,
                    color: copied === linkKey ? "#34d399" : color,
                    border: `1px solid ${copied === linkKey ? "rgba(52,211,153,0.3)" : `${color}30`}`,
                  }}
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
