import { memo, lazy, Suspense, useState, useEffect, useCallback } from "react";
import {
  Users, UserCheck, Clock, UserPlus, DollarSign,
  ArrowDownLeft, BarChart2, Activity, ArrowUpRight, ArrowDownRight,
  Minus, ChevronRight, Zap, Settings, Bell, UserCog, Plus, RefreshCw,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import {
  getAdminDashboard, getAdminSystemHealth, getAdminPendingOps,
  getAdminDailyBusiness, adminSearchUsers,
  type AdminDashboardStats, type AdminSystemHealth, type AdminPendingOps,
  type AdminDailyBusiness, type AdminUserListItem, type DailyBusinessRow,
} from "@/lib/api";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.5)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtUsd(s: string | number): string {
  const n = typeof s === "number" ? s : parseFloat(s);
  if (isNaN(n) || n === 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function sumIncome(stats: AdminDashboardStats): number {
  return (
    parseFloat(stats.totalRoiPaid)     +
    parseFloat(stats.totalBinaryIncome) +
    parseFloat(stats.totalOrbitIncome)  +
    parseFloat(stats.totalLevelIncome)  +
    parseFloat(stats.totalSalaryIncome)
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function weekdayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

// ── Chart data transformers ────────────────────────────────────────────────────

interface ChartPoint { d: string; v: number }

function toLast7(
  data: DailyBusinessRow[],
  key: "newUsers" | "investments" | "deposits",
): ChartPoint[] {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const filled: ChartPoint[] = [];
  // Build a map
  const map = new Map(sorted.map(r => [r.date, r]));
  // Get last 7 calendar days
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key2 = d.toISOString().substring(0, 10);
    filled.push({ d: weekdayLabel(key2), v: map.get(key2)?.[key] ?? 0 });
  }
  return filled;
}

function toWeekly(data: DailyBusinessRow[], key: "deposits" | "investments" | "newUsers"): ChartPoint[] {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  // Group into 8-week buckets (last 56 days)
  const weeks: number[] = Array(8).fill(0);
  const now = Date.now();
  for (const row of sorted) {
    const ageMs  = now - new Date(row.date).getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    if (ageDays < 0 || ageDays >= 56) continue;
    const weekIdx = 7 - Math.floor(ageDays / 7); // 7 = most recent week
    const bucket  = 7 - weekIdx;                 // 0 = oldest
    if (bucket >= 0 && bucket < 8) weeks[bucket] += row[key];
  }
  return weeks.map((v, i) => ({ d: `W${i + 1}`, v }));
}

// ── Health helpers ─────────────────────────────────────────────────────────────

function cronStatus(lastRun: string | null): "ok" | "warn" | "error" {
  if (!lastRun) return "warn";
  const ageMs = Date.now() - new Date(lastRun).getTime();
  return ageMs < 26 * 3_600_000 ? "ok" : "warn"; // ok if < 26 h
}

function cronLatency(lastRun: string | null): string {
  if (!lastRun) return "never";
  return timeAgo(lastRun);
}

// ── Dashboard data hook ────────────────────────────────────────────────────────

interface DashData {
  stats:    AdminDashboardStats | null;
  health:   AdminSystemHealth   | null;
  pending:  AdminPendingOps     | null;
  business: AdminDailyBusiness  | null;
  users:    AdminUserListItem[]  | null;
}

function useDashboard() {
  const [data, setData]     = useState<DashData>({ stats: null, health: null, pending: null, business: null, users: null });
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [statsR, healthR, pendingR, businessR, usersR] = await Promise.allSettled([
      getAdminDashboard(),
      getAdminSystemHealth(),
      getAdminPendingOps(),
      getAdminDailyBusiness(56),
      adminSearchUsers({ page: 1, limit: 5 }),
    ]);
    setData({
      stats:    statsR.status    === "fulfilled" ? statsR.value            : null,
      health:   healthR.status   === "fulfilled" ? healthR.value           : null,
      pending:  pendingR.status  === "fulfilled" ? pendingR.value          : null,
      business: businessR.status === "fulfilled" ? businessR.value         : null,
      users:    usersR.status    === "fulfilled" ? usersR.value.data       : null,
    });
    setLoading(false);
    setLastFetch(new Date());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { data, loading, lastFetch, refresh };
}

// ── Lazy charts ────────────────────────────────────────────────────────────────
const AdminCharts = lazy(() => import("./AdminCharts"));

// ── Shared card shell ──────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}

// ── Skeleton pulse ─────────────────────────────────────────────────────────────
function Skel({ w = "100%", h = 16 }: { w?: string | number; h?: number }) {
  return (
    <div style={{
      width: w, height: h,
      background: "rgba(255,255,255,0.07)",
      borderRadius: 5,
      animation: "pulse 1.6s ease-in-out infinite",
    }} />
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  change: string;
  dir: "up" | "down" | "flat";
  iconColor: string;
  iconBg: string;
  loading?: boolean;
}

export const StatCard = memo(function StatCard({
  icon: Icon, label, value, change, dir, iconColor, iconBg, loading,
}: StatCardProps) {
  const changeColor = dir === "up" ? "#34d399" : dir === "down" ? "#f87171" : MUTED;
  const ChangeIcon  = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;

  return (
    <Card style={{ padding: "16px 18px", cursor: "default" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: iconBg, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={16} style={{ color: iconColor }} />
        </div>
        {loading ? (
          <Skel w={64} h={22} />
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 3,
            background: dir === "up"   ? "rgba(52,211,153,0.08)"
                      : dir === "down" ? "rgba(248,113,113,0.08)"
                      : "rgba(170,179,197,0.06)",
            borderRadius: 6, padding: "3px 7px",
          }}>
            <ChangeIcon size={11} style={{ color: changeColor }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: changeColor }}>{change}</span>
          </div>
        )}
      </div>
      {loading ? (
        <Skel w="65%" h={26} />
      ) : (
        <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.1, marginBottom: 4 }}>
          {value}
        </div>
      )}
      <div style={{ fontSize: 12, color: MUTED, marginTop: loading ? 8 : 0 }}>{label}</div>
    </Card>
  );
});

// ── ChartCard ──────────────────────────────────────────────────────────────────
export function ChartCard({ title, subtitle, children, style }: {
  title: string; subtitle?: string;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <Card style={{ padding: "16px 18px 12px", ...style }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </Card>
  );
}

// ── SectionHeader ──────────────────────────────────────────────────────────────
function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.65)", letterSpacing: "0.03em" }}>
        {title}
      </h3>
      {action && (
        <button style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 11, color: GOLD, display: "flex", alignItems: "center", gap: 3,
        }}>
          {action} <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
}

