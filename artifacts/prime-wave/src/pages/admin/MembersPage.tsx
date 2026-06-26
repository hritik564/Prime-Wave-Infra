import {
  useState, useMemo, useCallback, useEffect, useRef, memo,
} from "react";
import AdminLayout from "./AdminLayout";
import {
  Search, Filter, Download, RefreshCw, Plus, ChevronLeft, ChevronRight,
  MoreHorizontal, Eye, Pencil, GitBranch, Wallet, TrendingUp, ShieldX,
  Trash2, CheckSquare, X, ChevronDown, Users, UserCheck, UserX, Clock,
  UserPlus, Copy, LogIn, KeyRound, BadgeCheck, ArrowUpRight, RotateCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Status   = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type Plan     = "STARTER" | "ALPHA" | "PREMIUM" | "VIP";
type Position = "LEFT" | "RIGHT";
type Rank     = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

interface Member {
  id:               string;
  username:         string;
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string;
  status:           Status;
  plan:             Plan | null;
  investment:       number;
  position:         Position | null;
  rank:             Rank | null;
  sponsor:          string | null;
  joinedAt:         Date;
  referralCode:     string;
  directReferrals:  number;
  totalTeam:        number;
  leftBV:           number;
  rightBV:          number;
  carryForward:     number;
  depositWallet:    number;
  incomeWallet:     number;
  withdrawalWallet: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — 48 members
// ─────────────────────────────────────────────────────────────────────────────
const FN = ["James","Emma","Liam","Sophia","Noah","Olivia","Mason","Ava","Ethan","Isabella","Logan","Mia","Lucas","Amelia","Jackson","Harper","Aiden","Evelyn","Elijah","Abigail","Carter","Emily","Sebastian","Elizabeth","Owen","Mila","Nathan","Ella","Ryan","Avery"];
const LN = ["Smith","Johnson","Williams","Brown","Davis","Miller","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Garcia","Martinez","Robinson","Clark","Lewis","Walker","Hall","Allen","Young","King","Wright","Scott","Green","Baker"];
const PLANS: (Plan | null)[] = [null,null,"STARTER","STARTER","STARTER","ALPHA","ALPHA","PREMIUM","VIP"];
const STATUSES: Status[]     = ["ACTIVE","ACTIVE","ACTIVE","ACTIVE","ACTIVE","INACTIVE","SUSPENDED"];
const RANKS: (Rank | null)[] = [null,"BRONZE","BRONZE","SILVER","SILVER","GOLD","DIAMOND"];
const POSITIONS: (Position | null)[] = ["LEFT","RIGHT","LEFT","RIGHT",null];

function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }
function seeded(n: number, max: number, min = 0) {
  return Math.floor(((Math.sin(n * 9301 + 49297) * 0.5 + 0.5)) * (max - min) + min);
}

const MOCK: Member[] = Array.from({ length: 48 }, (_, i) => {
  const fn = pick(FN, i * 3 + 1);
  const ln = pick(LN, i * 7 + 2);
  const plan = pick(PLANS, i * 5);
  const status = pick(STATUSES, i * 11);
  const rank   = pick(RANKS, i * 13);
  const pos    = pick(POSITIONS, i * 17);
  const invest = plan === "VIP" ? seeded(i, 50000, 25000)
               : plan === "PREMIUM" ? seeded(i, 15000, 8000)
               : plan === "ALPHA"   ? seeded(i, 7000, 3000)
               : plan === "STARTER" ? seeded(i, 2000, 500)
               : 0;
  const lBV  = seeded(i, 12000);
  const rBV  = seeded(i * 3, 12000);
  const refs = seeded(i * 7, 15);
  const daysAgo = seeded(i * 11, 400, 1);
  const joinDate = new Date(Date.now() - daysAgo * 86400000);
  return {
    id:               `USR${String(i + 1001).padStart(6, "0")}`,
    username:         `${fn.toLowerCase()}_${ln.toLowerCase()}${seeded(i, 99)}`,
    firstName:        fn,
    lastName:         ln,
    email:            `${fn.toLowerCase()}.${ln.toLowerCase()}${seeded(i, 99)}@example.com`,
    phone:            `+1 ${seeded(i, 999, 200)}-${seeded(i * 3, 999, 100)}-${seeded(i * 7, 9999, 1000)}`,
    status,
    plan,
    investment:       invest,
    position:         pos,
    rank,
    sponsor:          i > 0 ? `${pick(FN, i + 5).toLowerCase()}_${pick(LN, i + 3).toLowerCase()}${seeded(i + 5, 99)}` : null,
    joinedAt:         joinDate,
    referralCode:     `PW${fn.substring(0,2).toUpperCase()}${String(seeded(i * 3, 9999, 1000))}`,
    directReferrals:  refs,
    totalTeam:        refs * seeded(i, 8, 1),
    leftBV:           lBV,
    rightBV:          rBV,
    carryForward:     seeded(i * 5, 3000),
    depositWallet:    seeded(i * 13, 8000),
    incomeWallet:     seeded(i * 17, 5000),
    withdrawalWallet: seeded(i * 19, 2000),
  };
});

const TODAY_COUNT = MOCK.filter(m => {
  const d = new Date(Date.now() - 86400000);
  return m.joinedAt > d;
}).length || 3;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
const $  = (n: number) => n === 0 ? "—" : `$${n.toLocaleString()}`;
const dt = (d: Date)   => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const initials = (f: string, l: string) => `${f[0] ?? "?"}${l[0] ?? ""}`.toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<Status, { color: string; bg: string }> = {
  ACTIVE:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  INACTIVE:  { color: MUTED,     bg: "rgba(170,179,197,0.08)" },
  SUSPENDED: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};
export function StatusBadge({ status }: { status: Status }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
      color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 5,
    }}>{status}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvestmentBadge
