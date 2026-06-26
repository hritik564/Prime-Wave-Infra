import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  X, Copy, UserPlus, TrendingUp, DollarSign, ArrowDownLeft,
  Users, Award, Wallet, ArrowUpRight, ShieldX, KeyRound, LogIn,
  BadgeCheck, Clock, Shield, CheckCircle, Pencil, Trash2,
  ChevronRight, Activity, FileText, BarChart2, Network,
  AlertTriangle, ChevronDown, Download, Search, Pin,
  Globe, CalendarDays, Zap, Eye,
  File, ImageIcon, Receipt,
} from "lucide-react";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";
const BG2    = "hsl(222 62% 10%)";

// ─── Types ────────────────────────────────────────────────────────────────────
type Status   = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type Plan     = "STARTER" | "ALPHA" | "PREMIUM" | "VIP";
type Position = "LEFT" | "RIGHT";
type Rank     = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";
type KYC      = "VERIFIED" | "PENDING" | "REJECTED" | "UNSUBMITTED";

export interface DrawerMember {
  id: string; username: string; firstName: string; lastName: string;
  email: string; phone: string; country: string; status: Status;
  plan: Plan | null; investment: number; position: Position | null;
  rank: Rank | null; sponsor: string | null; joinedAt: Date;
  referralCode: string; kyc: KYC; directReferrals: number;
  totalTeam: number; leftBV: number; rightBV: number;
  carryForward: number; depositWallet: number;
  incomeWallet: number; withdrawalWallet: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $   = (n: number) => n === 0 ? "—" : `$${n.toLocaleString()}`;
const dt  = (d: Date)   => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dtt = (d: Date)   => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ago = (d: Date)   => {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return "Just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
};
const initials = (f: string, l: string) => `${f[0] ?? "?"}${l[0] ?? ""}`.toUpperCase();
function seeded(n: number, max: number, min = 0) {
  return Math.floor(((Math.sin(n * 9301 + 49297) * 0.5 + 0.5)) * (max - min) + min);
}

// Country flags
const FLAG: Record<string, string> = {
  "United States":"🇺🇸","United Kingdom":"🇬🇧","Canada":"🇨🇦","Australia":"🇦🇺",
  "Germany":"🇩🇪","France":"🇫🇷","Singapore":"🇸🇬","UAE":"🇦🇪","Nigeria":"🇳🇬",
  "India":"🇮🇳","Philippines":"🇵🇭","Malaysia":"🇲🇾","South Africa":"🇿🇦","Brazil":"🇧🇷","Mexico":"🇲🇽",
};

// ─── Badge helpers ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<Status, { color: string; bg: string }> = {
  ACTIVE:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"   },
  INACTIVE:  { color: MUTED,     bg: "rgba(170,179,197,0.08)"  },
  SUSPENDED: { color: "#f87171", bg: "rgba(248,113,113,0.12)"  },
};
const KYC_CFG: Record<KYC, { color: string; bg: string; label: string }> = {
  VERIFIED:    { color: "#34d399", bg: "rgba(52,211,153,0.12)",  label: "KYC ✓"       },
  PENDING:     { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  label: "KYC Pending" },
  REJECTED:    { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "KYC ✗"       },
  UNSUBMITTED: { color: MUTED,     bg: "rgba(170,179,197,0.06)", label: "No KYC"      },
};
const PLAN_CFG: Record<string, { color: string; bg: string }> = {
  STARTER: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  ALPHA:   { color: GOLD,      bg: "rgba(212,175,55,0.1)"  },
  PREMIUM: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  VIP:     { color: "#34d399", bg: "rgba(52,211,153,0.1)"  },
};
const RANK_NEXT: Record<Rank, { next: string; progress: number }> = {
  BRONZE:  { next: "Silver",   progress: 35 },
  SILVER:  { next: "Gold",     progress: 60 },
  GOLD:    { next: "Diamond",  progress: 78 },
  DIAMOND: { next: "—",        progress: 100 },
};

function Pill({ label, color, bg, size = 10 }: { label: string; color: string; bg: string; size?: number }) {
  return <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "0.05em", color, background: bg, padding: "2px 7px", borderRadius: 4 }}>{label}</span>;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ m, size = 36, online }: { m: DrawerMember; size?: number; online?: boolean }) {
  const col = m.status === "ACTIVE" ? "#34d399" : m.status === "SUSPENDED" ? "#f87171" : MUTED;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: size/2, background: "linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.05) 100%)", border: `1.5px solid ${col}50`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: size*0.33, fontWeight: 700, boxShadow: `0 0 0 3px ${col}15` }}>
        {initials(m.firstName, m.lastName)}
      </div>
      {online !== undefined && (
        <div style={{ position: "absolute", bottom: 1, right: 1, width: size * 0.22, height: size * 0.22, borderRadius: "50%", background: online ? "#34d399" : "#6b7280", border: `1.5px solid ${BG}` }} />
      )}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <span style={{ fontSize: 12, color: MUTED, flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: accent ? GOLD_L : "rgba(255,255,255,0.8)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED }}>{title}</span>
      {action}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14, ...style }}>{children}</div>;
}

