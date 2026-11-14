import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { type AdminUserDetail, type AdminWalletTx, type AdminWalletDetail, type WalletChangeAuditLogEntry, adminUpdateUserWallet, getWalletAuditLogs } from "@/lib/api";
import { getAdminToken, getAdminRole } from "@/lib/auth";
import {
  X, Copy, UserPlus, TrendingUp, DollarSign, ArrowDownLeft,
  Users, Award, Wallet, ArrowUpRight, ShieldX, KeyRound, LogIn,
  BadgeCheck, Clock, Shield, CheckCircle, Pencil, Trash2,
  ChevronRight, Activity, FileText, BarChart2, Network,
  AlertTriangle, ChevronDown, Download, Search, Pin,
  Globe, CalendarDays, Zap, Eye, UserCheck,
  File, ImageIcon, Receipt, CreditCard,
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
type Status   = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BLOCKED";
type Plan     = "STARTER" | "ALPHA" | "PREMIUM" | "VIP";
type Position = "LEFT" | "RIGHT";
type Rank     = "Bronze" | "Silver" | "Gold" | "Platinum" | "Sapphire" | "Ruby" | "Emerald" | "Diamond" | "Ambassador" | "Sovereign Crown";
type KYC      = "VERIFIED" | "PENDING" | "REJECTED" | "UNSUBMITTED";

export interface DrawerMember {
  id: string; username: string; firstName: string; lastName: string;
  email: string; phone: string; country: string; status: Status;
  operationalStatus: "ACTIVE" | "INACTIVE";
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
  BLOCKED:   { color: "#f87171", bg: "rgba(248,113,113,0.12)"  },
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
  "Bronze":         { next: "Silver",         progress: 10  },
  "Silver":         { next: "Gold",           progress: 25  },
  "Gold":           { next: "Platinum",       progress: 40  },
  "Platinum":       { next: "Sapphire",       progress: 55  },
  "Sapphire":       { next: "Ruby",           progress: 65  },
  "Ruby":           { next: "Emerald",        progress: 75  },
  "Emerald":        { next: "Diamond",        progress: 83  },
  "Diamond":        { next: "Ambassador",     progress: 90  },
  "Ambassador":     { next: "Sovereign Crown",progress: 96  },
  "Sovereign Crown":{ next: "—",              progress: 100 },
};

// ─── Transaction Timeline Config ──────────────────────────────────────────────
const CREDIT_TYPES = new Set([
  "DEPOSIT","ROI_CLAIM","PRINCIPAL_RELEASE","BINARY_MATCH","BINARY_ORBIT","LEVEL_INCOME","SALARY",
]);

interface TxCfg { emoji: string; label: string; filterLabel: string }
const TX_CFG: Record<string, TxCfg> = {
  DEPOSIT:           { emoji: "📥", label: "Deposit",             filterLabel: "Deposit"          },
  INVESTMENT:        { emoji: "💰", label: "Investment Purchase",  filterLabel: "Investment"       },
  ROI_CLAIM:         { emoji: "📈", label: "Daily ROI",            filterLabel: "Daily ROI"        },
  PRINCIPAL_RELEASE: { emoji: "💰", label: "Principal Return",     filterLabel: "Principal Return" },
  BINARY_MATCH:      { emoji: "⚖",  label: "Binary Matching Bonus", filterLabel: "Binary Matching"  },
  BINARY_ORBIT:      { emoji: "🔄", label: "Binary Orbit Bonus",   filterLabel: "Binary Orbit"     },
  LEVEL_INCOME:      { emoji: "👥", label: "Level Income",         filterLabel: "Level Income"     },
  SALARY:            { emoji: "🏆", label: "Rank Salary",          filterLabel: "Rank Salary"      },
  WITHDRAWAL:        { emoji: "💸", label: "Withdrawal",           filterLabel: "Withdrawal"       },
  INCOME_TRANSFER:   { emoji: "🔄", label: "Income Transfer",      filterLabel: "Transfer"         },
};
const TX_FILTER_OPTIONS = [
  "All","Deposit","Investment","Daily ROI","Level Income",
  "Binary Matching","Binary Orbit","Rank Salary","Withdrawal","Transfer","Principal Return",
];

function txLabel(type: string)   { return TX_CFG[type]?.label      ?? type.replace(/_/g, " "); }
function txEmoji(type: string)   { return TX_CFG[type]?.emoji      ?? "📝"; }
function txIsCredit(type: string){ return CREDIT_TYPES.has(type); }

function txAmountColor(tx: AdminWalletTx) {
  if (tx.status === "FAILED")  return "rgba(107,114,128,0.9)";
  if (tx.status === "PENDING") return "#fbbf24";
  return txIsCredit(tx.type) ? "#34d399" : "#f87171";
}
function txSign(tx: AdminWalletTx) {
  if (tx.status !== "SUCCESS") return "";
  return txIsCredit(tx.type) ? "+" : "−";
}

const $$ = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
};

function txMeta(tx: AdminWalletTx): Record<string, unknown> {
  if (!tx.metadata || typeof tx.metadata !== "object") return {};
  return tx.metadata as Record<string, unknown>;
}

function txMatchesFilter(tx: AdminWalletTx, f: string) {
  if (f === "All") return true;
  return (TX_CFG[tx.type]?.filterLabel ?? "") === f;
}

function txMatchesSearch(tx: AdminWalletTx, q: string) {
  if (!q) return true;
  const lower = q.toLowerCase();
  const m = txMeta(tx);
  return (
    tx.id.toLowerCase().includes(lower) ||
    (tx.description ?? "").toLowerCase().includes(lower) ||
    String(m["investmentId"]  ?? "").toLowerCase().includes(lower) ||
    String(m["sourceUserId"]  ?? "").toLowerCase().includes(lower)
  );
}

// Compute running balances walking newest-first through txs
function computeBalances(txs: AdminWalletTx[], currentTotal: number) {
  let bal = currentTotal;
  return txs.map(tx => {
    const amt     = parseFloat(tx.amount) || 0;
    const success = tx.status === "SUCCESS";
    const credit  = txIsCredit(tx.type);
    const balAfter  = bal;
    const balBefore = success ? (credit ? bal - amt : bal + amt) : bal;
    if (success) bal = credit ? bal - amt : bal + amt;
    return { before: balBefore, after: balAfter };
  });
}

