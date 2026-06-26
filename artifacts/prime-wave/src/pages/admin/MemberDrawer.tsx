import { useState, useMemo, useCallback, useRef } from "react";
import {
  X, Copy, UserPlus, TrendingUp, DollarSign, ArrowDownLeft,
  Users, Award, Wallet, ArrowUpRight, ShieldX, KeyRound, LogIn,
  BadgeCheck, Clock, Shield, CheckCircle, Pencil,
  ChevronRight, Activity, FileText, BarChart2, Network,
} from "lucide-react";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Types ─────────────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $   = (n: number) => n === 0 ? "—" : `$${n.toLocaleString()}`;
const dt  = (d: Date)   => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dtt = (d: Date)   => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const initials = (f: string, l: string) => `${f[0] ?? "?"}${l[0] ?? ""}`.toUpperCase();
function seeded(n: number, max: number, min = 0) {
  return Math.floor(((Math.sin(n * 9301 + 49297) * 0.5 + 0.5)) * (max - min) + min);
}

// ─── Status/plan/kyc badges ───────────────────────────────────────────────────
const STATUS_CFG: Record<Status, { color: string; bg: string }> = {
  ACTIVE:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"   },
  INACTIVE:  { color: MUTED,     bg: "rgba(170,179,197,0.08)"  },
  SUSPENDED: { color: "#f87171", bg: "rgba(248,113,113,0.12)"  },
};
const KYC_CFG: Record<KYC, { color: string; bg: string; label: string }> = {
  VERIFIED:    { color: "#34d399", bg: "rgba(52,211,153,0.12)",  label: "Verified"    },
  PENDING:     { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  label: "Pending"     },
  REJECTED:    { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "Rejected"    },
  UNSUBMITTED: { color: MUTED,     bg: "rgba(170,179,197,0.06)", label: "Unsubmitted" },
};
const PLAN_CFG: Record<string, { color: string; bg: string }> = {
  STARTER: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  ALPHA:   { color: GOLD,      bg: "rgba(212,175,55,0.1)"  },
  PREMIUM: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  VIP:     { color: "#34d399", bg: "rgba(52,211,153,0.1)"  },
};

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color, background: bg, padding: "3px 8px", borderRadius: 5 }}>{label}</span>;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ m, size = 36 }: { m: DrawerMember; size?: number }) {
  const col = m.status === "ACTIVE" ? "#34d399" : m.status === "SUSPENDED" ? "#f87171" : MUTED;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: size/2, background: "rgba(212,175,55,0.09)", border: `1.5px solid ${col}60`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: size*0.33, fontWeight: 700 }}>
        {initials(m.firstName, m.lastName)}
      </div>
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: col, border: "1.5px solid hsl(222 62% 7%)" }} />
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────
function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <span style={{ fontSize: 12, color: MUTED, flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: accent ? GOLD_L : "rgba(255,255,255,0.8)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = ["Overview","Investments","Wallets","Network","Activity","Audit Log","Notes"] as const;
type Tab = typeof TABS[number];

const TAB_ICONS: Record<Tab, React.ElementType> = {
  Overview: Users, Investments: TrendingUp, Wallets: Wallet,
  Network: Network, Activity: Activity, "Audit Log": Shield, Notes: FileText,
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Overview
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ m }: { m: DrawerMember }) {
  const { color: sc, bg: sb } = STATUS_CFG[m.status];
  const { color: kc, bg: kb, label: kl } = KYC_CFG[m.kyc];
  const pc = m.plan ? PLAN_CFG[m.plan] : null;
  return (
    <div>
      {/* Status/plan row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <Pill label={m.status}   color={sc} bg={sb} />
        {m.plan && pc && <Pill label={m.plan} color={pc.color} bg={pc.bg} />}
        <Pill label={kl} color={kc} bg={kb} />
        {m.rank && <Pill label={m.rank} color={GOLD} bg="rgba(212,175,55,0.1)" />}
      </div>

      {/* Profile */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 8 }}>PROFILE</div>
      <Row label="Full Name"     value={`${m.firstName} ${m.lastName}`} />
      <Row label="Email"         value={<span style={{ fontSize: 11 }}>{m.email}</span>} />
      <Row label="Phone"         value={m.phone} />
      <Row label="Country"       value={m.country} />
      <Row label="Referral Code" value={
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontFamily: "monospace", color: GOLD }}>{m.referralCode}</span>
          <Copy size={10} style={{ color: MUTED, cursor: "pointer" }} />
        </span>
      } />
      <Row label="Sponsor"  value={m.sponsor ? `@${m.sponsor}` : "—"} />
      <Row label="Position" value={m.position ?? "—"} />
      <Row label="Joined"   value={dt(m.joinedAt)} />

      {/* Quick metrics */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "16px 0 8px" }}>QUICK METRICS</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Total Invested", value: $(m.investment), color: GOLD_L },
          { label: "Direct Refs",    value: m.directReferrals,             color: "#60a5fa" },
          { label: "Total Team",     value: m.totalTeam,                   color: "#a78bfa" },
        ].map(q => (
          <div key={q.label} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 10px" }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>{q.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: q.color, fontFamily: "monospace" }}>{q.value}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "16px 0 8px" }}>QUICK ACTIONS</div>
      {[
        { icon: ShieldX,      label: "Suspend Member",   color: "#f87171", bg: "rgba(248,113,113,0.08)" },
        { icon: KeyRound,     label: "Reset Password",   color: "#60a5fa", bg: "rgba(96,165,250,0.08)"  },
        { icon: BadgeCheck,   label: "Approve KYC",      color: "#34d399", bg: "rgba(52,211,153,0.08)"  },
        { icon: LogIn,        label: "Login As User",    color: GOLD,      bg: "rgba(212,175,55,0.08)"  },
        { icon: ArrowUpRight, label: "View Full Profile",color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.04)" },
      ].map(a => (
        <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 8, cursor: "pointer", background: a.bg, marginBottom: 6, border: `1px solid rgba(255,255,255,0.04)`, transition: "opacity 0.15s" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.7"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}>
          <a.icon size={13} style={{ color: a.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: a.color, fontWeight: 500 }}>{a.label}</span>
        </div>
      ))}
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
    started: new Date(m.joinedAt.getTime() + 86400000 * 3),
    status: "ACTIVE",
  }] : [];

  const roiEarned = m.plan ? Math.round(m.investment * (inv[0]?.roi ?? 0) / 100 * 0.4) : 0;

  if (!m.plan) return (
    <div style={{ textAlign: "center", padding: 32, color: MUTED, fontSize: 13 }}>
      No active investment plan.
    </div>
  );

  return (
    <div>
      {inv.map(i => (
        <div key={i.id} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{i.plan} Plan</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{i.id} · Started {dt(i.started)}</div>
            </div>
            <Pill label={i.status} color="#34d399" bg="rgba(52,211,153,0.1)" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Principal",  value: $(i.amount),         color: GOLD_L },
              { label: "ROI Rate",   value: `${i.roi}% / year`,  color: "#34d399" },
              { label: "Duration",   value: `${i.duration} days`, color: MUTED },
            ].map(s => (
              <div key={s.label} style={{ background: CARD, borderRadius: 7, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          {/* ROI progress */}
          <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>ROI Progress (est. 40% elapsed)</div>
          <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: "40%", borderRadius: 4, background: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_L} 100%)` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
            <span style={{ fontSize: 10, color: MUTED }}>Earned so far</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399" }}>{$(roiEarned)}</span>
          </div>
        </div>
      ))}

      {/* Mock history */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "4px 0 8px" }}>TRANSACTION HISTORY</div>
      {[
        { type: "Investment Deposit",  amount: m.investment, date: new Date(m.joinedAt.getTime() + 86400000 * 3), color: "#60a5fa" },
        { type: "ROI Credit",          amount: roiEarned,    date: new Date(Date.now() - 86400000 * 14),          color: "#34d399" },
        { type: "ROI Credit",          amount: Math.round(roiEarned * 0.6), date: new Date(Date.now() - 86400000 * 44), color: "#34d399" },
      ].map((tx, i) => (
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
    { label: "Investment Deposit",  wallet: "Deposit",    amount: m.investment,     sign: "+", color: "#60a5fa", date: new Date(m.joinedAt.getTime() + 86400000 * 3) },
    { label: "ROI Credit",          wallet: "Income",     amount: seeded(m.directReferrals * 3, 2000, 50), sign: "+", color: "#34d399", date: new Date(Date.now() - 86400000 * 7) },
    { label: "Withdrawal Request",  wallet: "Withdrawal", amount: seeded(m.directReferrals * 7, 1500, 20), sign: "−", color: "#f87171", date: new Date(Date.now() - 86400000 * 3) },
    { label: "Level Income",        wallet: "Income",     amount: seeded(m.directReferrals, 400, 10),      sign: "+", color: "#34d399", date: new Date(Date.now() - 86400000 * 1) },
  ];
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {wallets.map(w => (
          <div key={w.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${w.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <w.icon size={15} style={{ color: w.color }} />
              </div>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{w.label}</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: w.color, fontFamily: "monospace" }}>{$(w.balance)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 8 }}>RECENT TRANSACTIONS</div>
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
  const rightPct = 100 - leftPct;
  return (
    <div>
      {/* BV meter */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 10 }}>BINARY VOLUME</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[
            { label: "Left BV",  value: m.leftBV,  color: "#60a5fa", pct: leftPct  },
            { label: "Right BV", value: m.rightBV, color: "#a78bfa", pct: rightPct },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "12px 12px" }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "monospace", marginBottom: 8 }}>{s.value.toLocaleString()}</div>
              <div style={{ height: 4, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                <div style={{ height: "100%", width: `${s.pct}%`, borderRadius: 3, background: s.color }} />
              </div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{s.pct}% of total</div>
            </div>
          ))}
        </div>
        <Row label="Carry Forward" value={m.carryForward.toLocaleString()} />
        <Row label="Weaker Leg"    value={Math.min(m.leftBV, m.rightBV).toLocaleString()} />
      </div>

      {/* Team summary */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 8 }}>TEAM SUMMARY</div>
      <Row label="Direct Referrals" value={m.directReferrals} />
      <Row label="Total Downline"   value={m.totalTeam} />
      <Row label="Active in Team"   value={Math.round(m.totalTeam * 0.7)} />

      {/* Mock downline */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "16px 0 8px" }}>DIRECT REFERRALS</div>
      {Array.from({ length: Math.min(m.directReferrals, 5) }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(212,175,55,0.09)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: GOLD }}>
              {String.fromCharCode(65 + i)}
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>@member_{m.id.slice(-3)}{i}</div>
              <div style={{ fontSize: 9, color: MUTED }}>{i % 2 === 0 ? "LEFT" : "RIGHT"} · Active</div>
            </div>
          </div>
          <ChevronRight size={12} style={{ color: MUTED }} />
        </div>
      ))}
      {m.directReferrals > 5 && <div style={{ fontSize: 11, color: "#60a5fa", textAlign: "center", padding: "8px 0", cursor: "pointer" }}>+{m.directReferrals - 5} more</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Activity (enhanced timeline)
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVITY_TYPES = {
  REGISTRATION:   { icon: UserPlus,       color: "#34d399", label: "Account Created"         },
  INVESTMENT:     { icon: TrendingUp,     color: GOLD,      label: "Investment Activated"    },
  ROI:            { icon: DollarSign,     color: "#34d399", label: "ROI Credit Received"     },
  WITHDRAWAL:     { icon: ArrowDownLeft,  color: "#fbbf24", label: "Withdrawal Processed"    },
  REFERRAL:       { icon: Users,          color: "#60a5fa", label: "Referral Joined"         },
  RANK_UPGRADE:   { icon: Award,          color: "#a78bfa", label: "Rank Upgraded"           },
  WALLET_TRANSFER:{ icon: Wallet,         color: "#67e8f9", label: "Wallet Transfer"         },
  KYC:            { icon: BadgeCheck,     color: "#34d399", label: "KYC Verified"            },
  PASSWORD:       { icon: KeyRound,       color: "#60a5fa", label: "Password Reset"          },
  LOGIN:          { icon: LogIn,          color: MUTED,     label: "Member Login"            },
};

type ActivityType = keyof typeof ACTIVITY_TYPES;

interface ActivityEvent {
  type: ActivityType;
  detail: string;
  date: Date;
}

function buildActivity(m: DrawerMember): ActivityEvent[] {
  const b = m.joinedAt.getTime();
  const events: ActivityEvent[] = [
    { type: "REGISTRATION",   detail: `Account registered from ${m.country}`,   date: new Date(b) },
    { type: "KYC",            detail: `KYC documents ${m.kyc === "VERIFIED" ? "verified" : "submitted"}`, date: new Date(b + 86400000 * 2) },
  ];
  if (m.plan) {
    events.push({ type: "INVESTMENT", detail: `${m.plan} plan — ${$(m.investment)}`, date: new Date(b + 86400000 * 4) });
    events.push({ type: "ROI",        detail: `ROI credit to income wallet`,          date: new Date(b + 86400000 * 34) });
  }
  if (m.rank) {
    events.push({ type: "RANK_UPGRADE", detail: `Upgraded to ${m.rank} rank`, date: new Date(b + 86400000 * 20) });
  }
  if (m.directReferrals > 0) {
    events.push({ type: "REFERRAL", detail: `${m.directReferrals} direct referral${m.directReferrals>1?"s":""} joined`, date: new Date(b + 86400000 * 10) });
  }
  if (m.withdrawalWallet > 0) {
    events.push({ type: "WITHDRAWAL", detail: `Withdrawal request — ${$(Math.round(m.withdrawalWallet * 0.6))}`, date: new Date(Date.now() - 86400000 * 5) });
  }
  events.push({ type: "LOGIN", detail: "Last platform login", date: new Date(Date.now() - 3600000 * 8) });
  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function ActivityTab({ m }: { m: DrawerMember }) {
  const events = useMemo(() => buildActivity(m), [m]);
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 12 }}>MEMBER ACTIVITY TIMELINE</div>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 15, top: 8, bottom: 0, width: 1, background: BORDER }} />
        {events.map((e, i) => {
          const cfg = ACTIVITY_TYPES[e.type];
          return (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, position: "relative" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${cfg.color}15`, border: `1.5px solid ${cfg.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1, background2: CARD } as React.CSSProperties}>
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
// TAB: Audit Log
// ─────────────────────────────────────────────────────────────────────────────
interface AuditEntry { action: string; admin: string; ip: string; date: Date; icon: React.ElementType; color: string; }

function buildAudit(m: DrawerMember): AuditEntry[] {
  const b = m.joinedAt.getTime();
  return [
    { action: "Account Created",    admin: "system",               ip: "—",              date: new Date(b),                         icon: UserPlus,    color: "#34d399" },
    { action: "Email Verified",     admin: "system",               ip: "203.0.113.45",   date: new Date(b + 3600000),               icon: CheckCircle, color: "#34d399" },
    { action: "KYC Submitted",      admin: m.username,             ip: "198.51.100.72",  date: new Date(b + 86400000 * 2),          icon: BadgeCheck,  color: "#fbbf24" },
    ...(m.kyc === "VERIFIED" ? [{ action: "KYC Approved", admin: "admin@primewave.io", ip: "10.0.0.1", date: new Date(b + 86400000 * 3), icon: BadgeCheck, color: "#34d399" }] : []),
    ...(m.plan ? [{ action: `Investment Approved (${m.plan})`, admin: "admin@primewave.io", ip: "10.0.0.2", date: new Date(b + 86400000 * 4), icon: TrendingUp, color: GOLD }] : []),
    { action: "Password Reset",     admin: "admin@primewave.io",   ip: "10.0.0.1",       date: new Date(Date.now() - 86400000 * 14),icon: KeyRound,    color: "#60a5fa" },
    { action: "Admin Login As User",admin: "admin@primewave.io",   ip: "10.0.0.3",       date: new Date(Date.now() - 86400000 * 7), icon: LogIn,       color: GOLD      },
    { action: "Profile Updated",    admin: "admin@primewave.io",   ip: "10.0.0.1",       date: new Date(Date.now() - 86400000 * 2), icon: Pencil,      color: "#a78bfa" },
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
}

function AuditLogTab({ m }: { m: DrawerMember }) {
  const entries = useMemo(() => buildAudit(m), [m]);
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 10 }}>AUDIT LOG</div>
      {entries.map((e, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: `${e.color}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            <e.icon size={12} style={{ color: e.color }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{e.action}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
              <span style={{ fontSize: 10, color: "#60a5fa" }}>{e.admin}</span>
              <span style={{ fontSize: 10, color: MUTED }}>IP: {e.ip}</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap", textAlign: "right" }}>
            {dtt(e.date)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Notes
// ─────────────────────────────────────────────────────────────────────────────
interface Note { id: number; text: string; date: Date; admin: string; }

function NotesTab({ m }: { m: DrawerMember }) {
  const [notes, setNotes] = useState<Note[]>([
    { id: 1, text: "Member contacted support regarding delayed withdrawal. Escalated to finance team.", date: new Date(Date.now() - 86400000 * 5), admin: "support@primewave.io" },
    { id: 2, text: "KYC documents re-requested. Member submitted passport and utility bill.", date: new Date(Date.now() - 86400000 * 12), admin: "kyc@primewave.io" },
  ]);
  const [draft, setDraft] = useState("");

  const addNote = useCallback(() => {
    if (!draft.trim()) return;
    setNotes(prev => [{ id: Date.now(), text: draft.trim(), date: new Date(), admin: "admin@primewave.io" }, ...prev]);
    setDraft("");
  }, [draft]);

  return (
    <div>
      {/* Add note */}
      <div style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: GOLD }}>A</div>
          <span style={{ fontSize: 11, color: MUTED }}>admin@primewave.io</span>
        </div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add an admin note about this member…"
          style={{ width: "100%", minHeight: 72, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "9px 10px", fontSize: 12, color: "rgba(255,255,255,0.78)", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }}
        />
        <button
          onClick={addNote}
          disabled={!draft.trim()}
          style={{ padding: "7px 16px", background: draft.trim() ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${draft.trim() ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 7, cursor: draft.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, color: draft.trim() ? GOLD_L : MUTED }}
        >
          Add Note
        </button>
      </div>

      {/* Notes list */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 8 }}>
        {notes.length} ADMIN NOTE{notes.length !== 1 ? "S" : ""}
      </div>
      {notes.map(n => (
        <div key={n.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: GOLD }}>A</div>
            <span style={{ fontSize: 11, color: "#60a5fa" }}>{n.admin}</span>
            <span style={{ fontSize: 10, color: MUTED, marginLeft: "auto" }}>{dtt(n.date)}</span>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, margin: 0 }}>{n.text}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MemberDrawer — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function MemberDrawer({ member, onClose }: { member: DrawerMember | null; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const visible = !!member;

  // reset to Overview tab when a new member opens
  const prevMember = useRef<string | null>(null);
  if (member && member.id !== prevMember.current) {
    prevMember.current = member.id;
    if (activeTab !== "Overview") setActiveTab("Overview");
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none", transition: "opacity 0.22s ease" }} />

      {/* Panel */}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: 520, background: BG, borderLeft: `1px solid ${BORDER}`, boxShadow: "-20px 0 60px rgba(0,0,0,0.55)", transform: visible ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.32,0.72,0,1)", display: "flex", flexDirection: "column" }}>
        {member && (
          <>
            {/* Header */}
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar m={member} size={42} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>@{member.username}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{member.id} · {member.country}</div>
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, overflowX: "auto" }}>
              {TABS.map(tab => {
                const Icon = TAB_ICONS[tab];
                const active = tab === activeTab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 12px", background: "none", border: "none", borderBottom: `2px solid ${active ? GOLD : "transparent"}`, cursor: "pointer", color: active ? GOLD_L : MUTED, fontSize: 11, fontWeight: active ? 600 : 400, whiteSpace: "nowrap", transition: "color 0.15s", flexShrink: 0 }}
                  >
                    <Icon size={11} />
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Tab content — lazy render only active tab */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 24px" }}>
              {activeTab === "Overview"    && <OverviewTab    m={member} />}
              {activeTab === "Investments" && <InvestmentsTab m={member} />}
              {activeTab === "Wallets"     && <WalletsTab     m={member} />}
              {activeTab === "Network"     && <NetworkTab     m={member} />}
              {activeTab === "Activity"    && <ActivityTab    m={member} />}
              {activeTab === "Audit Log"   && <AuditLogTab    m={member} />}
              {activeTab === "Notes"       && <NotesTab       m={member} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}