// ─────────────────────────────────────────────────────────────────────────────
const PLAN_CFG: Record<string, { color: string; bg: string }> = {
  STARTER: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"   },
  ALPHA:   { color: GOLD,      bg: "rgba(212,175,55,0.1)"   },
  PREMIUM: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)"  },
  VIP:     { color: "#34d399", bg: "rgba(52,211,153,0.1)"   },
};
export function InvestmentBadge({ plan, amount }: { plan: Plan | null; amount: number }) {
  if (!plan) return <span style={{ fontSize: 11, color: MUTED }}>—</span>;
  const c = PLAN_CFG[plan];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>
        {plan}
      </span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontFamily: "monospace" }}>{$(amount)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RankBadge
// ─────────────────────────────────────────────────────────────────────────────
const RANK_CFG: Record<string, { color: string; bg: string }> = {
  BRONZE:  { color: "#c97c3a", bg: "rgba(201,124,58,0.1)"  },
  SILVER:  { color: "#94a3b8", bg: "rgba(148,163,184,0.1)" },
  GOLD:    { color: GOLD,      bg: "rgba(212,175,55,0.1)"  },
  DIAMOND: { color: "#67e8f9", bg: "rgba(103,232,249,0.1)" },
};
function RankBadge({ rank }: { rank: Rank | null }) {
  if (!rank) return <span style={{ fontSize: 11, color: MUTED }}>—</span>;
  const c = RANK_CFG[rank];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>
      {rank}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: string | number; color: string; bg: string;
}) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 120 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionDropdown
// ─────────────────────────────────────────────────────────────────────────────
const ROW_ACTIONS = [
  { icon: Eye,         label: "View Profile",   color: "rgba(255,255,255,0.72)" },
  { icon: Pencil,      label: "Edit Member",    color: "rgba(255,255,255,0.72)" },
  { icon: GitBranch,   label: "View Network",   color: "rgba(255,255,255,0.72)" },
  { icon: Wallet,      label: "Wallet",         color: "rgba(255,255,255,0.72)" },
  { icon: TrendingUp,  label: "Investments",    color: "rgba(255,255,255,0.72)" },
  { icon: BadgeCheck,  label: "Verify KYC",     color: "#60a5fa" },
  { icon: ShieldX,     label: "Suspend",        color: "#f87171" },
  { icon: Trash2,      label: "Delete",         color: "#f87171" },
];

