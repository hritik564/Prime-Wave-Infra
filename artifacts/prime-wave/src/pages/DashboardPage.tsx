import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import MetricCard from "@/components/shared/MetricCard";
import SectionHeader from "@/components/shared/SectionHeader";
import TableWrapper from "@/components/shared/TableWrapper";
import EmptyState from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/shared/Card";
import {
  DollarSign,
  TrendingUp,
  Users,
  Wallet,
  Plus,
  ArrowRight,
  GitBranch,
  Globe,
  Layers3,
  Banknote,
  Clock,
} from "lucide-react";

interface Investment {
  plan: string;
  amount: string;
  date: string;
  status: "active" | "completed" | "pending";
  dailyReturn: string;
  totalReturn: string;
}

const investments: Investment[] = [
  {
    plan: "Elite Growth",
    amount: "$5,000.00",
    date: "Jun 20, 2026",
    status: "active",
    dailyReturn: "$12.50",
    totalReturn: "$62.50",
  },
  {
    plan: "Prime Orbit",
    amount: "$2,500.00",
    date: "Jun 15, 2026",
    status: "active",
    dailyReturn: "$6.25",
    totalReturn: "$56.25",
  },
  {
    plan: "Apex Binary",
    amount: "$7,000.00",
    date: "Jun 01, 2026",
    status: "active",
    dailyReturn: "$17.50",
    totalReturn: "$411.25",
  },
  {
    plan: "Starter Pack",
    amount: "$1,000.00",
    date: "May 10, 2026",
    status: "completed",
    dailyReturn: "$2.50",
    totalReturn: "$180.00",
  },
];

const statusConfig = {
  active: { label: "Active", variant: "success" as const },
  completed: { label: "Completed", variant: "secondary" as const },
  pending: { label: "Pending", variant: "warning" as const },
};

const incomeStreams = [
  {
    label: "Binary",
    value: "$450.00",
    icon: GitBranch,
    color: "#60a5fa",
    bg: "rgba(96, 165, 250, 0.1)",
  },
  {
    label: "Orbit",
    value: "$230.00",
    icon: Globe,
    color: "#c084fc",
    bg: "rgba(192, 132, 252, 0.1)",
  },
  {
    label: "Level",
    value: "$120.00",
    icon: Layers3,
    color: "#22d3ee",
    bg: "rgba(34, 211, 238, 0.1)",
  },
  {
    label: "Salary",
    value: "$800.00",
    icon: Banknote,
    color: "#34d399",
    bg: "rgba(52, 211, 153, 0.1)",
  },
];

const recentActivity = [
  { type: "ROI Credit", amount: "+$36.25", time: "2 hours ago", positive: true },
  { type: "Withdrawal Request", amount: "-$500.00", time: "5 hours ago", positive: false },
  { type: "Level Income", amount: "+$40.00", time: "1 day ago", positive: true },
  { type: "Binary Income", amount: "+$150.00", time: "2 days ago", positive: true },
  { type: "Deposit", amount: "+$2,500.00", time: "9 days ago", positive: true },
];