function ProgressBar({ value, color = GOLD, max = 100, label, sublabel }: { value: number; color?: string; max?: number; label?: string; sublabel?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      {(label || sublabel) && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          {label && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>{label}</span>}
          {sublabel && <span style={{ fontSize: 11, color: color, fontWeight: 600 }}>{sublabel}</span>}
        </div>
      )}
      <div style={{ height: 5, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: color, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ─── Health Score ─────────────────────────────────────────────────────────────
function computeHealth(m: DrawerMember) {
  const inv  = m.plan === "VIP" ? 25 : m.plan === "PREMIUM" ? 22 : m.plan === "ALPHA" ? 18 : m.plan === "STARTER" ? 12 : 0;
  const refs = Math.min(20, m.directReferrals * 2);
  const net  = Math.min(20, Math.round(m.totalTeam * 0.4));
  const wdr  = m.withdrawalWallet < 3000 ? 15 : m.withdrawalWallet < 8000 ? 11 : 7;
  const eng  = m.kyc === "VERIFIED" && m.status === "ACTIVE" ? 20 : m.status === "ACTIVE" ? 14 : 5;
  const total = Math.min(100, inv + refs + net + wdr + eng);
  return { total, inv, refs, net, wdr, eng };
}

function HealthScoreCard({ m }: { m: DrawerMember }) {
  const h = useMemo(() => computeHealth(m), [m]);
  const color = h.total >= 80 ? "#34d399" : h.total >= 60 ? GOLD : h.total >= 40 ? "#fbbf24" : "#f87171";
  const cats = [
    { label: "Investment Activity",   val: h.inv,  max: 25, color: GOLD     },
    { label: "Referral Activity",     val: h.refs, max: 20, color: "#60a5fa" },
    { label: "Network Growth",        val: h.net,  max: 20, color: "#a78bfa" },
    { label: "Withdrawal Behaviour",  val: h.wdr,  max: 15, color: "#34d399" },
    { label: "Platform Engagement",   val: h.eng,  max: 20, color: "#fbbf24" },
  ];
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1, fontFamily: "monospace" }}>{h.total}</div>
          <div style={{ fontSize: 9, color: MUTED, letterSpacing: "0.05em", marginTop: 2 }}>/ 100</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)", marginBottom: 2 }}>Member Health Score</div>
          <div style={{ fontSize: 11, color }}>
            {h.total >= 80 ? "Excellent" : h.total >= 60 ? "Good" : h.total >= 40 ? "Fair" : "Needs Attention"}
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 6 }}>
            <div style={{ height: "100%", width: `${h.total}%`, borderRadius: 4, background: `linear-gradient(90deg, ${color}90 0%, ${color} 100%)`, transition: "width 0.8s ease" }} />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {cats.map(c => (
          <ProgressBar key={c.label} label={c.label} sublabel={`${c.val}/${c.max}`} value={c.val} max={c.max} color={c.color} />
        ))}
      </div>
    </Card>
  );
}

// ─── Risk & Alerts ────────────────────────────────────────────────────────────
interface Alert { level: "error" | "warn" | "info"; msg: string; icon: React.ElementType }
function buildAlerts(m: DrawerMember): Alert[] {
  const alerts: Alert[] = [];
  if (m.status === "SUSPENDED")  alerts.push({ level: "error", msg: "Account is currently suspended",             icon: ShieldX });
  if (m.kyc === "REJECTED")      alerts.push({ level: "error", msg: "KYC rejected — re-submission required",      icon: BadgeCheck });
  if (m.kyc === "PENDING")       alerts.push({ level: "warn",  msg: "KYC verification pending",                    icon: Clock });
  if (!m.plan)                   alerts.push({ level: "info",  msg: "No active investment plan",                   icon: TrendingUp });
  const bvRatio = m.leftBV > 0 && m.rightBV > 0 ? Math.max(m.leftBV, m.rightBV) / Math.min(m.leftBV, m.rightBV) : 0;
  if (bvRatio > 2.5)             alerts.push({ level: "warn",  msg: `Binary leg imbalance — ${bvRatio.toFixed(1)}:1 ratio`, icon: Network });
  if (m.withdrawalWallet > 5000) alerts.push({ level: "warn",  msg: `Large balance in withdrawal wallet — ${$(m.withdrawalWallet)}`, icon: Wallet });
  const daysSince = Math.floor((Date.now() - m.joinedAt.getTime()) / 86400000);
  if (daysSince > 30 && m.directReferrals === 0) alerts.push({ level: "info", msg: "No direct referrals since joining", icon: Users });
  return alerts;
}

const ALERT_CFG = {
  error: { color: "#f87171", bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.18)" },
  warn:  { color: "#fbbf24", bg: "rgba(251,191,36,0.07)",  border: "rgba(251,191,36,0.18)"  },
  info:  { color: "#60a5fa", bg: "rgba(96,165,250,0.07)",  border: "rgba(96,165,250,0.18)"  },
};

