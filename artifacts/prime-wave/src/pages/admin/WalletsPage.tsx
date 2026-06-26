import { useState, useMemo, memo, useCallback } from "react";
import AdminLayout from "./AdminLayout";
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

// ─── Mock data factory ────────────────────────────────────────────────────────
let _id = 0;
const uid  = ()  => `WMB${String(++_id).padStart(7, "0")}`;
const rand = (a: number, b: number) => Math.round((Math.random() * (b - a) + a) * 100) / 100;

const COUNTRIES = ["US","GB","NG","IN","AE","CA","AU","ZA","KE","PK","PH","BD","MY","GH","BR"];
const PLANS     = ["Starter","Growth","Pro","Elite","Platinum", null];
const STATUSES: WalletStatus[] = ["ACTIVE","ACTIVE","ACTIVE","ACTIVE","LOCKED","FROZEN","FLAGGED","ACTIVE"];
const NAMES = [
  ["Alex","Chen"],["Ben","Osei"],["Carlos","Vega"],["Diana","Patel"],["Edward","Kim"],
  ["Fatima","Hassan"],["Grace","Liu"],["Hassan","Malik"],["Iris","Santos"],["James","Nwosu"],
  ["Kwame","Asante"],["Leila","Ahmad"],["Marco","Ferrari"],["Nadia","Petrov"],["Omar","Sheikh"],
  ["Priya","Sharma"],["Quinn","Moore"],["Ravi","Gupta"],["Sara","Williams"],["Tunde","Adeyemi"],
  ["Uma","Patel"],["Victor","Okonkwo"],["Wendy","Zhang"],["Xavier","Martin"],["Yemi","Balogun"],
  ["Zara","Khan"],["Aisha","Diallo"],["Bruno","Costa"],["Clara","Anderson"],["David","Chukwu"],
  ["Elena","Ivanova"],["Femi","Taiwo"],["George","Papadopoulos"],["Hannah","Müller"],["Ibrahim","Al-Rashid"],
  ["Julia","Nakamura"],["Kevin","O'Brien"],["Lina","Bergström"],["Mohammed","Al-Farsi"],["Nina","Johansson"],
  ["Oscar","Fernández"],["Paula","Rodrigues"],["Raj","Mehta"],["Sophie","Dupont"],["Tariq","Al-Amin"],
  ["Uche","Eze"],["Valentina","Romano"],["William","Thompson"],["Xin","Li"],["Yara","Khalid"],
  ["Zaid","Mansour"],["Amara","Diop"],["Bashir","Saleh"],["Chloe","Bernard"],["Dayo","Afolabi"],
  ["Emmanuel","Nkosi"],["Farida","Yusuf"],["Gabriel","Sousa"],["Hana","Kimura"],["Ismail","Fadel"],
];

function makeTx(i: number): WalletTransaction[] {
  const types: WalletTransaction["type"][] = [
    "ROI_CREDIT","BINARY_INCOME","WITHDRAWAL_APPROVED","WALLET_TRANSFER","PRINCIPAL_CLAIM","DEPOSIT_APPROVED",
  ];
  const wallets: WalletTransaction["wallet"][] = ["DEPOSIT","INCOME","WITHDRAWAL"];
  const notes = [
    "Auto-processed by income engine","Admin-approved","Member-initiated","System cron",
    "Weekly ROI distribution","Binary plan payout","Referral bonus applied",
  ];
  return Array.from({ length: 10 }, (_, j) => ({
    id: `TX${i}-${j}`,
    type: types[(i + j) % types.length],
    amount: rand(50, 2000),
    wallet: wallets[(i + j) % 3],
    timestamp: new Date(Date.now() - (j * 8 + i) * 3600000),
    note: notes[(i + j) % notes.length],
  }));
}

