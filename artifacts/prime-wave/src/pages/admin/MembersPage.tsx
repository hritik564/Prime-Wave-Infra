import {
  useState, useMemo, useCallback, useEffect, useRef, memo,
} from "react";
import AdminLayout from "./AdminLayout";
import MemberDrawer, { type DrawerMember } from "./MemberDrawer";
import MemberModal from "./MemberModal";
import { SuspendDialog, DeleteDialog, ResetPasswordDialog, ApproveKYCDialog, LoginAsUserDialog } from "./MemberDialogs";
import {
  Search, Download, Plus, ChevronLeft, ChevronRight,
  MoreHorizontal, Eye, Pencil, BadgeCheck, ShieldX, KeyRound,
  LogIn, Trash2, X, ChevronDown, Users, UserCheck, UserX,
  Clock, UserPlus, Crown, Filter, RotateCw,
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
type Status   = "ACTIVE" | "INACTIVE" | "SUSPENDED";
type Plan     = "STARTER" | "ALPHA" | "PREMIUM" | "VIP";
type Position = "LEFT" | "RIGHT";
type Rank     = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";
type KYC      = "VERIFIED" | "PENDING" | "REJECTED" | "UNSUBMITTED";

interface Member extends DrawerMember {}

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — 80 members
// ─────────────────────────────────────────────────────────────────────────────
const FN = ["James","Emma","Liam","Sophia","Noah","Olivia","Mason","Ava","Ethan","Isabella","Logan","Mia","Lucas","Amelia","Jackson","Harper","Aiden","Evelyn","Carter","Abigail","Sebastian","Emily","Owen","Ella","Ryan","Avery","Nathan","Scarlett","Caleb","Grace","Dylan","Zoe","Tyler","Lily","Hunter","Chloe","Andrew","Victoria","Christian","Madison"];
const LN = ["Smith","Johnson","Williams","Brown","Davis","Miller","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Garcia","Martinez","Robinson","Clark","Lewis","Walker","Hall","Allen","Young","King","Wright","Scott","Green","Baker","Nelson","Hill","Ramirez","Campbell","Mitchell","Roberts","Carter","Phillips","Evans","Turner"];
const COUNTRIES = ["United States","United Kingdom","Canada","Australia","Germany","France","Singapore","UAE","Nigeria","India","Philippines","Malaysia","South Africa","Brazil","Mexico"];
const PLANS: (Plan | null)[]          = [null,null,"STARTER","STARTER","STARTER","ALPHA","ALPHA","PREMIUM","PREMIUM","VIP"];
const STATUSES: Status[]              = ["ACTIVE","ACTIVE","ACTIVE","ACTIVE","ACTIVE","INACTIVE","SUSPENDED"];
const RANKS: (Rank | null)[]          = [null,"BRONZE","BRONZE","SILVER","SILVER","GOLD","DIAMOND"];
const POSITIONS: (Position | null)[]  = ["LEFT","RIGHT","LEFT","RIGHT",null];
const KYCS: KYC[]                     = ["VERIFIED","VERIFIED","VERIFIED","PENDING","PENDING","REJECTED","UNSUBMITTED"];

function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }
function seeded(n: number, max: number, min = 0) {
  return Math.floor(((Math.sin(n * 9301 + 49297) * 0.5 + 0.5)) * (max - min) + min);
}

