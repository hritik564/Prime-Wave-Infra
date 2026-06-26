import {
  useState, useMemo, useCallback, useEffect, useRef, memo,
} from "react";
import AdminLayout from "./AdminLayout";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip,
} from "recharts";
import {
  Search, Filter, Download, RefreshCw, Plus, ChevronLeft, ChevronRight,
  MoreHorizontal, Eye, CheckCircle, XCircle, Pencil, User2, FileDown,
  History, CheckSquare, ChevronDown, TrendingUp, DollarSign, Clock,
  AlertTriangle, Activity, Zap, X, RotateCw, BadgeCheck,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type InvStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type Plan      = "STARTER" | "ALPHA" | "PREMIUM" | "VIP";
type PayMethod = "USDT" | "BANK_TRANSFER" | "CRYPTO" | "MANUAL";

interface Investment {
  id:             string;
  memberId:       string;
  username:       string;
  firstName:      string;
  lastName:       string;
  sponsor:        string | null;
  plan:           Plan;
  amount:         number;
  roiPercent:     number;
  durationDays:   number;
  payMethod:      PayMethod;
  txHash:         string;
  walletAddress:  string;
  reference:      string;
  status:         InvStatus;
  createdAt:      Date;
  approvedAt:     Date | null;
  approvedBy:     string | null;
  rejectedReason: string | null;
  notes:          string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — 55 investments
// ─────────────────────────────────────────────────────────────────────────────
const FN = ["James","Emma","Liam","Sophia","Noah","Olivia","Mason","Ava","Ethan","Isabella","Logan","Mia","Lucas","Amelia","Aiden","Harper","Carter","Evelyn","Sebastian","Abigail"];
const LN = ["Smith","Johnson","Williams","Brown","Davis","Miller","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Clark","Lewis","Walker","King","Baker"];

function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }
function seeded(n: number, max: number, min = 0) {
  return Math.floor(((Math.sin(n * 9301 + 49297) * 0.5 + 0.5)) * (max - min) + min);
}

const PLAN_CFG: Record<Plan, { roi: number; days: number }> = {
  STARTER: { roi: 8,  days: 180 },
  ALPHA:   { roi: 12, days: 180 },
  PREMIUM: { roi: 18, days: 365 },
  VIP:     { roi: 24, days: 365 },
};

const PLANS: Plan[]      = ["STARTER","STARTER","ALPHA","ALPHA","PREMIUM","VIP"];
const STATUSES: InvStatus[] = ["APPROVED","APPROVED","APPROVED","PENDING","PENDING","REJECTED","CANCELLED"];
const PAY_METHODS: PayMethod[] = ["USDT","USDT","USDT","BANK_TRANSFER","CRYPTO","MANUAL"];

function hex(n: number): string {
  return Array.from({ length: n }, (_, i) => "0123456789abcdef"[seeded(i * 7 + 1, 16)]).join("");
}

const MOCK_INVESTMENTS: Investment[] = Array.from({ length: 55 }, (_, i) => {
  const fn      = pick(FN, i * 3 + 1);
  const ln      = pick(LN, i * 7 + 2);
  const plan    = pick(PLANS, i * 11);
  const status  = pick(STATUSES, i * 13);
  const payMeth = pick(PAY_METHODS, i * 17);
  const { roi, days } = PLAN_CFG[plan];
  const amount = plan === "VIP" ? seeded(i, 50000, 25000)
               : plan === "PREMIUM" ? seeded(i, 15000, 8000)
               : plan === "ALPHA"   ? seeded(i, 7000, 3000)
               : seeded(i, 2000, 500);
  const daysAgo = seeded(i * 11, 180, 1);
  const createdAt = new Date(Date.now() - daysAgo * 86400000);
  const approvedAt = (status === "APPROVED" || status === "REJECTED")
    ? new Date(createdAt.getTime() + seeded(i, 72, 2) * 3600000)
    : null;
  return {
    id:             `INV${String(i + 2001).padStart(7, "0")}`,
    memberId:       `USR${String(i + 1001).padStart(6, "0")}`,
    username:       `${fn.toLowerCase()}_${ln.toLowerCase()}${seeded(i, 99)}`,
    firstName:      fn,
    lastName:       ln,
    sponsor:        i > 0 ? `${pick(FN, i + 5).toLowerCase()}_ref` : null,
    plan,
    amount,
    roiPercent:     roi,
    durationDays:   days,
    payMethod:      payMeth,
    txHash:         `0x${hex(40)}`,
    walletAddress:  `T${hex(33)}`,
    reference:      `REF${String(seeded(i * 3, 999999, 100000))}`,
    status,
    createdAt,
    approvedAt,
    approvedBy:     status === "APPROVED" ? "admin@primewave.io" : null,
    rejectedReason: status === "REJECTED"  ? "Unverified transaction" : null,
    notes:          "",
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
const $    = (n: number) => `$${n.toLocaleString()}`;
const dt   = (d: Date)   => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dtt  = (d: Date)   => d.toLocaleString("en-US",    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const initials = (f: string, l: string) => `${f[0] ?? "?"}${l[0] ?? ""}`.toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<InvStatus, { color: string; bg: string }> = {
  PENDING:   { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"   },
  APPROVED:  { color: "#34d399", bg: "rgba(52,211,153,0.12)"   },
  REJECTED:  { color: "#f87171", bg: "rgba(248,113,113,0.12)"  },
  CANCELLED: { color: MUTED,     bg: "rgba(170,179,197,0.08)"  },
};
function StatusBadge({ status }: { status: InvStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 5 }}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan badge
// ─────────────────────────────────────────────────────────────────────────────
const PLAN_COLORS: Record<Plan, { color: string; bg: string }> = {
  STARTER: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  ALPHA:   { color: GOLD,      bg: "rgba(212,175,55,0.1)"  },
  PREMIUM: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  VIP:     { color: "#34d399", bg: "rgba(52,211,153,0.1)"  },
};
function PlanBadge({ plan, roi }: { plan: Plan; roi?: number }) {
  const c = PLAN_COLORS[plan];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>{plan}</span>
      {roi !== undefined && <span style={{ fontSize: 10, color: MUTED }}>{roi}% ROI</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, sub }: {
  icon: React.ElementType; label: string; value: string | number; color: string; bg: string; sub?: string;
}) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 110 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.1, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ inv, size = 28 }: { inv: Investment; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: "rgba(212,175,55,0.09)", border: `1.5px solid rgba(212,175,55,0.2)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: GOLD, fontSize: size * 0.33, fontWeight: 700, flexShrink: 0,
    }}>{initials(inv.firstName, inv.lastName)}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionDropdown
// ─────────────────────────────────────────────────────────────────────────────
const ROW_ACTIONS = [
  { icon: Eye,         label: "View Details",      color: "rgba(255,255,255,0.72)" },
  { icon: CheckCircle, label: "Approve",            color: "#34d399" },
  { icon: XCircle,     label: "Reject",             color: "#f87171" },
  { icon: Pencil,      label: "Edit",               color: "rgba(255,255,255,0.72)" },
  { icon: User2,       label: "View Member",        color: "#60a5fa" },
  { icon: FileDown,    label: "Download Receipt",   color: GOLD },
  { icon: History,     label: "Audit History",      color: "rgba(255,255,255,0.55)" },
];

const ActionDropdown = memo(function ActionDropdown({
  id, open, onToggle, onClose, onApprove, onReject,
}: { id: string; open: boolean; onToggle: () => void; onClose: () => void; onApprove: () => void; onReject: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  const handlers: Record<string, () => void> = { Approve: onApprove, Reject: onReject };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        style={{ background: open ? "rgba(255,255,255,0.06)" : "none", border: `1px solid ${open ? BORDER : "transparent"}`, borderRadius: 6, cursor: "pointer", padding: "4px 7px", color: MUTED, display: "flex", alignItems: "center", transition: "all 0.15s" }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100, background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 9, minWidth: 175, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          {ROW_ACTIONS.map((a, i) => (
            <div key={a.label}>
              {i === 1 && <div style={{ height: 1, background: BORDER }} />}
              {i === 3 && <div style={{ height: 1, background: BORDER }} />}
              <div
                onClick={e => { e.stopPropagation(); (handlers[a.label] ?? onClose)(); if (!handlers[a.label]) onClose(); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", cursor: "pointer", color: a.color, fontSize: 12, transition: "background 0.12s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
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
// InvestmentRow
// ─────────────────────────────────────────────────────────────────────────────
interface InvRowProps {
  inv: Investment; selected: boolean; onSelect: (id: string) => void;
  onOpen: (inv: Investment) => void; dropdownOpen: boolean;
  onDropdownToggle: (id: string) => void; onDropdownClose: () => void;
  onApprove: (inv: Investment) => void; onReject: (inv: Investment) => void;
}

const InvestmentRow = memo(function InvestmentRow({
  inv, selected, onSelect, onOpen, dropdownOpen, onDropdownToggle, onDropdownClose, onApprove, onReject,
}: InvRowProps) {
  const ref = useRef<HTMLTableRowElement>(null);
  const onEnter = useCallback(() => { if (ref.current) ref.current.style.background = "rgba(255,255,255,0.025)"; }, []);
  const onLeave = useCallback(() => { if (ref.current) ref.current.style.background = selected ? "rgba(212,175,55,0.04)" : "transparent"; }, [selected]);

  const TD: React.CSSProperties = { padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.72)", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" };

  return (
    <tr ref={ref} onClick={() => onOpen(inv)} onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ cursor: "pointer", background: selected ? "rgba(212,175,55,0.04)" : "transparent", transition: "background 0.12s" }}>
      <td style={{ ...TD, width: 36 }} onClick={e => { e.stopPropagation(); onSelect(inv.id); }}>
        <div style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${selected ? GOLD : BORDER}`, background: selected ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {selected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="hsl(222 62% 7%)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
        </div>
      </td>
      <td style={{ ...TD, fontFamily: "monospace", fontSize: 11, color: MUTED }}>{inv.id}</td>
      <td style={TD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar inv={inv} size={26} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{inv.username}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{inv.memberId}</div>
          </div>
        </div>
      </td>
      <td style={TD}><PlanBadge plan={inv.plan} roi={inv.roiPercent} /></td>
      <td style={{ ...TD, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "monospace" }}>{$(inv.amount)}</td>
      <td style={{ ...TD, fontSize: 11, color: "#34d399" }}>{inv.roiPercent}%</td>
      <td style={{ ...TD, fontSize: 11, color: MUTED }}>{inv.durationDays}d</td>
      <td style={TD}>
        <span style={{ fontSize: 10, fontWeight: 600, color: inv.payMethod === "USDT" ? "#34d399" : inv.payMethod === "BANK_TRANSFER" ? "#60a5fa" : inv.payMethod === "CRYPTO" ? GOLD : MUTED, background: "rgba(255,255,255,0.04)", padding: "2px 7px", borderRadius: 4 }}>
          {inv.payMethod.replace("_", " ")}
        </span>
      </td>
      <td style={{ ...TD, fontFamily: "monospace", fontSize: 10, color: MUTED }}>{inv.txHash.slice(0, 12)}…</td>
      <td style={TD}><StatusBadge status={inv.status} /></td>
      <td style={{ ...TD, fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>{dt(inv.createdAt)}</td>
      <td style={{ ...TD, fontSize: 11, color: MUTED }}>{inv.approvedBy ?? "—"}</td>
      <td style={{ ...TD, width: 48 }} onClick={e => e.stopPropagation()}>
        <ActionDropdown
          id={inv.id} open={dropdownOpen}
          onToggle={() => onDropdownToggle(inv.id)}
          onClose={onDropdownClose}
          onApprove={() => { onDropdownClose(); onApprove(inv); }}
          onReject={() => { onDropdownClose(); onReject(inv); }}
        />
      </td>
    </tr>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────────────────────
function Timeline({ inv }: { inv: Investment }) {
  const steps = [
    { label: "Submitted",  date: inv.createdAt,                                  done: true  },
    { label: "Verified",   date: inv.approvedAt ? new Date(inv.createdAt.getTime() + 3600000) : null, done: !!inv.approvedAt },
    { label: "Approved",   date: inv.approvedAt,                                 done: inv.status === "APPROVED" },
    { label: "Activated",  date: inv.approvedAt ? new Date(inv.approvedAt.getTime() + 86400000) : null, done: inv.status === "APPROVED" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: s.done ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${s.done ? "#34d399" : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
              {s.done && <svg width="7" height="6" viewBox="0 0 7 6" fill="none"><path d="M1 3L2.8 5L6 1" stroke="#34d399" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            </div>
            {i < steps.length - 1 && <div style={{ width: 1, height: 20, background: s.done ? "rgba(52,211,153,0.2)" : BORDER, margin: "2px 0" }} />}
          </div>
          <div style={{ paddingBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: s.done ? "rgba(255,255,255,0.8)" : MUTED }}>{s.label}</div>
            {s.date && <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{dtt(s.date)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvestmentDrawer
// ─────────────────────────────────────────────────────────────────────────────
function DrawerRow({ label, value, mono, accent }: { label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)`, gap: 8 }}>
      <span style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: accent ? GOLD_L : "rgba(255,255,255,0.8)", fontFamily: mono ? "monospace" : undefined, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function InvestmentDrawer({ inv, onClose, onApprove, onReject }: {
  inv: Investment | null; onClose: () => void;
  onApprove: (inv: Investment) => void; onReject: (inv: Investment) => void;
}) {
  const visible = !!inv;
  const GOLD_L = "#F3D37A";
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none", transition: "opacity 0.22s ease" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: 400, background: "hsl(222 62% 7%)", borderLeft: `1px solid ${BORDER}`, boxShadow: "-20px 0 60px rgba(0,0,0,0.5)", transform: visible ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.32,0.72,0,1)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {inv && (
          <>
            {/* Header */}
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "hsl(222 62% 7%)", zIndex: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{inv.id}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2, display: "flex", gap: 6 }}>
                  <StatusBadge status={inv.status} />
                  <PlanBadge plan={inv.plan} />
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "18px 18px 24px", flex: 1 }}>
              {/* Summary */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 10 }}>INVESTMENT SUMMARY</div>
              <DrawerRow label="Amount"    value={$(inv.amount)}          accent />
              <DrawerRow label="Plan"      value={<PlanBadge plan={inv.plan} />} />
              <DrawerRow label="ROI"       value={`${inv.roiPercent}%`} />
              <DrawerRow label="Duration"  value={`${inv.durationDays} days`} />
              <DrawerRow label="Status"    value={<StatusBadge status={inv.status} />} />

              {/* Member */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>MEMBER</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "10px 12px", background: "rgba(255,255,255,0.025)", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                <Avatar inv={inv} size={36} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{inv.username}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{inv.memberId}</div>
                  {inv.sponsor && <div style={{ fontSize: 11, color: "#60a5fa" }}>via @{inv.sponsor}</div>}
                </div>
              </div>

              {/* Wallet Details */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>WALLET DETAILS</div>
              <DrawerRow label="Method"    value={inv.payMethod.replace("_"," ")} />
              <DrawerRow label="TX Hash"   value={inv.txHash}  mono />
              <DrawerRow label="Address"   value={inv.walletAddress} mono />
              <DrawerRow label="Reference" value={inv.reference} />

              {/* Timeline */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>TIMELINE</div>
              <Timeline inv={inv} />

              {/* Audit */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>AUDIT TRAIL</div>
              <DrawerRow label="Created By"   value="system" />
              <DrawerRow label="Approved By"  value={inv.approvedBy ?? "—"} />
              <DrawerRow label="Last Modified" value={dtt(inv.approvedAt ?? inv.createdAt)} />
              {inv.rejectedReason && <DrawerRow label="Reject Reason" value={inv.rejectedReason} />}
              {inv.notes && <DrawerRow label="Notes" value={inv.notes} />}

              {/* Actions */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>ACTIONS</div>
              {inv.status === "PENDING" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    onClick={() => { onClose(); onApprove(inv); }}
                    style={{ flex: 1, padding: "9px 0", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <BadgeCheck size={13} /> Approve
                  </button>
                  <button
                    onClick={() => { onClose(); onReject(inv); }}
                    style={{ flex: 1, padding: "9px 0", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              )}
              {[
                { icon: Pencil,      label: "Edit Investment",   color: "rgba(255,255,255,0.65)", bg: "rgba(255,255,255,0.04)" },
                { icon: FileDown,    label: "Download Receipt",  color: GOLD,                    bg: "rgba(212,175,55,0.06)"  },
                { icon: User2,       label: "View Member",       color: "#60a5fa",               bg: "rgba(96,165,250,0.06)"  },
              ].map(a => (
                <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 8, cursor: "pointer", background: a.bg, marginBottom: 6, border: `1px solid rgba(255,255,255,0.04)`, transition: "opacity 0.15s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.7"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                >
                  <a.icon size={13} style={{ color: a.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: a.color, fontWeight: 500 }}>{a.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval modal
// ─────────────────────────────────────────────────────────────────────────────
function ApprovalModal({ inv, onConfirm, onCancel }: { inv: Investment; onConfirm: (comment: string) => void; onCancel: () => void }) {
  const [comment, setComment] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
      <div style={{ background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, width: 380, boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(52,211,153,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BadgeCheck size={18} style={{ color: "#34d399" }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Approve Investment</div>
            <div style={{ fontSize: 11, color: MUTED }}>{inv.id} · {$(inv.amount)}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>Add an admin comment (required).</div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Verified transaction and documentation…"
          style={{ width: "100%", minHeight: 80, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "9px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: MUTED }}>Cancel</button>
          <button
            onClick={() => comment.trim() && onConfirm(comment.trim())}
            disabled={!comment.trim()}
            style={{ flex: 2, padding: "9px 0", background: comment.trim() ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${comment.trim() ? "rgba(52,211,153,0.3)" : BORDER}`, borderRadius: 8, cursor: comment.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, color: comment.trim() ? "#34d399" : MUTED }}
          >
            Confirm Approval
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reject modal
// ─────────────────────────────────────────────────────────────────────────────
function RejectModal({ inv, onConfirm, onCancel }: { inv: Investment; onConfirm: (reason: string, notes: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes]   = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
      <div style={{ background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, width: 380, boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(248,113,113,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <XCircle size={18} style={{ color: "#f87171" }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Reject Investment</div>
            <div style={{ fontSize: 11, color: MUTED }}>{inv.id} · {$(inv.amount)}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Reason (required)</div>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Unverified transaction…"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box", marginBottom: 10 }}
        />
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Notes (optional)</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Additional context…"
          style={{ width: "100%", minHeight: 60, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "9px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: MUTED }}>Cancel</button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim(), notes.trim())}
            disabled={!reason.trim()}
            style={{ flex: 2, padding: "9px 0", background: reason.trim() ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${reason.trim() ? "rgba(248,113,113,0.3)" : BORDER}`, borderRadius: 8, cursor: reason.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, color: reason.trim() ? "#f87171" : MUTED }}
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────
const GROWTH_DATA = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => ({ day: d, amount: [28, 42, 35, 61, 55, 48, 73][i] }));
const PLAN_DIST = [
  { name: "STARTER", value: 18, fill: "#60a5fa" },
  { name: "ALPHA",   value: 21, fill: GOLD },
  { name: "PREMIUM", value: 11, fill: "#a78bfa" },
  { name: "VIP",     value: 5,  fill: "#34d399" },
];
const PAY_DATA = ["USDT","BANK","CRYPTO","MANUAL"].map((m, i) => ({ method: m, count: [32, 14, 6, 3][i] }));
const APPROVAL_DATA = ["<1h","1-6h","6-24h","1-3d",">3d"].map((r, i) => ({ range: r, count: [8, 15, 22, 9, 1][i] }));

const RECHARTS_STYLE = { fontSize: 11, fill: MUTED };

function InvestmentAnalytics() {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>Investment Analytics</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {/* Growth */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 16px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Investment Growth ($K) — Last 7 days</div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={GROWTH_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(222 62% 9%)", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="amount" stroke={GOLD} fill="rgba(212,175,55,0.08)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Plan Distribution */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Plan Distribution</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <PieChart width={100} height={100}>
              <Pie data={PLAN_DIST} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={3} dataKey="value" stroke="none">
                {PLAN_DIST.map(d => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
            </PieChart>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PLAN_DIST.map(d => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                  <span style={{ color: "rgba(255,255,255,0.65)" }}>{d.name}</span>
                  <span style={{ color: MUTED, marginLeft: "auto" }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 16px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Payment Methods</div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={PAY_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="method" tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(222 62% 9%)", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill={GOLD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Approval Time */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 16px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Approval Time Distribution</div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={APPROVAL_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="range" tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(222 62% 9%)", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* High value + Flagged */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        {/* High Value */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>Recent High Value</span>
            <span style={{ fontSize: 10, color: "#60a5fa", cursor: "pointer" }}>View All →</span>
          </div>
          {MOCK_INVESTMENTS.filter(i => i.plan === "VIP" || i.plan === "PREMIUM").slice(0, 5).map(inv => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar inv={inv} size={22} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>@{inv.username}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>{inv.id}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{$(inv.amount)}</div>
                <PlanBadge plan={inv.plan} />
              </div>
            </div>
          ))}
        </div>

        {/* Flagged */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={13} style={{ color: "#f87171" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>Flagged Transactions</span>
          </div>
          {[
            { label: "Large investments (>$20K)",  count: 3, color: "#fbbf24" },
            { label: "Duplicate transactions",      count: 1, color: "#f87171" },
            { label: "Manual review required",      count: 5, color: "#a78bfa" },
            { label: "Suspicious activity",         count: 2, color: "#f87171" },
          ].map(f => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{f.label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: f.color }}>{f.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────
interface Filters { status: string; plan: string; payMethod: string; date: string; sort: string }
const SEL: React.CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 28px 6px 10px", fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer", outline: "none", appearance: "none" as never };

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  const s = { background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 12 };
  const TD: React.CSSProperties = { padding: "12px", borderBottom: `1px solid rgba(255,255,255,0.04)` };
  return (
    <tr>{[36,90,140,70,80,40,50,80,100,70,80,90,36].map((w,i) => <td key={i} style={TD}><div style={{ ...s, width: w, opacity: 0.4 + (i % 4) * 0.15 }} /></td>)}</tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination (inline, matches MembersPage)
// ─────────────────────────────────────────────────────────────────────────────
function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const btnSt = (active?: boolean): React.CSSProperties => ({ minWidth: 30, height: 30, borderRadius: 6, border: `1px solid ${active ? GOLD : BORDER}`, background: active ? "rgba(212,175,55,0.12)" : "transparent", color: active ? GOLD_L : MUTED, cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px" });
  const GOLD_L = "#F3D37A";
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", padding: "12px 0 4px" }}>
      <span style={{ fontSize: 11, color: MUTED, marginRight: 8 }}>{(page-1)*perPage+1}–{Math.min(page*perPage,total)} of {total}</span>
      <button style={btnSt()} onClick={() => onChange(Math.max(1, page-1))} disabled={page===1}><ChevronLeft size={14} /></button>
      {visible.map((p, i) => (
        <span key={p} style={{ display: "contents" }}>
          {i > 0 && visible[i-1] !== p-1 && <span style={{ fontSize: 12, color: MUTED, padding: "0 4px" }}>…</span>}
          <button style={btnSt(p===page)} onClick={() => onChange(p)}>{p}</button>
        </span>
      ))}
      <button style={btnSt()} onClick={() => onChange(Math.min(pages, page+1))} disabled={page===pages}><ChevronRight size={14} /></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const PER_PAGE = 20;

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>(MOCK_INVESTMENTS);
  const [search,      setSearch]      = useState("");
  const [filters,     setFilters]     = useState<Filters>({ status: "All Status", plan: "All Plans", payMethod: "All Methods", date: "All Time", sort: "Newest" });
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawer,      setDrawer]      = useState<Investment | null>(null);
  const [dropdown,    setDropdown]    = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [approvalModal, setApprovalModal] = useState<Investment | null>(null);
  const [rejectModal,   setRejectModal]   = useState<Investment | null>(null);

  useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    let list = investments.filter(inv => {
      const q = search.toLowerCase();
      if (q && !inv.username.includes(q) && !inv.id.includes(q) && !inv.memberId.includes(q) && !inv.txHash.includes(q) && !inv.walletAddress.toLowerCase().includes(q) && !inv.reference.toLowerCase().includes(q)) return false;
      if (filters.status !== "All Status" && inv.status !== filters.status)   return false;
      if (filters.plan   !== "All Plans"  && inv.plan   !== filters.plan)     return false;
      if (filters.payMethod !== "All Methods" && inv.payMethod !== filters.payMethod) return false;
      if (filters.date === "Today"   && (now - inv.createdAt.getTime()) > 86400000)    return false;
      if (filters.date === "7 Days"  && (now - inv.createdAt.getTime()) > 7*86400000)  return false;
      if (filters.date === "30 Days" && (now - inv.createdAt.getTime()) > 30*86400000) return false;
      return true;
    });
    if (filters.sort === "Oldest")         list = [...list].sort((a,b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (filters.sort === "Highest Amount") list = [...list].sort((a,b) => b.amount - a.amount);
    if (filters.sort === "Lowest Amount")  list = [...list].sort((a,b) => a.amount - b.amount);
    return list;
  }, [investments, search, filters]);

  const paginated = useMemo(() => filtered.slice((page-1)*PER_PAGE, page*PER_PAGE), [filtered, page]);

  const allOnPage  = paginated.every(inv => selectedIds.has(inv.id));
  const someOnPage = paginated.some(inv => selectedIds.has(inv.id));

  const toggleAll    = useCallback(() => { setSelectedIds(prev => { const n = new Set(prev); allOnPage ? paginated.forEach(i => n.delete(i.id)) : paginated.forEach(i => n.add(i.id)); return n; }); }, [allOnPage, paginated]);
  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }, []);

  const handleApprove = useCallback((inv: Investment) => setApprovalModal(inv), []);
  const handleReject  = useCallback((inv: Investment) => setRejectModal(inv),   []);

  const confirmApprove = useCallback((comment: string) => {
    if (!approvalModal) return;
    setInvestments(prev => prev.map(i => i.id === approvalModal.id ? { ...i, status: "APPROVED" as InvStatus, approvedAt: new Date(), approvedBy: "admin@primewave.io", notes: comment } : i));
    setApprovalModal(null);
  }, [approvalModal]);

  const confirmReject = useCallback((reason: string, notes: string) => {
    if (!rejectModal) return;
    setInvestments(prev => prev.map(i => i.id === rejectModal.id ? { ...i, status: "REJECTED" as InvStatus, rejectedReason: reason, notes } : i));
    setRejectModal(null);
  }, [rejectModal]);

  const stats = useMemo(() => {
    const totalCap = investments.filter(i => i.status === "APPROVED").reduce((s, i) => s + i.amount, 0);
    const approved = investments.filter(i => i.status === "APPROVED");
    const avg = approved.length ? Math.round(approved.reduce((s,i) => s + i.amount, 0) / approved.length) : 0;
    const roiLiab = Math.round(totalCap * 0.12);
    return {
      total:     investments.length,
      today:     investments.filter(i => Date.now() - i.createdAt.getTime() < 86400000).length || 4,
      pending:   investments.filter(i => i.status === "PENDING").length,
      rejected:  investments.filter(i => i.status === "REJECTED").length,
      totalCap,  avg, activePlans: 3, roiLiab,
    };
  }, [investments]);

  const TH: React.CSSProperties = { padding: "10px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, background: "hsl(222 62% 9%)", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 5 };

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => { setFilters(f => ({ ...f, [k]: e.target.value })); setPage(1); };

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 3 }}>Investment Center</h1>
          <p style={{ fontSize: 12, color: MUTED }}>Monitor, approve and manage every investment across the platform.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { icon: RotateCw, label: "Refresh",    action: () => { setLoading(true); setTimeout(() => setLoading(false), 600); } },
            { icon: Download, label: "Export",      action: () => {} },
            { icon: Plus,     label: "Create",      action: () => {} },
          ].map(b => (
            <button key={b.label} onClick={b.action} style={{ display: "flex", alignItems: "center", gap: 6, background: b.label === "Create" ? "rgba(212,175,55,0.12)" : CARD, border: `1px solid ${b.label === "Create" ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: b.label === "Create" ? GOLD_L : "rgba(255,255,255,0.65)", transition: "opacity 0.15s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.75"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            >
              <b.icon size={13} /> {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard icon={TrendingUp}    label="Total Investments" value={stats.total}              color="#60a5fa" bg="rgba(96,165,250,0.1)"  />
        <StatCard icon={Zap}           label="Today's"           value={stats.today}              color={GOLD}    bg="rgba(212,175,55,0.1)"  />
        <StatCard icon={Clock}         label="Pending Approval"  value={stats.pending}            color="#fbbf24" bg="rgba(251,191,36,0.1)"  />
        <StatCard icon={XCircle}       label="Rejected"          value={stats.rejected}           color="#f87171" bg="rgba(248,113,113,0.1)" />
        <StatCard icon={DollarSign}    label="Total Capital"     value={`$${(stats.totalCap/1000).toFixed(0)}K`} color="#34d399" bg="rgba(52,211,153,0.1)" />
        <StatCard icon={Activity}      label="Avg Investment"    value={`$${stats.avg.toLocaleString()}`}         color="#a78bfa" bg="rgba(167,139,250,0.1)" />
        <StatCard icon={BadgeCheck}    label="Active Plans"      value={stats.activePlans}        color="#34d399" bg="rgba(52,211,153,0.1)"  />
        <StatCard icon={AlertTriangle} label="ROI Liability"     value={`$${(stats.roiLiab/1000).toFixed(0)}K`} color="#f87171" bg="rgba(248,113,113,0.1)" />
      </div>

      {/* Search + filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "8px 12px", flex: 1, maxWidth: 420 }}>
          <Search size={14} style={{ color: MUTED, flexShrink: 0 }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by ID, username, TX hash, reference…" style={{ background: "none", border: "none", outline: "none", fontSize: 12.5, color: "rgba(255,255,255,0.75)", width: "100%" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2 }}><X size={12} /></button>}
        </div>
        <button onClick={() => setShowFilters(f => !f)} style={{ display: "flex", alignItems: "center", gap: 6, background: showFilters ? "rgba(212,175,55,0.08)" : CARD, border: `1px solid ${showFilters ? "rgba(212,175,55,0.25)" : BORDER}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, color: showFilters ? GOLD_L : "rgba(255,255,255,0.6)" }}>
          <Filter size={13} /> Filters {showFilters && <X size={11} />}
        </button>
      </div>

      {showFilters && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {([
            { key: "status",    opts: ["All Status","PENDING","APPROVED","REJECTED","CANCELLED"] },
            { key: "plan",      opts: ["All Plans","STARTER","ALPHA","PREMIUM","VIP"] },
            { key: "payMethod", opts: ["All Methods","USDT","BANK_TRANSFER","CRYPTO","MANUAL"] },
            { key: "date",      opts: ["All Time","Today","7 Days","30 Days"] },
            { key: "sort",      opts: ["Newest","Oldest","Highest Amount","Lowest Amount"] },
          ] as const).map(f => (
            <div key={f.key} style={{ position: "relative" }}>
              <select style={SEL} value={filters[f.key as keyof Filters]} onChange={set(f.key as keyof Filters)}>
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown size={10} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(212,175,55,0.06)", border: `1px solid rgba(212,175,55,0.2)`, borderRadius: 9, padding: "9px 14px", marginBottom: 12 }}>
          <CheckSquare size={14} style={{ color: GOLD }} />
          <span style={{ fontSize: 12, color: GOLD_L, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <div style={{ flex: 1 }} />
          {["Approve","Reject","Export","Assign Reviewer"].map(a => (
            <button key={a} style={{ background: a === "Reject" ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.05)", border: `1px solid ${a === "Reject" ? "rgba(248,113,113,0.2)" : BORDER}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: a === "Reject" ? "#f87171" : "rgba(255,255,255,0.65)" }}>{a}</button>
          ))}
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 440px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 36 }}>
                  <div onClick={toggleAll} style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${allOnPage && paginated.length > 0 ? GOLD : BORDER}`, background: allOnPage && paginated.length > 0 ? GOLD : someOnPage ? "rgba(212,175,55,0.3)" : "transparent", cursor: "pointer" }} />
                </th>
                {["Inv ID","Member","Plan","Amount","ROI %","Duration","Payment","TX Hash","Status","Created","Approved By",""].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
                : paginated.length === 0
                  ? <tr><td colSpan={13} style={{ padding: 60, textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <TrendingUp size={20} style={{ color: MUTED }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{search ? `No results for "${search}"` : "No investments found"}</div>
                        <div style={{ fontSize: 12, color: MUTED }}>Adjust your filters to see investments.</div>
                      </div>
                    </td></tr>
                  : paginated.map(inv => (
                    <InvestmentRow
                      key={inv.id} inv={inv}
                      selected={selectedIds.has(inv.id)}
                      onSelect={toggleSelect} onOpen={setDrawer}
                      dropdownOpen={dropdown === inv.id}
                      onDropdownToggle={id => setDropdown(p => p === id ? null : id)}
                      onDropdownClose={() => setDropdown(null)}
                      onApprove={handleApprove} onReject={handleReject}
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

      {/* Analytics */}
      <InvestmentAnalytics />

      {/* Drawer + Modals */}
      <InvestmentDrawer inv={drawer} onClose={() => setDrawer(null)} onApprove={handleApprove} onReject={handleReject} />
      {approvalModal && <ApprovalModal inv={approvalModal} onConfirm={confirmApprove} onCancel={() => setApprovalModal(null)} />}
      {rejectModal   && <RejectModal   inv={rejectModal}   onConfirm={confirmReject}  onCancel={() => setRejectModal(null)}   />}
    </AdminLayout>
  );
}
