import {
  useState, useCallback, useEffect, useRef, memo,
} from "react";
import AdminLayout from "./AdminLayout";
import MemberDrawer, { type DrawerMember } from "./MemberDrawer";
import MemberModal from "./MemberModal";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  SuspendDialog, DeleteDialog, ResetPasswordDialog,
  ApproveKYCDialog, LoginAsUserDialog, ActivateDialog,
} from "./MemberDialogs";
import {
  getAdminUserDetail, adminSuspendUser, adminActivateUser, adminBlockUser,
  adminResetUserPassword, adminDeleteUser,
  type AdminUserDetail,
} from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import {
  Search, Filter, FileSpreadsheet, FileText,
  Users, UserCheck, UserPlus, Calendar, RefreshCw,
  ChevronLeft, ChevronRight, X, Eye, ShieldX, Ban,
  Plus, RotateCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.55)";
const BORDER = "rgba(255,255,255,0.07)";
const BG     = "hsl(222 62% 6%)";
const BG2    = "hsl(222 62% 8%)";

// ─────────────────────────────────────────────────────────────────────────────
// API row type (from /api/admin/reports/members)
// ─────────────────────────────────────────────────────────────────────────────
interface ReportRow {
  id: string; name: string; username: string; email: string; phone: string;
  joinedAt: string; accountType: string; sponsor: string; binaryParent: string;
  placement: string; accountStatus: string; operationalStatus: string;
  hasInvestment: boolean; investmentPlan: string; investmentAmount: string;
  depositWallet: string; incomeWallet: string; withdrawalWallet: string;
  directReferrals: number; leftBV: string; rightBV: string;
}

type Status   = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "BLOCKED";
type Plan     = "STARTER" | "ALPHA" | "PREMIUM" | "VIP";
type Position = "LEFT" | "RIGHT";

interface Meta    { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean; }
interface Summary { total: number; joinedToday: number; joinedYesterday: number; joinedThisWeek: number; joinedThisMonth: number; }
interface ReportData { data: ReportRow[]; meta: Meta; summary: Summary; }

