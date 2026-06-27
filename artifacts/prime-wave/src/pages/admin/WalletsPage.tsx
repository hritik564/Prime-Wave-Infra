import { useState, useMemo, memo, useCallback, useEffect, useRef } from "react";
import AdminLayout from "./AdminLayout";
import { SkeletonRows } from "@/components/admin/Skeleton";
import WalletDrawer, {
  DrawerWallet, WalletStatus, WalletTransaction, TransferQueueItem, WalletAlert, AuditEntry,
} from "./WalletDrawer";
import { AdjustmentModal, TransferModal } from "./WalletModals";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  RefreshCw, Download, SlidersHorizontal, ArrowRightLeft,
  Search, ChevronLeft, ChevronRight, MoreVertical,
  Wallet, TrendingUp, TrendingDown, Clock, Flag, CheckCircle,
  BarChart2, Users, ChevronDown,
} from "lucide-react";
import {
  getAdminWallets, getAdminWalletStats, getAdminWalletById,
  adminSaveWalletNotes, adminWalletAdjustment, adminBlockUser, adminActivateUser,
  type AdminWalletItem, type AdminWalletStats, type AdminWalletDetail,
} from "@/lib/api";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CFG: Record<WalletStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:  { label: "Active",  color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  LOCKED:  { label: "Locked",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  FROZEN:  { label: "Frozen",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  FLAGGED: { label: "Flagged", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

// ── Data mapping helpers ───────────────────────────────────────────────────────

function mapUserStatusToWalletStatus(s: string): WalletStatus {
  if (s === "BLOCKED")   return "FROZEN";
  if (s === "SUSPENDED") return "FLAGGED";
  if (s === "INACTIVE")  return "LOCKED";
  return "ACTIVE";
}

function mapPlanType(pt?: string): string | null {
  if (!pt) return null;
  const m: Record<string, string> = { PLAN_90: "90 Day", PLAN_180: "180 Day", PLAN_270: "270 Day", PLAN_360: "360 Day" };
  return m[pt] ?? pt;
}

const TX_TYPE_MAP: Record<string, WalletTransaction["type"]> = {
  DEPOSIT:           "DEPOSIT_APPROVED",
  INVESTMENT:        "ADJUSTMENT_DEBIT",
  ROI_CLAIM:         "ROI_CREDIT",
  PRINCIPAL_RELEASE: "PRINCIPAL_CLAIM",
  INCOME_TRANSFER:   "WALLET_TRANSFER",
  BINARY_MATCH:      "BINARY_INCOME",
  BINARY_ORBIT:      "BINARY_INCOME",
  LEVEL_INCOME:      "BINARY_INCOME",
  SALARY:            "BINARY_INCOME",
  WITHDRAWAL:        "WITHDRAWAL_APPROVED",
};

const TX_WALLET_MAP: Record<string, WalletTransaction["wallet"]> = {
  DEPOSIT:           "DEPOSIT",
  INVESTMENT:        "DEPOSIT",
  ROI_CLAIM:         "INCOME",
  PRINCIPAL_RELEASE: "INCOME",
  INCOME_TRANSFER:   "INCOME",
  BINARY_MATCH:      "WITHDRAWAL",
  BINARY_ORBIT:      "WITHDRAWAL",
  LEVEL_INCOME:      "WITHDRAWAL",
  SALARY:            "WITHDRAWAL",
  WITHDRAWAL:        "WITHDRAWAL",
};

function mapTransactions(txs: AdminWalletDetail["transactions"]): WalletTransaction[] {
  return txs.map(tx => ({
    id:        tx.id,
    type:      TX_TYPE_MAP[tx.type] ?? "ADJUSTMENT_CREDIT",
    amount:    parseFloat(tx.amount),
    wallet:    TX_WALLET_MAP[tx.type] ?? "DEPOSIT",
    timestamp: new Date(tx.createdAt),
    note:      tx.description ?? tx.type.replace(/_/g, " ").toLowerCase(),
  }));
}

function mapTransferQueue(txs: AdminWalletDetail["transactions"]): TransferQueueItem[] {
  return txs
    .filter(tx => tx.type === "INCOME_TRANSFER" && tx.status === "SUCCESS")
    .slice(0, 5)
    .map(tx => ({
      id:           tx.id,
      total:        parseFloat(tx.amount),
      released:     parseFloat(tx.netAmount ?? tx.amount),
      hoursElapsed: 72,
      totalHours:   72,
      status:       "COMPLETED" as const,
    }));
}

function buildAlerts(detail: AdminWalletDetail): WalletAlert[] {
  const alerts: WalletAlert[] = [];
  const { status } = detail.wallet.user;
  const dep = parseFloat(detail.wallet.depositWallet);
  if (status === "BLOCKED") {
    alerts.push({ id: "al-frozen", type: "FROZEN",             message: "Wallet frozen by admin pending compliance review.", severity: "error", timestamp: new Date(detail.wallet.updatedAt) });
  }
  if (status === "SUSPENDED") {
    alerts.push({ id: "al-susp",   type: "SUSPICIOUS_ACTIVITY", message: "Account suspended. Activity under review.",           severity: "error", timestamp: new Date(detail.wallet.updatedAt) });
  }
  if (dep > 10000) {
    alerts.push({ id: "al-large",  type: "LARGE_BALANCE",       message: `Deposit wallet balance $${dep.toFixed(2)} exceeds $10,000 threshold.`, severity: "info", timestamp: new Date() });
  }
  return alerts;
}

function mapAuditLog(logs: AdminWalletDetail["adminLogs"]): AuditEntry[] {
  return logs.map(log => {
    const det = log.details as Record<string, unknown> | null;
    return {
      id:        log.id,
      timestamp: new Date(log.createdAt),
      admin:     log.admin.email,
      action:    log.action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      oldValue:  (det?.["oldValue"] as string | undefined) ?? (det?.["direction"] as string | undefined) ?? "—",
      newValue:  (det?.["amount"] as string | undefined) ?? (det?.["newValue"] as string | undefined) ?? "—",
      reason:    (det?.["reason"] as string | undefined) ?? "—",
    };
  });
}

function itemToBasicWallet(item: AdminWalletItem): DrawerWallet {
  const lastTxDate = item.user.transactions[0]?.createdAt
    ? new Date(item.user.transactions[0].createdAt)
    : new Date(item.updatedAt);
  return {
    id:               item.user.id,
    memberId:         item.user.referralCode,
    username:         item.user.username,
    firstName:        item.user.firstName,
    lastName:         item.user.lastName,
    country:          "—",
    plan:             mapPlanType(item.user.investments[0]?.planType),
    status:           mapUserStatusToWalletStatus(item.user.status),
    depositWallet:    parseFloat(item.depositWallet),
    incomeWallet:     parseFloat(item.incomeWallet),
    withdrawalWallet: parseFloat(item.withdrawalWallet),
    pendingTransfer:  parseFloat(item.lockedWithdrawalBalance),
    lastTx:           lastTxDate,
    lifetimeCredits:  0,
    lifetimeDebits:   0,
    transferQueue:    [],
    recentTx:         [],
    alerts:           [],
    auditLog:         [],
    adminNotes:       "",
  };
}

function mergeDetail(basic: DrawerWallet, detail: AdminWalletDetail): DrawerWallet {
  return {
    ...basic,
    depositWallet:    parseFloat(detail.wallet.depositWallet),
    incomeWallet:     parseFloat(detail.wallet.incomeWallet),
    withdrawalWallet: parseFloat(detail.wallet.withdrawalWallet),
    pendingTransfer:  parseFloat(detail.wallet.lockedWithdrawalBalance),
    status:           mapUserStatusToWalletStatus(detail.wallet.user.status),
    lastTx:           new Date(detail.lastTx),
    lifetimeCredits:  parseFloat(detail.lifetimeCredits),
    lifetimeDebits:   parseFloat(detail.lifetimeDebits),
    transferQueue:    mapTransferQueue(detail.transactions),
    recentTx:         mapTransactions(detail.transactions),
    alerts:           buildAlerts(detail),
    auditLog:         mapAuditLog(detail.adminLogs),
    adminNotes:       detail.adminNotes,
  };
}

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: WalletStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "3px 9px", borderRadius: 5 }}>
      {c.label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} style={{ color }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED }}>{sub}</div>}
    </div>
  );
}