// ── ActivityTable ──────────────────────────────────────────────────────────────
export const ActivityTable = memo(function ActivityTable({
  title, rows, columns, loading,
}: {
  title: string;
  rows: Record<string, string>[];
  columns: { key: string; label: string; render?: (v: string) => React.ReactNode }[];
  loading?: boolean;
}) {
  return (
    <div>
      <SectionHeader title={title} action="View All" />
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3,4,5].map(i => <Skel key={i} h={30} />)}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: MUTED }}>
          No recent activity
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {columns.map(c => (
                  <th key={c.key} style={{
                    textAlign: "left", fontSize: 10, fontWeight: 600,
                    color: MUTED, letterSpacing: "0.08em",
                    padding: "6px 10px", borderBottom: `1px solid ${BORDER}`,
                  }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                >
                  {columns.map(c => (
                    <td key={c.key} style={{
                      fontSize: 12, color: "rgba(255,255,255,0.72)",
                      padding: "9px 10px", borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    }}>
                      {c.render ? c.render(row[c.key]) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

// ── HealthIndicator ────────────────────────────────────────────────────────────
export const HealthIndicator = memo(function HealthIndicator({
  label, status, latency,
}: { label: string; status: "ok" | "warn" | "error"; latency: string }) {
  const color = status === "ok" ? "#34d399" : status === "warn" ? "#fbbf24" : "#f87171";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 0", borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: color, boxShadow: `0 0 6px ${color}70`,
        }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{latency}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
          color, background: `${color}14`, padding: "2px 6px", borderRadius: 4,
        }}>{status.toUpperCase()}</span>
      </div>
    </div>
  );
});

// ── QuickActionCard ────────────────────────────────────────────────────────────
export const QuickActionCard = memo(function QuickActionCard({
  icon: Icon, label, color, bg,
}: { icon: React.ElementType; label: string; color: string; bg: string }) {
  return (
    <div
      style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: "14px 12px", display: "flex", flexDirection: "column",
        alignItems: "center", gap: 8, cursor: "pointer", textAlign: "center",
        transition: "border-color 0.15s,transform 0.15s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = `${color}40`;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = BORDER;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: bg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} style={{ color }} />
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500, lineHeight: 1.3 }}>
        {label}
      </span>
    </div>
  );
});

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const ok = status === "ACTIVE";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      color: ok ? "#34d399" : MUTED,
      background: ok ? "rgba(52,211,153,0.1)" : "rgba(170,179,197,0.07)",
      padding: "2px 7px", borderRadius: 5,
    }}>{status}</span>
  );
}

