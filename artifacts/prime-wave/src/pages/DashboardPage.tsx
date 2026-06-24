import { useState, useCallback } from "react";
import { CheckCircle2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import HeroCard from "@/components/dashboard/HeroCard";
import RankProgressCard from "@/components/dashboard/RankProgressCard";
import { PortfolioGrowthChart, EarningsTrendChart } from "@/components/dashboard/DashboardCharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DepositModal from "@/components/deposits/DepositModal";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  GitFork,
  Bell,
  Wallet,
  PiggyBank,
  Banknote,
  TrendingUp,
  GitBranch,
  Globe,
  Layers3,
  Clock,
  CheckCircle,
  DollarSign,
} from "lucide-react";

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

const wallets = [
  {
    label: "Deposit Wallet",
    value: "$15,000.00",
    subtext: "3 active plans",
    icon: PiggyBank,
    color: "#D4AF37",
    bg: "rgba(212,175,55,0.1)",
  },
  {
    label: "Income Wallet",
    value: "$1,280.75",
    subtext: "Available to withdraw",
    icon: Wallet,
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.1)",
  },
  {
    label: "Withdrawal Wallet",
    value: "$500.00",
    subtext: "Pending processing",
    icon: ArrowUpFromLine,
    color: "#c084fc",
    bg: "rgba(192,132,252,0.1)",
  },
  {
    label: "Today's ROI",
    value: "+$36.25",
    subtext: "0.15% of portfolio",
    icon: TrendingUp,
    color: "#34d399",
    bg: "rgba(52,211,153,0.1)",
  },
];

const earnings = [
  {
    label: "Binary Income",
    value: "$450.00",
    subtext: "This month",
    icon: GitBranch,
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.08)",
  },
  {
    label: "Orbit Income",
    value: "$230.00",
    subtext: "This month",
    icon: Globe,
    color: "#c084fc",
    bg: "rgba(192,132,252,0.08)",
  },
  {
    label: "Level Income",
    value: "$120.00",
    subtext: "This month",
    icon: Layers3,
    color: "#22d3ee",
    bg: "rgba(34,211,238,0.08)",
  },
  {
    label: "Salary Income",
    value: "$800.00",
    subtext: "This month",
    icon: Banknote,
    color: "#D4AF37",
    bg: "rgba(212,175,55,0.08)",
  },
];

const recentActivity = [
  {
    icon: CheckCircle,
    iconColor: "#34d399",
    iconBg: "rgba(52,211,153,0.1)",
    type: "Deposit Approved",
    description: "Bank transfer processed",
    amount: "+$2,500.00",
    positive: true,
    time: "2 days ago",
    badge: "Approved",
    badgeVariant: "success" as const,
  },
  {
    icon: GitBranch,
    iconColor: "#60a5fa",
    iconBg: "rgba(96,165,250,0.1)",
    type: "Binary Income",
    description: "Left leg cycle matched",
    amount: "+$150.00",
    positive: true,
    time: "3 days ago",
    badge: "Received",
    badgeVariant: "secondary" as const,
  },
  {
    icon: DollarSign,
    iconColor: "#D4AF37",
    iconBg: "rgba(212,175,55,0.1)",
    type: "Leadership Salary",
    description: "Silver rank monthly salary",
    amount: "+$800.00",
    positive: true,
    time: "5 days ago",
    badge: "Received",
    badgeVariant: "secondary" as const,
  },
  {
    icon: TrendingUp,
    iconColor: "#34d399",
    iconBg: "rgba(52,211,153,0.1)",
    type: "Daily ROI Credit",
    description: "Elite Growth plan returns",
    amount: "+$36.25",
    positive: true,
    time: "Today",
    badge: null,
    badgeVariant: "secondary" as const,
  },
  {
    icon: ArrowUpFromLine,
    iconColor: "#f87171",
    iconBg: "rgba(248,113,113,0.1)",
    type: "Withdrawal Processed",
    description: "To registered bank account",
    amount: "-$500.00",
    positive: false,
    time: "1 week ago",
    badge: "Sent",
    badgeVariant: "secondary" as const,
  },
];