// ─────────────────────────────────────────────────────────────────────────────
// Map report row → DrawerMember
// ─────────────────────────────────────────────────────────────────────────────
function mapRow(u: ReportRow): DrawerMember {
  const parts     = u.name.trim().split(" ");
  const firstName = parts[0] ?? u.username;
  const lastName  = parts.slice(1).join(" ");
  const p = (s: string) => parseFloat(s) || 0;
  return {
    id: u.id, username: u.username, firstName, lastName,
    email: u.email, phone: u.phone ?? "", country: "—",
    status:            u.accountStatus as Status,
    operationalStatus: u.operationalStatus as "ACTIVE" | "INACTIVE",
    plan:              (u.investmentPlan || null) as Plan | null,
    investment:        p(u.investmentAmount),
    position:          (u.placement || null) as Position | null,
    rank:              null, sponsor: u.sponsor || null,
    joinedAt:          new Date(u.joinedAt),
    referralCode: "", kyc: "UNSUBMITTED",
    directReferrals: u.directReferrals, totalTeam: 0,
    leftBV: p(u.leftBV), rightBV: p(u.rightBV), carryForward: 0,
    depositWallet: p(u.depositWallet),
    incomeWallet:  p(u.incomeWallet),
    withdrawalWallet: p(u.withdrawalWallet),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter state
// ─────────────────────────────────────────────────────────────────────────────
interface Filters {
  preset: string; from: string; to: string;
  status: string; operationalStatus: string; hasInvestment: string;
  placement: string; accountType: string; search: string;
}
const DEFAULT_FILTERS: Filters = {
  preset: "", from: "", to: "",
  status: "", operationalStatus: "", hasInvestment: "",
  placement: "", accountType: "", search: "",
};

function buildQS(f: Filters, page: number, limit: number) {
  const p = new URLSearchParams();
  if (f.preset)            p.set("preset", f.preset);
  if (f.from)              p.set("from",   f.from);
  if (f.to)                p.set("to",     f.to);
  if (f.status)            p.set("status", f.status);
  if (f.operationalStatus) p.set("operationalStatus", f.operationalStatus);
  if (f.hasInvestment)     p.set("hasInvestment", f.hasInvestment);
  if (f.placement)         p.set("placement", f.placement);
  if (f.accountType)       p.set("accountType", f.accountType);
  if (f.search)            p.set("search", f.search);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return p.toString();
}

function buildExportQS(f: Filters) {
  const p = new URLSearchParams();
  if (f.preset)            p.set("preset", f.preset);
  if (f.from)              p.set("from",   f.from);
  if (f.to)                p.set("to",     f.to);
  if (f.status)            p.set("status", f.status);
  if (f.operationalStatus) p.set("operationalStatus", f.operationalStatus);
  if (f.hasInvestment)     p.set("hasInvestment", f.hasInvestment);
  if (f.placement)         p.set("placement", f.placement);
  if (f.accountType)       p.set("accountType", f.accountType);
  if (f.search)            p.set("search", f.search);
  return p.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers / sub-components
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 140 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.9)", lineHeight: 1.1 }}>{value.toLocaleString()}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>{label.toUpperCase()}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7, color: value ? "rgba(255,255,255,0.85)" : MUTED, fontSize: 12, padding: "7px 10px", outline: "none", cursor: "pointer", appearance: "none", minWidth: 130 }}>
        {options.map(o => <option key={o.value} value={o.value} style={{ background: "#0E1B37" }}>{o.label}</option>)}
      </select>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfgs: Record<string, { color: string; bg: string }> = {
    ACTIVE:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
    INACTIVE:  { color: MUTED,     bg: "rgba(170,179,197,0.08)" },
    SUSPENDED: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)"   },
    BLOCKED:   { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  };
  const c = cfgs[status] ?? cfgs.INACTIVE;
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 5 }}>{status}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const cfgs: Record<string, { color: string; bg: string }> = {
    MI:     { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
    RD:     { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
    SP:     { color: "#fb923c", bg: "rgba(251,146,60,0.1)"  },
    Master: { color: GOLD_L,    bg: "rgba(212,175,55,0.1)"  },
    Normal: { color: MUTED,     bg: "rgba(170,179,197,0.06)"},
  };
  const c = cfgs[type] ?? cfgs.Normal;
  return <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>{type}</span>;
}

function PlacementBadge({ p }: { p: string }) {
  if (!p) return <span style={{ color: MUTED, fontSize: 11 }}>—</span>;
  return <span style={{ fontSize: 10, fontWeight: 700, color: p === "LEFT" ? "#60a5fa" : "#a78bfa", background: p === "LEFT" ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)", padding: "2px 7px", borderRadius: 4 }}>{p}</span>;
}

function SkeletonRow({ cols }: { cols: number }) {
  return <tr>{Array.from({ length: cols }, (_, i) => <td key={i} style={{ padding: "11px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}><div style={{ height: 11, borderRadius: 4, background: "rgba(255,255,255,0.06)", opacity: 0.4 + (i % 3) * 0.15 }} /></td>)}</tr>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block dialog (simple confirm)
// ─────────────────────────────────────────────────────────────────────────────
function BlockDialog({ member, onClose, onConfirm }: { member: DrawerMember; onClose: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", padding: 16 }}>
      <div style={{ background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 14, width: "100%", maxWidth: 400, boxShadow: "0 24px 60px rgba(0,0,0,0.75)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(248,113,113,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ban size={19} style={{ color: "#f87171" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Block Member</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Permanently restrict access for @{member.username}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }}><X size={15} /></button>
        </div>
        <div style={{ padding: "0 20px 20px" }}>
          <div style={{ fontSize: 12, color: "rgba(248,113,113,0.85)", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "10px 12px", margin: "14px 0 20px" }}>
            Blocking will permanently prevent this member from logging in or performing any actions. This is more severe than suspension.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, color: MUTED }}>Cancel</button>
            <button onClick={() => { onConfirm(); onClose(); }} style={{ flex: 1, padding: "10px 0", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#f87171" }}>Block Member</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row action buttons
// ─────────────────────────────────────────────────────────────────────────────
const RowActions = memo(function RowActions({ row, onView, onToggleStatus, onBlock }: {
  row: ReportRow;
  onView: () => void;
  onToggleStatus: () => void;
  onBlock: () => void;
}) {
  const isBlocked   = row.accountStatus === "BLOCKED";
  const isSuspended = row.accountStatus === "SUSPENDED";
  const isActive    = row.accountStatus === "ACTIVE";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={e => { e.stopPropagation(); onView(); }}
        title="View member"
        style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, color: GOLD_L, display: "flex", alignItems: "center", gap: 4 }}
      >
        <Eye size={11} />View
      </button>

      {isActive ? (
        <button
          onClick={e => { e.stopPropagation(); onToggleStatus(); }}
          title="Suspend member"
          style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, color: "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}
        >
          <ShieldX size={11} />Suspend
        </button>
      ) : !isBlocked ? (
        <button
          onClick={e => { e.stopPropagation(); onToggleStatus(); }}
          title="Activate member"
          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, color: "#34d399", display: "flex", alignItems: "center", gap: 4 }}
        >
          <UserCheck size={11} />Activate
        </button>
      ) : null}

      {!isBlocked && (
        <button
          onClick={e => { e.stopPropagation(); onBlock(); }}
          title="Block member"
          style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, padding: "4px 7px", cursor: "pointer", fontSize: 11, color: "#f87171", display: "flex", alignItems: "center" }}
        >
          <Ban size={11} />
        </button>
      )}

      {isBlocked && (
        <span style={{ fontSize: 10, color: "#f87171", fontWeight: 600, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, padding: "4px 8px" }}>BLOCKED</span>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const LIMIT = 50;

export default function MembersPage() {
  const [filters,   setFilters]   = useState<Filters>(DEFAULT_FILTERS);
  const [applied,   setApplied]   = useState<Filters>(DEFAULT_FILTERS);
  const [page,      setPage]      = useState(1);
  const [data,      setData]      = useState<ReportData | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [exporting, setExporting] = useState<"excel" | "csv" | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [createOpen,     setCreateOpen]     = useState(false);
  const [drawer,         setDrawer]         = useState<DrawerMember | null>(null);
  const [drawerDetail,   setDrawerDetail]   = useState<AdminUserDetail | null>(null);
  const drawerIdRef = useRef<string | null>(null);
  const [suspendTarget,  setSuspendTarget]  = useState<DrawerMember | null>(null);
  const [activateTarget, setActivateTarget] = useState<DrawerMember | null>(null);
  const [blockTarget,    setBlockTarget]    = useState<DrawerMember | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<DrawerMember | null>(null);
  const [resetTarget,    setResetTarget]    = useState<DrawerMember | null>(null);
  const [kycTarget,      setKycTarget]      = useState<DrawerMember | null>(null);
  const [loginAsTarget,  setLoginAsTarget]  = useState<DrawerMember | null>(null);
  const [editTarget,     setEditTarget]     = useState<DrawerMember | null>(null);

  const { toasts, toast, dismiss } = useToast();

  const fetchReport = useCallback(async (f: Filters, pg: number) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const token = getAdminToken();
      const qs    = buildQS(f, pg, LIMIT);
      const res   = await fetch(`/api/admin/reports/members?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data as ReportData);
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchReport(applied, page); }, [fetchReport, applied, page]);

  const handleApply = useCallback(() => { setApplied(filters); setPage(1); }, [filters]);
  const handleReset = useCallback(() => { setFilters(DEFAULT_FILTERS); setApplied(DEFAULT_FILTERS); setPage(1); }, []);
  const setF = (key: keyof Filters) => (v: string) => setFilters(f => ({ ...f, [key]: v }));
  const activeCount = Object.values(applied).filter(Boolean).length;

  const handleExport = useCallback(async (type: "excel" | "csv") => {
    setExporting(type);
    try {
      const token    = getAdminToken();
      const qs       = buildExportQS(applied);
      const endpoint = type === "excel"
        ? `/api/admin/reports/members/export?${qs}`
        : `/api/admin/reports/members/export-csv?${qs}`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = type === "excel"
        ? `members-${new Date().toISOString().slice(0, 10)}.xlsx`
        : `members-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setExporting(null);
    }
  }, [applied, toast]);

  const openDrawer = useCallback((row: ReportRow) => {
    const m = mapRow(row);
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
          position:        (d.position ?? null) as typeof prev.position,
          leftBV:          parseFloat(String(d.leftBV  ?? 0)) || 0,
          rightBV:         parseFloat(String(d.rightBV ?? 0)) || 0,
          sponsor:         d.sponsor?.username ?? null,
          plan:            (activeInv?.planType ?? null) as typeof prev.plan,
          investment:      d.investments.reduce((s, i) => s + (parseFloat(String(i.amount)) || 0), 0),
          rank:            (d.salaryAchievements.find(s => s.isActive)?.rankName ?? null) as typeof prev.rank,
          directReferrals: d.directReferralCount,
          depositWallet:   dep, incomeWallet: inc, withdrawalWallet: wit,
        };
      });
    }).catch(() => {});
  }, []);

  const closeDrawer = useCallback(() => { drawerIdRef.current = null; setDrawer(null); setDrawerDetail(null); }, []);

  const handleDrawerAction = useCallback((label: string) => {
    if (!drawer) return;
    if (label === "Suspend Member")  { setSuspendTarget(drawer);  return; }
    if (label === "Activate Member") { setActivateTarget(drawer); return; }
    if (label === "Block Member")    { setBlockTarget(drawer);    return; }
    if (label === "Reset Password")  { setResetTarget(drawer);    return; }
    if (label === "Approve KYC")     { setKycTarget(drawer);      return; }
    if (label === "Login As User")   { setLoginAsTarget(drawer);  return; }
    if (label === "Delete Member")   { setDeleteTarget(drawer);   return; }
    if (label === "Edit Member")     { setEditTarget(drawer);     return; }
  }, [drawer]);

  const updateRowStatus = useCallback((id: string, status: Status) => {
    setData(prev => {
      if (!prev) return prev;
      return { ...prev, data: prev.data.map(r => r.id === id ? { ...r, accountStatus: status } : r) };
    });
    setDrawer(prev => prev?.id === id ? { ...prev, status } : prev);
  }, []);

  const TH: React.CSSProperties = {
    padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700,
    letterSpacing: "0.06em", color: MUTED, background: "hsl(222 62% 5%)",
    borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 5,
  };
  const TD: React.CSSProperties = {
    padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.72)",
    borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle",
  };

  const rows    = data?.data ?? [];
  const meta    = data?.meta;
  const summary = data?.summary;

  return (
    <AdminLayout>
      <div style={{ minHeight: "100vh", background: BG, color: "rgba(255,255,255,0.85)", padding: "24px 28px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={15} style={{ color: GOLD }} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.92)", margin: 0 }}>Members</h1>
              <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>Manage, filter, and export member data</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => void fetchReport(applied, page)}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6, background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.6)" }}
            >
              <RotateCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: GOLD_L, fontWeight: 600 }}
            >
              <Plus size={13} /> Create Member
            </button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <SummaryCard icon={Users}     label="Total Members"     value={summary?.total           ?? 0} color={GOLD}      />
          <SummaryCard icon={UserPlus}  label="Joined Today"      value={summary?.joinedToday     ?? 0} color="#34d399"   />
          <SummaryCard icon={UserPlus}  label="Joined Yesterday"  value={summary?.joinedYesterday ?? 0} color="#60a5fa"   />
          <SummaryCard icon={Calendar}  label="Joined This Week"  value={summary?.joinedThisWeek  ?? 0} color="#a78bfa"   />
          <SummaryCard icon={UserCheck} label="Joined This Month" value={summary?.joinedThisMonth ?? 0} color="#fb923c"   />
        </div>

        {/* ── Filters panel ── */}
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Filter size={13} style={{ color: GOLD }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD_L, letterSpacing: "0.04em" }}>FILTERS</span>
            {activeCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(212,175,55,0.15)", color: GOLD, borderRadius: 4, padding: "1px 6px" }}>{activeCount} active</span>
            )}
          </div>

          {/* Row 1: date */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Sel label="Date Preset" value={filters.preset} onChange={setF("preset")} options={[
              { value: "",          label: "All time"    },
              { value: "today",     label: "Today"       },
              { value: "yesterday", label: "Yesterday"   },
              { value: "last7",     label: "Last 7 Days" },
              { value: "last30",    label: "Last 30 Days"},
              { value: "thisMonth", label: "This Month"  },
              { value: "lastMonth", label: "Last Month"  },
            ]} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>FROM</label>
              <input type="date" value={filters.from} onChange={e => setF("from")(e.target.value)}
                style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7, color: "rgba(255,255,255,0.8)", fontSize: 12, padding: "7px 10px", outline: "none", colorScheme: "dark" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>TO</label>
              <input type="date" value={filters.to} onChange={e => setF("to")(e.target.value)}
                style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7, color: "rgba(255,255,255,0.8)", fontSize: 12, padding: "7px 10px", outline: "none", colorScheme: "dark" }} />
            </div>
          </div>

          {/* Row 2: status filters */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Sel label="Account Status" value={filters.status} onChange={setF("status")} options={[
              { value: "",          label: "All Statuses" },
              { value: "ACTIVE",    label: "Active"       },
              { value: "INACTIVE",  label: "Inactive"     },
              { value: "SUSPENDED", label: "Suspended"    },
              { value: "BLOCKED",   label: "Blocked"      },
            ]} />
            <Sel label="Operational Status" value={filters.operationalStatus} onChange={setF("operationalStatus")} options={[
              { value: "",        label: "All"      },
              { value: "ACTIVE",  label: "Active"   },
              { value: "INACTIVE",label: "Inactive" },
            ]} />
            <Sel label="Investment" value={filters.hasInvestment} onChange={setF("hasInvestment")} options={[
              { value: "",    label: "All"            },
              { value: "yes", label: "Has Investment" },
              { value: "no",  label: "No Plan"        },
            ]} />
            <Sel label="Placement" value={filters.placement} onChange={setF("placement")} options={[
              { value: "",      label: "All"   },
              { value: "LEFT",  label: "Left"  },
              { value: "RIGHT", label: "Right" },
            ]} />
            <Sel label="Account Type" value={filters.accountType} onChange={setF("accountType")} options={[
              { value: "",       label: "All Types"   },
              { value: "master", label: "Master"      },
              { value: "mi",     label: "MI"          },
              { value: "rd",     label: "RD"          },
              { value: "sp",     label: "SP"          },
              { value: "normal", label: "Normal"      },
            ]} />
          </div>

          {/* Row 3: search + apply */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>SEARCH</label>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
                <input
                  type="text" placeholder="Name, username, or email…"
                  value={filters.search}
                  onChange={e => setF("search")(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleApply(); }}
                  style={{ width: "100%", background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7, color: "rgba(255,255,255,0.85)", fontSize: 12, padding: "7px 10px 7px 30px", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <button onClick={handleApply} style={{ background: "rgba(212,175,55,0.15)", border: "1px solid rgba(212,175,55,0.3)", color: GOLD_L, borderRadius: 7, padding: "8px 18px", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Filter size={12} /> Apply Filters
            </button>
            {activeCount > 0 && (
              <button onClick={handleReset} style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 7, padding: "8px 14px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                <X size={12} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Toolbar: count + exports ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
            {loading
              ? "Loading…"
              : meta
                ? <>{meta.total.toLocaleString()} member{meta.total !== 1 ? "s" : ""} matched</>
                : ""
            }
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => void handleExport("excel")} disabled={!!exporting || loading}
              style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399", borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: exporting ? 0.6 : 1 }}>
              {exporting === "excel"
                ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Exporting…</>
                : <><FileSpreadsheet size={12} /> Export Excel</>}
            </button>
            <button onClick={() => void handleExport("csv")} disabled={!!exporting || loading}
              style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa", borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, opacity: exporting ? 0.6 : 1 }}>
              {exporting === "csv"
                ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Exporting…</>
                : <><FileText size={12} /> Export CSV</>}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#f87171" }}>{error}</div>
        )}

        {/* ── Table ── */}
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 480px)", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
              <thead>
                <tr>
                  {["Member", "Type", "Acct Status", "Op Status", "Investment", "Sponsor", "Placement", "Directs", "Joined", "Actions"].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && (
                  Array.from({ length: 10 }, (_, i) => <SkeletonRow key={i} cols={10} />)
                )}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: "60px 0", textAlign: "center", color: MUTED, fontSize: 13 }}>
                      <Users size={28} style={{ color: MUTED, display: "block", margin: "0 auto 10px" }} />
                      No members matched the current filters.
                    </td>
                  </tr>
                )}

                {rows.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => openDrawer(row)}
                    style={{ cursor: "pointer", transition: "background 0.12s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                  >
                    {/* Member */}
                    <td style={TD}>
                      <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{row.username}</div>
                      <div style={{ fontSize: 10, color: MUTED }}>{row.name}</div>
                      <div style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>{row.email}</div>
                    </td>
                    {/* Type */}
                    <td style={TD}><TypeBadge type={row.accountType} /></td>
                    {/* Acct Status */}
                    <td style={TD}><StatusBadge status={row.accountStatus} /></td>
                    {/* Op Status */}
                    <td style={TD}><StatusBadge status={row.operationalStatus} /></td>
                    {/* Investment */}
                    <td style={TD}>
                      {row.hasInvestment
                        ? <><div style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{row.investmentPlan}</div><div style={{ fontSize: 10, color: MUTED }}>${parseFloat(row.investmentAmount).toLocaleString()}</div></>
                        : <span style={{ fontSize: 11, color: MUTED }}>—</span>
                      }
                    </td>
                    {/* Sponsor */}
                    <td style={TD}>{row.sponsor ? <span style={{ fontSize: 11, color: "#60a5fa" }}>@{row.sponsor}</span> : <span style={{ color: MUTED }}>—</span>}</td>
                    {/* Placement */}
                    <td style={TD}><PlacementBadge p={row.placement} /></td>
                    {/* Directs */}
                    <td style={{ ...TD, fontWeight: 600 }}>{row.directReferrals}</td>
                    {/* Joined */}
                    <td style={{ ...TD, color: MUTED, whiteSpace: "nowrap" }}>{fmtDate(row.joinedAt)}</td>
                    {/* Actions */}
                    <td style={TD} onClick={e => e.stopPropagation()}>
                      <RowActions
                        row={row}
                        onView={() => openDrawer(row)}
                        onToggleStatus={() => {
                          const m = mapRow(row);
                          if (row.accountStatus === "ACTIVE") setSuspendTarget(m);
                          else if (row.accountStatus !== "BLOCKED") setActivateTarget(m);
                        }}
                        onBlock={() => setBlockTarget(mapRow(row))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && meta && meta.total > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, color: MUTED }}>
                Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total.toLocaleString()} members
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!meta.hasPrevPage}
                  style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, cursor: meta.hasPrevPage ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: meta.hasPrevPage ? 1 : 0.4 }}
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === meta.totalPages || Math.abs(p - meta.page) <= 1)
                  .map((p, i, arr) => (
                    <span key={p} style={{ display: "contents" }}>
                      {i > 0 && arr[i - 1] !== p - 1 && <span style={{ fontSize: 12, color: MUTED, padding: "0 4px" }}>…</span>}
                      <button
                        onClick={() => setPage(p)}
                        style={{ minWidth: 30, height: 30, borderRadius: 6, border: `1px solid ${p === meta.page ? GOLD : BORDER}`, background: p === meta.page ? "rgba(212,175,55,0.12)" : "transparent", color: p === meta.page ? GOLD_L : MUTED, cursor: "pointer", fontSize: 12, fontWeight: p === meta.page ? 600 : 400, padding: "0 8px" }}
                      >{p}</button>
                    </span>
                  ))
                }
                <button
                  onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                  disabled={!meta.hasNextPage}
                  style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, cursor: meta.hasNextPage ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: meta.hasNextPage ? 1 : 0.4 }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Member Drawer ── */}
      <MemberDrawer member={drawer} detail={drawerDetail} onClose={closeDrawer} onAction={handleDrawerAction} />

      {/* ── Create member modal ── */}
      {createOpen && (
        <MemberModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void fetchReport(applied, page); toast("Member created successfully", "success"); }}
        />
      )}

      {/* ── Edit member modal ── */}
      {editTarget && (
        <MemberModal
          mode="edit"
          userId={editTarget.id}
          initial={{
            firstName: editTarget.firstName,
            lastName:  editTarget.lastName,
            username:  editTarget.username,
            email:     editTarget.email,
            phone:     editTarget.phone,
          }}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setEditTarget(null);
            setData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                data: prev.data.map(r => r.id === editTarget.id
                  ? { ...r, name: `${updated.firstName} ${updated.lastName}`.trim(), username: updated.username, email: updated.email, phone: updated.phone ?? "" }
                  : r),
              };
            });
            setDrawer(prev => prev?.id === editTarget.id
              ? { ...prev, firstName: updated.firstName, lastName: updated.lastName, username: updated.username, email: updated.email, phone: updated.phone ?? "" }
              : prev);
            toast("Member updated successfully", "success");
          }}
        />
      )}

      {/* ── Dialogs ── */}
      {suspendTarget && (
        <SuspendDialog member={suspendTarget} onClose={() => setSuspendTarget(null)}
          onConfirm={async () => {
            try {
              await adminSuspendUser(suspendTarget.id);
              updateRowStatus(suspendTarget.id, "SUSPENDED");
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
              updateRowStatus(activateTarget.id, "ACTIVE");
              toast(`@${activateTarget.username} activated`, "success");
            } catch { toast("Failed to activate member", "error"); }
          }}
        />
      )}
      {blockTarget && (
        <BlockDialog member={blockTarget} onClose={() => setBlockTarget(null)}
          onConfirm={async () => {
            try {
              await adminBlockUser(blockTarget.id);
              updateRowStatus(blockTarget.id, "BLOCKED");
              toast(`@${blockTarget.username} blocked`, "error");
            } catch { toast("Failed to block member", "error"); }
          }}
        />
      )}
      {deleteTarget && (
        <DeleteDialog member={deleteTarget} onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            adminDeleteUser(target.id)
              .then(() => {
                toast(`@${target.username} permanently deleted`, "success");
                closeDrawer();
                setData(prev => prev
                  ? { ...prev, data: prev.data.filter(r => r.id !== target.id), meta: { ...prev.meta, total: Math.max(0, prev.meta.total - 1) } }
                  : prev
                );
              })
              .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : "Failed to delete member";
                toast(msg, "error");
              });
          }} />
      )}
      {resetTarget && (
        <ResetPasswordDialog member={resetTarget} onClose={() => setResetTarget(null)}
          onConfirm={async (pass) => {
            try {
              await adminResetUserPassword(resetTarget.id, pass);
              toast(`Password reset for @${resetTarget.username}`, "success");
            } catch { toast("Failed to reset password", "error"); }
          }} />
      )}
      {kycTarget && (
        <ApproveKYCDialog member={kycTarget} onClose={() => setKycTarget(null)}
          onConfirm={() => toast("KYC management — coming soon", "info")} />
      )}
      {loginAsTarget && (
        <LoginAsUserDialog member={loginAsTarget} onClose={() => setLoginAsTarget(null)}
          onConfirm={() => toast("Impersonation — coming soon", "info")} />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </AdminLayout>
  );
}
