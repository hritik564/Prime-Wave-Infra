import {
  useState, useCallback, useEffect, useRef, memo,
} from "react";
import { useResponsive } from "@/hooks/useResponsive";
import AdminLayout from "./AdminLayout";
import MemberDrawer, { type DrawerMember } from "./MemberDrawer";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import MemberModal from "./MemberModal";
import {
  SuspendDialog, DeleteDialog, ResetPasswordDialog,
  ApproveKYCDialog, LoginAsUserDialog, ActivateDialog,
} from "./MemberDialogs";
import {
  adminSearchUsers, getAdminDashboard, getAdminUserDetail,
  adminSuspendUser, adminActivateUser, adminResetUserPassword,
  type AdminUserListItem, type AdminUserDetail,
  type AdminUpdateUserPayload,
} from "@/lib/api";
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
type Status   = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BLOCKED";
type Plan     = "STARTER" | "ALPHA" | "PREMIUM" | "VIP";
type Position = "LEFT" | "RIGHT";
type Rank     = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";
type KYC      = "VERIFIED" | "PENDING" | "REJECTED" | "UNSUBMITTED";

interface Member extends DrawerMember {}

// ─────────────────────────────────────────────────────────────────────────────
// Search helpers
// ─────────────────────────────────────────────────────────────────────────────
function buildSearchParams(term: string): {
  username?: string; email?: string; phone?: string; referralCode?: string;
} {
  if (!term.trim()) return {};
  const t = term.trim();
  if (t.includes("@"))                            return { email: t };
  if (t.startsWith("+") || /^\d{6,}/.test(t))    return { phone: t };
  if (/^pw/i.test(t))                             return { referralCode: t };
  return { username: t };
}

function mapApiUser(u: AdminUserListItem): Member {
  const dep = parseFloat(String(u.wallet?.depositWallet   ?? 0)) || 0;
  const inc = parseFloat(String(u.wallet?.incomeWallet    ?? 0)) || 0;
  const wit = parseFloat(String(u.wallet?.withdrawalWallet ?? 0)) || 0;
  return {
    id:               u.id,
    username:         u.username,
    firstName:        u.firstName ?? "",
    lastName:         u.lastName  ?? "",
    email:            u.email,
    phone:            u.phone ?? "",
    country:          "—",
    status:           u.status as Status,
    plan:             null,
    investment:       dep,
    position:         null,
    rank:             null,
    sponsor:          null,
    joinedAt:         new Date(u.createdAt),
    referralCode:     u.referralCode ?? "",
    kyc:              "UNSUBMITTED" as KYC,
    directReferrals:  u.directReferralCount ?? 0,
    totalTeam:        0,
    leftBV:           0,
    rightBV:          0,
    carryForward:     0,
    depositWallet:    dep,
    incomeWallet:     inc,
    withdrawalWallet: wit,
  };
}

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
  ACTIVE:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  INACTIVE:  { color: MUTED,     bg: "rgba(170,179,197,0.08)" },
  SUSPENDED: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  BLOCKED:   { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};