const MOCK: Member[] = Array.from({ length: 80 }, (_, i) => {
  const fn   = pick(FN, i * 3 + 1);
  const ln   = pick(LN, i * 7 + 2);
  const plan = pick(PLANS, i * 5);
  const stat = pick(STATUSES, i * 11);
  const rank = pick(RANKS, i * 13);
  const pos  = pick(POSITIONS, i * 17);
  const kyc  = pick(KYCS, i * 19);
  const invest = plan === "VIP" ? seeded(i, 50000, 25000)
               : plan === "PREMIUM" ? seeded(i, 15000, 8000)
               : plan === "ALPHA"   ? seeded(i, 7000, 3000)
               : plan === "STARTER" ? seeded(i, 2000, 500) : 0;
  const refs  = seeded(i * 7, 18);
  const daysAgo = seeded(i * 11, 500, 1);
  return {
    id:               `USR${String(i + 1001).padStart(6, "0")}`,
    username:         `${fn.toLowerCase()}_${ln.toLowerCase()}${seeded(i, 99)}`,
    firstName:        fn,
    lastName:         ln,
    email:            `${fn.toLowerCase()}.${ln.toLowerCase()}${seeded(i, 99)}@example.com`,
    phone:            `+1 ${seeded(i, 999, 200)}-${seeded(i * 3, 999, 100)}-${seeded(i * 7, 9999, 1000)}`,
    country:          pick(COUNTRIES, i * 23),
    status:           stat,
    plan,
    investment:       invest,
    position:         pos,
    rank,
    sponsor:          i > 0 ? `${pick(FN, i + 5).toLowerCase()}_${pick(LN, i + 3).toLowerCase()}${seeded(i + 5, 99)}` : null,
    joinedAt:         new Date(Date.now() - daysAgo * 86400000),
    referralCode:     `PW${fn.substring(0, 2).toUpperCase()}${String(seeded(i * 3, 9999, 1000))}`,
    kyc,
    directReferrals:  refs,
    totalTeam:        refs * seeded(i, 8, 1),
    leftBV:           seeded(i, 12000),
    rightBV:          seeded(i * 3, 12000),
    carryForward:     seeded(i * 5, 3000),
    depositWallet:    seeded(i * 13, 8000),
    incomeWallet:     seeded(i * 17, 5000),
    withdrawalWallet: seeded(i * 19, 2000),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
const $  = (n: number) => n === 0 ? "—" : `$${n.toLocaleString()}`;
const dt = (d: Date)   => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const initials = (f: string, l: string) => `${f[0] ?? "?"}${l[0] ?? ""}`.toUpperCase();

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<Status, { color: string; bg: string }> = {
  ACTIVE:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"   },
  INACTIVE:  { color: MUTED,     bg: "rgba(170,179,197,0.08)"  },
  SUSPENDED: { color: "#f87171", bg: "rgba(248,113,113,0.12)"  },
};
export function StatusBadge({ status }: { status: Status }) {
  const c = STATUS_CFG[status];
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 5 }}>{status}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC badge
// ─────────────────────────────────────────────────────────────────────────────
const KYC_CFG: Record<KYC, { color: string; bg: string; label: string }> = {
  VERIFIED:    { color: "#34d399", bg: "rgba(52,211,153,0.12)",  label: "Verified"    },
  PENDING:     { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  label: "Pending"     },
  REJECTED:    { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "Rejected"    },
  UNSUBMITTED: { color: MUTED,     bg: "rgba(170,179,197,0.06)", label: "Unsubmitted" },
};
function KYCBadge({ kyc }: { kyc: KYC }) {
  const c = KYC_CFG[kyc];
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 5 }}>{c.label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan badge
// ─────────────────────────────────────────────────────────────────────────────
const PLAN_CFG: Record<string, { color: string; bg: string }> = {
  STARTER: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  ALPHA:   { color: GOLD,      bg: "rgba(212,175,55,0.1)"  },
  PREMIUM: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  VIP:     { color: "#34d399", bg: "rgba(52,211,153,0.1)"  },
};
function PlanBadge({ plan, amount }: { plan: Plan | null; amount: number }) {
  if (!plan) return <span style={{ fontSize: 11, color: MUTED }}>—</span>;
  const c = PLAN_CFG[plan];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>{plan}</span>
      <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>{$(amount)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: string | number; color: string; bg: string;
}) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 110 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ m, size = 30 }: { m: Member; size?: number }) {
  const col = m.status === "ACTIVE" ? "#34d399" : m.status === "SUSPENDED" ? "#f87171" : MUTED;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: size / 2, background: "rgba(212,175,55,0.09)", border: `1.5px solid ${col}50`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: size * 0.33, fontWeight: 700 }}>
        {initials(m.firstName, m.lastName)}
      </div>
      <div style={{ position: "absolute", bottom: 0, right: 0, width: 7, height: 7, borderRadius: "50%", background: col, border: "1.5px solid hsl(222 62% 7%)" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action dropdown
// ─────────────────────────────────────────────────────────────────────────────
const ROW_ACTIONS = [
  { icon: Eye,       label: "View Profile",   color: "rgba(255,255,255,0.72)" },
  { icon: Pencil,    label: "Edit Member",    color: "rgba(255,255,255,0.72)" },
  { icon: BadgeCheck,label: "Approve KYC",   color: "#34d399" },
  { icon: ShieldX,   label: "Suspend Member",color: "#f87171" },
  { icon: KeyRound,  label: "Reset Password",color: "#60a5fa" },
  { icon: LogIn,     label: "Login As User",  color: GOLD     },
  { icon: Trash2,    label: "Delete Member",  color: "#f87171" },
];

const ActionDropdown = memo(function ActionDropdown({
  open, onToggle, onClose, onAction,
}: { open: boolean; onToggle: () => void; onClose: () => void; onAction: (label: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        style={{ background: open ? "rgba(255,255,255,0.06)" : "none", border: `1px solid ${open ? BORDER : "transparent"}`, borderRadius: 6, cursor: "pointer", padding: "4px 7px", color: MUTED, display: "flex", alignItems: "center", transition: "all 0.15s" }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100, background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 9, minWidth: 170, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          {ROW_ACTIONS.map((a, i) => (
            <div key={a.label}>
              {(i === 2 || i === 5) && <div style={{ height: 1, background: BORDER }} />}
              <div
                onClick={e => { e.stopPropagation(); onAction(a.label); onClose(); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", cursor: "pointer", color: a.color, fontSize: 12, transition: "background 0.12s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                <a.icon size={13} style={{ flexShrink: 0 }} />{a.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Member row
// ─────────────────────────────────────────────────────────────────────────────
interface MemberRowProps {
  m: Member; selected: boolean; onSelect: (id: string) => void;
  onOpen: (m: Member) => void; dropdownOpen: boolean;
  onDropdownToggle: () => void; onDropdownClose: () => void;
  onAction: (m: Member, label: string) => void;
}
export const MemberRow = memo(function MemberRow({ m, selected, onSelect, onOpen, dropdownOpen, onDropdownToggle, onDropdownClose, onAction }: MemberRowProps) {
  const ref = useRef<HTMLTableRowElement>(null);
  const onEnter = useCallback(() => { if (ref.current) ref.current.style.background = "rgba(255,255,255,0.025)"; }, []);
  const onLeave = useCallback(() => { if (ref.current) ref.current.style.background = selected ? "rgba(212,175,55,0.04)" : "transparent"; }, [selected]);
  const TD: React.CSSProperties = { padding: "9px 10px", fontSize: 12, color: "rgba(255,255,255,0.72)", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" };
  return (
    <tr ref={ref} onClick={() => onOpen(m)} onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ cursor: "pointer", background: selected ? "rgba(212,175,55,0.04)" : "transparent", transition: "background 0.12s" }}>
      <td style={{ ...TD, width: 34 }} onClick={e => { e.stopPropagation(); onSelect(m.id); }}>
        <div style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${selected ? GOLD : BORDER}`, background: selected ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {selected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="hsl(222 62% 7%)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
        </div>
      </td>
      <td style={TD}><Avatar m={m} size={26} /></td>
      <td style={TD}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{m.username}</div>
        <div style={{ fontSize: 10, color: MUTED }}>{m.id}</div>
      </td>
      <td style={TD}><span style={{ fontSize: 12 }}>{m.firstName} {m.lastName}</span></td>
      <td style={{ ...TD, fontSize: 11, color: MUTED }}>{m.email}</td>
      <td style={{ ...TD, fontSize: 11, color: MUTED }}>{m.country}</td>
      <td style={TD}><PlanBadge plan={m.plan} amount={m.investment} /></td>
      <td style={{ ...TD, fontWeight: 600, fontFamily: "monospace", color: "rgba(255,255,255,0.82)" }}>{$(m.investment)}</td>
      <td style={TD}>{m.sponsor ? <span style={{ fontSize: 11, color: "#60a5fa" }}>@{m.sponsor}</span> : <span style={{ color: MUTED }}>—</span>}</td>
      <td style={TD}>{m.position ? <span style={{ fontSize: 10, fontWeight: 700, color: m.position === "LEFT" ? "#60a5fa" : "#a78bfa", background: m.position === "LEFT" ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)", padding: "2px 7px", borderRadius: 4 }}>{m.position}</span> : <span style={{ color: MUTED, fontSize: 11 }}>—</span>}</td>
      <td style={{ ...TD, fontSize: 12, fontWeight: 600 }}>{m.directReferrals}</td>
      <td style={TD}><StatusBadge status={m.status} /></td>
      <td style={TD}><KYCBadge kyc={m.kyc} /></td>
      <td style={{ ...TD, fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>{dt(m.joinedAt)}</td>
      <td style={{ ...TD, width: 44 }} onClick={e => e.stopPropagation()}>
        <ActionDropdown
          open={dropdownOpen}
          onToggle={onDropdownToggle}
          onClose={onDropdownClose}
          onAction={label => onAction(m, label)}
        />
      </td>
    </tr>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton row
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  const s = { background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 12 };
  const TD: React.CSSProperties = { padding: "11px 10px", borderBottom: `1px solid rgba(255,255,255,0.04)` };
  return <tr>{[34,28,130,100,150,90,70,70,90,55,50,55,60,80,44].map((w,i) => <td key={i} style={TD}><div style={{ ...s, width: w, opacity: 0.4 + (i % 4) * 0.15 }} /></td>)}</tr>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ search }: { search: string }) {
  return (
    <div style={{ padding: "60px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Users size={24} style={{ color: MUTED }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
        {search ? `No results for "${search}"` : "No members found"}
      </div>
      <div style={{ fontSize: 12, color: MUTED, maxWidth: 280 }}>Try a different search term or clear your filters.</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────
interface Filters { status: string; plan: string; country: string; kyc: string; investStatus: string; date: string }
const SEL: React.CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 28px 6px 10px", fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer", outline: "none", appearance: "none" as never };
const FILTER_OPTS = [
  { key: "status",       opts: ["All Status","ACTIVE","INACTIVE","SUSPENDED"]              },
  { key: "plan",         opts: ["All Plans","No Plan","STARTER","ALPHA","PREMIUM","VIP"]   },
  { key: "country",      opts: ["All Countries",...Array.from(new Set(MOCK.map(m => m.country))).sort()] },
  { key: "kyc",          opts: ["All KYC","VERIFIED","PENDING","REJECTED","UNSUBMITTED"]  },
  { key: "investStatus", opts: ["All Investment","With Plan","No Plan"]                    },
  { key: "date",         opts: ["All Time","Today","7 Days","30 Days"]                     },
] as const;

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...filters, [k]: e.target.value });
  const hasActive = Object.values(filters).some(v => !v.startsWith("All") && v !== "All Time");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Filter size={13} style={{ color: MUTED }} />
      {FILTER_OPTS.map(f => (
        <div key={f.key} style={{ position: "relative" }}>
          <select style={SEL} value={filters[f.key as keyof Filters]} onChange={set(f.key as keyof Filters)}>
            {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={10} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
        </div>
      ))}
      {hasActive && (
        <button onClick={() => onChange({ status: "All Status", plan: "All Plans", country: "All Countries", kyc: "All KYC", investStatus: "All Investment", date: "All Time" })}
          style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>
          Clear Filters
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_PER_PAGE = 25;

export default function MembersPage() {
  // Table state
  const [search,      setSearch]      = useState("");
  const [filters,     setFilters]     = useState<Filters>({ status: "All Status", plan: "All Plans", country: "All Countries", kyc: "All KYC", investStatus: "All Investment", date: "All Time" });
  const [perPage,     setPerPage]     = useState(DEFAULT_PER_PAGE);
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dropdown,    setDropdown]    = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Drawer
  const [drawer, setDrawer] = useState<Member | null>(null);

  // Modals / dialogs
  const [createOpen,    setCreateOpen]    = useState(false);
  const [editTarget,    setEditTarget]    = useState<Member | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Member | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<Member | null>(null);
  const [resetTarget,   setResetTarget]   = useState<Member | null>(null);
  const [kycTarget,     setKycTarget]     = useState<Member | null>(null);
  const [loginAsTarget, setLoginAsTarget] = useState<Member | null>(null);

  useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);

  // ── Row action handler ────────────────────────────────────────────────────
  const handleRowAction = useCallback((m: Member, label: string) => {
    if (label === "View Profile")   { setDrawer(m);         return; }
    if (label === "Edit Member")    { setEditTarget(m);     return; }
    if (label === "Approve KYC")    { setKycTarget(m);      return; }
    if (label === "Suspend Member") { setSuspendTarget(m);  return; }
    if (label === "Reset Password") { setResetTarget(m);    return; }
    if (label === "Login As User")  { setLoginAsTarget(m);  return; }
    if (label === "Delete Member")  { setDeleteTarget(m);   return; }
  }, []);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = Date.now();
    return MOCK.filter(m => {
      const q = search.toLowerCase();
      if (q && !m.username.includes(q) && !m.email.includes(q) && !m.id.includes(q) && !m.phone.includes(q) && !m.referralCode.toLowerCase().includes(q) && !(m.sponsor ?? "").includes(q) && !`${m.firstName} ${m.lastName}`.toLowerCase().includes(q)) return false;
      if (filters.status  !== "All Status"     && m.status !== filters.status)   return false;
      if (filters.plan    === "No Plan"         && m.plan   !== null)             return false;
      if (filters.plan    !== "All Plans" && filters.plan !== "No Plan" && m.plan !== filters.plan) return false;
      if (filters.country !== "All Countries"  && m.country !== filters.country) return false;
      if (filters.kyc     !== "All KYC"        && m.kyc    !== filters.kyc)      return false;
      if (filters.investStatus === "With Plan"  && m.plan   === null)             return false;
      if (filters.investStatus === "No Plan"    && m.plan   !== null)             return false;
      if (filters.date    === "Today"  && (now - m.joinedAt.getTime()) > 86400000)    return false;
      if (filters.date    === "7 Days" && (now - m.joinedAt.getTime()) > 7*86400000)  return false;
      if (filters.date    === "30 Days"&& (now - m.joinedAt.getTime()) > 30*86400000) return false;
      return true;
    });
  }, [search, filters]);

  const paginated  = useMemo(() => filtered.slice((page-1)*perPage, page*perPage), [filtered, page, perPage]);
  const allOnPage  = paginated.every(m => selectedIds.has(m.id));
  const someOnPage = paginated.some(m => selectedIds.has(m.id));

  const toggleAll    = useCallback(() => { setSelectedIds(prev => { const n = new Set(prev); allOnPage ? paginated.forEach(m => n.delete(m.id)) : paginated.forEach(m => n.add(m.id)); return n; }); }, [allOnPage, paginated]);
  const toggleSelect = useCallback((id: string) => { setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }, []);

  const handleSearch  = useCallback((v: string) => { setSearch(v); setPage(1); }, []);
  const handleFilters = useCallback((f: Filters) => { setFilters(f); setPage(1); }, []);

  const stats = useMemo(() => ({
    total:    MOCK.length,
    active:   MOCK.filter(m => m.status === "ACTIVE").length,
    kyc:      MOCK.filter(m => m.kyc === "PENDING").length,
    suspended:MOCK.filter(m => m.status === "SUSPENDED").length,
    premium:  MOCK.filter(m => m.plan === "PREMIUM" || m.plan === "VIP").length,
    today:    MOCK.filter(m => Date.now() - m.joinedAt.getTime() < 86400000).length || 5,
  }), []);

  const pages = Math.ceil(filtered.length / perPage);

  const TH: React.CSSProperties = { padding: "9px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, background: "hsl(222 62% 9%)", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 5 };

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 3 }}>Members</h1>
          <p style={{ fontSize: 12, color: MUTED }}>Manage every registered member across the platform.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 600); }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            <RotateCw size={13} /> Refresh
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            <Download size={13} /> Export CSV
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: GOLD_L, fontWeight: 600 }}>
            <Plus size={13} /> Create Member
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard icon={Users}     label="Total Members"   value={stats.total}     color="#60a5fa" bg="rgba(96,165,250,0.1)"   />
        <StatCard icon={UserCheck} label="Active Members"  value={stats.active}    color="#34d399" bg="rgba(52,211,153,0.1)"   />
        <StatCard icon={Clock}     label="Pending KYC"     value={stats.kyc}       color="#fbbf24" bg="rgba(251,191,36,0.1)"   />
        <StatCard icon={UserX}     label="Suspended"       value={stats.suspended} color="#f87171" bg="rgba(248,113,113,0.1)"  />
        <StatCard icon={Crown}     label="Premium Members" value={stats.premium}   color="#a78bfa" bg="rgba(167,139,250,0.1)"  />
        <StatCard icon={UserPlus}  label="New Today"       value={stats.today}     color={GOLD}    bg="rgba(212,175,55,0.1)"   />
      </div>

      {/* Search + filter toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "8px 12px", flex: 1, maxWidth: 460 }}>
          <Search size={14} style={{ color: MUTED, flexShrink: 0 }} />
          <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search members, email, phone, username or member ID…" style={{ background: "none", border: "none", outline: "none", fontSize: 12.5, color: "rgba(255,255,255,0.75)", width: "100%" }} />
          {search && <button onClick={() => handleSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2 }}><X size={12} /></button>}
        </div>
        <button onClick={() => setShowFilters(f => !f)} style={{ display: "flex", alignItems: "center", gap: 6, background: showFilters ? "rgba(212,175,55,0.08)" : CARD, border: `1px solid ${showFilters ? "rgba(212,175,55,0.25)" : BORDER}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, color: showFilters ? GOLD_L : "rgba(255,255,255,0.6)" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 9, padding: "9px 14px", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: GOLD_L, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <div style={{ flex: 1 }} />
          {["Approve KYC","Suspend","Export","Send Notification","Delete"].map(a => (
            <button key={a} style={{ background: a === "Delete" || a === "Suspend" ? "rgba(248,113,113,0.08)" : "rgba(255,255,255,0.05)", border: `1px solid ${a === "Delete" || a === "Suspend" ? "rgba(248,113,113,0.2)" : BORDER}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: a === "Delete" || a === "Suspend" ? "#f87171" : "rgba(255,255,255,0.65)" }}>{a}</button>
          ))}
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 400px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 34 }}>
                  <div onClick={toggleAll} style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${allOnPage && paginated.length > 0 ? GOLD : BORDER}`, background: allOnPage && paginated.length > 0 ? GOLD : someOnPage ? "rgba(212,175,55,0.3)" : "transparent", cursor: "pointer" }} />
                </th>
                {["","Username","Full Name","Email","Country","Plan","Investment","Sponsor","Position","Refs","Status","KYC","Joined","⋯"].map((h, i) => (
                  <th key={i} style={TH}>{h === "⋯" ? "" : h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 10 }, (_, i) => <SkeletonRow key={i} />)
                : paginated.length === 0
                  ? <tr><td colSpan={15}><EmptyState search={search} /></td></tr>
                  : paginated.map(m => (
                    <MemberRow key={m.id} m={m}
                      selected={selectedIds.has(m.id)}
                      onSelect={toggleSelect}
                      onOpen={setDrawer}
                      dropdownOpen={dropdown === m.id}
                      onDropdownToggle={() => setDropdown(p => p === m.id ? null : m.id)}
                      onDropdownClose={() => setDropdown(null)}
                      onAction={handleRowAction}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: MUTED }}>Rows per page</span>
              <div style={{ position: "relative" }}>
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }} style={{ ...SEL, padding: "4px 24px 4px 8px", fontSize: 11 }}>
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown size={9} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
              </div>
              <span style={{ fontSize: 11, color: MUTED }}>
                Showing {(page-1)*perPage+1}–{Math.min(page*perPage, filtered.length)} of {filtered.length} Members
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: pages }, (_, i) => i+1).filter(p => p===1||p===pages||Math.abs(p-page)<=1).map((p, i, arr) => (
                <span key={p} style={{ display: "contents" }}>
                  {i > 0 && arr[i-1] !== p-1 && <span style={{ fontSize: 12, color: MUTED, padding: "0 4px" }}>…</span>}
                  <button onClick={() => setPage(p)} style={{ minWidth: 30, height: 30, borderRadius: 6, border: `1px solid ${p===page ? GOLD : BORDER}`, background: p===page ? "rgba(212,175,55,0.12)" : "transparent", color: p===page ? GOLD_L : MUTED, cursor: "pointer", fontSize: 12, fontWeight: p===page ? 600 : 400, padding: "0 8px" }}>{p}</button>
                </span>
              ))}
              <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Drawer ────────────────────────────────────────────────────────── */}
      <MemberDrawer member={drawer} onClose={() => setDrawer(null)} />

      {/* ── Create modal ──────────────────────────────────────────────────── */}
      {createOpen && (
        <MemberModal mode="create" onClose={() => setCreateOpen(false)} />
      )}

      {/* ── Edit modal ────────────────────────────────────────────────────── */}
      {editTarget && (
        <MemberModal
          mode="edit"
          initial={{
            firstName: editTarget.firstName, lastName: editTarget.lastName,
            username: editTarget.username, email: editTarget.email,
            phone: editTarget.phone, country: editTarget.country,
            sponsor: editTarget.sponsor ?? "",
            placement: editTarget.position ?? "",
            status: editTarget.status,
            plan: editTarget.plan ?? "",
            investment: String(editTarget.investment),
            emailVerified: true,
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {suspendTarget && <SuspendDialog  member={suspendTarget} onClose={() => setSuspendTarget(null)} />}
      {deleteTarget  && <DeleteDialog   member={deleteTarget}  onClose={() => setDeleteTarget(null)}  />}
      {resetTarget   && <ResetPasswordDialog member={resetTarget} onClose={() => setResetTarget(null)} />}
      {kycTarget     && <ApproveKYCDialog    member={kycTarget}   onClose={() => setKycTarget(null)}   />}
      {loginAsTarget && <LoginAsUserDialog   member={loginAsTarget} onClose={() => setLoginAsTarget(null)} />}
    </AdminLayout>
  );
}
