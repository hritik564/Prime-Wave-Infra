import { memo, lazy, Suspense } from "react";
import {
  Users, UserCheck, Clock, UserPlus, DollarSign,
  ArrowDownLeft, BarChart2, Activity, ArrowUpRight, ArrowDownRight,
  Minus, ChevronRight, Zap, Settings, Bell, UserCog, Plus,
} from "lucide-react";
import AdminLayout from "./AdminLayout";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.5)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

// ── Mock Data ──────────────────────────────────────────────────────────────────

const memberGrowth = [
  { d: "Mon", v: 1189 }, { d: "Tue", v: 1204 }, { d: "Wed", v: 1218 },
  { d: "Thu", v: 1225 }, { d: "Fri", v: 1231 }, { d: "Sat", v: 1239 }, { d: "Sun", v: 1247 },
];

const investmentVolume = [
  { d: "Mon", v: 42 }, { d: "Tue", v: 38 }, { d: "Wed", v: 55 },
  { d: "Thu", v: 47 }, { d: "Fri", v: 63 }, { d: "Sat", v: 31 }, { d: "Sun", v: 48 },
];

const revenueTrend = [
  { d: "W1", v: 18.4 }, { d: "W2", v: 22.1 }, { d: "W3", v: 19.8 }, { d: "W4", v: 28.3 },
  { d: "W5", v: 31.2 }, { d: "W6", v: 27.9 }, { d: "W7", v: 35.1 }, { d: "W8", v: 38.6 },
];

const recentRegistrations = [
  { username: "crypto_hawk",  email: "c.hawk@mail.com",    joined: "2 min ago",  status: "ACTIVE" },
  { username: "moon_alice",   email: "alice@example.com",  joined: "18 min ago", status: "ACTIVE" },
  { username: "d_venture",    email: "d@venture.io",       joined: "41 min ago", status: "ACTIVE" },
  { username: "wave_rider88", email: "rider@wave.co",      joined: "1 hr ago",   status: "ACTIVE" },
  { username: "stellar_k",    email: "kira@stellar.net",   joined: "2 hrs ago",  status: "INACTIVE" },
];

const recentInvestments = [
  { username: "profit_king",  amount: "$5,000", plan: "ALPHA",   date: "5 min ago",  status: "ACTIVE" },
  { username: "moon_alice",   amount: "$2,500", plan: "STARTER", date: "23 min ago", status: "ACTIVE" },
  { username: "crypto_hawk",  amount: "$10,000",plan: "PREMIUM", date: "1 hr ago",   status: "ACTIVE" },
  { username: "wave_rider88", amount: "$1,000", plan: "STARTER", date: "3 hrs ago",  status: "ACTIVE" },
  { username: "bull_terrance",amount: "$7,500", plan: "ALPHA",   date: "5 hrs ago",  status: "ACTIVE" },
];

const pendingActions = [
  { label: "Pending Withdrawals",  count: 7,  amount: "$12,450", color: "#fbbf24", urgent: true },
  { label: "Pending KYC Reviews",  count: 23, amount: null,      color: "#60a5fa", urgent: false },
  { label: "Failed Transactions",  count: 3,  amount: "$2,100",  color: "#f87171", urgent: true },
  { label: "Support Tickets",      count: 11, amount: null,      color: "#a78bfa", urgent: false },
];

const healthServices = [
  { label: "API",       status: "ok",   latency: "18ms"  },
  { label: "Database",  status: "ok",   latency: "4ms"   },
  { label: "Queue",     status: "ok",   latency: "—"     },
  { label: "Cron Jobs", status: "ok",   latency: "—"     },
  { label: "Storage",   status: "warn", latency: "82%"   },
  { label: "Email",     status: "ok",   latency: "—"     },
];

const quickActions = [
  { icon: UserPlus,  label: "Create Member",       color: "#60a5fa", bg: "rgba(96,165,250,0.09)"  },
  { icon: UserCheck, label: "Approve Withdrawal",  color: "#34d399", bg: "rgba(52,211,153,0.09)"  },
  { icon: Plus,      label: "Create Plan",         color: GOLD,      bg: "rgba(212,175,55,0.09)"  },
  { icon: Bell,      label: "Broadcast",           color: "#a78bfa", bg: "rgba(167,139,250,0.09)" },
  { icon: Settings,  label: "System Settings",     color: MUTED,     bg: "rgba(170,179,197,0.06)" },
  { icon: UserCog,   label: "Manage Admins",       color: "#f87171", bg: "rgba(248,113,113,0.09)" },
];

// ── Lazy charts ────────────────────────────────────────────────────────────────
const AdminCharts = lazy(() => import("./AdminCharts"));

// ── Shared card shell ──────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 12, ...style,
    }}>
      {children}
    </div>
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
}