const quickActions = [
  {
    label: "New Deposit",
    icon: ArrowDownToLine,
    primary: true,
    href: "/wallets/deposit",
  },
  {
    label: "Withdraw Funds",
    icon: ArrowUpFromLine,
    primary: false,
    href: "/wallets/withdrawal",
  },
  {
    label: "Binary Tree",
    icon: GitFork,
    primary: false,
    href: "/binary-tree",
  },
  {
    label: "Notifications",
    icon: Bell,
    primary: false,
    href: "/notifications",
  },
];

export default function DashboardPage() {
  const greeting = getGreeting();
  const [depositOpen, setDepositOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <AppLayout notificationCount={3}>
      <PageContainer>
        {/* ── Greeting ── */}
        <div className="mb-5 lg:mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold font-heading text-foreground">
            {greeting}, John{" "}
            <span role="img" aria-label="wave">
              👋
            </span>
          </h1>
          <p className="mt-1 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Beyond Limits. Beyond Growth.
          </p>
        </div>

        {/* ── Hero Card ── */}
        <HeroCard
          totalInvestment="$15,000.00"
          todayEarnings="+$36.25"
          currentRank="Silver"
          nextSalaryTarget="$25,000"
          nextSalaryProgress={34}
        />

        {/* ── Rank Progress ── */}
        <RankProgressCard
          currentRank="Silver"
          nextRank="Gold"
          progress={34}
          remaining="$8,500"
          teamVolume="$16,500"
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
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ background: w.bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color: w.color }} />
                    </div>
                  </div>
                  <p className="text-lg lg:text-xl font-bold font-heading" style={{ color: w.value.startsWith("+") ? "#34d399" : "hsl(var(--foreground))" }}>
                    {w.value}
                  </p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {w.label}
                  </p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(170,179,197,0.5)" }}>
                    {w.subtext}
                  </p>
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
              const isNewDeposit = action.label === "New Deposit";
              return (
                <button
                  key={action.label}
                  onClick={isNewDeposit ? () => setDepositOpen(true) : undefined}
                  className="flex items-center justify-center gap-2.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.97] min-h-[52px]"
                  style={
                    action.primary
                      ? {
                          background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
                          color: "#0E1B37",
                          border: "none",
                          boxShadow: "0 4px 16px rgba(212,175,55,0.3)",
                        }
                      : {
                          background: "hsl(var(--card))",
                          color: "hsl(var(--foreground))",
                          border: "1px solid hsl(var(--border))",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                        }
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{action.label}</span>
                </button>
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
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                  }}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl mb-3"
                    style={{ background: e.bg }}
                  >
                    <Icon className="h-4 w-4" style={{ color: e.color }} />
                  </div>
                  <p className="text-lg lg:text-xl font-bold font-heading text-foreground">
                    {e.value}
                  </p>
                  <p className="text-xs mt-0.5 font-medium truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {e.label}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(170,179,197,0.45)" }}>
                    {e.subtext}
                  </p>
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
          action={
            <Button variant="ghost" size="sm" className="text-xs h-8 gap-1">
              View all
            </Button>
          }
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}
          >
            {recentActivity.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                  style={{
                    borderBottom:
                      i < recentActivity.length - 1
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "none",
                  }}
                >
                  {/* Icon */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: item.iconBg }}
                  >
                    <Icon className="h-4 w-4" style={{ color: item.iconColor }} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.type}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="h-2.5 w-2.5 shrink-0" style={{ color: "rgba(170,179,197,0.5)" }} />
                      <p className="text-xs truncate" style={{ color: "rgba(170,179,197,0.5)" }}>
                        {item.description} · {item.time}
                      </p>
                    </div>
                  </div>
                  {/* Right: Amount + Badge */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-sm font-semibold font-mono"
                      style={{ color: item.positive ? "#34d399" : "#f87171" }}
                    >
                      {item.amount}
                    </span>
                    {item.badge && (
                      <Badge variant={item.badgeVariant} className="text-[9px] px-1.5 py-0">
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
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

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 lg:mb-8">
      <div className="flex items-start justify-between gap-4 mb-3 lg:mb-4">
        <div>
          <h2 className="text-lg lg:text-xl font-semibold font-heading text-foreground">
            {title}
          </h2>
          {description && (
            <p className="text-xs lg:text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