export function StatusBadge({ status }: { status: Status }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.INACTIVE;
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
  const col = m.status === "ACTIVE" ? "#34d399" : (m.status === "SUSPENDED" || m.status === "BLOCKED") ? "#f87171" : MUTED;
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
function getRowActions(status: Status) {
  return [
    { icon: Eye,       label: "View Profile",    color: "rgba(255,255,255,0.72)" },
    { icon: Pencil,    label: "Edit Member",     color: "rgba(255,255,255,0.72)" },
    { icon: BadgeCheck,label: "Approve KYC",     color: "#34d399" },
    (status === "SUSPENDED" || status === "INACTIVE" || status === "BLOCKED")
      ? { icon: UserCheck, label: "Activate Member", color: "#34d399" }
      : { icon: ShieldX,   label: "Suspend Member",  color: "#f87171" },
    { icon: KeyRound,  label: "Reset Password",  color: "#60a5fa" },
    { icon: LogIn,     label: "Login As User",   color: GOLD     },
    { icon: Trash2,    label: "Delete Member",   color: "#f87171" },
  ];
}

const ActionDropdown = memo(function ActionDropdown({
  open, onToggle, onClose, onAction, memberStatus,
}: { open: boolean; onToggle: () => void; onClose: () => void; onAction: (label: string) => void; memberStatus: Status }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);
  const actions = getRowActions(memberStatus);
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
          {actions.map((a, i) => (
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
          memberStatus={m.status}
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
  { key: "status",       opts: ["All Status","ACTIVE","INACTIVE","SUSPENDED","BLOCKED"]     },
  { key: "plan",         opts: ["All Plans","No Plan","STARTER","ALPHA","PREMIUM","VIP"]    },
  { key: "country",      opts: ["All Countries"]                                             },
  { key: "kyc",          opts: ["All KYC","VERIFIED","PENDING","REJECTED","UNSUBMITTED"]    },
  { key: "investStatus", opts: ["All Investment","With Plan","No Plan"]                      },
  { key: "date",         opts: ["All Time","Today","7 Days","30 Days"]                       },
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
// Mobile card
// ─────────────────────────────────────────────────────────────────────────────
function MobileMemberCard({ m, onOpen, onAction }: {
  m: Member; onOpen: (m: Member) => void; onAction: (m: Member, label: string) => void;
}) {
  const col = m.status === "ACTIVE" ? "#34d399"
    : (m.status === "SUSPENDED" || m.status === "BLOCKED") ? "#f87171" : MUTED;
  return (
    <div
      onClick={() => onOpen(m)}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer" }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(212,175,55,0.09)", border: `1.5px solid ${col}60`, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontSize: 13, fontWeight: 700 }}>
          {initials(m.firstName, m.lastName)}
        </div>
        <div style={{ position: "absolute", bottom: 1, right: 1, width: 8, height: 8, borderRadius: "50%", background: col, border: "1.5px solid hsl(222 62% 7%)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>@{m.username}</span>
          <StatusBadge status={m.status} />
        </div>
        <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{m.email}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {m.plan && <span style={{ fontSize: 10, color: GOLD, background: "rgba(212,175,55,0.08)", padding: "1px 6px", borderRadius: 4 }}>{m.plan}</span>}
          <span style={{ fontSize: 10, color: MUTED }}>{m.directReferrals} refs</span>
          <span style={{ fontSize: 10, color: MUTED }}>{dt(m.joinedAt)}</span>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onAction(m, "View Profile"); }}
        style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 11, color: GOLD_L, flexShrink: 0 }}
      >
        View
      </button>
    </div>
  );
}

function SkeletonMobileCard() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: 120, height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 7 }} />
        <div style={{ width: 160, height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 4 }} />
      </div>
      <div style={{ width: 46, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.04)", flexShrink: 0 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_PER_PAGE = 25;

export default function MembersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const [filters,     setFilters]     = useState<Filters>({
    status: "All Status", plan: "All Plans", country: "All Countries",
    kyc: "All KYC", investStatus: "All Investment", date: "All Time",
  });
  const [perPage,     setPerPage]     = useState(DEFAULT_PER_PAGE);
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dropdown,    setDropdown]    = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const { toasts, toast, dismiss } = useToast();
  const { isMobile } = useResponsive();

  const [members,    setMembers]    = useState<Member[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, kyc: 0, suspended: 0, premium: 0, today: 0 });

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const sp = buildSearchParams(search);
      const result = await adminSearchUsers({
        page, limit: perPage,
        ...(filters.status !== "All Status" ? { status: filters.status } : {}),
        ...sp,
      });
      setMembers(result.data.map(mapApiUser));
      setTotalCount(result.meta.total);
    } catch {
      toast("Failed to load members", "error");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, filters.status, toast]);

  useEffect(() => { void fetchMembers(); }, [fetchMembers]);

  useEffect(() => {
    getAdminDashboard()
      .then(d => setStats({
        total: d.totalUsers, active: d.activeUsers, kyc: 0,
        suspended: d.suspendedUsers, premium: 0, today: d.todayNewUsers,
      }))
      .catch(() => {});
  }, []);

  const [drawer,       setDrawer]       = useState<Member | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<AdminUserDetail | null>(null);
  const drawerIdRef = useRef<string | null>(null);

  const openDrawer = useCallback((m: Member) => {
    setDrawer(m);
    setDrawerDetail(null);
    drawerIdRef.current = m.id;
    void getAdminUserDetail(m.id).then(d => {
      if (drawerIdRef.current !== m.id) return;
      setDrawerDetail(d);
      const dep = parseFloat(String(d.wallet?.depositWallet   ?? 0)) || 0;
      const inc = parseFloat(String(d.wallet?.incomeWallet    ?? 0)) || 0;
      const wit = parseFloat(String(d.wallet?.withdrawalWallet ?? 0)) || 0;
      const activeInv = d.investments.find(i => i.status === "ACTIVE");
      setDrawer(prev => {
        if (!prev || prev.id !== m.id) return prev;
        return {
          ...prev,
          position:         (d.position ?? null) as Position | null,
          leftBV:           parseFloat(String(d.leftBV ?? 0)) || 0,
          rightBV:          parseFloat(String(d.rightBV ?? 0)) || 0,
          sponsor:          d.sponsor?.username ?? null,
          plan:             (activeInv?.planType ?? null) as Plan | null,
          investment:       d.investments.reduce((s, i) => s + (parseFloat(String(i.amount)) || 0), 0),
          rank:             (d.salaryAchievements.find(s => s.isActive)?.rankName ?? null) as Rank | null,
          directReferrals:  d.directReferralCount,
          depositWallet:    dep,
          incomeWallet:     inc,
          withdrawalWallet: wit,
        };
      });
    }).catch(() => {});
  }, []);

  const closeDrawer = useCallback(() => {
    drawerIdRef.current = null;
    setDrawer(null);
    setDrawerDetail(null);
  }, []);

  const [createOpen,     setCreateOpen]     = useState(false);
  const [editTarget,     setEditTarget]     = useState<Member | null>(null);
  const [suspendTarget,  setSuspendTarget]  = useState<Member | null>(null);
  const [activateTarget, setActivateTarget] = useState<Member | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<Member | null>(null);
  const [resetTarget,    setResetTarget]    = useState<Member | null>(null);
  const [kycTarget,      setKycTarget]      = useState<Member | null>(null);
  const [loginAsTarget,  setLoginAsTarget]  = useState<Member | null>(null);

  const handleRowAction = useCallback((m: Member, label: string) => {
    if (label === "View Profile")    { openDrawer(m);        return; }
    if (label === "Edit Member")     { setEditTarget(m);     return; }
    if (label === "Approve KYC")     { toast("KYC management — coming soon", "info"); return; }
    if (label === "Suspend Member")  { setSuspendTarget(m);    return; }
    if (label === "Activate Member") { setActivateTarget(m);   return; }
    if (label === "Reset Password")  { setResetTarget(m); return; }
    if (label === "Login As User")   { toast("Impersonation — coming soon", "info");  return; }
    if (label === "Delete Member")   { toast("Delete member — coming soon", "info");  return; }
  }, [openDrawer, toast]);

  const pages      = Math.ceil(totalCount / perPage) || 1;
  const allOnPage  = members.length > 0 && members.every(m => selectedIds.has(m.id));
  const someOnPage = members.some(m => selectedIds.has(m.id));

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      allOnPage ? members.forEach(m => n.delete(m.id)) : members.forEach(m => n.add(m.id));
      return n;
    });
  }, [allOnPage, members]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleSearch  = useCallback((v: string) => { setSearchInput(v); }, []);
  const handleFilters = useCallback((f: Filters) => { setFilters(f); setPage(1); }, []);

  const TH: React.CSSProperties = { padding: "9px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, background: "hsl(222 62% 9%)", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 5 };

  return (
    <AdminLayout>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 3 }}>Members</h1>
          {!isMobile && <p style={{ fontSize: 12, color: MUTED }}>Manage every registered member across the platform.</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void fetchMembers()} style={{ display: "flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            <RotateCw size={13} />
          </button>
          {!isMobile && (
            <button style={{ display: "flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              <Download size={13} /> Export CSV
            </button>
          )}
          <button onClick={() => setCreateOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: GOLD_L, fontWeight: 600 }}>
            <Plus size={13} /> {isMobile ? "Add" : "Create Member"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
        <StatCard icon={Users}     label="Total Members"   value={stats.total}     color="#60a5fa" bg="rgba(96,165,250,0.1)"  />
        <StatCard icon={UserCheck} label="Active Members"  value={stats.active}    color="#34d399" bg="rgba(52,211,153,0.1)"  />
        <StatCard icon={Clock}     label="Pending KYC"     value={stats.kyc}       color="#fbbf24" bg="rgba(251,191,36,0.1)"  />
        <StatCard icon={UserX}     label="Suspended"       value={stats.suspended} color="#f87171" bg="rgba(248,113,113,0.1)" />
        <StatCard icon={Crown}     label="Premium Members" value={stats.premium}   color="#a78bfa" bg="rgba(167,139,250,0.1)" />
        <StatCard icon={UserPlus}  label="New Today"       value={stats.today}     color={GOLD}    bg="rgba(212,175,55,0.1)"  />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "8px 12px", flex: 1, maxWidth: 460 }}>
          <Search size={14} style={{ color: MUTED, flexShrink: 0 }} />
          <input value={searchInput} onChange={e => handleSearch(e.target.value)} placeholder="Search by username, email, phone or referral code…" style={{ background: "none", border: "none", outline: "none", fontSize: 12.5, color: "rgba(255,255,255,0.75)", width: "100%" }} />
          {searchInput && <button onClick={() => handleSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2 }}><X size={12} /></button>}
        </div>
        <button onClick={() => setShowFilters(f => !f)} style={{ display: "flex", alignItems: "center", gap: 6, background: showFilters ? "rgba(212,175,55,0.08)" : CARD, border: `1px solid ${showFilters ? "rgba(212,175,55,0.25)" : BORDER}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, color: showFilters ? GOLD_L : "rgba(255,255,255,0.6)" }}>
          <Filter size={13} /> Filters {showFilters && <X size={11} />}
        </button>
      </div>

      {showFilters && <div style={{ marginBottom: 14 }}><FilterBar filters={filters} onChange={handleFilters} /></div>}

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

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        {isMobile ? (
          <div>
            {loading
              ? Array.from({ length: 6 }, (_, i) => <SkeletonMobileCard key={i} />)
              : members.length === 0
                ? <EmptyState search={searchInput} />
                : members.map(m => <MobileMemberCard key={m.id} m={m} onOpen={openDrawer} onAction={handleRowAction} />)
            }
          </div>
        ) : (
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 400px)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 34 }}>
                    <div onClick={toggleAll} style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${allOnPage ? GOLD : BORDER}`, background: allOnPage ? GOLD : someOnPage ? "rgba(212,175,55,0.3)" : "transparent", cursor: "pointer" }} />
                  </th>
                  {["","Username","Full Name","Email","Country","Plan","Investment","Sponsor","Position","Refs","Status","KYC","Joined",""].map((h, i) => (
                    <th key={i} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 10 }, (_, i) => <SkeletonRow key={i} />)
                  : members.length === 0
                    ? <tr><td colSpan={15}><EmptyState search={searchInput} /></td></tr>
                    : members.map(m => (
                      <MemberRow key={m.id} m={m}
                        selected={selectedIds.has(m.id)}
                        onSelect={toggleSelect}
                        onOpen={openDrawer}
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
        )}

        {!loading && totalCount > 0 && (
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
                Showing {(page-1)*perPage+1}–{Math.min(page*perPage, totalCount)} of {totalCount} Members
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, cursor: page===1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: page===1 ? 0.4 : 1 }}>
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: pages }, (_, i) => i+1).filter(p => p===1||p===pages||Math.abs(p-page)<=1).map((p, i, arr) => (
                <span key={p} style={{ display: "contents" }}>
                  {i > 0 && arr[i-1] !== p-1 && <span style={{ fontSize: 12, color: MUTED, padding: "0 4px" }}>…</span>}
                  <button onClick={() => setPage(p)} style={{ minWidth: 30, height: 30, borderRadius: 6, border: `1px solid ${p===page ? GOLD : BORDER}`, background: p===page ? "rgba(212,175,55,0.12)" : "transparent", color: p===page ? GOLD_L : MUTED, cursor: "pointer", fontSize: 12, fontWeight: p===page ? 600 : 400, padding: "0 8px" }}>{p}</button>
                </span>
              ))}
              <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, cursor: page===pages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: page===pages ? 0.4 : 1 }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <MemberDrawer member={drawer} detail={drawerDetail} onClose={closeDrawer}
        onAction={label => { if (drawer) handleRowAction(drawer, label); }}
      />

      {createOpen && (
        <MemberModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void fetchMembers(); toast("Member created successfully", "success"); }}
        />
      )}

      {editTarget && (
        <MemberModal
          mode="edit"
          userId={editTarget.id}
          initial={{
            firstName: editTarget.firstName ?? "",
            lastName:  editTarget.lastName  ?? "",
            username:  editTarget.username  ?? "",
            email:     editTarget.email     ?? "",
            phone:     editTarget.phone     ?? "",
            status:    editTarget.status    ?? "INACTIVE",
          }}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setMembers(p => p.map(m => m.id === editTarget.id ? {
              ...m,
              username:  updated.username,
              email:     updated.email,
              phone:     updated.phone ?? "",
              firstName: updated.firstName,
              lastName:  updated.lastName,
            } : m));
            if (drawer?.id === editTarget.id) {
              setDrawer(d => d ? { ...d, username: updated.username, email: updated.email, phone: updated.phone ?? "", firstName: updated.firstName, lastName: updated.lastName } : d);
            }
            setEditTarget(null);
            toast(`@${updated.username} updated successfully`, "success");
          }}
        />
      )}

      {suspendTarget && (
        <SuspendDialog member={suspendTarget} onClose={() => setSuspendTarget(null)}
          onConfirm={async (_reason) => {
            try {
              await adminSuspendUser(suspendTarget.id);
              setMembers(p => p.map(m => m.id === suspendTarget.id ? { ...m, status: "SUSPENDED" as Status } : m));
              if (drawer?.id === suspendTarget.id) setDrawer(d => d ? { ...d, status: "SUSPENDED" as Status } : d);
              toast(`@${suspendTarget.username} suspended`, "warn");
            } catch { toast("Failed to suspend member", "error"); }
          }}
        />
      )}

      {activateTarget && (
        <ActivateDialog member={activateTarget} onClose={() => setActivateTarget(null)}
          onConfirm={async () => {
            try {
              await adminActivateUser(activateTarget.id);
              setMembers(p => p.map(m => m.id === activateTarget.id ? { ...m, status: "ACTIVE" as Status } : m));
              if (drawer?.id === activateTarget.id) setDrawer(d => d ? { ...d, status: "ACTIVE" as Status } : d);
              toast(`@${activateTarget.username} activated`, "success");
            } catch { toast("Failed to activate member", "error"); }
          }}
        />
      )}

      {deleteTarget && (
        <DeleteDialog member={deleteTarget} onClose={() => setDeleteTarget(null)}
          onConfirm={() => toast("Delete member — coming soon", "info")} />
      )}
      {resetTarget && (
        <ResetPasswordDialog member={resetTarget} onClose={() => setResetTarget(null)}
          onConfirm={async (pass) => {
            try {
              await adminResetUserPassword(resetTarget.id, pass);
              toast(`Password reset for @${resetTarget.username}`, "success");
            } catch {
              toast("Failed to reset password", "error");
            }
          }} />
      )}
      {kycTarget && (
        <ApproveKYCDialog member={kycTarget} onClose={() => setKycTarget(null)}
          onConfirm={(_type) => toast("KYC management — coming soon", "info")} />
      )}
      {loginAsTarget && (
        <LoginAsUserDialog member={loginAsTarget} onClose={() => setLoginAsTarget(null)}
          onConfirm={() => toast("Impersonation — coming soon", "info")} />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </AdminLayout>
  );
}