function makeQueue(i: number): TransferQueueItem[] {
  if (i % 4 === 0) return [];
  return [{
    id: `TQ${i}`,
    total: rand(500, 5000),
    released: rand(100, 500),
    hoursElapsed: (i * 7) % 72,
    totalHours: 72,
    status: (["PROCESSING","PROCESSING","COMPLETED","PAUSED"] as const)[i % 4],
  }];
}

function makeAlerts(i: number, status: WalletStatus): WalletAlert[] {
  const alerts: WalletAlert[] = [];
  if (status === "FROZEN")  alerts.push({ id: `AL${i}-0`, type: "FROZEN",             message: "Wallet frozen by admin pending compliance review.", severity: "error", timestamp: new Date(Date.now() - 3600000) });
  if (status === "FLAGGED") alerts.push({ id: `AL${i}-1`, type: "SUSPICIOUS_ACTIVITY", message: "Unusual withdrawal pattern detected. 4 large withdrawals in 24 hours.", severity: "error", timestamp: new Date(Date.now() - 7200000) });
  if (i % 5 === 0) alerts.push({ id: `AL${i}-2`, type: "LARGE_BALANCE", message: "Deposit wallet balance exceeds $10,000 threshold.", severity: "info", timestamp: new Date(Date.now() - 86400000) });
  if (i % 7 === 0) alerts.push({ id: `AL${i}-3`, type: "TRANSFER_DELAYED", message: "72-hour transfer queue item is past expected completion time.", severity: "warn", timestamp: new Date(Date.now() - 10800000) });
  return alerts;
}

function makeAudit(i: number): AuditEntry[] {
  const admins = ["superadmin@primewave.io","finance@primewave.io","rewards@primewave.io"];
  const actions = [
    { action: "Balance Adjusted",  old: "$0.00",       new: "$1,500.00", reason: "Initial deposit credited" },
    { action: "Status Changed",    old: "ACTIVE",      new: "LOCKED",    reason: "Compliance hold" },
    { action: "Transfer Executed", old: "$3,200.00",   new: "$1,700.00", reason: "Withdrawal preparation" },
    { action: "Status Changed",    old: "LOCKED",      new: "ACTIVE",    reason: "Compliance cleared" },
    { action: "Balance Adjusted",  old: "$1,700.00",   new: "$2,200.00", reason: "ROI manual correction" },
  ];
  return actions.map((a, j) => ({
    id: `AUD${i}-${j}`,
    timestamp: new Date(Date.now() - (j * 48 + i) * 3600000),
    admin: admins[(i + j) % admins.length],
    action: a.action, oldValue: a.old, newValue: a.new, reason: a.reason,
  }));
}

function makeMember(i: number): DrawerWallet {
  const [firstName, lastName] = NAMES[i % NAMES.length];
  const username = `${firstName.toLowerCase()}${i + 1}`;
  const status = STATUSES[i % STATUSES.length];
  const dep = rand(200, 15000);
  const inc = rand(100, 8000);
  const wit = rand(50, 5000);
  return {
    id: `w-${i}`,
    memberId: uid(),
    username, firstName, lastName,
    country: COUNTRIES[i % COUNTRIES.length],
    plan: PLANS[i % PLANS.length] as string | null,
    status,
    depositWallet: dep, incomeWallet: inc, withdrawalWallet: wit,
    pendingTransfer: rand(0, 2000),
    lastTx: new Date(Date.now() - rand(0, 72) * 3600000),
    lifetimeCredits: rand(5000, 80000),
    lifetimeDebits:  rand(2000, 40000),
    transferQueue: makeQueue(i),
    recentTx: makeTx(i),
    alerts: makeAlerts(i, status),
    auditLog: makeAudit(i),
    adminNotes: i % 5 === 0 ? "Member contacted support on June 12 regarding delayed ROI. Issue resolved." : "",
  };
}