// ─── Row action dropdown ───────────────────────────────────────────────────────
const RowActions = memo(function RowActions({ w, onView, onAdjust, onTransfer, onFreeze, onUnfreeze }: {
  w: DrawerWallet;
  onView:      (w: DrawerWallet) => void;
  onAdjust:    (w: DrawerWallet) => void;
  onTransfer:  (w: DrawerWallet) => void;
  onFreeze:    (w: DrawerWallet) => void;
  onUnfreeze:  (w: DrawerWallet) => void;
}) {
  const [open, setOpen] = useState(false);
  const isFrozen = w.status === "FROZEN";

  const items = [
    { label: "View Wallet",       onClick: () => onView(w),           color: "rgba(255,255,255,0.75)" },
    { label: "Adjust Balance",    onClick: () => onAdjust(w),         color: GOLD_L                   },
    { label: "Transfer Funds",    onClick: () => onTransfer(w),       color: "#60a5fa"                },
    { label: isFrozen ? "Unfreeze Wallet" : "Freeze Wallet",
                                  onClick: () => isFrozen ? onUnfreeze(w) : onFreeze(w),
                                  color: isFrozen ? "#34d399" : "#f87171"                             },
    { label: "View Transactions", onClick: () => onView(w),           color: "rgba(255,255,255,0.75)" },
    { label: "Audit Log",         onClick: () => onView(w),           color: "rgba(255,255,255,0.75)" },
  ];

  return (
    <div style={{ position: "relative" }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", color: MUTED }}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 51, background: "hsl(222 62% 10%)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "4px 0", minWidth: 170, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
            {items.map(item => (
              <button key={item.label} onClick={e => { e.stopPropagation(); item.onClick(); setOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: item.color }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// ─── Table row ────────────────────────────────────────────────────────────────
const WalletRow = memo(function WalletRow({ w, onView, onAdjust, onTransfer, onFreeze, onUnfreeze, hovered, onHover }: {
  w: DrawerWallet;
  onView:     (w: DrawerWallet) => void;
  onAdjust:   (w: DrawerWallet) => void;
  onTransfer: (w: DrawerWallet) => void;
  onFreeze:   (w: DrawerWallet) => void;
  onUnfreeze: (w: DrawerWallet) => void;
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const tdStyle: React.CSSProperties = { padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" };
  return (
    <tr
      onClick={() => onView(w)}
      onMouseEnter={() => onHover(w.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer", background: hovered ? "rgba(255,255,255,0.025)" : "transparent", transition: "background 0.12s", borderBottom: `1px solid ${BORDER}` }}
    >
      <td style={{ ...tdStyle, padding: "12px 14px 12px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(212,175,55,0.1)", border: "1.5px solid rgba(212,175,55,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: GOLD, flexShrink: 0 }}>
            {w.firstName[0]}{w.lastName[0]}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>@{w.username}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{w.firstName} {w.lastName}</div>
          </div>
        </div>
      </td>
      <td style={tdStyle}><span style={{ fontFamily: "monospace", fontSize: 11, color: MUTED }}>{w.memberId}</span></td>
      <td style={{ ...tdStyle, color: "#34d399", fontWeight: 600 }}>{$(w.depositWallet)}</td>
      <td style={{ ...tdStyle, color: GOLD,      fontWeight: 600 }}>{$(w.incomeWallet)}</td>
      <td style={{ ...tdStyle, color: "#60a5fa", fontWeight: 600 }}>{$(w.withdrawalWallet)}</td>
      <td style={{ ...tdStyle, color: w.pendingTransfer > 0 ? "#fbbf24" : MUTED }}>{$(w.pendingTransfer)}</td>
      <td style={{ ...tdStyle, color: MUTED, fontSize: 11 }}>{fmtDate(w.lastTx)}</td>
      <td style={tdStyle}><StatusBadge status={w.status} /></td>
      <td style={{ ...tdStyle, padding: "12px 18px 12px 14px" }} onClick={e => e.stopPropagation()}>
        <RowActions w={w} onView={onView} onAdjust={onAdjust} onTransfer={onTransfer} onFreeze={onFreeze} onUnfreeze={onUnfreeze} />
      </td>
    </tr>
  );
});

// ─── Select helper ─────────────────────────────────────────────────────────────
const SEL_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: "8px 30px 8px 11px", fontSize: 11, color: "rgba(255,255,255,0.7)", outline: "none",
  cursor: "pointer", appearance: "none",
};

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function WalletsPage() {
  const { toasts, toast, dismiss } = useToast();

  // ── Server data state ────────────────────────────────────────────────────────
  const [wallets,       setWallets]       = useState<DrawerWallet[]>([]);
  const [meta,          setMeta]          = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [stats,         setStats]         = useState<AdminWalletStats | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [statsLoading,  setStatsLoading]  = useState(true);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState("");
  const [debouncedQ,    setDebouncedQ]    = useState("");
  const [fStatus,       setFStatus]       = useState("");
  const [fCountry,      setFCountry]      = useState("");
  const [fPlan,         setFPlan]         = useState("");
  const [page,          setPage]          = useState(1);
  const PAGE_SIZE = 25;

  // ── Drawer / modals ──────────────────────────────────────────────────────────
  const [drawer,    setDrawer]    = useState<DrawerWallet | null>(null);
  const [adjTarget, setAdjTarget] = useState<DrawerWallet | null>(null);
  const [trfTarget, setTrfTarget] = useState<DrawerWallet | null>(null);
  const [hovered,   setHovered]   = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // ── Fetch helpers ────────────────────────────────────────────────────────────
  const fetchAbort = useRef<AbortController | null>(null);

  const fetchWallets = useCallback(async (pg = page) => {
    fetchAbort.current?.abort();
    fetchAbort.current = new AbortController();
    setLoading(true);
    try {
      const resp = await getAdminWallets({
        page:      pg,
        limit:     PAGE_SIZE,
        search:    debouncedQ || undefined,
        status:    (fStatus as "ACTIVE" | "LOCKED" | "FROZEN" | "FLAGGED") || undefined,
        sortBy:    "updatedAt",
        sortOrder: "desc",
      });
      setWallets(resp.wallets.map(itemToBasicWallet));
      setMeta(resp.meta);
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== "AbortError") {
        const msg = err instanceof Error ? err.message : "Failed to load wallets";
        toast(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, fStatus, toast]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await getAdminWalletStats();
      setStats(s);
    } catch {
      // non-critical — KPI cards show "—" if unavailable
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Initial load + re-fetch on filter/page change
  useEffect(() => { fetchWallets(page); }, [page, debouncedQ, fStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchStats(); }, []);                                  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drawer detail loader ─────────────────────────────────────────────────────
  const loadDrawerDetail = useCallback(async (userId: string) => {
    try {
      const detail: AdminWalletDetail = await getAdminWalletById(userId);
      setDrawer(d => d?.id === userId ? mergeDetail(d, detail) : d);
      setAdjTarget(a => a?.id === userId ? mergeDetail(a, detail) : a);
    } catch {
      // drawer shows basic data on failure
    }
  }, []);

  const openDrawer = useCallback((w: DrawerWallet) => {
    setDrawer(w);
    loadDrawerDetail(w.id);
  }, [loadDrawerDetail]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleAdjust = useCallback(async (
    w: DrawerWallet,
    walletType: "DEPOSIT" | "INCOME" | "WITHDRAWAL",
    adjType:    "CREDIT" | "DEBIT",
    amount:     number,
    reason:     string,
    notes:      string,
  ) => {
    const signedAmount = adjType === "CREDIT" ? amount : -amount;
    const fullReason   = notes ? `${reason} — ${notes}` : reason;
    try {
      await adminWalletAdjustment(w.id, walletType, signedAmount, fullReason);
      toast(`Balance ${adjType === "CREDIT" ? "credited" : "debited"} $${amount.toFixed(2)} on @${w.username}'s ${walletType.toLowerCase()} wallet.`, "success");
      await loadDrawerDetail(w.id);
      await fetchWallets(page);
      await fetchStats();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Adjustment failed", "error");
    }
  }, [page, fetchWallets, fetchStats, loadDrawerDetail, toast]);

  const handleTransfer = useCallback((_w: DrawerWallet, _from: string, _to: string, _amount: number, _reason: string) => {
    toast("Platform transfers are processed automatically by the 72-hour release engine. Manual transfers are not permitted.", "info");
  }, [toast]);

  const handleFreeze = useCallback(async (w: DrawerWallet) => {
    try {
      await adminBlockUser(w.id);
      toast(`@${w.username}'s wallet has been frozen.`, "info");
      setWallets(ws => ws.map(x => x.id === w.id ? { ...x, status: "FROZEN" } : x));
      setDrawer(d => d?.id === w.id ? { ...d, status: "FROZEN" } : d);
      await fetchStats();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to freeze wallet", "error");
    }
  }, [fetchStats, toast]);

  const handleUnfreeze = useCallback(async (w: DrawerWallet) => {
    try {
      await adminActivateUser(w.id);
      toast(`@${w.username}'s wallet has been unfrozen and set to Active.`, "success");
      setWallets(ws => ws.map(x => x.id === w.id ? { ...x, status: "ACTIVE" } : x));
      setDrawer(d => d?.id === w.id ? { ...d, status: "ACTIVE" } : d);
      await fetchStats();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to unfreeze wallet", "error");
    }
  }, [fetchStats, toast]);

  const handleSaveNotes = useCallback(async (id: string, notes: string) => {
    try {
      await adminSaveWalletNotes(id, notes);
      setDrawer(d => d?.id === id ? { ...d, adminNotes: notes } : d);
      toast("Admin notes saved.", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to save notes", "error");
    }
  }, [toast]);

  // ── Client-side sub-filter (plan only — no country in DB) ────────────────────
  const filtered = useMemo(() => {
    if (!fPlan) return wallets;
    return wallets.filter(w => {
      if (fPlan === "none") return w.plan === null;
      return w.plan === fPlan;
    });
  }, [wallets, fPlan]);

  const plans    = useMemo(() => [...new Set(wallets.map(w => w.plan).filter(Boolean))].sort() as string[], [wallets]);
  const pageRows = filtered;

  // ── KPI values (from stats, fall back to zeros while loading) ───────────────
  const kpis = {
    depTotal:      stats ? parseFloat(stats.totalDepositWallet)    : 0,
    incTotal:      stats ? parseFloat(stats.totalIncomeWallet)     : 0,
    witTotal:      stats ? parseFloat(stats.totalWithdrawalWallet) : 0,
    pending:       stats ? parseFloat(stats.totalLockedBalance)    : 0,
    completedToday:stats?.completedTransfersToday                  ?? 0,
    platform:      stats ? parseFloat(stats.totalPlatformValue)    : 0,
    avg:           stats ? parseFloat(stats.avgWalletBalance)      : 0,
    flagged:       stats?.flaggedCount                             ?? 0,
  };

  const liveDrawer = drawer;
  const liveAdj    = adjTarget;
  const liveTrf    = trfTarget;

  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", letterSpacing: "0.07em", position: "sticky", top: 0, background: "hsl(222 62% 8%)", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };

  return (
    <AdminLayout>
      <div style={{ padding: "24px 28px", minHeight: "100vh", background: BG, boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Wallet Control Center</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Monitor balances, transfers and wallet activity across the platform.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              { icon: RefreshCw,         label: "Refresh",        onClick: () => { fetchWallets(page); fetchStats(); } },
              { icon: Download,          label: "Export",         onClick: undefined },
              { icon: SlidersHorizontal, label: "Adjust Wallet",  onClick: undefined, gold: false },
              { icon: ArrowRightLeft,    label: "Transfer Funds", onClick: undefined, gold: true  },
            ].map(b => (
              <button key={b.label} onClick={b.onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: b.gold ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${b.gold ? "rgba(212,175,55,0.25)" : BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: b.gold ? GOLD_L : "rgba(255,255,255,0.7)" }}>
                <b.icon size={13} />{b.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
          <KpiCard icon={TrendingUp}   label="TOTAL DEPOSIT WALLET"    value={statsLoading ? "—" : $(kpis.depTotal)}     sub={stats ? `${stats.totalWallets} wallets` : "…"} color="#34d399" />
          <KpiCard icon={Wallet}       label="TOTAL INCOME WALLET"     value={statsLoading ? "—" : $(kpis.incTotal)}     sub="Platform-wide"                                 color={GOLD}    />
          <KpiCard icon={TrendingDown} label="TOTAL WITHDRAWAL WALLET" value={statsLoading ? "—" : $(kpis.witTotal)}     sub="Ready to withdraw"                             color="#60a5fa" />
          <KpiCard icon={Clock}        label="PENDING TRANSFERS"       value={statsLoading ? "—" : $(kpis.pending)}      sub="Locked withdrawal balance"                     color="#fbbf24" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 26 }}>
          <KpiCard icon={CheckCircle}  label="COMPLETED TODAY"         value={statsLoading ? "—" : String(kpis.completedToday)} sub="Transfers released"            color="#34d399" />
          <KpiCard icon={BarChart2}    label="TOTAL PLATFORM VALUE"    value={statsLoading ? "—" : $(kpis.platform)}    sub="All wallets combined"                          color="#a78bfa" />
          <KpiCard icon={Users}        label="AVG WALLET BALANCE"      value={statsLoading ? "—" : $(kpis.avg)}         sub="Per member"                                    color="#60a5fa" />
          <KpiCard icon={Flag}         label="FLAGGED WALLETS"         value={statsLoading ? "—" : String(kpis.flagged)} sub="Requires review"                              color="#f87171" />
        </div>

        {/* Search + Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 400 }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search username, member ID…"
              style={{ width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "9px 12px 9px 32px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Status filter */}
          <div style={{ position: "relative" }}>
            <select value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }} style={SEL_STYLE}>
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="LOCKED">Locked</option>
              <option value="FROZEN">Frozen</option>
              <option value="FLAGGED">Flagged</option>
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          </div>

          {/* Country filter */}
          <div style={{ position: "relative" }}>
            <select value={fCountry} onChange={e => { setFCountry(e.target.value); setPage(1); }} style={SEL_STYLE}>
              <option value="">All Countries</option>
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          </div>

          {/* Plan filter */}
          <div style={{ position: "relative" }}>
            <select value={fPlan} onChange={e => { setFPlan(e.target.value); setPage(1); }} style={SEL_STYLE}>
              <option value="">All Plans</option>
              {plans.map(p => <option key={p} value={p}>{p}</option>)}
              <option value="none">No Plan</option>
            </select>
            <ChevronDown size={11} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
          </div>

          <div style={{ marginLeft: "auto", fontSize: 11, color: MUTED }}>
            {loading ? "Loading…" : `${meta.total} wallet${meta.total !== 1 ? "s" : ""}`}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
              <thead>
                <tr>
                  {["USERNAME","MEMBER ID","DEPOSIT","INCOME","WITHDRAWAL","PENDING","LAST TX","STATUS",""].map(h => (
                    <th key={h} style={{ ...TH, textAlign: h === "" ? "right" : "left", paddingLeft: h === "USERNAME" ? 18 : 14, paddingRight: h === "" ? 18 : 14 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && wallets.length === 0 ? (
                  <SkeletonRows rows={8} cols={9} />
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 13 }}>No wallets match your filters.</td></tr>
                ) : (
                  pageRows.map(w => (
                    <WalletRow
                      key={w.id} w={w}
                      onView={openDrawer}
                      onAdjust={setAdjTarget}
                      onTransfer={setTrfTarget}
                      onFreeze={handleFreeze}
                      onUnfreeze={handleUnfreeze}
                      hovered={hovered === w.id}
                      onHover={setHovered}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta.totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, color: MUTED }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, meta.total)} of {meta.total}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: page === 1 ? "not-allowed" : "pointer", color: page === 1 ? MUTED : "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
                  <ChevronLeft size={13} />
                </button>
                {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                  const pg = Math.max(1, Math.min(meta.totalPages - 4, page - 2)) + i;
                  return (
                    <button key={pg} onClick={() => setPage(pg)} style={{ padding: "5px 10px", minWidth: 32, background: pg === page ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${pg === page ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: pg === page ? 700 : 400, color: pg === page ? GOLD_L : "rgba(255,255,255,0.65)" }}>
                      {pg}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: page === meta.totalPages ? "not-allowed" : "pointer", color: page === meta.totalPages ? MUTED : "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>

      {/* Drawer */}
      <WalletDrawer
        wallet={liveDrawer}
        onClose={() => setDrawer(null)}
        onAdjust={w => { setDrawer(null); setAdjTarget(w); }}
        onTransfer={w => { setDrawer(null); setTrfTarget(w); }}
        onFreeze={w => { handleFreeze(w); }}
        onUnfreeze={w => { handleUnfreeze(w); }}
        onSaveNotes={handleSaveNotes}
      />

      {/* Modals */}
      {liveAdj && (
        <AdjustmentModal
          wallet={liveAdj}
          onClose={() => setAdjTarget(null)}
          onConfirm={(walletType, adjType, amount, reason, notes) => {
            handleAdjust(liveAdj, walletType, adjType, amount, reason, notes);
            setAdjTarget(null);
          }}
        />
      )}
      {liveTrf && (
        <TransferModal
          wallet={liveTrf}
          onClose={() => setTrfTarget(null)}
          onConfirm={(from, to, amount, reason) => {
            handleTransfer(liveTrf, from, to, amount, reason);
            setTrfTarget(null);
          }}
        />
      )}
    </AdminLayout>
  );
}
