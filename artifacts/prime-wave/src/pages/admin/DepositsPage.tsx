import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, MoreHorizontal,
  CheckCircle, XCircle, Clock, Loader2, DollarSign, TrendingUp,
  Activity, AlertTriangle, ArrowDownToLine, SlidersHorizontal,
} from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/providers/AuthProvider";
import AdminLayout from "./AdminLayout";
import DepositDrawer from "./DepositDrawer";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  adminGetDeposits,
  adminGetDepositStats,
  adminApproveDeposit,
  adminRejectDeposit,
  adminMarkDepositConfirming,
  type AdminDepositItem,
  type AdminDepositStats,
  type AdminDepositStatus,
} from "@/lib/api";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $   = (n: number | string) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ago = (d: Date) => {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:    { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  label: "Pending"    },
  CONFIRMING: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  label: "Confirming" },
  APPROVED:   { color: "#34d399", bg: "rgba(52,211,153,0.12)",  label: "Approved"   },
  REJECTED:   { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "Rejected"   },
};

function StatusBadge({ s }: { s: string }) {
  const c = STATUS_CFG[s] ?? STATUS_CFG.PENDING;
  return <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{c.label}</span>;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = "rgba(255,255,255,0.78)", bg = "#3b3b4a", loading }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color?: string; bg?: string; loading?: boolean;
}) {
  return (
    <div style={{ background: CARD, borderRadius: 10, padding: "16px", border: `1px solid ${BORDER}`, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4, letterSpacing: "0.04em" }}>{label}</div>
        {loading
          ? <div style={{ width: 60, height: 18, background: "rgba(255,255,255,0.05)", borderRadius: 4, animation: "pulse 1.5s ease-in-out infinite" }} />
          : <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
        }
        {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Network badge ────────────────────────────────────────────────────────────
const NET_COLORS: Record<string, { color: string; bg: string }> = {
  BEP20: { color: "#fbbf24", bg: "rgba(251,191,36,0.1)"  },
  TRC20: { color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  ERC20: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  SOL:   { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
};
function NetBadge({ n }: { n: string }) {
  const c = NET_COLORS[n] ?? { color: MUTED, bg: "rgba(170,179,197,0.06)" };
  return <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>{n}</span>;
}

// ─── Action dropdown ─────────────────────────────────────────────────────────
function ActionMenu({ item, onApprove, onReject, onConfirm, onView, canMutate = true }: {
  item: AdminDepositItem;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onConfirm: (id: string) => void;
  onView:    (id: string) => void;
  canMutate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canAct  = canMutate && (item.status === "PENDING" || item.status === "CONFIRMING");
  const canConf = canMutate && item.status === "PENDING";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const menuItem = (label: string, color: string, onClick: () => void) => (
    <button
      onClick={() => { onClick(); setOpen(false); }}
      style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 14px", fontSize: 12, color, cursor: "pointer" }}
      onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={e => { (e.target as HTMLElement).style.background = "none"; }}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, display: "flex" }}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "100%", background: "hsl(222 62% 11%)", border: `1px solid ${BORDER}`, borderRadius: 8, minWidth: 140, zIndex: 20, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {menuItem("View Detail", "rgba(255,255,255,0.8)", () => onView(item.id))}
          {canAct  && menuItem("Approve",    "#34d399", () => onApprove(item.id))}
          {canConf && menuItem("Confirming", "#60a5fa", () => onConfirm(item.id))}
          {canAct  && menuItem("Reject",     "#f87171", () => onReject(item.id))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile deposit card ──────────────────────────────────────────────────────
function MobileDepositCard({ item, onView, onApprove, onReject, onConfirm, canMutate = true }: {
  item:      AdminDepositItem;
  onView:    (id: string) => void;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onConfirm: (id: string) => void;
  canMutate?: boolean;
}) {
  const canAct  = canMutate && (item.status === "PENDING" || item.status === "CONFIRMING");
  const canConf = canMutate && item.status === "PENDING";
  return (
    <div onClick={() => onView(item.id)} style={{ background: CARD, borderRadius: 10, padding: 14, border: `1px solid ${BORDER}`, marginBottom: 8, cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "rgba(255,255,255,0.9)" }}>@{item.user.username}</div>
          <div style={{ fontSize: 11, color: MUTED }}>{item.id.slice(0, 12)}…</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: GOLD_L }}>{$(item.amount)}</div>
          <StatusBadge s={item.status} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <NetBadge n={item.network} />
        <span style={{ fontSize: 10, color: MUTED }}>{ago(new Date(item.createdAt))}</span>
        <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace", marginLeft: "auto" }}>{item.txHash.slice(0, 12)}…</span>
      </div>
      {canAct && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onApprove(item.id)} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #34d39940", background: "rgba(52,211,153,0.1)", color: "#34d399", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Approve</button>
          {canConf && <button onClick={() => onConfirm(item.id)} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #60a5fa40", background: "rgba(96,165,250,0.1)", color: "#60a5fa", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Confirming</button>}
          <button onClick={() => onReject(item.id)} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #f8717140", background: "rgba(248,113,113,0.1)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Reject</button>
        </div>
      )}
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ open, onClose, onConfirm, loading }: {
  open: boolean; onClose: () => void;
  onConfirm: (reason: string) => void; loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const REASONS = ["Invalid transaction hash", "Duplicate submission", "Incorrect amount", "Network mismatch", "Suspicious activity", "Unable to verify on blockchain", "Other"];

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "hsl(222 62% 10%)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, border: `1px solid ${BORDER}` }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#f87171", marginBottom: 16 }}>Reject Deposit</div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Select or enter rejection reason:</div>
        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={{ width: "100%", background: "hsl(222 62% 7%)", border: `1px solid ${BORDER}`, borderRadius: 8, color: "rgba(255,255,255,0.8)", fontSize: 13, padding: "10px 12px", marginBottom: 10 }}
        >
          <option value="">-- Select a reason --</option>
          {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <textarea
          placeholder="Or type a custom reason…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          style={{ width: "100%", background: "hsl(222 62% 7%)", border: `1px solid ${BORDER}`, borderRadius: 8, color: "rgba(255,255,255,0.8)", fontSize: 13, padding: "10px 12px", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button
            onClick={() => { if (reason.trim()) onConfirm(reason.trim()); }}
            disabled={!reason.trim() || loading}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#f87171", color: "#fff", fontSize: 13, fontWeight: 700, cursor: reason.trim() && !loading ? "pointer" : "not-allowed", opacity: reason.trim() && !loading ? 1 : 0.5 }}
          >
            {loading ? "Rejecting…" : "Confirm Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DepositsPage() {
  const { isMobile }  = useResponsive();
  const { toast, toasts, dismiss } = useToast();
  const { role } = useAuth();
  const isStaffOperations = role === "STAFF_OPERATIONS";

  // Data state
  const [deposits, setDeposits] = useState<AdminDepositItem[]>([]);
  const [stats,    setStats]    = useState<AdminDepositStats | null>(null);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Filters
  const [search,     setSearch]     = useState("");
  const [statusFilt, setStatusFilt] = useState<AdminDepositStatus | "">("");
  const [networkFilt,setNetworkFilt]= useState("");
  const [sortBy,     setSortBy]     = useState<"createdAt" | "amount">("createdAt");
  const [sortOrder,  setSortOrder]  = useState<"asc" | "desc">("desc");
  const [page,       setPage]       = useState(1);
  const LIMIT = 20;

  // UI state
  const [drawerDepositId,  setDrawerDepositId]  = useState<string | null>(null);
  const [rejectTargetId,   setRejectTargetId]   = useState<string | null>(null);
  const [actionLoading,    setActionLoading]     = useState<string | null>(null);

  // Debounced search
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 350);
  }, []);

  const totalPages = Math.ceil(total / LIMIT);

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetDeposits({
        page,
        limit: LIMIT,
        status:    statusFilt || undefined,
        network:   networkFilt || undefined,
        search:    debouncedSearch || undefined,
        sortBy,
        sortOrder,
      });
      setDeposits(res.data);
      setTotal(res.meta.total);
    } catch {
      toast("Failed to load deposits", "error");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilt, networkFilt, debouncedSearch, sortBy, sortOrder, toast]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await adminGetDepositStats();
      setStats(s);
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchDeposits(); }, [fetchDeposits]);
  useEffect(() => { void fetchStats(); },   [fetchStats]);

  const refresh = useCallback(() => {
    void fetchDeposits();
    void fetchStats();
  }, [fetchDeposits, fetchStats]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (id: string) => {
    if (isStaffOperations) return;
    setActionLoading(id);
    try {
      await adminApproveDeposit(id);
      toast("Deposit approved — wallet credited", "success");
      void fetchDeposits();
      void fetchStats();
      if (drawerDepositId === id) setDrawerDepositId(null);
    } catch (e: unknown) {
      toast((e as Error).message ?? "Failed to approve", "error");
    } finally {
      setActionLoading(null);
    }
  }, [fetchDeposits, fetchStats, drawerDepositId, toast, isStaffOperations]);

  const handleConfirm = useCallback(async (id: string) => {
    if (isStaffOperations) return;
    setActionLoading(id);
    try {
      await adminMarkDepositConfirming(id);
      toast("Deposit marked as confirming", "success");
      void fetchDeposits();
      void fetchStats();
      if (drawerDepositId === id) setDrawerDepositId(null);
    } catch (e: unknown) {
      toast((e as Error).message ?? "Failed to update", "error");
    } finally {
      setActionLoading(null);
    }
  }, [fetchDeposits, fetchStats, drawerDepositId, toast, isStaffOperations]);

  const handleRejectStart = useCallback((id: string) => {
    if (isStaffOperations) return;
    setRejectTargetId(id);
    if (drawerDepositId) setDrawerDepositId(null);
  }, [drawerDepositId, isStaffOperations]);

  const handleRejectConfirm = useCallback(async (reason: string) => {
    if (isStaffOperations) return;
    if (!rejectTargetId) return;
    const id = rejectTargetId;
    setActionLoading(id);
    try {
      await adminRejectDeposit(id, reason);
      toast("Deposit rejected", "success");
      setRejectTargetId(null);
      void fetchDeposits();
      void fetchStats();
    } catch (e: unknown) {
      toast((e as Error).message ?? "Failed to reject", "error");
    } finally {
      setActionLoading(null);
    }
  }, [rejectTargetId, fetchDeposits, fetchStats, toast, isStaffOperations]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const cols: Array<{ key: string; label: string; width?: number }> = [
    { key: "id",      label: "Deposit ID",  width: 130 },
    { key: "user",    label: "Member",      width: 140 },
    { key: "network", label: "Network",     width: 90  },
    { key: "amount",  label: "Amount",      width: 100 },
    { key: "wallet",  label: "Company Wallet", width: 130 },
    { key: "txHash",  label: "TXID",        width: 130 },
    { key: "date",    label: "Submitted",   width: 100 },
    { key: "status",  label: "Status",      width: 100 },
    { key: "actions", label: "",            width: 40  },
  ];

  const thStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", textAlign: "left" };
  const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", verticalAlign: "middle" };

  const sortToggle = (col: "createdAt" | "amount") => {
    if (sortBy === col) setSortOrder(o => o === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortOrder("desc"); }
    setPage(1);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div style={{ padding: isMobile ? "16px" : "24px 28px", minHeight: "100vh", background: BG }}>
        <ToastContainer toasts={toasts} onDismiss={dismiss} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <ArrowDownToLine size={20} color={GOLD} />
              <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>Deposit Center</h1>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Review, approve and track all user deposits</p>
          </div>
          <button
            onClick={refresh}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer" }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard icon={Clock}          label="Pending"          value={String(stats?.pendingCount ?? 0)}    color="#fbbf24" bg="rgba(251,191,36,0.15)"   loading={statsLoading} />
          <StatCard icon={CheckCircle}    label="Approved Today"   value={String(stats?.approvedToday ?? 0)}  color="#34d399" bg="rgba(52,211,153,0.15)"   loading={statsLoading} />
          <StatCard icon={XCircle}        label="Rejected Today"   value={String(stats?.rejectedToday ?? 0)}  color="#f87171" bg="rgba(248,113,113,0.15)"  loading={statsLoading} />
          <StatCard icon={Loader2}        label="Confirming"       value={String(stats?.confirmingCount ?? 0)} color="#60a5fa" bg="rgba(96,165,250,0.15)"   loading={statsLoading} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard icon={DollarSign}    label="Total Volume"      value={stats ? $(stats.totalApprovedAmount) : "—"} color={GOLD_L}  bg="rgba(212,175,55,0.15)"   loading={statsLoading} />
          <StatCard icon={Activity}      label="Average Deposit"   value={stats ? $(stats.avgDepositAmount) : "—"}    color="#a78bfa" bg="rgba(167,139,250,0.15)"  loading={statsLoading} />
          <StatCard icon={TrendingUp}    label="Largest Deposit"   value={stats ? $(stats.largestDeposit) : "—"}      color="#34d399" bg="rgba(52,211,153,0.15)"   loading={statsLoading} />
          <StatCard icon={AlertTriangle} label="Pending Value"     value={stats ? $(stats.pendingDepositValue) : "—"} color="#fbbf24" bg="rgba(251,191,36,0.15)"  loading={statsLoading} />
        </div>

        {/* Filters */}
        <div style={{ background: CARD, borderRadius: 10, padding: "12px 16px", border: `1px solid ${BORDER}`, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={14} color={MUTED} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by username, ID, TXID, wallet…"
              style={{ width: "100%", background: "hsl(222 62% 7%)", border: `1px solid ${BORDER}`, borderRadius: 8, color: "rgba(255,255,255,0.8)", fontSize: 13, padding: "8px 10px 8px 32px", boxSizing: "border-box" }}
            />
          </div>

          <select
            value={statusFilt}
            onChange={e => { setStatusFilt(e.target.value as AdminDepositStatus | ""); setPage(1); }}
            style={{ background: "hsl(222 62% 7%)", border: `1px solid ${BORDER}`, borderRadius: 8, color: statusFilt ? "rgba(255,255,255,0.8)" : MUTED, fontSize: 12, padding: "8px 12px" }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMING">Confirming</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <select
            value={networkFilt}
            onChange={e => { setNetworkFilt(e.target.value); setPage(1); }}
            style={{ background: "hsl(222 62% 7%)", border: `1px solid ${BORDER}`, borderRadius: 8, color: networkFilt ? "rgba(255,255,255,0.8)" : MUTED, fontSize: 12, padding: "8px 12px" }}
          >
            <option value="">All Networks</option>
            <option value="BEP20">BEP20</option>
            <option value="TRC20">TRC20</option>
            <option value="ERC20">ERC20</option>
            <option value="SOL">SOL</option>
          </select>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SlidersHorizontal size={13} color={MUTED} />
            <select
              value={`${sortBy}_${sortOrder}`}
              onChange={e => {
                const [sb, so] = e.target.value.split("_") as ["createdAt" | "amount", "asc" | "desc"];
                setSortBy(sb); setSortOrder(so); setPage(1);
              }}
              style={{ background: "hsl(222 62% 7%)", border: `1px solid ${BORDER}`, borderRadius: 8, color: "rgba(255,255,255,0.7)", fontSize: 12, padding: "8px 12px" }}
            >
              <option value="createdAt_desc">Newest first</option>
              <option value="createdAt_asc">Oldest first</option>
              <option value="amount_desc">Highest amount</option>
              <option value="amount_asc">Lowest amount</option>
            </select>
          </div>

          <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto" }}>
            {total} {total === 1 ? "result" : "results"}
          </span>
        </div>

        {/* Mobile view */}
        {isMobile ? (
          <div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} color={GOLD} style={{ animation: "spin 1s linear infinite" }} /></div>
            ) : deposits.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: MUTED, fontSize: 13 }}>No deposits found</div>
            ) : deposits.map(item => (
              <MobileDepositCard
                key={item.id}
                item={item}
                onView={setDrawerDepositId}
                onApprove={handleApprove}
                onReject={handleRejectStart}
                onConfirm={handleConfirm}
                canMutate={!isStaffOperations}
              />
            ))}
          </div>
        ) : (
          /* Desktop table */
          <div style={{ background: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {cols.map(c => (
                      <th key={c.key} style={{ ...thStyle, width: c.width, cursor: c.key === "amount" || c.key === "date" ? "pointer" : "default" }}
                        onClick={() => {
                          if (c.key === "amount") sortToggle("amount");
                          if (c.key === "date")   sortToggle("createdAt");
                        }}
                      >
                        {c.label}
                        {c.key === "amount" && sortBy === "amount" && (sortOrder === "desc" ? " ↓" : " ↑")}
                        {c.key === "date"   && sortBy === "createdAt" && (sortOrder === "desc" ? " ↓" : " ↑")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={cols.length} style={{ textAlign: "center", padding: 40 }}>
                      <Loader2 size={22} color={GOLD} style={{ animation: "spin 1s linear infinite" }} />
                    </td></tr>
                  ) : deposits.length === 0 ? (
                    <tr><td colSpan={cols.length} style={{ textAlign: "center", padding: 40, color: MUTED, fontSize: 13 }}>No deposits found</td></tr>
                  ) : deposits.map((item, idx) => (
                    <tr
                      key={item.id}
                      style={{ borderBottom: idx < deposits.length - 1 ? `1px solid ${BORDER}` : "none", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      onClick={() => setDrawerDepositId(item.id)}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: MUTED }}>{item.id.slice(0, 12)}…</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>@{item.user.username}</div>
                        <div style={{ fontSize: 10, color: MUTED }}>{item.user.id.slice(0, 8).toUpperCase()}</div>
                      </td>
                      <td style={tdStyle}><NetBadge n={item.network} /></td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 700, color: GOLD_L }}>{$(item.amount)}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: MUTED }}>{item.companyWallet.slice(0, 12)}…</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: MUTED }}>{item.txHash.slice(0, 12)}…</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 11 }}>{ago(new Date(item.createdAt))}</div>
                        <div style={{ fontSize: 10, color: MUTED }}>{new Date(item.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td style={tdStyle}><StatusBadge s={item.status} /></td>
                      <td style={{ ...tdStyle, textAlign: "right" }} onClick={e => e.stopPropagation()}>
                        <ActionMenu
                          item={item}
                          onView={setDrawerDepositId}
                          onApprove={handleApprove}
                          onReject={handleRejectStart}
                          onConfirm={handleConfirm}
                           canMutate={!isStaffOperations}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 0" }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "7px 12px", color: page === 1 ? MUTED : "rgba(255,255,255,0.8)", cursor: page === 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span style={{ fontSize: 12, color: MUTED }}>Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "7px 12px", color: page === totalPages ? MUTED : "rgba(255,255,255,0.8)", cursor: page === totalPages ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Deposit Drawer */}
      <DepositDrawer
        depositId={drawerDepositId}
        onClose={() => setDrawerDepositId(null)}
         onApprove={isStaffOperations ? undefined : handleApprove}
         onReject={isStaffOperations ? undefined : handleRejectStart}
         onConfirm={isStaffOperations ? undefined : handleConfirm}
        actionLoading={actionLoading}
      />

      {/* Reject Modal */}
      {!isStaffOperations && <RejectModal
        open={!!rejectTargetId}
        onClose={() => setRejectTargetId(null)}
        onConfirm={handleRejectConfirm}
        loading={actionLoading === rejectTargetId}
      />}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </AdminLayout>
  );
}