export default function DashboardPage() {
  return (
    <AppLayout pageTitle="Dashboard" notificationCount={3}>
      <PageContainer>
        {/* Welcome */}
        <div className="mb-5 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold font-heading gold-gradient">
            Welcome back, John
          </h1>
          <p className="mt-1 text-xs lg:text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
            Wednesday, June 24, 2026 · Portfolio performing well
          </p>
        </div>

        {/* Metric Cards — 2 cols mobile, 4 cols desktop */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4 mb-5 lg:mb-8">
          <MetricCard
            label="Total Portfolio"
            value="$24,500"
            subValue="3 active plans"
            trend="up"
            trendLabel="↑ 3.2% this week"
            icon={DollarSign}
            iconColor="text-gold"
            iconBg="bg-gold/10"
          />
          <MetricCard
            label="Today's ROI"
            value="+$36.25"
            subValue="0.15% daily"
            trend="up"
            trendLabel="On schedule"
            icon={TrendingUp}
            iconColor="text-emerald-400"
            iconBg="bg-emerald-400/10"
          />
          <MetricCard
            label="Team Members"
            value="12"
            subValue="4 direct refs"
            trend="up"
            trendLabel="+2 this month"
            icon={Users}
            iconColor="text-blue-400"
            iconBg="bg-blue-400/10"
          />
          <MetricCard
            label="Withdrawal"
            value="$1,230"
            subValue="Income wallet"
            trend="neutral"
            trendLabel="Ready"
            icon={Wallet}
            iconColor="text-purple-400"
            iconBg="bg-purple-400/10"
          />
        </div>

        {/* Income Streams — 2 cols mobile, 4 cols desktop */}
        <div className="mb-5 lg:mb-8">
          <SectionHeader
            title="Income Streams"
            description="Passive income across all channels"
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {incomeStreams.map((stream) => {
              const Icon = stream.icon;
              return (
                <div
                  key={stream.label}
                  className="rounded-xl p-4 lg:p-5 transition-all duration-200 active:scale-[0.98] cursor-pointer"
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                  }}
                >
                  <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3">
                    <div
                      className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-lg shrink-0"
                      style={{ background: stream.bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color: stream.color }} />
                    </div>
                    <span className="text-xs lg:text-sm font-medium truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {stream.label}
                    </span>
                  </div>
                  <p className="text-lg lg:text-xl font-bold font-heading text-foreground">
                    {stream.value}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    This month
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Investments + Recent Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6 mb-5 lg:mb-8">
          {/* Investments */}
          <div className="xl:col-span-2">
            <SectionHeader
              title="Active Investments"
              description="Your current investment plans"
              action={
                <Button
                  className="gap-1.5 font-semibold h-9 lg:h-10 text-sm px-3 lg:px-4"
                  style={{ background: "#D4AF37", color: "#0E1B37" }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Invest
                </Button>
              }
            />

            {/* Mobile: card view */}
            <div className="md:hidden space-y-3">
              {investments.map((inv, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4"
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 mr-2">
                      <p className="font-semibold text-foreground truncate">{inv.plan}</p>
                      <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {inv.date}
                      </p>
                    </div>
                    <Badge variant={statusConfig[inv.status].variant} className="shrink-0">
                      {statusConfig[inv.status].label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Amount
                      </p>
                      <p className="text-sm font-mono font-semibold mt-0.5 text-foreground">
                        {inv.amount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Daily
                      </p>
                      <p className="text-sm font-mono font-semibold mt-0.5" style={{ color: "#34d399" }}>
                        {inv.dailyReturn}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Earned
                      </p>
                      <p className="text-sm font-mono font-semibold mt-0.5 text-foreground">
                        {inv.totalReturn}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table view */}
            <div className="hidden md:block">
              <TableWrapper<Investment>
                columns={[
                  {
                    key: "plan",
                    header: "Plan",
                    render: (row) => (
                      <span className="font-medium text-foreground">{row.plan}</span>
                    ),
                  },
                  {
                    key: "amount",
                    header: "Amount",
                    render: (row) => (
                      <span className="font-mono text-sm">{row.amount}</span>
                    ),
                  },
                  {
                    key: "dailyReturn",
                    header: "Daily ROI",
                    render: (row) => (
                      <span className="font-medium font-mono text-sm" style={{ color: "#34d399" }}>
                        {row.dailyReturn}
                      </span>
                    ),
                  },
                  {
                    key: "totalReturn",
                    header: "Total Earned",
                    render: (row) => (
                      <span className="font-mono text-sm">{row.totalReturn}</span>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (row) => {
                      const cfg = statusConfig[row.status];
                      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
                    },
                  },
                  {
                    key: "date",
                    header: "Date",
                    render: (row) => (
                      <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {row.date}
                      </span>
                    ),
                  },
                ]}
                data={investments}
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <SectionHeader
              title="Recent Activity"
              action={
                <Button variant="ghost" size="sm" className="gap-1 text-xs h-8">
                  View all
                  <ArrowRight className="h-3 w-3" />
                </Button>
              }
            />
            <Card>
              <CardContent className="space-y-0 p-0">
                {recentActivity.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                      borderBottom:
                        i < recentActivity.length - 1
                          ? "1px solid hsl(var(--border) / 0.4)"
                          : "none",
                    }}
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.type}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }} />
                        <p className="text-xs truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {item.time}
                        </p>
                      </div>
                    </div>
                    <span
                      className="text-sm font-semibold font-mono shrink-0"
                      style={{ color: item.positive ? "#34d399" : "#f87171" }}
                    >
                      {item.amount}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Empty State: Pending Withdrawals */}
        <div>
          <SectionHeader title="Pending Withdrawals" />
          <Card>
            <EmptyState
              title="No pending withdrawals"
              description="Your funds are working for you. Request a withdrawal when ready."
              action={
                <Button
                  className="gap-1.5 font-semibold h-12 px-6"
                  style={{ background: "#D4AF37", color: "#0E1B37" }}
                >
                  <Wallet className="h-4 w-4" />
                  Request Withdrawal
                </Button>
              }
            />
          </Card>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