export const ActionDropdown = memo(function ActionDropdown({
  memberId, open, onToggle, onClose,
}: { memberId: string; open: boolean; onToggle: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        style={{
          background: open ? "rgba(255,255,255,0.06)" : "none",
          border: `1px solid ${open ? BORDER : "transparent"}`,
          borderRadius: 6, cursor: "pointer", padding: "4px 7px",
          color: MUTED, display: "flex", alignItems: "center",
          transition: "all 0.15s",
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100,
          background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`,
          borderRadius: 9, minWidth: 165, boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}>
          {ROW_ACTIONS.map((a, i) => (
            <div key={a.label}>
              {i === 5 && <div style={{ height: 1, background: BORDER, margin: "2px 0" }} />}
              <div
                onClick={e => { e.stopPropagation(); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "8px 13px", cursor: "pointer", color: a.color,
                  fontSize: 12, fontWeight: i >= 6 ? 500 : 400,
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
              >
                <a.icon size={13} style={{ flexShrink: 0 }} />
                {a.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ m, size = 30 }: { m: Member; size?: number }) {
  const col = m.status === "ACTIVE" ? "#34d399" : m.status === "SUSPENDED" ? "#f87171" : MUTED;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: size / 2,
        background: "rgba(212,175,55,0.09)",
        border: `1.5px solid ${col}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: GOLD, fontSize: size * 0.33, fontWeight: 700,
      }}>{initials(m.firstName, m.lastName)}</div>
      <div style={{
        position: "absolute", bottom: 0, right: 0,
        width: 7, height: 7, borderRadius: "50%", background: col,
        border: "1.5px solid hsl(222 62% 7%)",
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MemberRow
// ─────────────────────────────────────────────────────────────────────────────
interface MemberRowProps {
  m: Member;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (m: Member) => void;
  dropdownOpen: boolean;
  onDropdownToggle: (id: string) => void;
  onDropdownClose: () => void;
}
export const MemberRow = memo(function MemberRow({
  m, selected, onSelect, onOpen, dropdownOpen, onDropdownToggle, onDropdownClose,
}: MemberRowProps) {
  const ref = useRef<HTMLTableRowElement>(null);
  const onEnter = useCallback(() => {
    if (ref.current) ref.current.style.background = "rgba(255,255,255,0.025)";
  }, []);
  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.background = selected ? "rgba(212,175,55,0.04)" : "transparent";
  }, [selected]);

  const TD: React.CSSProperties = {
    padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.75)",
    borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle",
  };

  return (
    <tr
      ref={ref}
      onClick={() => onOpen(m)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        cursor: "pointer",
        background: selected ? "rgba(212,175,55,0.04)" : "transparent",
        transition: "background 0.12s",
      }}
    >
      <td style={{ ...TD, width: 36 }} onClick={e => { e.stopPropagation(); onSelect(m.id); }}>
        <div style={{
          width: 15, height: 15, borderRadius: 4,
          border: `1.5px solid ${selected ? GOLD : BORDER}`,
          background: selected ? GOLD : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          {selected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="hsl(222 62% 7%)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
        </div>
      </td>
      <td style={TD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar m={m} size={28} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{m.username}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{m.id}</div>
          </div>
        </div>
      </td>
      <td style={TD}><span style={{ fontSize: 11, color: MUTED }}>{m.email}</span></td>
      <td style={TD}><span style={{ fontSize: 11, color: MUTED }}>{m.phone}</span></td>
      <td style={TD}>
        {m.sponsor
          ? <span style={{ fontSize: 11, color: "#60a5fa" }}>@{m.sponsor}</span>
          : <span style={{ fontSize: 11, color: MUTED }}>—</span>}
      </td>
      <td style={TD}>
        {m.position
          ? <span style={{ fontSize: 10, fontWeight: 700, color: m.position === "LEFT" ? "#60a5fa" : "#a78bfa", background: m.position === "LEFT" ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)", padding: "2px 7px", borderRadius: 4 }}>
              {m.position}
            </span>
          : <span style={{ fontSize: 11, color: MUTED }}>—</span>}
      </td>
      <td style={TD}><RankBadge rank={m.rank} /></td>
      <td style={TD}><InvestmentBadge plan={m.plan} amount={m.investment} /></td>
      <td style={TD}><StatusBadge status={m.status} /></td>
      <td style={{ ...TD, whiteSpace: "nowrap", fontSize: 11, color: MUTED }}>{dt(m.joinedAt)}</td>
      <td style={{ ...TD, width: 48 }} onClick={e => e.stopPropagation()}>
        <ActionDropdown
          memberId={m.id}
          open={dropdownOpen}
          onToggle={() => onDropdownToggle(m.id)}
          onClose={onDropdownClose}
        />
      </td>
    </tr>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MemberDrawer
// ─────────────────────────────────────────────────────────────────────────────
function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function DrawerRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: accent ? GOLD_L : "rgba(255,255,255,0.8)" }}>{value}</span>
    </div>
  );
}

function MemberDrawer({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const visible = !!member;
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.45)",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
        width: 380, background: "hsl(222 62% 7%)",
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
        transform: visible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s cubic-bezier(0.32,0.72,0,1)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        {member && (
          <>
            {/* Header */}
            <div style={{
              padding: "16px 18px", borderBottom: `1px solid ${BORDER}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              position: "sticky", top: 0, background: "hsl(222 62% 7%)", zIndex: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <Avatar m={member} size={38} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>@{member.username}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{member.id}</div>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "18px 18px 24px", flex: 1 }}>
              {/* Status badge + plan */}
              <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                <StatusBadge status={member.status} />
                {member.plan && <InvestmentBadge plan={member.plan} amount={0} />}
                {member.rank && <RankBadge rank={member.rank} />}
              </div>

              {/* Profile */}
              <DrawerSection title="PROFILE">
                <DrawerRow label="Full Name"     value={`${member.firstName} ${member.lastName}`} />
                <DrawerRow label="Email"         value={<span style={{ fontSize: 11 }}>{member.email}</span>} />
                <DrawerRow label="Phone"         value={member.phone} />
                <DrawerRow label="Referral Code" value={
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontFamily: "monospace", color: GOLD }}>{member.referralCode}</span>
                    <Copy size={10} style={{ color: MUTED, cursor: "pointer" }} />
                  </span>
                } />
                <DrawerRow label="Sponsor"       value={member.sponsor ? `@${member.sponsor}` : "—"} />
                <DrawerRow label="Position"      value={member.position ?? "—"} />
                <DrawerRow label="Joined"        value={dt(member.joinedAt)} />
              </DrawerSection>

              {/* Wallets */}
              <DrawerSection title="WALLETS">
                <DrawerRow label="Deposit Wallet"    value={$(member.depositWallet)}    accent />
                <DrawerRow label="Income Wallet"     value={$(member.incomeWallet)}     accent />
                <DrawerRow label="Withdrawal Wallet" value={$(member.withdrawalWallet)} accent />
              </DrawerSection>

              {/* Network */}
              <DrawerSection title="NETWORK">
                <DrawerRow label="Left BV"          value={member.leftBV.toLocaleString()} />
                <DrawerRow label="Right BV"         value={member.rightBV.toLocaleString()} />
                <DrawerRow label="Carry Forward"    value={member.carryForward.toLocaleString()} />
                <DrawerRow label="Direct Referrals" value={member.directReferrals} />
                <DrawerRow label="Total Team"       value={member.totalTeam} />
              </DrawerSection>

              {/* Investments */}
              <DrawerSection title="INVESTMENTS">
                <DrawerRow label="Current Plan" value={member.plan ?? "No Plan"} />
                <DrawerRow label="Total Invested" value={$(member.investment)} accent />
                <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 11, color: MUTED }}>ROI history available after backend integration.</span>
                </div>
              </DrawerSection>

              {/* Actions */}
              <DrawerSection title="ACTIONS">
                {[
                  { icon: ShieldX,    label: "Suspend Member",  color: "#f87171", bg: "rgba(248,113,113,0.08)" },
                  { icon: KeyRound,   label: "Reset Password",  color: "#60a5fa", bg: "rgba(96,165,250,0.08)"  },
                  { icon: BadgeCheck, label: "Verify KYC",      color: "#34d399", bg: "rgba(52,211,153,0.08)"  },
                  { icon: LogIn,      label: "Login As User",   color: GOLD,      bg: "rgba(212,175,55,0.08)"  },
                  { icon: ArrowUpRight, label: "View Full Profile", color: "rgba(255,255,255,0.65)", bg: "rgba(255,255,255,0.04)" },
                ].map(a => (
                  <div
                    key={a.label}
                    style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                      background: a.bg, marginBottom: 6,
                      border: `1px solid rgba(255,255,255,0.05)`,
                      transition: "opacity 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = "0.75"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = "1"}
                  >
                    <a.icon size={13} style={{ color: a.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: a.color, fontWeight: 500 }}>{a.label}</span>
                  </div>
                ))}
              </DrawerSection>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonRow
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  const s = { background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 12 };
  const TD: React.CSSProperties = { padding: "12px", borderBottom: `1px solid rgba(255,255,255,0.04)` };
  return (
    <tr>
      {[36, 140, 160, 110, 100, 60, 60, 80, 70, 80, 36].map((w, i) => (
        <td key={i} style={TD}>
          <div style={{ ...s, width: w, opacity: 0.5 + (i % 3) * 0.15 }} />
        </td>
      ))}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ search }: { search: string }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Users size={24} style={{ color: MUTED }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>
        {search ? `No results for "${search}"` : "No members found"}
      </div>
      <div style={{ fontSize: 12, color: MUTED, maxWidth: 280 }}>
        {search ? "Try a different search term or clear your filters." : "Adjust your filters to see members."}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────
export function Pagination({ page, total, perPage, onChange }: {
  page: number; total: number; perPage: number; onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const btnStyle = (active?: boolean): React.CSSProperties => ({
    minWidth: 30, height: 30, borderRadius: 6, border: `1px solid ${active ? GOLD : BORDER}`,
    background: active ? "rgba(212,175,55,0.12)" : "transparent",
    color: active ? GOLD_L : MUTED,
    cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px",
    transition: "all 0.12s",
  });
  const visible = Array.from({ length: pages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", padding: "12px 0 4px" }}>
      <span style={{ fontSize: 11, color: MUTED, marginRight: 8 }}>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <button style={btnStyle()} onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}>
        <ChevronLeft size={14} />
      </button>
      {visible.map((p, i) => (
        <span key={p} style={{ display: "contents" }}>
          {i > 0 && visible[i - 1] !== p - 1 && (
            <span style={{ fontSize: 12, color: MUTED, padding: "0 4px" }}>…</span>
          )}
          <button style={btnStyle(p === page)} onClick={() => onChange(p)}>{p}</button>
        </span>
      ))}
      <button style={btnStyle()} onClick={() => onChange(Math.min(pages, page + 1))} disabled={page === pages}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SearchBar
// ─────────────────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 9, padding: "8px 12px", flex: 1, maxWidth: 420,
    }}>
      <Search size={14} style={{ color: MUTED, flexShrink: 0 }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search username, email, ID, phone, referral code…"
        style={{
          background: "none", border: "none", outline: "none",
          fontSize: 12.5, color: "rgba(255,255,255,0.75)", width: "100%",
        }}
      />
      {value && (
        <button onClick={() => onChange("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2 }}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar
// ─────────────────────────────────────────────────────────────────────────────
interface Filters { status: string; plan: string; position: string; rank: string; date: string }
const SEL: React.CSSProperties = {
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7,
  padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.7)",
  cursor: "pointer", outline: "none",
  appearance: "none" as never, WebkitAppearance: "none" as never,
};

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    onChange({ ...filters, [k]: e.target.value });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Filter size={13} style={{ color: MUTED }} />
      {([
        { key: "status",   label: "Status",   opts: ["All Status","ACTIVE","INACTIVE","SUSPENDED","PENDING KYC"] },
        { key: "plan",     label: "Plan",     opts: ["All Plans","No Plan","STARTER","ALPHA","PREMIUM","VIP"] },
        { key: "position", label: "Position", opts: ["All Positions","LEFT","RIGHT"] },
        { key: "rank",     label: "Rank",     opts: ["All Ranks","BRONZE","SILVER","GOLD","DIAMOND"] },
        { key: "date",     label: "Date",     opts: ["All Time","Today","7 Days","30 Days"] },
      ] as const).map(f => (
        <div key={f.key} style={{ position: "relative" }}>
          <select style={SEL} value={filters[f.key as keyof Filters]} onChange={set(f.key as keyof Filters)}>
            {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={10} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const PER_PAGE = 20;

export default function MembersPage() {
  const [search,      setSearch]      = useState("");
  const [filters,     setFilters]     = useState<Filters>({ status: "All Status", plan: "All Plans", position: "All Positions", rank: "All Ranks", date: "All Time" });
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawer,      setDrawer]      = useState<Member | null>(null);
  const [dropdown,    setDropdown]    = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  // Filter + search
  const filtered = useMemo(() => {
    const now = Date.now();
    return MOCK.filter(m => {
      const q = search.toLowerCase();
      if (q && !m.username.includes(q) && !m.email.includes(q) && !m.id.includes(q) && !m.phone.includes(q) && !m.referralCode.toLowerCase().includes(q) && !(m.sponsor ?? "").includes(q)) return false;
      if (filters.status !== "All Status" && m.status !== filters.status) return false;
      if (filters.plan === "No Plan" && m.plan !== null) return false;
      if (filters.plan !== "All Plans" && filters.plan !== "No Plan" && m.plan !== filters.plan) return false;
      if (filters.position !== "All Positions" && m.position !== filters.position) return false;
      if (filters.rank !== "All Ranks" && m.rank !== filters.rank) return false;
      if (filters.date === "Today"  && (now - m.joinedAt.getTime()) > 86400000)   return false;
      if (filters.date === "7 Days" && (now - m.joinedAt.getTime()) > 7 * 86400000)  return false;
      if (filters.date === "30 Days"&& (now - m.joinedAt.getTime()) > 30 * 86400000) return false;
      return true;
    });
  }, [search, filters]);

  const paginated = useMemo(() => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE), [filtered, page]);

  const allOnPage  = paginated.every(m => selectedIds.has(m.id));
  const someOnPage = paginated.some(m => selectedIds.has(m.id));

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPage) paginated.forEach(m => next.delete(m.id));
      else paginated.forEach(m => next.add(m.id));
      return next;
    });
  }, [allOnPage, paginated]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleDropdownToggle = useCallback((id: string) => {
    setDropdown(prev => prev === id ? null : id);
  }, []);

  const handleDropdownClose = useCallback(() => setDropdown(null), []);

  const handleSearch = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleFilters = useCallback((f: Filters) => { setFilters(f); setPage(1); }, []);

  const stats = useMemo(() => ({
    total: MOCK.length,
    active: MOCK.filter(m => m.status === "ACTIVE").length,
    suspended: MOCK.filter(m => m.status === "SUSPENDED").length,
    pendingKyc: 8,
    newToday: TODAY_COUNT,
  }), []);

  const TH: React.CSSProperties = {
    padding: "10px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
    color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`,
    background: "hsl(222 62% 9%)", whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 5,
  };

  return (
    <AdminLayout>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 3 }}>Members</h1>
          <p style={{ fontSize: 12, color: MUTED }}>Manage, search and monitor every member on the platform.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { icon: RotateCw,  label: "Refresh", action: () => { setLoading(true); setTimeout(() => setLoading(false), 600); } },
            { icon: Download,  label: "Export CSV", action: () => {} },
            { icon: Plus,      label: "Create Member", action: () => {} },
          ].map(b => (
            <button key={b.label} onClick={b.action} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: b.label === "Create Member" ? "rgba(212,175,55,0.12)" : CARD,
              border: `1px solid ${b.label === "Create Member" ? "rgba(212,175,55,0.3)" : BORDER}`,
              borderRadius: 8, padding: "7px 12px", cursor: "pointer",
              fontSize: 12, color: b.label === "Create Member" ? GOLD_L : "rgba(255,255,255,0.65)",
              transition: "opacity 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = "0.75"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = "1"}
            >
              <b.icon size={13} />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <StatCard icon={Users}    label="Total Members"  value={stats.total}     color="#60a5fa" bg="rgba(96,165,250,0.1)"   />
        <StatCard icon={UserCheck}label="Active"         value={stats.active}    color="#34d399" bg="rgba(52,211,153,0.1)"   />
        <StatCard icon={UserX}    label="Suspended"      value={stats.suspended} color="#f87171" bg="rgba(248,113,113,0.1)"  />
        <StatCard icon={Clock}    label="Pending KYC"    value={stats.pendingKyc}color="#fbbf24" bg="rgba(251,191,36,0.1)"   />
        <StatCard icon={UserPlus} label="New Today"      value={stats.newToday}  color={GOLD}    bg="rgba(212,175,55,0.1)"   />
      </div>

      {/* Search + filter row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: showFilters ? 10 : 14, flexWrap: "wrap" }}>
        <SearchBar value={search} onChange={handleSearch} />
        <button
          onClick={() => setShowFilters(f => !f)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: showFilters ? "rgba(212,175,55,0.08)" : CARD,
            border: `1px solid ${showFilters ? "rgba(212,175,55,0.25)" : BORDER}`,
            borderRadius: 9, padding: "8px 12px", cursor: "pointer",
            fontSize: 12, color: showFilters ? GOLD_L : "rgba(255,255,255,0.6)",
          }}
        >
          <Filter size={13} /> Filters {showFilters && <X size={11} />}
        </button>
      </div>

      {showFilters && (
        <div style={{ marginBottom: 14 }}>
          <FilterBar filters={filters} onChange={handleFilters} />
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(212,175,55,0.06)", border: `1px solid rgba(212,175,55,0.2)`,
          borderRadius: 9, padding: "9px 14px", marginBottom: 12,
        }}>
          <CheckSquare size={14} style={{ color: GOLD }} />
          <span style={{ fontSize: 12, color: GOLD_L, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <div style={{ flex: 1 }} />
          {["Approve KYC","Suspend","Export","Send Notification","Delete"].map(a => (
            <button key={a} style={{
              background: a === "Delete" ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${a === "Delete" ? "rgba(248,113,113,0.2)" : BORDER}`,
              borderRadius: 6, padding: "5px 10px", cursor: "pointer",
              fontSize: 11, color: a === "Delete" ? "#f87171" : "rgba(255,255,255,0.65)",
            }}>{a}</button>
          ))}
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 370px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 36 }}>
                  <div
                    onClick={toggleAll}
                    style={{
                      width: 15, height: 15, borderRadius: 4,
                      border: `1.5px solid ${allOnPage && paginated.length > 0 ? GOLD : BORDER}`,
                      background: allOnPage && paginated.length > 0 ? GOLD : someOnPage ? "rgba(212,175,55,0.3)" : "transparent",
                      cursor: "pointer",
                    }}
                  />
                </th>
                {["Member","Email","Phone","Sponsor","Position","Rank","Plan / Investment","Status","Joined",""].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
                : paginated.length === 0
                  ? <tr><td colSpan={11}><EmptyState search={search} /></td></tr>
                  : paginated.map(m => (
                      <MemberRow
                        key={m.id}
                        m={m}
                        selected={selectedIds.has(m.id)}
                        onSelect={toggleSelect}
                        onOpen={setDrawer}
                        dropdownOpen={dropdown === m.id}
                        onDropdownToggle={handleDropdownToggle}
                        onDropdownClose={handleDropdownClose}
                      />
                    ))
              }
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div style={{ padding: "6px 16px 10px", borderTop: `1px solid ${BORDER}` }}>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Drawer */}
      <MemberDrawer member={drawer} onClose={() => setDrawer(null)} />
    </AdminLayout>
  );
}