export const StatCard = memo(function StatCard({
  icon: Icon, label, value, change, dir, iconColor, iconBg,
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
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.1, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: MUTED }}>{label}</div>
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
  title, rows, columns,
}: {
  title: string;
  rows: Record<string, string>[];
  columns: { key: string; label: string; render?: (v: string) => React.ReactNode }[];
}) {
  return (
    <div>
      <SectionHeader title={title} action="View All" />
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

// ── Main Dashboard Page ────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      {/* Page header */}
      <div style={{ marginBottom: 22 }}>
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
            <p style={{ fontSize: 12, color: MUTED }}>Platform overview · Live mock data</p>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <StatCard
          icon={Users} label="Total Members" value="1,247"
          change="+12.3%" dir="up"
          iconColor="#60a5fa" iconBg="rgba(96,165,250,0.1)"
        />
        <StatCard
          icon={UserCheck} label="Active Members" value="891"
          change="+8.7%" dir="up"
          iconColor="#34d399" iconBg="rgba(52,211,153,0.1)"
        />
        <StatCard
          icon={Clock} label="Pending KYC" value="23"
          change="-2 today" dir="down"
          iconColor="#fbbf24" iconBg="rgba(251,191,36,0.1)"
        />
        <StatCard
          icon={UserPlus} label="Today's Signups" value="18"
          change="+22%" dir="up"
          iconColor="#a78bfa" iconBg="rgba(167,139,250,0.1)"
        />
        <StatCard
          icon={DollarSign} label="Total Investments" value="$2.4M"
          change="+$48K" dir="up"
          iconColor={GOLD} iconBg="rgba(212,175,55,0.1)"
        />
        <StatCard
          icon={ArrowDownLeft} label="Pending Withdrawals" value="7"
          change="$12,450" dir="flat"
          iconColor="#f87171" iconBg="rgba(248,113,113,0.1)"
        />
        <StatCard
          icon={BarChart2} label="Platform Revenue" value="$124K"
          change="+$3.2K" dir="up"
          iconColor={GOLD_L} iconBg="rgba(212,175,55,0.08)"
        />
        <StatCard
          icon={Activity} label="System Health" value="99.8%"
          change="Uptime" dir="up"
          iconColor="#34d399" iconBg="rgba(52,211,153,0.1)"
        />
      </div>

      {/* ── Charts ── */}
      <Suspense fallback={
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20,
        }}>
          {[0, 1].map(i => (
            <Card key={i} style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: MUTED }}>Loading charts…</span>
            </Card>
          ))}
        </div>
      }>
        <AdminCharts
          memberGrowth={memberGrowth}
          investmentVolume={investmentVolume}
          revenueTrend={revenueTrend}
          ChartCard={ChartCard}
          Card={Card}
        />
      </Suspense>

      {/* ── Bottom grid: activity + actions + health ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        {/* Recent Registrations */}
        <Card style={{ padding: "16px 18px", gridColumn: "span 1" }}>
          <ActivityTable
            title="Recent Registrations"
            rows={recentRegistrations.map(r => ({
              user: r.username, email: r.email, when: r.joined, status: r.status,
            }))}
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

        {/* Recent Investments */}
        <Card style={{ padding: "16px 18px", gridColumn: "span 1" }}>
          <ActivityTable
            title="Recent Investments"
            rows={recentInvestments.map(r => ({
              user: r.username, amount: r.amount, plan: r.plan, when: r.date,
            }))}
            columns={[
              { key: "user",   label: "USERNAME" },
              { key: "amount", label: "AMOUNT" },
              { key: "plan",   label: "PLAN" },
            ]}
          />
        </Card>

        {/* Pending Actions */}
        <Card style={{ padding: "16px 18px" }}>
          <SectionHeader title="Pending Actions" />
          {pendingActions.map(a => (
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
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {a.amount && <span style={{ fontSize: 11, color: MUTED }}>{a.amount}</span>}
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: a.color, background: `${a.color}14`,
                  padding: "2px 7px", borderRadius: 5,
                }}>{a.count}</span>
                <ChevronRight size={12} style={{ color: MUTED }} />
              </div>
            </div>
          ))}
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
          {healthServices.map(s => (
            <HealthIndicator
              key={s.label}
              label={s.label}
              status={s.status as "ok" | "warn" | "error"}
              latency={s.latency}
            />
          ))}
          <div style={{
            marginTop: 10, display: "flex", alignItems: "center", gap: 6,
            padding: "7px 10px", borderRadius: 7,
            background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.12)",
          }}>
            <Zap size={12} style={{ color: "#34d399" }} />
            <span style={{ fontSize: 11, color: "#34d399" }}>All critical systems operational</span>
          </div>
        </Card>
      </div>

      <div style={{ height: 24 }} />
    </AdminLayout>
  );
}