// ── Quick actions (navigation only, no backend) ───────────────────────────────
const quickActions = [
  { icon: UserPlus,  label: "Create Member",      color: "#60a5fa", bg: "rgba(96,165,250,0.09)"  },
  { icon: UserCheck, label: "Approve Withdrawal", color: "#34d399", bg: "rgba(52,211,153,0.09)"  },
  { icon: Plus,      label: "Create Plan",        color: GOLD,      bg: "rgba(212,175,55,0.09)"  },
  { icon: Bell,      label: "Broadcast",          color: "#a78bfa", bg: "rgba(167,139,250,0.09)" },
  { icon: Settings,  label: "System Settings",    color: MUTED,     bg: "rgba(170,179,197,0.06)" },
  { icon: UserCog,   label: "Manage Admins",      color: "#f87171", bg: "rgba(248,113,113,0.09)" },
];

// ── Main Dashboard Page ────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const { data, loading, lastFetch, refresh } = useDashboard();
  const { stats, health, pending, business, users } = data;

  /* ── KPI computed values ── */
  const totalRevenue  = stats ? sumIncome(stats) : 0;
  const pctActive     = stats && stats.totalUsers > 0
    ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;

  /* ── Chart data ── */
  const bizData       = business?.data ?? [];
  const memberGrowth  = bizData.length > 0 ? toLast7(bizData, "newUsers")     : [];
  const investVol     = bizData.length > 0 ? toLast7(bizData, "investments")  : [];
  const revTrend      = bizData.length > 0 ? toWeekly(bizData, "deposits")    : [];

  /* ── Recent registrations ── */
  const recentRegRows: Record<string, string>[] = (users ?? []).map(u => ({
    user:   u.username,
    email:  u.email,
    when:   timeAgo(u.createdAt),
    status: u.status,
  }));

  /* ── Pending actions ── */
  const pendingActions = [
    {
      label: "Pending Withdrawals",
      count: pending?.pendingWithdrawals ?? (loading ? "…" : "—"),
      amount: null,
      color: "#fbbf24",
      urgent: (pending?.pendingWithdrawals ?? 0) > 0,
    },
    {
      label: "Pending Deposits",
      count: pending?.pendingDeposits ?? (loading ? "…" : "—"),
      amount: null,
      color: "#60a5fa",
      urgent: false,
    },
    {
      label: "Failed Jobs",
      count: pending?.failedJobs ?? (loading ? "…" : "—"),
      amount: null,
      color: "#f87171",
      urgent: (pending?.failedJobs ?? 0) > 0,
    },
    {
      label: "Support Tickets",
      count: "—",
      amount: null,
      color: "#a78bfa",
      urgent: false,
      notConfigured: true,
    },
  ];

  /* ── Health services ── */
  const healthServices = health ? [
    { label: "API",            status: "ok"  as const,                    latency: "live"                                   },
    { label: "Database",       status: "ok"  as const,                    latency: "live"                                   },
    { label: "ROI Engine",     status: cronStatus(health.lastRoiCronExecution),           latency: cronLatency(health.lastRoiCronExecution)           },
    { label: "Binary Engine",  status: cronStatus(health.lastBinaryMatchingExecution),    latency: cronLatency(health.lastBinaryMatchingExecution)    },
    { label: "Storage",        status: "warn" as const,                   latency: "N/C"                                    },
    { label: "Email Service",  status: "warn" as const,                   latency: "N/C"                                    },
  ] : loading ? [] : [
    { label: "API",            status: "ok"   as const, latency: "—" },
    { label: "Database",       status: "warn" as const, latency: "—" },
    { label: "ROI Engine",     status: "warn" as const, latency: "—" },
    { label: "Binary Engine",  status: "warn" as const, latency: "—" },
    { label: "Storage",        status: "warn" as const, latency: "N/C" },
    { label: "Email Service",  status: "warn" as const, latency: "N/C" },
  ];

  const allCriticalOk = healthServices.every(s => s.status !== "error");

  /* ── Investment activity rows (daily summary from business report) ── */
  const investRows: Record<string, string>[] = [...bizData]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(r => ({
      date:        new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      investments: String(r.investments),
      deposits:    String(r.deposits),
      newUsers:    String(r.newUsers),
    }));

  return (
    <AdminLayout>
      {/* Page header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <BarChart2 size={15} style={{ color: GOLD }} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", lineHeight: 1.2 }}>
                Control Center
              </h1>
              <p style={{ fontSize: 12, color: MUTED }}>
                Platform overview · Live data
                {lastFetch && !loading && (
                  <span style={{ marginLeft: 8, color: "rgba(170,179,197,0.35)" }}>
                    · updated {timeAgo(lastFetch.toISOString())}
                  </span>
                )}
              </p>
            </div>
          </div>
          {/* Refresh button */}
          <button
            onClick={() => void refresh()}
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "7px 12px", cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6, color: MUTED, fontSize: 12,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <StatCard
          icon={Users} label="Total Members"
          value={stats ? fmtNum(stats.totalUsers) : "—"}
          change={stats ? `+${stats.todayNewUsers} today` : "—"}
          dir={stats && stats.todayNewUsers > 0 ? "up" : "flat"}
          iconColor="#60a5fa" iconBg="rgba(96,165,250,0.1)" loading={loading && !stats}
        />
        <StatCard
          icon={UserCheck} label="Active Members"
          value={stats ? fmtNum(stats.activeUsers) : "—"}
          change={stats ? `${pctActive}% of total` : "—"}
          dir="up"
          iconColor="#34d399" iconBg="rgba(52,211,153,0.1)" loading={loading && !stats}
        />
        <StatCard
          icon={Clock} label="Pending KYC"
          value="N/A"
          change="Not configured"
          dir="flat"
          iconColor="#fbbf24" iconBg="rgba(251,191,36,0.1)"
        />
        <StatCard
          icon={UserPlus} label="Today's Signups"
          value={stats ? fmtNum(stats.todayNewUsers) : "—"}
          change={stats && stats.todayNewUsers > 0 ? "+new today" : "0 today"}
          dir={stats && stats.todayNewUsers > 0 ? "up" : "flat"}
          iconColor="#a78bfa" iconBg="rgba(167,139,250,0.1)" loading={loading && !stats}
        />
        <StatCard
          icon={DollarSign} label="Total Investments"
          value={stats ? fmtNum(stats.totalInvestments) : "—"}
          change={stats ? `${stats.totalInvestments} records` : "—"}
          dir="up"
          iconColor={GOLD} iconBg="rgba(212,175,55,0.1)" loading={loading && !stats}
        />
        <StatCard
          icon={ArrowDownLeft} label="Pending Withdrawals"
          value={stats ? fmtNum(stats.pendingWithdrawals) : "—"}
          change={stats && stats.pendingWithdrawals > 0 ? "Action needed" : "All clear"}
          dir={stats && stats.pendingWithdrawals > 0 ? "down" : "flat"}
          iconColor="#f87171" iconBg="rgba(248,113,113,0.1)" loading={loading && !stats}
        />
        <StatCard
          icon={BarChart2} label="Platform Revenue"
          value={stats ? fmtUsd(totalRevenue) : "—"}
          change={stats ? "All income types" : "—"}
          dir="up"
          iconColor={GOLD_L} iconBg="rgba(212,175,55,0.08)" loading={loading && !stats}
        />
        <StatCard
          icon={Activity} label="System Health"
          value={health ? (health.failedJobsCount === 0 ? "Healthy" : `${health.failedJobsCount} alerts`) : "—"}
          change={health ? (health.failedJobsCount === 0 ? "All systems ok" : "Check jobs") : "—"}
          dir={health && health.failedJobsCount === 0 ? "up" : "down"}
          iconColor="#34d399" iconBg="rgba(52,211,153,0.1)" loading={loading && !health}
        />
      </div>

      {/* ── Charts ── */}
      <Suspense fallback={
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[0, 1].map(i => (
            <Card key={i} style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: MUTED }}>Loading charts…</span>
            </Card>
          ))}
        </div>
      }>
        {loading && !business ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[0, 1].map(i => (
              <Card key={i} style={{ padding: "16px 18px" }}>
                <Skel h={14} w="40%" />
                <div style={{ marginTop: 8 }}><Skel h={10} w="25%" /></div>
                <div style={{ marginTop: 14 }}><Skel h={165} /></div>
              </Card>
            ))}
          </div>
        ) : (
          <AdminCharts
            memberGrowth={memberGrowth}
            investmentVolume={investVol}
            revenueTrend={revTrend}
            ChartCard={ChartCard}
            Card={Card}
          />
        )}
      </Suspense>

      {/* ── Bottom grid: activity + actions + health ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        {/* Recent Registrations */}
        <Card style={{ padding: "16px 18px", gridColumn: "span 1" }}>
          <ActivityTable
            title="Recent Registrations"
            rows={recentRegRows}
            loading={loading && !users}
            columns={[
              { key: "user",   label: "USERNAME" },
              { key: "when",   label: "JOINED" },
              {
                key: "status", label: "STATUS",
                render: v => <StatusBadge status={v} />,
              },
            ]}
          />
        </Card>

        {/* Investment Activity (daily business report) */}
        <Card style={{ padding: "16px 18px", gridColumn: "span 1" }}>
          <ActivityTable
            title="Investment Activity"
            rows={investRows}
            loading={loading && !business}
            columns={[
              { key: "date",        label: "DATE"        },
              { key: "investments", label: "INVESTMENTS" },
              { key: "deposits",    label: "DEPOSITS"    },
            ]}
          />
        </Card>

        {/* Pending Actions */}
        <Card style={{ padding: "16px 18px" }}>
          <SectionHeader title="Pending Actions" />
          {loading && !pending ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3,4].map(i => <Skel key={i} h={36} />)}
            </div>
          ) : (
            pendingActions.map(a => (
              <div
                key={a.label}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 0", borderBottom: `1px solid rgba(255,255,255,0.04)`,
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = "0.7"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = "1"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  {a.urgent && (
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>{a.label}</span>
                  {"notConfigured" in a && a.notConfigured && (
                    <span style={{ fontSize: 9, color: MUTED, border: `1px solid rgba(170,179,197,0.2)`, borderRadius: 4, padding: "1px 5px" }}>
                      N/C
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {a.amount && <span style={{ fontSize: 11, color: MUTED }}>{a.amount}</span>}
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: a.color, background: `${a.color}14`,
                    padding: "2px 7px", borderRadius: 5,
                  }}>{String(a.count)}</span>
                  <ChevronRight size={12} style={{ color: MUTED }} />
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* ── Quick Actions + Platform Health ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
        <Card style={{ padding: "16px 18px" }}>
          <SectionHeader title="Quick Actions" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {quickActions.map(a => (
              <QuickActionCard key={a.label} icon={a.icon} label={a.label} color={a.color} bg={a.bg} />
            ))}
          </div>
        </Card>

        <Card style={{ padding: "16px 18px", minWidth: 280 }}>
          <SectionHeader title="Platform Health" />
          {loading && healthServices.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3,4,5,6].map(i => <Skel key={i} h={30} />)}
            </div>
          ) : (
            healthServices.map(s => (
              <HealthIndicator
                key={s.label}
                label={s.label}
                status={s.status}
                latency={s.latency}
              />
            ))
          )}
          <div style={{
            marginTop: 10, display: "flex", alignItems: "center", gap: 6,
            padding: "7px 10px", borderRadius: 7,
            background: allCriticalOk ? "rgba(52,211,153,0.05)" : "rgba(251,191,36,0.05)",
            border: `1px solid ${allCriticalOk ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)"}`,
          }}>
            <Zap size={12} style={{ color: allCriticalOk ? "#34d399" : "#fbbf24" }} />
            <span style={{ fontSize: 11, color: allCriticalOk ? "#34d399" : "#fbbf24" }}>
              {allCriticalOk ? "All critical systems operational" : "Some services need attention"}
            </span>
          </div>
        </Card>
      </div>

      <div style={{ height: 24 }} />
    </AdminLayout>
  );
}