function exportTxCsv(txs: AdminWalletTx[], bals: { before: number; after: number }[], username: string) {
  const headers = ["Date UTC","Type","Title","Status","Amount","Balance Before","Balance After","Transaction ID","Description"];
  const rows = txs.map((tx, i) => [
    new Date(tx.createdAt).toISOString(),
    tx.type,
    txLabel(tx.type),
    tx.status,
    (txIsCredit(tx.type) ? "+" : "-") + parseFloat(tx.amount).toFixed(8),
    bals[i].before.toFixed(8),
    bals[i].after.toFixed(8),
    tx.id,
    tx.description ?? "",
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions_${username}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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
const RANK_ORDER: Rank[] = ["Bronze","Silver","Gold","Platinum","Sapphire","Ruby","Emerald","Diamond","Ambassador","Sovereign Crown"];
function rankTier(r: string | null): number {
  if (!r) return 0;
  const idx = RANK_ORDER.indexOf(r as Rank);
  return idx >= 0 ? idx + 1 : 0;
}

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
  const tier    = rankTier(m.rank);
  const salary  = tier >= 8 ? 2500 : tier >= 7 ? 1500 : tier >= 6 ? 1000 : tier >= 5 ? 500 : tier >= 4 ? 250 : tier >= 3 ? 125 : 0;
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
  const rankNext = m.rank ? (RANK_NEXT[m.rank] ?? { next: "—", progress: 0 }) : { next: "Bronze", progress: 20 };
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
function QuickActionPanel({ m, onTabSwitch, onAction }: { m: DrawerMember; onTabSwitch: (tab: string) => void; onAction: (label: string) => void }) {
  const suspended = m.status === "SUSPENDED" || m.status === "INACTIVE" || m.status === "BLOCKED";
  const actions = [
    { icon: BadgeCheck,    label: "Approve KYC",   color: "#34d399", bg: "rgba(52,211,153,0.07)",   action: "Approve KYC"    },
    suspended
      ? { icon: UserCheck, label: "Activate",      color: "#34d399", bg: "rgba(52,211,153,0.07)",   action: "Activate Member" }
      : { icon: ShieldX,   label: "Suspend",       color: "#f87171", bg: "rgba(248,113,113,0.07)",  action: "Suspend Member"  },
    { icon: KeyRound,      label: "Reset Password",color: "#60a5fa", bg: "rgba(96,165,250,0.07)",   action: "Reset Password"  },
    { icon: Network,       label: "Binary Tree",   color: "#a78bfa", bg: "rgba(167,139,250,0.07)",  tab:    "Network"         },
    { icon: TrendingUp,    label: "Investments",   color: GOLD,      bg: "rgba(212,175,55,0.07)",   tab:    "Investments"     },
    { icon: Wallet,        label: "Wallets",       color: "#67e8f9", bg: "rgba(103,232,249,0.07)",  tab:    "Wallets"         },
    { icon: ArrowDownLeft, label: "Withdrawals",   color: "#fbbf24", bg: "rgba(251,191,36,0.07)",   tab:    "Wallets"         },
    { icon: LogIn,         label: "Impersonate",   color: GOLD_L,    bg: "rgba(212,175,55,0.07)",   action: "Login As User"   },
  ] as { icon: React.ElementType; label: string; color: string; bg: string; action?: string; tab?: string }[];
  return (
    <div style={{ marginBottom: 14 }}>
      <SectionTitle title="QUICK ACTIONS" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {actions.map(a => (
          <div key={a.label}
            onClick={() => { if (a.action) onAction(a.action); else if (a.tab) onTabSwitch(a.tab); }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: a.bg, border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 8, cursor: "pointer", transition: "opacity 0.15s" }}
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
const TABS = ["Overview","Investments","Wallets","Transactions","Network","Activity","Audit Log","Notes","Documents","Power BV"] as const;
type Tab = typeof TABS[number];

const TAB_ICONS: Record<Tab, React.ElementType> = {
  Overview: Zap, Investments: TrendingUp, Wallets: Wallet,
  Transactions: CreditCard,
  Network: Network, Activity: Activity, "Audit Log": Shield,
  Notes: FileText, Documents: File, "Power BV": BarChart2,
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Overview — complete intelligence view
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ m, onTabSwitch, onAction }: { m: DrawerMember; onTabSwitch: (tab: Tab) => void; onAction: (label: string) => void }) {
  return (
    <div>
      <HealthScoreCard m={m} />
      <RiskAlerts m={m} />
      <FinancialSnapshot m={m} />
      <NetworkSnapshot m={m} />
      <MiniTimeline m={m} onViewAll={() => onTabSwitch("Activity")} />
      <QuickActionPanel m={m} onTabSwitch={onTabSwitch} onAction={onAction} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Investments
// ─────────────────────────────────────────────────────────────────────────────
function InvestmentsTab({ detail }: { m: DrawerMember; detail?: AdminUserDetail | null }) {
  if (!detail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1,2].map(i => <div key={i} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, height: 130, opacity: 0.5 }} />)}
      </div>
    );
  }
  const investments = detail.investments;
  if (investments.length === 0) {
    return <div style={{ textAlign: "center", padding: 40, color: MUTED, fontSize: 13 }}>No investment history.</div>;
  }
  return (
    <div>
      {investments.map(inv => {
        const amount    = parseFloat(String(inv.amount)) || 0;
        const claimable = parseFloat(String(inv.claimableROI)) || 0;
        const dailyROI  = parseFloat(String(inv.dailyROI)) || 0;
        const isActive  = inv.status === "ACTIVE";
        const pc        = PLAN_CFG[inv.planType] ?? { color: MUTED, bg: "rgba(170,179,197,0.06)" };
        return (
          <Card key={inv.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)", marginBottom: 2 }}>{inv.planType} Plan</div>
                <div style={{ fontSize: 10, color: MUTED }}>
                  {inv.id.slice(0, 18)}… · {inv.startedAt ? `Started ${dt(new Date(inv.startedAt))}` : "Not started"}
                </div>
              </div>
              <Pill label={inv.status} color={isActive ? "#34d399" : MUTED} bg={isActive ? "rgba(52,211,153,0.1)" : "rgba(170,179,197,0.06)"} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Principal",     value: $(amount),                        color: pc.color  },
                { label: "Daily ROI",     value: `${(dailyROI*100).toFixed(2)}%`,  color: "#34d399" },
                { label: "Claimable ROI", value: $(claimable),                     color: GOLD      },
              ].map(s => (
                <div key={s.label} style={{ background: CARD, borderRadius: 7, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            {inv.maturesAt && (
              <div style={{ fontSize: 10, color: MUTED }}>Matures: {dt(new Date(inv.maturesAt))}</div>
            )}
          </Card>
        );
      })}
      <SectionTitle title="RECENT DEPOSITS" />
      {detail.depositRequests.length === 0
        ? <div style={{ fontSize: 12, color: MUTED, padding: "8px 0" }}>No deposit history.</div>
        : detail.depositRequests.slice(0, 5).map(dep => (
          <div key={dep.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
            <div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Deposit · {dep.network}</div>
              <div style={{ fontSize: 10, color: MUTED }}>{dt(new Date(dep.createdAt))} · {dep.status}</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontFamily: "monospace" }}>{$(parseFloat(String(dep.amount)) || 0)}</span>
          </div>
        ))
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Wallets
// ─────────────────────────────────────────────────────────────────────────────
function WalletsTab({ m, detail, onTabSwitch }: { m: DrawerMember; detail?: AdminUserDetail | null; onTabSwitch: (tab: Tab) => void }) {
  const adminRole    = getAdminRole();
  const isSuperAdmin = adminRole === "SUPER_ADMIN";
  const canManageWallet = isSuperAdmin || adminRole === "STAFF_OPERATIONS";

  const [walletDetail,  setWalletDetail]  = useState<AdminWalletDetail | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [auditLogs,     setAuditLogs]     = useState<WalletChangeAuditLogEntry[] | null>(null);
  const [auditLoading,  setAuditLoading]  = useState(false);

  const [currentWallet, setCurrentWallet] = useState<string | null>(detail?.walletAddress ?? null);
  const [changeOpen,    setChangeOpen]    = useState(false);
  const [newWallet,     setNewWallet]     = useState("");
  const [reasonPreset,  setReasonPreset]  = useState("");
  const [reasonCustom,  setReasonCustom]  = useState("");
  const [changing,      setChanging]      = useState(false);
  const [changeError,   setChangeError]   = useState<string | null>(null);
  const [changeSuccess, setChangeSuccess] = useState(false);

  const finalReason = reasonPreset === "Other" ? reasonCustom : reasonPreset;

  useEffect(() => {
    setLoading(true);
    const token = getAdminToken();
    fetch(`/api/admin/wallets/${m.id}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    })
      .then(r => r.ok ? r.json() as Promise<{ data: AdminWalletDetail }> : Promise.reject())
      .then(json => setWalletDetail(json.data))
      .catch(() => setWalletDetail(null))
      .finally(() => setLoading(false));
  }, [m.id]);

  useEffect(() => {
    if (!canManageWallet) return;
    setAuditLoading(true);
    getWalletAuditLogs(m.id)
      .then(d => setAuditLogs(d.logs))
      .catch(() => setAuditLogs([]))
      .finally(() => setAuditLoading(false));
  }, [m.id, canManageWallet]);

  const handleChangeWallet = async () => {
    setChangeError(null);
    if (!newWallet.trim())             { setChangeError("New wallet address is required"); return; }
    if (!finalReason.trim())           { setChangeError("Reason is required"); return; }
    if (finalReason.trim().length < 5) { setChangeError("Reason must be at least 5 characters"); return; }
    setChanging(true);
    try {
      const result = await adminUpdateUserWallet(m.id, { newWallet: newWallet.trim(), reason: finalReason.trim() });
      setCurrentWallet(result.newWallet);
      setChangeSuccess(true);
      setChangeOpen(false);
      setNewWallet("");
      setReasonPreset("");
      setReasonCustom("");
      getWalletAuditLogs(m.id).then(d => setAuditLogs(d.logs)).catch(() => {});
      setTimeout(() => setChangeSuccess(false), 4000);
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : "Failed to update wallet address");
    } finally {
      setChanging(false);
    }
  };

  const wallets = [
    { label: "Deposit Wallet",    balance: m.depositWallet,    color: "#60a5fa", icon: ArrowDownLeft },
    { label: "Income Wallet",     balance: m.incomeWallet,     color: "#34d399", icon: TrendingUp    },
    { label: "Withdrawal Wallet", balance: m.withdrawalWallet, color: GOLD,      icon: Wallet        },
  ];

  const recentTxs = walletDetail?.transactions?.slice(0, 5) ?? [];

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

      <SectionTitle title="RECENT TRANSACTIONS" action={
        <button onClick={() => onTabSwitch("Transactions")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#60a5fa", display: "flex", alignItems: "center", gap: 3 }}>
          View All <ChevronRight size={9} />
        </button>
      } />

      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: MUTED, fontSize: 12 }}>Loading…</div>
      ) : recentTxs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: MUTED, fontSize: 12 }}>No transactions yet.</div>
      ) : (
        recentTxs.map(tx => <TxMiniRow key={tx.id} tx={tx} />)
      )}

      {walletDetail && (
        <div style={{ display: "flex", gap: 7, marginTop: 14 }}>
          {[
            { label: "Lifetime In",  value: $$(walletDetail.lifetimeCredits), color: "#34d399" },
            { label: "Lifetime Out", value: $$(walletDetail.lifetimeDebits),  color: "#f87171" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: CARD, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── SUPER_ADMIN: Withdrawal Hold ──────────────────────────────────── */}
      {isSuperAdmin && (
        <div style={{ marginTop: 20 }}>
          <WithdrawalHoldPanel memberId={m.id} />
        </div>
      )}

      {/* ── SUPER_ADMIN + STAFF_OPERATIONS: Withdrawal Wallet Management ──── */}
      {canManageWallet && (
        <div style={{ marginTop: 20 }}>
          <SectionTitle title="WITHDRAWAL WALLET ADDRESS" />

          <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Current BEP20 Address</div>
            {currentWallet ? (
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.8)", wordBreak: "break-all" as const }}>{currentWallet}</span>
            ) : (
              <span style={{ fontSize: 11, color: MUTED, fontStyle: "italic" }}>No withdrawal wallet set</span>
            )}
          </div>

          {changeSuccess && (
            <div style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 11, color: "#34d399" }}>
              ✓ Withdrawal wallet updated and audit log recorded
            </div>
          )}

          {!changeOpen ? (
            <button
              onClick={() => setChangeOpen(true)}
              style={{ width: "100%", padding: "9px 14px", borderRadius: 8, background: "rgba(212,175,55,0.08)", border: `1px solid rgba(212,175,55,0.2)`, color: GOLD, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
            >
              <Pencil size={11} />
              Change Withdrawal Wallet
            </button>
          ) : (
            <div style={{ background: BG2, border: `1px solid rgba(212,175,55,0.25)`, borderRadius: 10, padding: "14px" }}>
              <div style={{ fontSize: 10, color: GOLD, fontWeight: 700, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                 🔐 Change Withdrawal Wallet — ADMIN ACCESS
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 9, color: MUTED, display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>New BEP20 Wallet Address *</label>
                <input
                  type="text"
                  value={newWallet}
                  onChange={e => setNewWallet(e.target.value)}
                  placeholder="0x…"
                  style={{ width: "100%", boxSizing: "border-box" as const, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 10px", fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.85)", outline: "none" }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 9, color: MUTED, display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>Reason for Change *</label>
                <select
                  value={reasonPreset}
                  onChange={e => { setReasonPreset(e.target.value); setReasonCustom(""); }}
                  style={{ width: "100%", boxSizing: "border-box" as const, background: "#1a2440", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 10px", fontSize: 12, color: reasonPreset ? "rgba(255,255,255,0.85)" : MUTED, outline: "none", marginBottom: 6 }}
                >
                  <option value="">Select a reason…</option>
                  <option value="Wallet compromised">Wallet compromised</option>
                  <option value="Wrong address entered during registration">Wrong address entered during registration</option>
                  <option value="User verification completed">User verification completed</option>
                  <option value="Support request approved">Support request approved</option>
                  <option value="Other">Other (specify below)</option>
                </select>
                {reasonPreset === "Other" && (
                  <textarea
                    value={reasonCustom}
                    onChange={e => setReasonCustom(e.target.value)}
                    placeholder="Describe the reason for this change…"
                    rows={2}
                    style={{ width: "100%", boxSizing: "border-box" as const, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 10px", fontSize: 12, color: "rgba(255,255,255,0.85)", outline: "none", resize: "vertical" as const }}
                  />
                )}
              </div>

              {changeError && (
                <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{changeError}</div>
              )}

              <div style={{ display: "flex", gap: 7 }}>
                <button
                  onClick={() => void handleChangeWallet()}
                  disabled={changing || !newWallet.trim() || !finalReason.trim() || finalReason.trim().length < 5}
                  style={{ flex: 1, padding: "9px", borderRadius: 7, background: "linear-gradient(135deg, #D4AF37, #F3D37A)", color: "#0E1B37", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", opacity: (changing || !newWallet.trim() || !finalReason.trim() || finalReason.trim().length < 5) ? 0.5 : 1 }}
                >
                  {changing ? "Saving…" : "Confirm Change"}
                </button>
                <button
                  onClick={() => { setChangeOpen(false); setChangeError(null); setNewWallet(""); setReasonPreset(""); setReasonCustom(""); }}
                  style={{ padding: "9px 14px", borderRadius: 7, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: MUTED, fontSize: 11, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Wallet Change Audit History */}
          <SectionTitle title="WALLET CHANGE HISTORY" />
          {auditLoading ? (
            <div style={{ textAlign: "center", padding: "12px 0", color: MUTED, fontSize: 11 }}>Loading…</div>
          ) : !auditLogs || auditLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "12px 0", color: MUTED, fontSize: 11 }}>No wallet address changes on record.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {auditLogs.map(log => (
                <div key={log.id} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24" }}>Wallet Changed</span>
                    <span style={{ fontSize: 9, color: MUTED }}>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>
                    By: <span style={{ color: "rgba(255,255,255,0.65)" }}>{log.adminUsername}</span>
                  </div>
                  {log.previousWallet && (
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>
                      From: <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.45)", fontSize: 8 }}>{log.previousWallet.slice(0, 14)}…</span>
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 5 }}>
                    To: <span style={{ fontFamily: "monospace", color: "#34d399", fontSize: 8 }}>{log.newWallet.slice(0, 14)}…</span>
                  </div>
                  <div style={{ background: "rgba(251,191,36,0.06)", borderRadius: 5, padding: "4px 8px" }}>
                    <span style={{ fontSize: 9, color: "rgba(251,191,36,0.85)" }}>📋 {log.reason}</span>
                  </div>
                  {log.ipAddress && (
                    <div style={{ fontSize: 8, color: MUTED, marginTop: 4 }}>IP: {log.ipAddress}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Withdrawal Hold Panel ────────────────────────────────────────────────────
function WithdrawalHoldPanel({ memberId }: { memberId: string }) {
  interface HoldData {
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

  const [data,        setData]        = useState<HoldData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [err,         setErr]         = useState<string | null>(null);
  const [showModal,   setShowModal]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const token = getAdminToken();
    fetch(`/api/admin/users/${memberId}/withdrawal-hold`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    })
      .then(r => r.ok ? r.json() as Promise<{ data: HoldData }> : Promise.reject())
      .then(j => setData(j.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const held = data?.withdrawalHold ?? false;

  const confirm = async () => {
    if (!data) return;
    setSubmitting(true); setErr(null);
    try {
      const token = getAdminToken();
      const r = await fetch(`/api/admin/users/${memberId}/withdrawal-hold`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ hold: !held }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(j.message ?? `HTTP ${r.status}`);
      }
      setShowModal(false);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Operation failed");
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ textAlign: "center", padding: "16px 0", color: MUTED, fontSize: 12 }}>Loading…</div>
    </Card>
  );

  // Confirmation modal
  const modal = showModal ? (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={() => { if (!submitting) { setShowModal(false); setErr(null); } }}
    >
      <div
        style={{
          background: "#141627", border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: "24px 28px", maxWidth: 380, width: "90%",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)", marginBottom: 10 }}>
          {held ? "Enable Withdrawals?" : "Pause Withdrawals?"}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.65, marginBottom: 20 }}>
          {held
            ? "Future withdrawal requests will be processed normally."
            : (
              <>
                This member will still be able to submit withdrawal requests.
                <br /><br />
                All new withdrawal requests will remain &ldquo;Under Review&rdquo; until withdrawals are enabled again.
              </>
            )
          }
        </div>
        {err && (
          <div style={{ fontSize: 11, color: "#f87171", marginBottom: 12 }}>{err}</div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => { setShowModal(false); setErr(null); }}
            disabled={submitting}
            style={{
              padding: "8px 18px", borderRadius: 7,
              border: `1px solid ${BORDER}`,
              background: "transparent", color: "rgba(255,255,255,0.6)",
              fontSize: 12, cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void confirm()}
            disabled={submitting}
            style={{
              padding: "8px 18px", borderRadius: 7,
              border: held ? "1px solid rgba(52,211,153,0.4)" : "1px solid rgba(248,113,113,0.4)",
              background: held ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
              color: held ? "#34d399" : "#f87171",
              fontSize: 12, fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Processing…" : held ? "Enable Withdrawals" : "Pause Withdrawals"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {modal}
      <Card style={{
        marginBottom: 14,
        border: held ? "1px solid rgba(248,113,113,0.25)" : "1px solid rgba(52,211,153,0.15)",
      }}>
        <SectionTitle title="WITHDRAWAL CONTROL" />

        {/* Status + toggle row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>Withdrawals</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: held ? "#f87171" : "#34d399",
                boxShadow: `0 0 6px ${held ? "#f87171" : "#34d399"}80`,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: held ? "#f87171" : "#34d399" }}>
                {held ? "Paused" : "Enabled"}
              </span>
            </div>
          </div>

          {/* Toggle switch — ON = enabled (!held), OFF = paused (held) */}
          <div
            role="switch"
            aria-checked={!held}
            onClick={() => setShowModal(true)}
            title={held ? "Click to enable withdrawals" : "Click to pause withdrawals"}
            style={{
              width: 44, height: 24, borderRadius: 12, flexShrink: 0,
              background: held ? "rgba(248,113,113,0.18)" : "rgba(52,211,153,0.18)",
              border: held ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(52,211,153,0.4)",
              position: "relative", cursor: "pointer",
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              background: held ? "#f87171" : "#34d399",
              position: "absolute", top: 2,
              left: held ? 2 : 22,
              transition: "left 0.2s, background 0.2s",
              boxShadow: `0 1px 4px rgba(0,0,0,0.4)`,
            }} />
          </div>
        </div>

        <div style={{ fontSize: 10, color: MUTED, marginBottom: held ? 12 : 4 }}>
          {held
            ? "New requests remain \u201cUnder Review\u201d until withdrawals are re-enabled."
            : "Withdrawal requests are processed normally."}
        </div>

        {/* Audit history */}
        {data && data.auditHistory.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowHistory(v => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#60a5fa", padding: 0, display: "flex", alignItems: "center", gap: 3 }}
            >
              {showHistory ? "Hide" : "Show"} History ({data.auditHistory.length})
              <ChevronDown size={9} style={{ transform: showHistory ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {showHistory && (
              <div style={{ marginTop: 8 }}>
                {data.auditHistory.slice(0, 10).map(e => {
                  const paused = e.action === "WITHDRAWAL_HOLD_ENABLED";
                  return (
                    <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: paused ? "#f87171" : "#34d399", marginTop: 3, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: paused ? "#f87171" : "#34d399", fontWeight: 600, marginBottom: 1 }}>
                          {paused ? "Paused" : "Enabled"}
                        </div>
                        <div style={{ fontSize: 9, color: MUTED }}>
                          {e.admin ? `${e.admin.firstName} ${e.admin.lastName}` : "Admin"} · {new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
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
// TAB: Transactions — Financial Timeline
// ─────────────────────────────────────────────────────────────────────────────

// Expandable detail for a single transaction
function TxDetailRows({ tx }: { tx: AdminWalletTx }) {
  const m = txMeta(tx);
  const rows: { label: string; value: string }[] = [];

  switch (tx.type) {
    case "LEVEL_INCOME": {
      if (m["level"] !== undefined)        rows.push({ label: "Level",            value: `Level ${m["level"]}` });
      if (m["sourceUserId"])               rows.push({ label: "Source User ID",   value: String(m["sourceUserId"]) });
      if (m["investmentId"])               rows.push({ label: "Investment ID",    value: String(m["investmentId"]) });
      if (m["investmentAmount"] !== undefined) rows.push({ label: "Investment",   value: $$(String(m["investmentAmount"])) });
      if (m["percentage"] !== undefined)   rows.push({ label: "Rate Applied",     value: `${(Number(m["percentage"]) * 100).toFixed(2)}%` });
      break;
    }
    case "ROI_CLAIM": {
      if (m["investmentId"])               rows.push({ label: "Investment ID",    value: String(m["investmentId"]) });
      if (m["amountClaimed"])              rows.push({ label: "Amount Claimed",   value: $$(String(m["amountClaimed"])) });
      if (m["ledgerEntriesClaimed"] !== undefined) rows.push({ label: "Days Claimed", value: String(m["ledgerEntriesClaimed"]) });
      break;
    }
    case "PRINCIPAL_RELEASE": {
      if (m["investmentId"])               rows.push({ label: "Investment ID",    value: String(m["investmentId"]) });
      if (m["principalCredited"])          rows.push({ label: "Principal",        value: $$(String(m["principalCredited"])) });
      break;
    }
    case "BINARY_MATCH":
    case "BINARY_ORBIT": {
      if (m["matchedBV"] !== undefined)    rows.push({ label: "Matched BV",       value: $$(String(m["matchedBV"])) });
      if (m["rewardedBV"] !== undefined)   rows.push({ label: "Rewarded BV",      value: $$(String(m["rewardedBV"])) });
      if (m["cycleStart"])                 rows.push({ label: "Cycle Start",      value: new Date(String(m["cycleStart"])).toLocaleDateString("en-GB", { day:"numeric",month:"short",year:"numeric" }) });
      if (m["cycleEnd"])                   rows.push({ label: "Cycle End",        value: new Date(String(m["cycleEnd"])).toLocaleDateString("en-GB", { day:"numeric",month:"short",year:"numeric" }) });
      break;
    }
    case "INVESTMENT": {
      if (m["planType"])                   rows.push({ label: "Plan",             value: String(m["planType"]) });
      if (m["durationDays"] !== undefined) rows.push({ label: "Duration", value: m["durationDays"] === null ? "No fixed maturity" : `${m["durationDays"]} days` });
      if (m["investmentId"])               rows.push({ label: "Investment ID",    value: String(m["investmentId"]) });
      if (m["autoCompound"] !== undefined) rows.push({ label: "Auto-Compound",   value: m["autoCompound"] ? "Yes" : "No" });
      break;
    }
    case "WITHDRAWAL": {
      if (m["network"])                    rows.push({ label: "Network",          value: String(m["network"]) });
      if (m["fee"] !== undefined)          rows.push({ label: "Fee",              value: $$(String(m["fee"])) });
      if (m["netAmount"] !== undefined)    rows.push({ label: "Net Amount",       value: $$(String(m["netAmount"])) });
      break;
    }
    case "SALARY": {
      if (m["rankName"])                   rows.push({ label: "Rank",             value: String(m["rankName"]) });
      if (m["month"] && m["year"])         rows.push({ label: "Period",           value: `${m["month"]}/${m["year"]}` });
      if (m["paymentNumber"] !== undefined)rows.push({ label: "Payment #",        value: String(m["paymentNumber"]) });
      if (m["durationMonths"] !== undefined) rows.push({ label: "Total Months",  value: String(m["durationMonths"]) });
      break;
    }
    case "DEPOSIT": {
      if (m["txHash"])                     rows.push({ label: "TX Hash",          value: String(m["txHash"]) });
      if (m["network"])                    rows.push({ label: "Network",          value: String(m["network"]) });
      break;
    }
    case "INCOME_TRANSFER": {
      if (m["fromWallet"])                 rows.push({ label: "From Wallet",      value: String(m["fromWallet"]) });
      if (m["toWallet"])                   rows.push({ label: "To Wallet",        value: String(m["toWallet"]) });
      break;
    }
  }

  if (tx.description) rows.push({ label: "Note", value: tx.description });

  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 2 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ fontSize: 10, color: MUTED, flexShrink: 0, marginRight: 8 }}>{r.label}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.68)", fontFamily: "monospace", textAlign: "right", wordBreak: "break-all" }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// Single expandable transaction card
function TxCard({ tx, balBefore, balAfter }: { tx: AdminWalletTx; balBefore: number; balAfter: number }) {
  const [expanded, setExpanded] = useState(false);
  const amount    = parseFloat(tx.amount) || 0;
  const amtColor  = txAmountColor(tx);
  const sign      = txSign(tx);
  const isSuccess = tx.status === "SUCCESS";
  const isPending = tx.status === "PENDING";
  const isFailed  = tx.status === "FAILED";
  const credit    = txIsCredit(tx.type);
  const statusBadgeCfg = isFailed
    ? { color: "rgba(107,114,128,0.9)", bg: "rgba(107,114,128,0.08)" }
    : isPending
    ? { color: "#fbbf24", bg: "rgba(251,191,36,0.08)" }
    : null;

  const dateFmt = new Date(tx.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  }) + " UTC";

  return (
    <div
      style={{ background: BG2, border: `1px solid ${expanded ? "rgba(255,255,255,0.1)" : BORDER}`, borderRadius: 9, marginBottom: 7, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s" }}
      onClick={() => setExpanded(v => !v)}
      onMouseEnter={e => !expanded && ((e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.09)")}
      onMouseLeave={e => !expanded && ((e.currentTarget as HTMLElement).style.borderColor = BORDER)}
    >
      {/* Collapsed row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px" }}>
        <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{txEmoji(tx.type)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{txLabel(tx.type)}</span>
            {statusBadgeCfg && (
              <span style={{ fontSize: 9, fontWeight: 700, color: statusBadgeCfg.color, background: statusBadgeCfg.bg, padding: "1px 5px", borderRadius: 3 }}>{tx.status}</span>
            )}
          </div>
          <span style={{ fontSize: 10, color: MUTED }}>{dateFmt}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: amtColor, fontFamily: "monospace" }}>{sign}{$$(amount)}</span>
          <ChevronDown size={10} style={{ color: MUTED, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", marginTop: 3 }} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, padding: "12px 13px 13px" }}
          onClick={e => e.stopPropagation()}>

          {/* Balance before / after */}
          {isSuccess && (
            <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
              {[
                { label: "Balance Before", value: $$(balBefore), color: MUTED      },
                { label: "Balance After",  value: $$(balAfter),  color: amtColor   },
              ].map(b => (
                <div key={b.label} style={{ flex: 1, background: CARD, borderRadius: 7, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{b.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: b.color, fontFamily: "monospace" }}>{b.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Business detail rows */}
          <TxDetailRows tx={tx} />

          {/* Transaction ID footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, marginTop: 4 }}>
            <span style={{ fontSize: 9, color: MUTED }}>Transaction ID</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", wordBreak: "break-all", textAlign: "right", maxWidth: "72%" }}>{tx.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Mini compact row for Wallets tab
function TxMiniRow({ tx }: { tx: AdminWalletTx }) {
  const amount   = parseFloat(tx.amount) || 0;
  const amtColor = txAmountColor(tx);
  const sign     = txSign(tx);
  const dateFmt  = new Date(tx.createdAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{txEmoji(tx.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{txLabel(tx.type)}</div>
        <div style={{ fontSize: 9, color: MUTED }}>{dateFmt} · {tx.status}</div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: amtColor, fontFamily: "monospace", flexShrink: 0 }}>{sign}{$$(amount)}</span>
    </div>
  );
}

// Full Transactions tab
function TransactionsTab({ m, onTabSwitch }: { m: DrawerMember; onTabSwitch: (tab: Tab) => void }) {
  const [walletDetail, setWalletDetail] = useState<AdminWalletDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState("All");
  const [query,    setQuery]    = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    setWalletDetail(null);
    const token = getAdminToken();
    fetch(`/api/admin/wallets/${m.id}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    })
      .then(r => r.ok ? r.json() as Promise<{ data: AdminWalletDetail }> : Promise.reject(`HTTP ${r.status}`))
      .then(json => setWalletDetail(json.data))
      .catch(e  => setError(String(e)))
      .finally(() => setLoading(false));
  }, [m.id]);

  if (loading) return (
    <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 13 }}>
      <div style={{ fontSize: 20, marginBottom: 10 }}>⏳</div>
      Loading transactions…
    </div>
  );
  if (error) return (
    <div style={{ textAlign: "center", padding: 40, color: "#f87171", fontSize: 13 }}>Failed to load: {error}</div>
  );
  if (!walletDetail) return null;

  const w = walletDetail.wallet;
  const currentTotal =
    (parseFloat(String(w.depositWallet))    || 0) +
    (parseFloat(String(w.incomeWallet))     || 0) +
    (parseFloat(String(w.withdrawalWallet)) || 0);

  const allBalances = computeBalances(walletDetail.transactions, currentTotal);

  const filteredPairs = walletDetail.transactions
    .map((tx, i) => ({ tx, bal: allBalances[i] }))
    .filter(({ tx }) => txMatchesFilter(tx, filter) && txMatchesSearch(tx, query));

  const filtered     = filteredPairs.map(p => p.tx);
  const filteredBals = filteredPairs.map(p => p.bal);

  return (
    <div>
      {/* Lifetime stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
        {[
          { label: "Lifetime Credits", value: $$(walletDetail.lifetimeCredits), color: "#34d399" },
          { label: "Lifetime Debits",  value: $$(walletDetail.lifetimeDebits),  color: "#f87171" },
        ].map(s => (
          <div key={s.label} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + CSV export */}
      <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px" }}>
          <Search size={11} style={{ color: MUTED, flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by ID, user, description…"
            style={{ background: "none", border: "none", outline: "none", fontSize: 11, color: "rgba(255,255,255,0.75)", width: "100%" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0 }}>
              ×
            </button>
          )}
        </div>
        <button
          onClick={() => exportTxCsv(filtered, filteredBals, m.username)}
          title="Export CSV"
          style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 11px", cursor: "pointer", fontSize: 11, color: MUTED, flexShrink: 0 }}
        >
          <Download size={11} /> CSV
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 11 }}>
        {TX_FILTER_OPTIONS.map(f => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "3px 9px", borderRadius: 100, fontSize: 10, fontWeight: active ? 700 : 400, cursor: "pointer",
                background: active ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(212,175,55,0.35)" : BORDER}`,
                color: active ? GOLD_L : MUTED,
                transition: "all 0.15s",
              }}
            >{f}</button>
          );
        })}
      </div>

      {/* Count */}
      <div style={{ fontSize: 10, color: MUTED, marginBottom: 10 }}>
        {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        {filter !== "All" ? ` · ${filter}` : ""}
        {query ? ` · "${query}"` : ""}
        <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 6 }}>
          (showing last {walletDetail.transactions.length} total)
        </span>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: MUTED, fontSize: 12 }}>No transactions found.</div>
      ) : (
        filtered.map((tx, i) => (
          <TxCard key={tx.id} tx={tx} balBefore={filteredBals[i].before} balAfter={filteredBals[i].after} />
        ))
      )}

      {walletDetail.transactions.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 12 }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>💳</div>
          No transactions yet for this member.
        </div>
      )}
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
// TAB: Power BV
// ─────────────────────────────────────────────────────────────────────────────