function RiskAlerts({ m }: { m: DrawerMember }) {
  const alerts = useMemo(() => buildAlerts(m), [m]);
  if (alerts.length === 0) return (
    <Card style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <CheckCircle size={14} style={{ color: "#34d399" }} />
      <span style={{ fontSize: 12, color: "#34d399" }}>No active alerts — member looks healthy.</span>
    </Card>
  );
  return (
    <div style={{ marginBottom: 14 }}>
      <SectionTitle title="RISK & ALERTS" />
      {alerts.map((a, i) => {
        const cfg = ALERT_CFG[a.level];
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, marginBottom: 6 }}>
            <a.icon size={12} style={{ color: cfg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: cfg.color }}>{a.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Financial Snapshot ───────────────────────────────────────────────────────
function FinancialSnapshot({ m }: { m: DrawerMember }) {
  const roi     = m.plan ? Math.round(m.investment * 0.4 * (m.plan === "VIP" ? 0.24 : m.plan === "PREMIUM" ? 0.18 : m.plan === "ALPHA" ? 0.12 : 0.08)) : 0;
  const binary  = seeded(m.directReferrals * 5 + 1, 4000);
  const level   = seeded(m.directReferrals * 7 + 2, 2000);
  const salary  = m.rank === "DIAMOND" ? 2500 : m.rank === "GOLD" ? 1200 : 0;
  const pending = m.withdrawalWallet > 2000 ? Math.round(m.withdrawalWallet * 0.4) : 0;
  const rows = [
    { label: "Total Invested",          value: $(m.investment),            color: GOLD_L    },
    { label: "ROI Earned",              value: $(roi),                     color: "#34d399" },
    { label: "Binary Income",           value: $(binary),                  color: "#a78bfa" },
    { label: "Level Income",            value: $(level),                   color: "#60a5fa" },
    { label: "Salary Income",           value: $(salary),                  color: GOLD      },
    { label: "Deposit Wallet",          value: $(m.depositWallet),         color: MUTED     },
    { label: "Income Wallet",           value: $(m.incomeWallet),          color: MUTED     },
    { label: "Withdrawal Wallet",       value: $(m.withdrawalWallet),      color: MUTED     },
    { label: "Pending Withdrawals",     value: pending > 0 ? $(pending) : "—", color: "#fbbf24" },
  ];
  return (
    <Card>
      <SectionTitle title="FINANCIAL SNAPSHOT" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        {rows.map(r => (
          <div key={r.label} style={{ padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>{r.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: r.color, fontFamily: "monospace" }}>{r.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Network Snapshot ─────────────────────────────────────────────────────────
function NetworkSnapshot({ m }: { m: DrawerMember }) {
  const rankNext = m.rank ? RANK_NEXT[m.rank] : { next: "Bronze", progress: 20 };
  const bvTotal  = m.leftBV + m.rightBV;
  const lPct     = bvTotal > 0 ? Math.round((m.leftBV / bvTotal) * 100) : 50;
  return (
    <Card>
      <SectionTitle title="NETWORK SNAPSHOT" />
      <Row label="Sponsor"         value={m.sponsor ? `@${m.sponsor}` : "—"} />
      <Row label="Position"        value={m.position ?? "—"} />
      <Row label="Direct Referrals"value={m.directReferrals} />
      <Row label="Total Downline"  value={m.totalTeam} />
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: MUTED }}>LEFT BV</span>
          <span style={{ fontSize: 10, color: MUTED }}>RIGHT BV</span>
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
          <div style={{ height: 6, width: `${lPct}%`, background: "#60a5fa", borderRadius: 3 }} />
          <div style={{ height: 6, flex: 1, background: "#a78bfa", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#60a5fa", fontFamily: "monospace" }}>{m.leftBV.toLocaleString()}</span>
          <span style={{ fontSize: 10, color: "#a78bfa", fontFamily: "monospace" }}>{m.rightBV.toLocaleString()}</span>
        </div>
      </div>
      {m.rank && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: MUTED }}>Rank Progress</span>
            <span style={{ fontSize: 10, color: GOLD }}>
              {m.rank} → {rankNext.next !== "—" ? rankNext.next : "MAX"}
            </span>
          </div>
          <ProgressBar value={rankNext.progress} color={GOLD} sublabel={`${rankNext.progress}%`} />
        </div>
      )}
    </Card>
  );
}

// ─── Quick Action Panel ───────────────────────────────────────────────────────
function QuickActionPanel({ onTabSwitch }: { onTabSwitch: (tab: string) => void }) {
  const actions = [
    { icon: BadgeCheck, label: "Approve KYC",      color: "#34d399", bg: "rgba(52,211,153,0.07)"  },
    { icon: ShieldX,    label: "Suspend",           color: "#f87171", bg: "rgba(248,113,113,0.07)" },
    { icon: KeyRound,   label: "Reset Password",    color: "#60a5fa", bg: "rgba(96,165,250,0.07)"  },
    { icon: Network,    label: "Binary Tree",       color: "#a78bfa", bg: "rgba(167,139,250,0.07)" },
    { icon: TrendingUp, label: "Investments",       color: GOLD,      bg: "rgba(212,175,55,0.07)",  tab: "Investments" },
    { icon: Wallet,     label: "Wallets",           color: "#67e8f9", bg: "rgba(103,232,249,0.07)", tab: "Wallets"     },
    { icon: ArrowDownLeft, label: "Withdrawals",    color: "#fbbf24", bg: "rgba(251,191,36,0.07)"  },
    { icon: LogIn,      label: "Impersonate",       color: GOLD_L,    bg: "rgba(212,175,55,0.07)"  },
  ];
  return (
    <div style={{ marginBottom: 14 }}>
      <SectionTitle title="QUICK ACTIONS" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {actions.map(a => (
          <div key={a.label} onClick={() => a.tab && onTabSwitch(a.tab)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: a.bg, border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 8, cursor: "pointer", transition: "opacity 0.15s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.7"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}>
            <a.icon size={12} style={{ color: a.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: a.color, fontWeight: 500 }}>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────
const TABS = ["Overview","Investments","Wallets","Network","Activity","Audit Log","Notes","Documents"] as const;
type Tab = typeof TABS[number];

const TAB_ICONS: Record<Tab, React.ElementType> = {
  Overview: Zap, Investments: TrendingUp, Wallets: Wallet,
  Network: Network, Activity: Activity, "Audit Log": Shield,
  Notes: FileText, Documents: File,
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Overview — complete intelligence view
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ m, onTabSwitch }: { m: DrawerMember; onTabSwitch: (tab: Tab) => void }) {
  return (
    <div>
      <HealthScoreCard m={m} />
      <RiskAlerts m={m} />
      <FinancialSnapshot m={m} />
      <NetworkSnapshot m={m} />
      <MiniTimeline m={m} onViewAll={() => onTabSwitch("Activity")} />
      <QuickActionPanel onTabSwitch={onTabSwitch} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Investments
// ─────────────────────────────────────────────────────────────────────────────
function InvestmentsTab({ m }: { m: DrawerMember }) {
  const inv = m.plan ? [{
    id: `INV${m.id.slice(-5)}01`, plan: m.plan, amount: m.investment,
    roi: m.plan === "VIP" ? 24 : m.plan === "PREMIUM" ? 18 : m.plan === "ALPHA" ? 12 : 8,
    duration: m.plan === "PREMIUM" || m.plan === "VIP" ? 365 : 180,
    started: new Date(m.joinedAt.getTime() + 86400000 * 3), status: "ACTIVE",
  }] : [];
  const roiEarned = m.plan ? Math.round(m.investment * (inv[0]?.roi ?? 0) / 100 * 0.4) : 0;
  if (!m.plan) return <div style={{ textAlign: "center", padding: 32, color: MUTED, fontSize: 13 }}>No active investment plan.</div>;
  return (
    <div>
      {inv.map(i => (
        <Card key={i.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{i.plan} Plan</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{i.id} · Started {dt(i.started)}</div>
            </div>
            <Pill label={i.status} color="#34d399" bg="rgba(52,211,153,0.1)" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Principal",  value: $(i.amount),        color: GOLD_L    },
              { label: "ROI Rate",   value: `${i.roi}% p.a.`,   color: "#34d399" },
              { label: "Duration",   value: `${i.duration}d`,   color: MUTED     },
            ].map(s => (
              <div key={s.label} style={{ background: CARD, borderRadius: 7, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <ProgressBar label="ROI Progress (40% elapsed)" sublabel={$(roiEarned)} value={40} color={GOLD} />
        </Card>
      ))}
      <SectionTitle title="TRANSACTION HISTORY" />
      {[
        { type: "Investment Deposit", amount: m.investment, date: new Date(m.joinedAt.getTime() + 86400000*3), color: "#60a5fa" },
        { type: "ROI Credit",         amount: roiEarned,    date: new Date(Date.now()-86400000*14),            color: "#34d399" },
        { type: "ROI Credit",         amount: Math.round(roiEarned*.6), date: new Date(Date.now()-86400000*44),color: "#34d399" },
      ].map((tx,i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{tx.type}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{dt(tx.date)}</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: tx.color, fontFamily: "monospace" }}>{$(tx.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Wallets
// ─────────────────────────────────────────────────────────────────────────────
function WalletsTab({ m }: { m: DrawerMember }) {
  const wallets = [
    { label: "Deposit Wallet",    balance: m.depositWallet,    color: "#60a5fa", icon: ArrowDownLeft },
    { label: "Income Wallet",     balance: m.incomeWallet,     color: "#34d399", icon: TrendingUp    },
    { label: "Withdrawal Wallet", balance: m.withdrawalWallet, color: GOLD,      icon: Wallet        },
  ];
  const txMock = [
    { label: "Investment Deposit",  wallet: "Deposit",    amount: m.investment,     sign: "+", color: "#60a5fa", date: new Date(m.joinedAt.getTime()+86400000*3) },
    { label: "ROI Credit",          wallet: "Income",     amount: seeded(m.directReferrals*3,2000,50), sign: "+", color: "#34d399", date: new Date(Date.now()-86400000*7) },
    { label: "Withdrawal Request",  wallet: "Withdrawal", amount: seeded(m.directReferrals*7,1500,20), sign: "−", color: "#f87171", date: new Date(Date.now()-86400000*3) },
    { label: "Level Income",        wallet: "Income",     amount: seeded(m.directReferrals,400,10),    sign: "+", color: "#34d399", date: new Date(Date.now()-86400000*1) },
  ];
  return (
    <div>
      {wallets.map(w => (
        <div key={w.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `${w.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <w.icon size={15} style={{ color: w.color }} />
            </div>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{w.label}</span>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: w.color, fontFamily: "monospace" }}>{$(w.balance)}</span>
        </div>
      ))}
      <SectionTitle title="RECENT TRANSACTIONS" />
      {txMock.map((tx, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{tx.label}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{tx.wallet} · {dt(tx.date)}</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: tx.color, fontFamily: "monospace" }}>{tx.sign}{$(tx.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Network
// ─────────────────────────────────────────────────────────────────────────────
function NetworkTab({ m }: { m: DrawerMember }) {
  const total = m.leftBV + m.rightBV;
  const leftPct = total > 0 ? Math.round((m.leftBV / total) * 100) : 50;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Left BV",    value: m.leftBV,  color: "#60a5fa", pct: leftPct     },
          { label: "Right BV",   value: m.rightBV, color: "#a78bfa", pct: 100-leftPct },
        ].map(s => (
          <Card key={s.label} style={{ margin: 0 }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "monospace", marginBottom: 8 }}>{s.value.toLocaleString()}</div>
            <ProgressBar value={s.pct} color={s.color} sublabel={`${s.pct}%`} />
          </Card>
        ))}
      </div>
      <Row label="Carry Forward"     value={m.carryForward.toLocaleString()} />
      <Row label="Weaker Leg"        value={Math.min(m.leftBV, m.rightBV).toLocaleString()} />
      <Row label="Direct Referrals"  value={m.directReferrals} />
      <Row label="Total Downline"    value={m.totalTeam} />
      <Row label="Active in Team"    value={Math.round(m.totalTeam * 0.7)} />
      <SectionTitle title="DIRECT REFERRALS" />
      {Array.from({ length: Math.min(m.directReferrals, 5) }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(212,175,55,0.09)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: GOLD }}>{String.fromCharCode(65+i)}</div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>@member_{m.id.slice(-3)}{i}</div>
              <div style={{ fontSize: 9, color: MUTED }}>{i%2===0?"LEFT":"RIGHT"} · Active</div>
            </div>
          </div>
          <ChevronRight size={12} style={{ color: MUTED }} />
        </div>
      ))}
      {m.directReferrals > 5 && <div style={{ fontSize: 11, color: "#60a5fa", textAlign: "center", padding: "8px 0", cursor: "pointer" }}>+{m.directReferrals-5} more</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity helpers
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVITY_TYPES = {
  REGISTRATION:    { icon: UserPlus,      color: "#34d399", label: "Joined Platform"          },
  INVESTMENT:      { icon: TrendingUp,    color: GOLD,      label: "Purchased Plan"            },
  ROI:             { icon: DollarSign,    color: "#34d399", label: "Received ROI"              },
  BINARY_INCOME:   { icon: BarChart2,     color: "#a78bfa", label: "Received Binary Income"    },
  WITHDRAWAL:      { icon: ArrowDownLeft, color: "#fbbf24", label: "Requested Withdrawal"      },
  REFERRAL:        { icon: Users,         color: "#60a5fa", label: "Referral Registered"       },
  RANK_UPGRADE:    { icon: Award,         color: "#a78bfa", label: "Rank Upgraded"             },
  WALLET_TRANSFER: { icon: Wallet,        color: "#67e8f9", label: "Transferred Income"        },
  KYC:             { icon: BadgeCheck,    color: "#34d399", label: "KYC Approved"              },
  PASSWORD:        { icon: KeyRound,      color: "#60a5fa", label: "Password Reset"            },
  LOGIN:           { icon: LogIn,         color: MUTED,     label: "Member Login"              },
} as const;
type ActivityType = keyof typeof ACTIVITY_TYPES;
interface AEvent { type: ActivityType; detail: string; date: Date }

function buildActivity(m: DrawerMember): AEvent[] {
  const b = m.joinedAt.getTime();
  const events: AEvent[] = [
    { type: "REGISTRATION", detail: `Account registered from ${m.country}`, date: new Date(b) },
    { type: "KYC", detail: `KYC ${m.kyc==="VERIFIED"?"verified":"submitted"}`, date: new Date(b+86400000*2) },
  ];
  if (m.plan) {
    events.push({ type: "INVESTMENT",    detail: `${m.plan} plan — ${$(m.investment)}`,             date: new Date(b+86400000*4) });
    events.push({ type: "ROI",           detail: "ROI credit received",                              date: new Date(b+86400000*34) });
    events.push({ type: "BINARY_INCOME", detail: `Binary income credited`,                           date: new Date(b+86400000*50) });
  }
  if (m.rank)              events.push({ type: "RANK_UPGRADE",    detail: `Upgraded to ${m.rank}`,     date: new Date(b+86400000*20) });
  if (m.directReferrals>0) events.push({ type: "REFERRAL",        detail: `${m.directReferrals} referral${m.directReferrals>1?"s":""} joined`, date: new Date(b+86400000*10) });
  if (m.withdrawalWallet>0)events.push({ type: "WITHDRAWAL",      detail: `Withdrawal — ${$(Math.round(m.withdrawalWallet*.6))}`, date: new Date(Date.now()-86400000*5) });
  events.push({ type: "LOGIN", detail: "Last platform login", date: new Date(Date.now()-3600000*8) });
  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini timeline (Overview card)
// ─────────────────────────────────────────────────────────────────────────────
function MiniTimeline({ m, onViewAll }: { m: DrawerMember; onViewAll: () => void }) {
  const events = useMemo(() => buildActivity(m).slice(0, 8), [m]);
  return (
    <div style={{ marginBottom: 14 }}>
      <SectionTitle title="RECENT ACTIVITY" action={
        <button onClick={onViewAll} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#60a5fa", display: "flex", alignItems: "center", gap: 3 }}>
          View All <ChevronRight size={9} />
        </button>
      } />
      {events.map((e, i) => {
        const cfg = ACTIVITY_TYPES[e.type];
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "6px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: `${cfg.color}12`, border: `1px solid ${cfg.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <cfg.icon size={10} style={{ color: cfg.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{cfg.label}</div>
              <div style={{ fontSize: 10, color: MUTED }}>{e.detail}</div>
            </div>
            <span style={{ fontSize: 9, color: MUTED, whiteSpace: "nowrap", marginTop: 2 }}>{ago(e.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Activity (full timeline)
// ─────────────────────────────────────────────────────────────────────────────
function ActivityTab({ m }: { m: DrawerMember }) {
  const events = useMemo(() => buildActivity(m), [m]);
  return (
    <div>
      <SectionTitle title="MEMBER ACTIVITY TIMELINE" />
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 15, top: 8, bottom: 0, width: 1, background: BORDER }} />
        {events.map((e, i) => {
          const cfg = ACTIVITY_TYPES[e.type];
          return (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, position: "relative" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${cfg.color}12`, border: `1.5px solid ${cfg.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                <cfg.icon size={13} style={{ color: cfg.color }} />
              </div>
              <div style={{ paddingTop: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.82)" }}>{cfg.label}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{e.detail}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{dtt(e.date)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Audit Log (with search + device)
// ─────────────────────────────────────────────────────────────────────────────
interface AuditEntry { action: string; admin: string; ip: string; date: Date; device: string; icon: React.ElementType; color: string; status: "SUCCESS" | "INFO" | "WARN" }

const DEVICES = ["Chrome on Windows","Firefox on macOS","Mobile App (iOS)","Mobile App (Android)","Safari on macOS","Admin Portal"];

function buildAudit(m: DrawerMember): AuditEntry[] {
  const b = m.joinedAt.getTime();
  return [
    { action: "Account Created",       admin: "system",             ip: "—",             device: "system",                date: new Date(b),                     icon: UserPlus,    color: "#34d399", status: "SUCCESS" },
    { action: "Email Verified",        admin: "system",             ip: "203.0.113.45",  device: DEVICES[0],              date: new Date(b+3600000),             icon: CheckCircle, color: "#34d399", status: "SUCCESS" },
    { action: "KYC Submitted",         admin: m.username,           ip: "198.51.100.72", device: DEVICES[2],              date: new Date(b+86400000*2),          icon: BadgeCheck,  color: "#fbbf24", status: "INFO"    },
    ...(m.kyc==="VERIFIED"?[{ action: "KYC Approved", admin: "kyc@primewave.io",  ip: "10.0.0.1",  device: DEVICES[5], date: new Date(b+86400000*3),  icon: BadgeCheck,  color: "#34d399", status: "SUCCESS" as const }]:[]),
    ...(m.plan?[{ action: `Investment Approved (${m.plan})`, admin: "admin@primewave.io", ip: "10.0.0.2", device: DEVICES[5], date: new Date(b+86400000*4), icon: TrendingUp, color: GOLD, status: "SUCCESS" as const }]:[]),
    { action: "Password Reset",        admin: "admin@primewave.io", ip: "10.0.0.1",      device: DEVICES[5],              date: new Date(Date.now()-86400000*14), icon: KeyRound,    color: "#60a5fa", status: "INFO"    },
    { action: "Admin Login As User",   admin: "admin@primewave.io", ip: "10.0.0.3",      device: DEVICES[5],              date: new Date(Date.now()-86400000*7),  icon: LogIn,       color: GOLD,      status: "WARN"    },
    { action: "Profile Updated",       admin: "admin@primewave.io", ip: "10.0.0.1",      device: DEVICES[5],              date: new Date(Date.now()-86400000*2),  icon: Pencil,      color: "#a78bfa", status: "INFO"    },
  ].sort((a, b) => b.date.getTime() - a.date.getTime()) as AuditEntry[];
}

function AuditLogTab({ m }: { m: DrawerMember }) {
  const entries  = useMemo(() => buildAudit(m), [m]);
  const [query,  setQuery]  = useState("");
  const filtered = entries.filter(e =>
    !query || e.action.toLowerCase().includes(query.toLowerCase()) || e.admin.toLowerCase().includes(query.toLowerCase())
  );
  const STATUS_COLOR = { SUCCESS: "#34d399", INFO: "#60a5fa", WARN: "#fbbf24" };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px" }}>
          <Search size={12} style={{ color: MUTED }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search audit log…" style={{ background: "none", border: "none", outline: "none", fontSize: 11, color: "rgba(255,255,255,0.75)", width: "100%" }} />
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontSize: 11, color: MUTED }}>
          <Download size={11} /> Export
        </button>
      </div>
      {filtered.map((e, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `${e.color}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            <e.icon size={12} style={{ color: e.color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{e.action}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COLOR[e.status], background: `${STATUS_COLOR[e.status]}15`, padding: "1px 6px", borderRadius: 3 }}>{e.status}</span>
            </div>
            <div style={{ fontSize: 10, color: "#60a5fa", marginTop: 2 }}>{e.admin}</div>
            <div style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>IP: {e.ip} · {e.device}</div>
          </div>
          <div style={{ fontSize: 9, color: MUTED, whiteSpace: "nowrap", textAlign: "right", marginTop: 2 }}>
            {dtt(e.date)}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: 24, color: MUTED, fontSize: 12 }}>No results for "{query}"</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Notes (with pinned support)
// ─────────────────────────────────────────────────────────────────────────────
interface Note { id: number; text: string; date: Date; admin: string; pinned: boolean }

function NotesTab({ m }: { m: DrawerMember }) {
  const [notes, setNotes] = useState<Note[]>([
    { id: 1, text: "Member contacted support regarding delayed withdrawal. Escalated to finance team.", date: new Date(Date.now()-86400000*5), admin: "support@primewave.io", pinned: true },
    { id: 2, text: "KYC documents re-requested. Member submitted passport and utility bill.", date: new Date(Date.now()-86400000*12), admin: "kyc@primewave.io", pinned: false },
  ]);
  const [draft, setDraft] = useState("");

  const addNote = useCallback(() => {
    if (!draft.trim()) return;
    setNotes(prev => [{ id: Date.now(), text: draft.trim(), date: new Date(), admin: "admin@primewave.io", pinned: false }, ...prev]);
    setDraft("");
  }, [draft]);

  const togglePin = useCallback((id: number) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  }, []);

  const sorted = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.date.getTime() - a.date.getTime());

  return (
    <div>
      {/* Add note */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: GOLD }}>A</div>
          <span style={{ fontSize: 11, color: MUTED }}>admin@primewave.io</span>
        </div>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add an admin note…" style={{ width: "100%", minHeight: 70, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "9px 10px", fontSize: 12, color: "rgba(255,255,255,0.78)", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
        <button onClick={addNote} disabled={!draft.trim()} style={{ padding: "7px 16px", background: draft.trim() ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${draft.trim() ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 7, cursor: draft.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, color: draft.trim() ? GOLD_L : MUTED }}>
          Add Note
        </button>
      </Card>

      <SectionTitle title={`${notes.length} NOTE${notes.length !== 1 ? "S" : ""}`} />
      {sorted.map(n => (
        <div key={n.id} style={{ background: n.pinned ? "rgba(212,175,55,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${n.pinned ? "rgba(212,175,55,0.15)" : BORDER}`, borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: GOLD }}>A</div>
            <span style={{ fontSize: 11, color: "#60a5fa" }}>{n.admin}</span>
            {n.pinned && <Pin size={9} style={{ color: GOLD }} />}
            <span style={{ fontSize: 10, color: MUTED, marginLeft: "auto" }}>{dtt(n.date)}</span>
            <button onClick={() => togglePin(n.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: n.pinned ? GOLD : MUTED }}
              title={n.pinned ? "Unpin" : "Pin"}>
              <Pin size={11} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, margin: 0 }}>{n.text}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Documents
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_DOCS = [
  { name: "passport.jpg",      type: "Passport",          status: "VERIFIED",  size: "2.3 MB", icon: ImageIcon, color: "#34d399" },
  { name: "utility_bill.pdf",  type: "Proof of Address",  status: "PENDING",   size: "1.1 MB", icon: FileText,  color: "#fbbf24" },
  { name: "selfie_id.jpg",     type: "Selfie with ID",    status: "VERIFIED",  size: "3.7 MB", icon: ImageIcon, color: "#34d399" },
  { name: "pan_card.pdf",      type: "PAN / Tax ID",      status: "PENDING",   size: "0.6 MB", icon: FileText,  color: "#fbbf24" },
  { name: "bank_statement.pdf",type: "Bank Statement",    status: "UNSUBMITTED",size:"—",       icon: Receipt,   color: MUTED     },
  { name: "investment_receipt.pdf", type: "Investment Receipt", status: "VERIFIED", size: "0.8 MB", icon: Receipt, color: "#34d399" },
];
const DOC_STATUS_CFG: Record<string, { color: string; bg: string }> = {
  VERIFIED:    { color: "#34d399", bg: "rgba(52,211,153,0.1)"   },
  PENDING:     { color: "#fbbf24", bg: "rgba(251,191,36,0.1)"   },
  UNSUBMITTED: { color: MUTED,     bg: "rgba(170,179,197,0.06)" },
};

function DocumentsTab({ m }: { m: DrawerMember }) {
  const verifiedCount = MOCK_DOCS.filter(d => d.status === "VERIFIED").length;
  return (
    <div>
      <Card style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: verifiedCount >= 4 ? "rgba(52,211,153,0.1)" : "rgba(251,191,36,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BadgeCheck size={16} style={{ color: verifiedCount >= 4 ? "#34d399" : "#fbbf24" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>KYC Status: <span style={{ color: KYC_CFG[m.kyc].color }}>{KYC_CFG[m.kyc].label}</span></div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{verifiedCount} of {MOCK_DOCS.length} documents verified</div>
        </div>
      </Card>
      <SectionTitle title="SUBMITTED DOCUMENTS" />
      {MOCK_DOCS.map((doc, i) => {
        const cfg = DOC_STATUS_CFG[doc.status];
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${doc.color}12`, border: `1px solid ${doc.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <doc.icon size={14} style={{ color: doc.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{doc.type}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{doc.name} {doc.size !== "—" ? `· ${doc.size}` : ""}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "2px 7px", borderRadius: 4 }}>{doc.status}</span>
              {doc.status !== "UNSUBMITTED" && (
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#60a5fa", display: "flex", alignItems: "center", gap: 3, fontSize: 9 }}>
                  <Download size={10} /> Download
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header quick-actions dropdown
// ─────────────────────────────────────────────────────────────────────────────
function HeaderActions({ m, onTabSwitch }: { m: DrawerMember; onTabSwitch: (tab: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const actions = [
    { icon: Eye,        label: "View Profile",   color: "rgba(255,255,255,0.7)" },
    { icon: Pencil,     label: "Edit Member",    color: "rgba(255,255,255,0.7)" },
    { icon: BadgeCheck, label: "Approve KYC",   color: "#34d399"                },
    { icon: ShieldX,    label: "Suspend Member",color: "#f87171"                },
    { icon: KeyRound,   label: "Reset Password",color: "#60a5fa"                },
    { icon: LogIn,      label: "Login As User",  color: GOLD                    },
    { icon: Trash2,     label: "Delete Member",  color: "#f87171"               },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 5, background: open ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
        Actions <ChevronDown size={10} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20, background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 9, minWidth: 170, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          {actions.map((a, i) => (
            <div key={a.label}>
              {(i === 2 || i === 5) && <div style={{ height: 1, background: BORDER }} />}
              <div onClick={() => setOpen(false)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", cursor: "pointer", color: a.color, fontSize: 12 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                <a.icon size={13} style={{ flexShrink: 0 }} />{a.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MemberDrawer — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function MemberDrawer({ member, onClose }: { member: DrawerMember | null; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const visible = !!member;
  const prevId  = useRef<string | null>(null);

  if (member && member.id !== prevId.current) {
    prevId.current = member.id;
    if (activeTab !== "Overview") setActiveTab("Overview");
  }

  const isOnline = member ? seeded(parseInt(member.id.slice(-3)), 3) === 0 : false;
  const lastLogin = member ? new Date(Date.now() - 3600000 * seeded(parseInt(member.id.slice(-3)) + 1, 48, 1)) : new Date();

  const pc = member?.plan ? PLAN_CFG[member.plan] : null;
  const kc = member ? KYC_CFG[member.kyc] : null;
  const sc = member ? STATUS_CFG[member.status] : null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none", transition: "opacity 0.2s ease" }} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: 520, background: BG, borderLeft: `1px solid ${BORDER}`, boxShadow: "-24px 0 64px rgba(0,0,0,0.6)", transform: visible ? "translateX(0)" : "translateX(100%)", transition: "transform 0.24s cubic-bezier(0.32,0.72,0,1)", display: "flex", flexDirection: "column" }}>
        {member && sc && kc && (
          <>
            {/* ── Upgraded header ─────────────────────────────────────────── */}
            <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, background: "linear-gradient(180deg, rgba(212,175,55,0.04) 0%, transparent 100%)" }}>
              {/* Top row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                <Avatar m={member} size={52} online={isOnline} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>@{member.username}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: isOnline ? "#34d399" : MUTED, background: isOnline ? "rgba(52,211,153,0.1)" : "rgba(170,179,197,0.06)", padding: "1px 6px", borderRadius: 4 }}>
                      {isOnline ? "● Online" : "○ Offline"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>{member.firstName} {member.lastName}</div>
                  <div style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>{member.id}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <HeaderActions m={member} onTabSwitch={setActiveTab} />
                  <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", color: MUTED, padding: "6px 8px", display: "flex" }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Badges row */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                <Pill label={member.status} color={sc.color} bg={sc.bg} />
                {member.plan && pc && <Pill label={member.plan} color={pc.color} bg={pc.bg} />}
                {member.rank && <Pill label={member.rank} color={GOLD} bg="rgba(212,175,55,0.1)" />}
                <Pill label={kc.label} color={kc.color} bg={kc.bg} />
              </div>

              {/* Meta row */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Globe size={10} style={{ color: MUTED }} />
                  <span style={{ fontSize: 10, color: MUTED }}>{FLAG[member.country] ?? ""} {member.country}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <CalendarDays size={10} style={{ color: MUTED }} />
                  <span style={{ fontSize: 10, color: MUTED }}>Joined {dt(member.joinedAt)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock size={10} style={{ color: MUTED }} />
                  <span style={{ fontSize: 10, color: MUTED }}>Last login {ago(lastLogin)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                  <Copy size={10} style={{ color: MUTED }} />
                  <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>{member.referralCode}</span>
                </div>
              </div>
            </div>

            {/* ── Tab bar ──────────────────────────────────────────────────── */}
            <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, overflowX: "auto" }}>
              {TABS.map(tab => {
                const Icon   = TAB_ICONS[tab];
                const active = tab === activeTab;
                return (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "9px 11px", background: "none", border: "none", borderBottom: `2px solid ${active ? GOLD : "transparent"}`, cursor: "pointer", color: active ? GOLD_L : MUTED, fontSize: 10, fontWeight: active ? 700 : 400, whiteSpace: "nowrap", transition: "color 0.15s", flexShrink: 0 }}>
                    <Icon size={10} />
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* ── Tab content ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 28px" }}>
              {activeTab === "Overview"    && <OverviewTab    m={member} onTabSwitch={setActiveTab} />}
              {activeTab === "Investments" && <InvestmentsTab m={member} />}
              {activeTab === "Wallets"     && <WalletsTab     m={member} />}
              {activeTab === "Network"     && <NetworkTab     m={member} />}
              {activeTab === "Activity"    && <ActivityTab    m={member} />}
              {activeTab === "Audit Log"   && <AuditLogTab    m={member} />}
              {activeTab === "Notes"       && <NotesTab       m={member} />}
              {activeTab === "Documents"   && <DocumentsTab   m={member} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}