const INITIAL_WALLETS: DrawerWallet[] = Array.from({ length: 60 }, (_, i) => makeMember(i));

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
  const [wallets, setWallets] = useState<DrawerWallet[]>(() => INITIAL_WALLETS);
  const [search,   setSearch]   = useState("");
  const [fStatus,  setFStatus]  = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fPlan,    setFPlan]    = useState("");
  const [page,     setPage]     = useState(1);
  const PAGE_SIZE = 20;

  const [drawer,   setDrawer]   = useState<DrawerWallet | null>(null);
  const [adjTarget, setAdjTarget] = useState<DrawerWallet | null>(null);
  const [trfTarget, setTrfTarget] = useState<DrawerWallet | null>(null);
  const [hovered,  setHovered]  = useState<string | null>(null);

  // Update wallet by id helper
  const updateWallet = useCallback((id: string, patch: Partial<DrawerWallet>) => {
    setWallets(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w));
    setDrawer(d => d?.id === id ? { ...d, ...patch } : d);
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAdjust = useCallback((w: DrawerWallet, walletType: "DEPOSIT" | "INCOME" | "WITHDRAWAL", adjType: "CREDIT" | "DEBIT", amount: number, reason: string, notes: string) => {
    const field: Record<string, keyof DrawerWallet> = { DEPOSIT: "depositWallet", INCOME: "incomeWallet", WITHDRAWAL: "withdrawalWallet" };
    const key = field[walletType] as "depositWallet" | "incomeWallet" | "withdrawalWallet";
    const oldVal = w[key] as number;
    const newVal = adjType === "CREDIT" ? oldVal + amount : oldVal - amount;

    const newTx: WalletTransaction = {
      id: `TX-ADJ-${Date.now()}`, type: adjType === "CREDIT" ? "ADJUSTMENT_CREDIT" : "ADJUSTMENT_DEBIT",
      amount, wallet: walletType, timestamp: new Date(), note: reason,
    };
    const newAudit: AuditEntry = {
      id: `AUD-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io",
      action: `Balance Adjusted (${adjType})`, oldValue: `$${oldVal.toFixed(2)}`, newValue: `$${newVal.toFixed(2)}`, reason,
    };

    updateWallet(w.id, {
      [key]: newVal,
      adminNotes: notes || w.adminNotes,
      recentTx: [newTx, ...w.recentTx.slice(0, 9)],
      auditLog: [newAudit, ...w.auditLog],
    });
    toast(`Balance ${adjType === "CREDIT" ? "credited" : "debited"} $${amount.toFixed(2)} on @${w.username}'s ${walletType.toLowerCase()} wallet.`, "success");
  }, [updateWallet, toast]);

  const handleTransfer = useCallback((w: DrawerWallet, from: "DEPOSIT" | "INCOME" | "WITHDRAWAL", to: "DEPOSIT" | "INCOME" | "WITHDRAWAL", amount: number, reason: string) => {
    const field: Record<string, keyof DrawerWallet> = { DEPOSIT: "depositWallet", INCOME: "incomeWallet", WITHDRAWAL: "withdrawalWallet" };
    const fKey = field[from] as "depositWallet" | "incomeWallet" | "withdrawalWallet";
    const tKey = field[to]   as "depositWallet" | "incomeWallet" | "withdrawalWallet";
    const newFromVal = (w[fKey] as number) - amount;
    const newToVal   = (w[tKey] as number) + amount;

    const newTx: WalletTransaction = {
      id: `TX-TRF-${Date.now()}`, type: "WALLET_TRANSFER",
      amount, wallet: from, timestamp: new Date(), note: `${from} → ${to}: ${reason}`,
    };
    const newQItem: TransferQueueItem = {
      id: `TQ-${Date.now()}`, total: amount, released: 0,
      hoursElapsed: 0, totalHours: 72, status: "PROCESSING",
    };
    const newAudit: AuditEntry = {
      id: `AUD-TRF-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io",
      action: `Transfer Executed (${from} → ${to})`,
      oldValue: `${from}: $${(w[fKey] as number).toFixed(2)}`,
      newValue:  `${from}: $${newFromVal.toFixed(2)} | ${to}: $${newToVal.toFixed(2)}`,
      reason,
    };

    updateWallet(w.id, {
      [fKey]: newFromVal, [tKey]: newToVal,
      transferQueue: [newQItem, ...w.transferQueue],
      recentTx: [newTx, ...w.recentTx.slice(0, 9)],
      auditLog: [newAudit, ...w.auditLog],
    });
    toast(`Transferred $${amount.toFixed(2)} from ${from} → ${to} on @${w.username}.`, "success");
  }, [updateWallet, toast]);

  const handleFreeze = useCallback((w: DrawerWallet) => {
    const newAudit: AuditEntry = { id: `AUD-FRZ-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io", action: "Wallet Frozen", oldValue: w.status, newValue: "FROZEN", reason: "Admin action" };
    const newAlert: WalletAlert = { id: `AL-FRZ-${Date.now()}`, type: "FROZEN", message: "Wallet frozen by admin.", severity: "error", timestamp: new Date() };
    const newTx: WalletTransaction = { id: `TX-FRZ-${Date.now()}`, type: "FREEZE", amount: 0, wallet: "DEPOSIT", timestamp: new Date(), note: "Admin froze wallet" };
    updateWallet(w.id, { status: "FROZEN", auditLog: [newAudit, ...w.auditLog], alerts: [newAlert, ...w.alerts], recentTx: [newTx, ...w.recentTx.slice(0, 9)] });
    toast(`@${w.username}'s wallet has been frozen.`, "info");
  }, [updateWallet, toast]);

  const handleUnfreeze = useCallback((w: DrawerWallet) => {
    const newAudit: AuditEntry = { id: `AUD-UFZ-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io", action: "Wallet Unfrozen", oldValue: "FROZEN", newValue: "ACTIVE", reason: "Admin action" };
    const newTx: WalletTransaction = { id: `TX-UFZ-${Date.now()}`, type: "UNFREEZE", amount: 0, wallet: "DEPOSIT", timestamp: new Date(), note: "Admin unfroze wallet" };
    updateWallet(w.id, { status: "ACTIVE", alerts: w.alerts.filter(a => a.type !== "FROZEN"), auditLog: [newAudit, ...w.auditLog], recentTx: [newTx, ...w.recentTx.slice(0, 9)] });
    toast(`@${w.username}'s wallet has been unfrozen and set to Active.`, "success");
  }, [updateWallet, toast]);

  const handleSaveNotes = useCallback((id: string, notes: string) => {
    updateWallet(id, { adminNotes: notes });
    toast("Admin notes saved.", "success");
  }, [updateWallet, toast]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return wallets.filter(w => {
      if (q && !w.username.includes(q) && !w.memberId.toLowerCase().includes(q) && !(w.firstName + " " + w.lastName).toLowerCase().includes(q)) return false;
      if (fStatus  && w.status  !== fStatus)  return false;
      if (fCountry && w.country !== fCountry) return false;
      if (fPlan) {
        if (fPlan === "none" && w.plan !== null) return false;
        if (fPlan !== "none" && w.plan !== fPlan) return false;
      }
      return true;
    });
  }, [wallets, search, fStatus, fCountry, fPlan]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  // KPI aggregates (from live state)
  const kpis = useMemo(() => {
    const depTotal = wallets.reduce((s, w) => s + w.depositWallet, 0);
    const incTotal = wallets.reduce((s, w) => s + w.incomeWallet, 0);
    const witTotal = wallets.reduce((s, w) => s + w.withdrawalWallet, 0);
    const pending  = wallets.reduce((s, w) => s + w.pendingTransfer, 0);
    const platform = depTotal + incTotal + witTotal;
    const avg      = platform / wallets.length;
    const flagged  = wallets.filter(w => w.status === "FLAGGED").length;
    const completedToday = wallets.filter(w => w.transferQueue.some(q => q.status === "COMPLETED")).length;
    return { depTotal, incTotal, witTotal, pending, completedToday, platform, avg, flagged };
  }, [wallets]);

  const countries = useMemo(() => [...new Set(wallets.map(w => w.country))].sort(), [wallets]);
  const plans     = useMemo(() => [...new Set(wallets.map(w => w.plan).filter(Boolean))].sort() as string[], [wallets]);

  // Lookup live wallet for drawer
  const liveDrawer = drawer ? wallets.find(w => w.id === drawer.id) ?? drawer : null;

  // Adjust target (live lookup)
  const liveAdj = adjTarget ? wallets.find(w => w.id === adjTarget.id) ?? adjTarget : null;
  const liveTrf = trfTarget ? wallets.find(w => w.id === trfTarget.id) ?? trfTarget : null;

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
              { icon: RefreshCw,        label: "Refresh",        onClick: undefined },
              { icon: Download,         label: "Export",         onClick: undefined },
              { icon: SlidersHorizontal,label: "Adjust Wallet",  onClick: undefined, gold: false },
              { icon: ArrowRightLeft,   label: "Transfer Funds", onClick: undefined, gold: true  },
            ].map(b => (
              <button key={b.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: b.gold ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${b.gold ? "rgba(212,175,55,0.25)" : BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: b.gold ? GOLD_L : "rgba(255,255,255,0.7)" }}>
                <b.icon size={13} />{b.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
          <KpiCard icon={TrendingUp}   label="TOTAL DEPOSIT WALLET"    value={$(kpis.depTotal)}     sub={`${wallets.length} wallets`}    color="#34d399" />
          <KpiCard icon={Wallet}       label="TOTAL INCOME WALLET"     value={$(kpis.incTotal)}     sub="Platform-wide"                   color={GOLD}    />
          <KpiCard icon={TrendingDown} label="TOTAL WITHDRAWAL WALLET" value={$(kpis.witTotal)}     sub="Awaiting release"                color="#60a5fa" />
          <KpiCard icon={Clock}        label="PENDING TRANSFERS"       value={$(kpis.pending)}      sub="In 72-hr queue"                  color="#fbbf24" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 26 }}>
          <KpiCard icon={CheckCircle}  label="COMPLETED TODAY"         value={String(kpis.completedToday)} sub="Transfers released"      color="#34d399" />
          <KpiCard icon={BarChart2}    label="TOTAL PLATFORM VALUE"    value={$(kpis.platform)}     sub="All wallets combined"            color="#a78bfa" />
          <KpiCard icon={Users}        label="AVG WALLET BALANCE"      value={$(kpis.avg)}          sub="Per member"                      color="#60a5fa" />
          <KpiCard icon={Flag}         label="FLAGGED WALLETS"         value={String(kpis.flagged)} sub="Requires review"                 color="#f87171" />
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
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
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
            {filtered.length} wallet{filtered.length !== 1 ? "s" : ""}
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
                {pageRows.map(w => (
                  <WalletRow
                    key={w.id} w={w}
                    onView={setDrawer}
                    onAdjust={setAdjTarget}
                    onTransfer={setTrfTarget}
                    onFreeze={handleFreeze}
                    onUnfreeze={handleUnfreeze}
                    hovered={hovered === w.id}
                    onHover={setHovered}
                  />
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 13 }}>No wallets match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, color: MUTED }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: page === 1 ? "not-allowed" : "pointer", color: page === 1 ? MUTED : "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
                  <ChevronLeft size={13} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return (
                    <button key={pg} onClick={() => setPage(pg)} style={{ padding: "5px 10px", minWidth: 32, background: pg === page ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${pg === page ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: pg === page ? 700 : 400, color: pg === page ? GOLD_L : "rgba(255,255,255,0.65)" }}>
                      {pg}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: page === totalPages ? "not-allowed" : "pointer", color: page === totalPages ? MUTED : "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
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