interface PBvSummary {
  userId: string; username: string;
  organicLeftBV: string; organicRightBV: string;
  powerLeftBV: string;   powerRightBV: string;
  effectiveLeftBV: string; effectiveRightBV: string;
}
interface PBvEntry {
  id: string; side: "LEFT" | "RIGHT"; operation: "ADD" | "REMOVE";
  bv: string; balanceBefore: string; balanceAfter: string;
  reason: string; createdAt: string;
  admin: { firstName: string; lastName: string; email: string; role: string };
}

function PowerBvTab({ m }: { m: DrawerMember }) {
  const adminRole = getAdminRole();
  const canWrite  = adminRole === "SUPER_ADMIN" || adminRole === "FINANCE_ADMIN";
  const token     = getAdminToken();

  const [summary,    setSummary]    = useState<PBvSummary | null>(null);
  const [ledger,     setLedger]     = useState<PBvEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const [formMode,   setFormMode]   = useState<"add" | "remove" | null>(null);
  const [formSide,   setFormSide]   = useState<"LEFT" | "RIGHT">("LEFT");
  const [formBv,     setFormBv]     = useState("");
  const [formReason, setFormReason] = useState("");
  const [formErr,    setFormErr]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm,    setConfirm]    = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);

  const h = { Authorization: `Bearer ${token ?? ""}` };

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/power-bv/${m.id}`, { headers: h }).then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)),
      fetch(`/api/admin/power-bv/${m.id}/ledger?limit=50`, { headers: h }).then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)),
    ])
      .then(([sum, led]) => {
        setSummary((sum as { data: PBvSummary }).data);
        setLedger(((led as { data: { records: PBvEntry[] } }).data.records) ?? []);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [m.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const bvNum = parseInt(formBv, 10);

  const handlePreSubmit = () => {
    setFormErr(null);
    if (!formBv || isNaN(bvNum) || bvNum <= 0) { setFormErr("BV must be a positive whole number"); return; }
    if (bvNum > 10000) { setFormErr("BV cannot exceed 10,000 per operation"); return; }
    if (formReason.trim().length < 10) { setFormErr("Reason must be at least 10 characters"); return; }
    setConfirm(true);
  };

  const handleConfirm = async () => {
    if (!formMode) return;
    setConfirm(false);
    setSubmitting(true);
    setFormErr(null);
    try {
      const r = await fetch(`/api/admin/power-bv/${m.id}/${formMode}`, {
        method:  "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body:    JSON.stringify({ side: formSide, bv: bvNum, reason: formReason.trim() }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(j.message ?? `HTTP ${r.status}`);
      }
      setToast(`Power BV ${formMode === "add" ? "added" : "removed"} successfully`);
      setFormMode(null); setFormBv(""); setFormReason("");
      fetchAll();
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Operation failed");
    } finally { setSubmitting(false); }
  };

  const exportCsv = () => {
    if (!ledger.length) return;
    const headers = ["Date UTC","Admin","Side","Operation","BV","Balance Before","Balance After","Reason"];
    const rows = ledger.map(e => [
      new Date(e.createdAt).toISOString(),
      `${e.admin.firstName} ${e.admin.lastName} (${e.admin.email})`,
      e.side, e.operation,
      parseFloat(e.bv).toFixed(2),
      parseFloat(e.balanceBefore).toFixed(2),
      parseFloat(e.balanceAfter).toFixed(2),
      e.reason,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `power_bv_${m.username}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 13 }}>Loading Power BV data…</div>;
  if (error)   return <div style={{ textAlign: "center", padding: 40, color: "#f87171", fontSize: 13 }}>{error}</div>;

  const oL = parseFloat(summary?.organicLeftBV  ?? "0");
  const oR = parseFloat(summary?.organicRightBV ?? "0");
  const pL = parseFloat(summary?.powerLeftBV    ?? "0");
  const pR = parseFloat(summary?.powerRightBV   ?? "0");
  const eL = parseFloat(summary?.effectiveLeftBV  ?? "0");
  const eR = parseFloat(summary?.effectiveRightBV ?? "0");
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div>
      {toast && (
        <div style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "9px 13px", marginBottom: 14, fontSize: 12, color: "#34d399" }}>
          ✓ {toast}
        </div>
      )}

      {/* BV Balances Grid */}
      <Card>
        <SectionTitle title="BV BALANCES" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { label: "Organic L",   val: oL, color: "#60a5fa" },
            { label: "Power L",     val: pL, color: "#f59e0b" },
            { label: "Effective L", val: eL, color: "#34d399" },
            { label: "Organic R",   val: oR, color: "#a78bfa" },
            { label: "Power R",     val: pR, color: "#f59e0b" },
            { label: "Effective R", val: eR, color: "#34d399" },
          ].map(s => (
            <div key={s.label} style={{ background: CARD, borderRadius: 7, padding: "9px 10px" }}>
              <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{fmt(s.val)}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "6px 8px", background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.18)", borderRadius: 6, fontSize: 10, color: "rgba(52,211,153,0.75)", lineHeight: 1.5 }}>
          ✓ Power Business is included in Team Business and participates in Binary Matching, Binary Orbit, Salary and Rank calculations. Direct Referral Income and Level Income are generated only from real investments.
        </div>
      </Card>

      {/* Write actions — SUPER_ADMIN and FINANCE_ADMIN only */}
      {canWrite && (
        <Card>
          <SectionTitle title="MANAGE POWER BV" />
          <div style={{ display: "flex", gap: 8, marginBottom: formMode ? 14 : 0 }}>
            {(["add","remove"] as const).map(mode => {
              const active = formMode === mode;
              const color  = mode === "add" ? "#34d399" : "#f87171";
              const border = active ? `rgba(${mode === "add" ? "52,211,153" : "248,113,113"},0.4)` : BORDER;
              const bg     = active ? `rgba(${mode === "add" ? "52,211,153" : "248,113,113"},0.08)` : "rgba(255,255,255,0.03)";
              return (
                <button key={mode} onClick={() => { setFormMode(active ? null : mode); setFormErr(null); }}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: `1px solid ${border}`, background: bg, color: active ? color : MUTED, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {mode === "add" ? "+ Add" : "− Remove"} Power BV
                </button>
              );
            })}
          </div>

          {formMode && (
            <div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {(["LEFT","RIGHT"] as const).map(s => (
                  <button key={s} onClick={() => setFormSide(s)}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${formSide === s ? "rgba(212,175,55,0.4)" : BORDER}`, background: formSide === s ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.02)", color: formSide === s ? GOLD_L : MUTED, fontSize: 11, fontWeight: formSide === s ? 700 : 400, cursor: "pointer" }}>
                    {s} Leg
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>BV Amount (1 – 10,000)</div>
                <input type="number" min="1" max="10000" value={formBv} onChange={e => setFormBv(e.target.value)}
                  placeholder="e.g. 150"
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>Reason (min 10 chars)</div>
                <textarea value={formReason} onChange={e => setFormReason(e.target.value)}
                  placeholder="e.g. Platform launch incentive — Platinum bootstrap"
                  rows={3}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>

              {formErr && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>{formErr}</div>}

              <button onClick={handlePreSubmit} disabled={submitting}
                style={{ width: "100%", padding: "9px 0", borderRadius: 7, border: `1px solid ${formMode === "add" ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"}`, background: formMode === "add" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: formMode === "add" ? "#34d399" : "#f87171", fontSize: 12, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}>
                {submitting ? "Processing…" : `Confirm ${formMode === "add" ? "Add" : "Remove"}`}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Confirmation modal */}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)" }}>
          <div style={{ background: "hsl(222 62% 9%)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "22px 24px", maxWidth: 360, width: "90%" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 10 }}>
              Confirm Power BV {formMode === "add" ? "Addition" : "Removal"}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 18, lineHeight: 1.6 }}>
              <b style={{ color: formMode === "add" ? "#34d399" : "#f87171" }}>{formMode === "add" ? "+" : "−"}{bvNum} BV</b>{" "}
              on the <b style={{ color: "rgba(255,255,255,0.8)" }}>{formSide}</b> leg of{" "}
              <b style={{ color: GOLD_L }}>@{m.username}</b>.<br /><br />
              <span style={{ fontStyle: "italic", color: "rgba(255,255,255,0.55)" }}>{formReason}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(false)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.04)", color: MUTED, fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => void handleConfirm()}
                style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "none", background: formMode === "add" ? "#34d399" : "#f87171", color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger */}
      <SectionTitle title={`AUDIT LEDGER (${ledger.length})`} action={
        ledger.length > 0
          ? <button onClick={exportCsv} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontSize: 10, color: MUTED }}><Download size={10} /> CSV</button>
          : undefined
      } />

      {ledger.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: MUTED, fontSize: 12 }}>No Power BV operations yet.</div>
      ) : (
        ledger.map(e => {
          const isAdd = e.operation === "ADD";
          const col   = isAdd ? "#34d399" : "#f87171";
          return (
            <div key={e.id} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 13px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: isAdd ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)", color: col }}>{e.operation}</span>
                  <span style={{ fontSize: 10, color: e.side === "LEFT" ? "#60a5fa" : "#a78bfa", fontWeight: 600 }}>{e.side}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: col, fontFamily: "monospace" }}>{isAdd ? "+" : "−"}{fmt(parseFloat(e.bv))} BV</span>
                </div>
                <span style={{ fontSize: 10, color: MUTED }}>{dtt(new Date(e.createdAt))}</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>
                Balance: {fmt(parseFloat(e.balanceBefore))} → {fmt(parseFloat(e.balanceAfter))} BV
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>{e.reason}</div>
              <div style={{ fontSize: 10, color: MUTED }}>By {e.admin.firstName} {e.admin.lastName} · {e.admin.role}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header quick-actions dropdown
// ─────────────────────────────────────────────────────────────────────────────
function HeaderActions({ m, onAction }: { m: DrawerMember; onAction: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const suspended = m.status === "SUSPENDED" || m.status === "INACTIVE" || m.status === "BLOCKED";
  const actions = [
    { icon: Eye,        label: "View Profile",   color: "rgba(255,255,255,0.7)" },
    { icon: Pencil,     label: "Edit Member",    color: "rgba(255,255,255,0.7)" },
    { icon: BadgeCheck, label: "Approve KYC",    color: "#34d399"               },
    suspended
      ? { icon: UserCheck, label: "Activate Member", color: "#34d399" }
      : { icon: ShieldX,   label: "Suspend Member",  color: "#f87171" },
    { icon: KeyRound,   label: "Reset Password", color: "#60a5fa"               },
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
              <div onClick={() => { onAction(a.label); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", cursor: "pointer", color: a.color, fontSize: 12 }}
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
export default function MemberDrawer({ member, detail, onClose, onAction }: { member: DrawerMember | null; detail?: AdminUserDetail | null; onClose: () => void; onAction?: (label: string) => void }) {
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
  const sc = member ? STATUS_CFG[member.operationalStatus] : null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none", transition: "opacity 0.2s ease" }} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: 520, maxWidth: "100vw", background: BG, borderLeft: `1px solid ${BORDER}`, boxShadow: "-24px 0 64px rgba(0,0,0,0.6)", transform: visible ? "translateX(0)" : "translateX(100%)", transition: "transform 0.24s cubic-bezier(0.32,0.72,0,1)", display: "flex", flexDirection: "column" }}>
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
                  <HeaderActions m={member} onAction={label => onAction?.(label)} />
                  <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", color: MUTED, padding: "6px 8px", display: "flex" }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Badges row */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                <Pill label={member.operationalStatus} color={sc.color} bg={sc.bg} />
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
              {activeTab === "Overview"     && <OverviewTab     m={member} onTabSwitch={setActiveTab} onAction={label => onAction?.(label)} />}
              {activeTab === "Investments"  && <InvestmentsTab  m={member} detail={detail} />}
              {activeTab === "Wallets"      && <WalletsTab      m={member} detail={detail} onTabSwitch={setActiveTab} />}
              {activeTab === "Transactions" && <TransactionsTab m={member} onTabSwitch={setActiveTab} />}
              {activeTab === "Network"      && <NetworkTab      m={member} />}
              {activeTab === "Activity"     && <ActivityTab     m={member} />}
              {activeTab === "Audit Log"    && <AuditLogTab     m={member} />}
              {activeTab === "Notes"        && <NotesTab        m={member} />}
              {activeTab === "Documents"    && <DocumentsTab    m={member} />}
              {activeTab === "Power BV"    && <PowerBvTab      m={member} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}
