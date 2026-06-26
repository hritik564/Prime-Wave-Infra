import { useState, memo } from "react";
import {
  X, Wallet, ArrowRightLeft, Clock, ShieldAlert, FileText, StickyNote,
  TrendingUp, TrendingDown, CheckCircle, AlertTriangle, Info, ChevronRight,
  Download, Search, Copy,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

export type WalletStatus = "ACTIVE" | "LOCKED" | "FROZEN" | "FLAGGED";
export type WalletType   = "DEPOSIT" | "INCOME" | "WITHDRAWAL";
export type TxType       = "ROI_CREDIT" | "BINARY_INCOME" | "WITHDRAWAL_APPROVED" | "WALLET_TRANSFER" |
                           "PRINCIPAL_CLAIM" | "DEPOSIT_APPROVED" | "ADJUSTMENT_CREDIT" | "ADJUSTMENT_DEBIT" | "FREEZE" | "UNFREEZE";

export interface WalletTransaction {
  id: string; type: TxType; amount: number; wallet: WalletType; timestamp: Date; note: string;
}

export interface TransferQueueItem {
  id: string; total: number; released: number; hoursElapsed: number; totalHours: number;
  status: "PROCESSING" | "COMPLETED" | "PAUSED";
}

export interface WalletAlert {
  id: string; type: "LARGE_BALANCE" | "TRANSFER_DELAYED" | "NEGATIVE_BALANCE" | "SUSPICIOUS_ACTIVITY" | "FROZEN";
  message: string; severity: "warn" | "error" | "info"; timestamp: Date;
}

export interface AuditEntry {
  id: string; timestamp: Date; admin: string; action: string;
  oldValue: string; newValue: string; reason: string;
}

export interface DrawerWallet {
  id: string; memberId: string; username: string; firstName: string; lastName: string;
  country: string; plan: string | null; status: WalletStatus;
  depositWallet: number; incomeWallet: number; withdrawalWallet: number;
  pendingTransfer: number; lastTx: Date;
  lifetimeCredits: number; lifetimeDebits: number;
  transferQueue: TransferQueueItem[];
  recentTx: WalletTransaction[];
  alerts: WalletAlert[];
  auditLog: AuditEntry[];
  adminNotes: string;
}

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_CFG: Record<WalletStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:  { label: "Active",  color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  LOCKED:  { label: "Locked",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  FROZEN:  { label: "Frozen",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  FLAGGED: { label: "Flagged", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

const TX_CFG: Record<TxType, { icon: React.ElementType; color: string; label: string }> = {
  ROI_CREDIT:          { icon: TrendingUp,   color: "#34d399", label: "ROI Credited"        },
  BINARY_INCOME:       { icon: TrendingUp,   color: GOLD,      label: "Binary Income"        },
  WITHDRAWAL_APPROVED: { icon: TrendingDown, color: "#f87171", label: "Withdrawal Approved"  },
  WALLET_TRANSFER:     { icon: ArrowRightLeft,color:"#60a5fa", label: "Wallet Transfer"      },
  PRINCIPAL_CLAIM:     { icon: CheckCircle,  color: "#a78bfa", label: "Principal Claim"      },
  DEPOSIT_APPROVED:    { icon: TrendingUp,   color: "#34d399", label: "Deposit Approved"     },
  ADJUSTMENT_CREDIT:   { icon: TrendingUp,   color: "#34d399", label: "Balance Adjusted +"   },
  ADJUSTMENT_DEBIT:    { icon: TrendingDown, color: "#f87171", label: "Balance Adjusted –"   },
  FREEZE:              { icon: ShieldAlert,  color: "#60a5fa", label: "Wallet Frozen"        },
  UNFREEZE:            { icon: CheckCircle,  color: "#34d399", label: "Wallet Unfrozen"      },
};

const ALERT_CFG = {
  LARGE_BALANCE:       { icon: Info,         color: "#60a5fa", bg: "rgba(96,165,250,0.08)"   },
  TRANSFER_DELAYED:    { icon: Clock,         color: "#fbbf24", bg: "rgba(251,191,36,0.08)"  },
  NEGATIVE_BALANCE:    { icon: AlertTriangle, color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  SUSPICIOUS_ACTIVITY: { icon: ShieldAlert,   color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  FROZEN:              { icon: ShieldAlert,   color: "#60a5fa", bg: "rgba(96,165,250,0.08)"  },
};

const TABS = [
  { id: "overview",  icon: Wallet,        label: "Overview"   },
  { id: "queue",     icon: Clock,         label: "Transfers"  },
  { id: "txns",      icon: TrendingUp,    label: "History"    },
  { id: "alerts",    icon: ShieldAlert,   label: "Alerts"     },
  { id: "audit",     icon: FileText,      label: "Audit"      },
  { id: "notes",     icon: StickyNote,    label: "Notes"      },
];

// ─── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({ w }: { w: DrawerWallet }) {
  const total = w.depositWallet + w.incomeWallet + w.withdrawalWallet;
  const sc = STATUS_CFG[w.status];
  const balances = [
    { label: "Deposit Wallet",    value: w.depositWallet,    color: "#34d399" },
    { label: "Income Wallet",     value: w.incomeWallet,     color: GOLD      },
    { label: "Withdrawal Wallet", value: w.withdrawalWallet, color: "#60a5fa" },
    { label: "Pending Transfer",  value: w.pendingTransfer,  color: "#fbbf24" },
  ];
  return (
    <div>
      {/* Member chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(212,175,55,0.12)", border: "2px solid rgba(212,175,55,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: GOLD, flexShrink: 0 }}>
          {w.firstName[0]}{w.lastName[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>@{w.username}</div>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{w.memberId}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "4px 10px", borderRadius: 6 }}>{sc.label}</span>
      </div>

      {/* Total value */}
      <div style={{ background: `linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.03))`, border: `1px solid rgba(212,175,55,0.18)`, borderRadius: 12, padding: "16px 18px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 6, letterSpacing: "0.1em" }}>TOTAL WALLET VALUE</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: GOLD_L }}>{$(total)}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{w.country}{w.plan ? ` · ${w.plan}` : ""}</div>
      </div>

      {/* Balance cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {balances.map(b => (
          <div key={b.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 5, fontWeight: 600 }}>{b.label.toUpperCase()}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: b.color }}>{$(b.value)}</div>
          </div>
        ))}
      </div>

      {/* Lifetime stats */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 12, letterSpacing: "0.08em" }}>LIFETIME SUMMARY</div>
        {[
          { label: "Total Credits", value: $(w.lifetimeCredits), color: "#34d399" },
          { label: "Total Debits",  value: $(w.lifetimeDebits),  color: "#f87171" },
          { label: "Net Flow",      value: $(w.lifetimeCredits - w.lifetimeDebits), color: (w.lifetimeCredits - w.lifetimeDebits) >= 0 ? "#34d399" : "#f87171" },
          { label: "Last Tx",       value: fmtDate(w.lastTx), color: "rgba(255,255,255,0.7)" },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: r.color }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Transfer Queue tab ───────────────────────────────────────────────────────
function QueueTab({ w }: { w: DrawerWallet }) {
  const STATUS_COLOR: Record<string, string> = { PROCESSING: "#fbbf24", COMPLETED: "#34d399", PAUSED: "#f87171" };
  if (w.transferQueue.length === 0) {
    return <div style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 12 }}>No active transfer queue items.</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 16, lineHeight: 1.6 }}>
        Transfers are released over a 72-hour window. Each entry shows the current progress, next release time, and status.
      </div>
      {w.transferQueue.map(item => {
        const pct = Math.round((item.hoursElapsed / item.totalHours) * 100);
        const remaining = item.total - item.released;
        const msLeft = ((item.totalHours - item.hoursElapsed) * 3600 * 1000);
        const hoursLeft = Math.floor(msLeft / 3600000);
        const minsLeft  = Math.floor((msLeft % 3600000) / 60000);
        return (
          <div key={item.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Transfer {item.id}</div>
                <div style={{ fontSize: 11, color: MUTED }}>Total: {$(item.total)}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[item.status], background: `${STATUS_COLOR[item.status]}18`, padding: "4px 10px", borderRadius: 6 }}>{item.status}</span>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: MUTED }}>Hour {item.hoursElapsed} / {item.totalHours}</span>
                <span style={{ fontSize: 10, color: GOLD }}>{pct}%</span>
              </div>
              <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})`, width: `${pct}%`, transition: "width 0.4s ease" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Released",  value: $(item.released),  color: "#34d399" },
                { label: "Remaining", value: $(remaining),      color: "#fbbf24" },
                { label: "Next Release", value: item.status === "COMPLETED" ? "Done" : `${hoursLeft}h ${minsLeft}m`, color: "#60a5fa" },
              ].map(stat => (
                <div key={stat.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>{stat.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Transactions tab ─────────────────────────────────────────────────────────
function TxTab({ w }: { w: DrawerWallet }) {
  if (w.recentTx.length === 0) {
    return <div style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 12 }}>No recent transactions.</div>;
  }
  return (
    <div>
      {w.recentTx.map((tx, i) => {
        const cfg = TX_CFG[tx.type];
        const isLast = i === w.recentTx.length - 1;
        return (
          <div key={tx.id} style={{ display: "flex", gap: 12, paddingBottom: isLast ? 0 : 16 }}>
            {/* Timeline dot + line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${cfg.color}18`, border: `1.5px solid ${cfg.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <cfg.icon size={13} style={{ color: cfg.color }} />
              </div>
              {!isLast && <div style={{ width: 1, flex: 1, background: BORDER, margin: "4px 0" }} />}
            </div>
            {/* Content */}
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{cfg.label}</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: tx.type.includes("DEBIT") || tx.type === "WITHDRAWAL_APPROVED" ? "#f87171" : "#34d399" }}>
                  {tx.type.includes("DEBIT") || tx.type === "WITHDRAWAL_APPROVED" ? "-" : "+"}{$(tx.amount)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{tx.note}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{fmtDate(tx.timestamp)} · {tx.wallet} WALLET</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Alerts tab ───────────────────────────────────────────────────────────────
function AlertsTab({ w }: { w: DrawerWallet }) {
  if (w.alerts.length === 0) {
    return <div style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 12 }}>No active wallet alerts.</div>;
  }
  return (
    <div>
      {w.alerts.map(alert => {
        const cfg = ALERT_CFG[alert.type];
        return (
          <div key={alert.id} style={{ background: cfg.bg, border: `1px solid ${cfg.color}25`, borderLeft: `3px solid ${cfg.color}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <cfg.icon size={13} style={{ color: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{alert.type.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 10, color: MUTED, marginLeft: "auto" }}>{fmtDate(alert.timestamp)}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{alert.message}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Audit Log tab ────────────────────────────────────────────────────────────
function AuditTab({ w }: { w: DrawerWallet }) {
  const [q, setQ] = useState("");
  const entries = w.auditLog.filter(e =>
    !q || e.action.toLowerCase().includes(q.toLowerCase()) || e.admin.toLowerCase().includes(q.toLowerCase()) || e.reason.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search audit…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px 7px 28px", fontSize: 12, color: "rgba(255,255,255,0.75)", outline: "none", boxSizing: "border-box" }} />
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: MUTED }}>
          <Download size={11} /> Export
        </button>
      </div>
      {entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: MUTED, fontSize: 12 }}>No audit entries found.</div>
      ) : entries.map(e => (
        <div key={e.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{e.action}</span>
            <span style={{ fontSize: 10, color: MUTED }}>{fmtDate(e.timestamp)}</span>
          </div>
          <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 5 }}>Admin: {e.admin}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 5 }}>
            <div style={{ flex: 1, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, padding: "5px 8px" }}>
              <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>OLD VALUE</div>
              <div style={{ fontSize: 11, color: "#f87171", fontFamily: "monospace" }}>{e.oldValue || "—"}</div>
            </div>
            <ChevronRight size={14} style={{ color: MUTED, alignSelf: "center", flexShrink: 0 }} />
            <div style={{ flex: 1, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 6, padding: "5px 8px" }}>
              <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>NEW VALUE</div>
              <div style={{ fontSize: 11, color: "#34d399", fontFamily: "monospace" }}>{e.newValue || "—"}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>Reason: {e.reason}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Notes tab ────────────────────────────────────────────────────────────────
function NotesTab({ notes, onSave }: { notes: string; onSave: (n: string) => void }) {
  const [val, setVal] = useState(notes);
  const dirty = val !== notes;
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Internal admin notes — not visible to the member.</div>
      <textarea
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Add admin notes about this wallet…"
        style={{ width: "100%", minHeight: 200, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "rgba(255,255,255,0.82)", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button
          onClick={() => onSave(val)}
          disabled={!dirty}
          style={{ padding: "8px 20px", background: dirty ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${dirty ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 8, cursor: dirty ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, color: dirty ? GOLD_L : MUTED }}
        >
          Save Notes
        </button>
      </div>
    </div>
  );
}

// ─── Main WalletDrawer ─────────────────────────────────────────────────────────
const WalletDrawer = memo(function WalletDrawer({ wallet, onClose, onAdjust, onTransfer, onFreeze, onUnfreeze, onSaveNotes }: {
  wallet: DrawerWallet | null;
  onClose: () => void;
  onAdjust:   (w: DrawerWallet) => void;
  onTransfer: (w: DrawerWallet) => void;
  onFreeze:   (w: DrawerWallet) => void;
  onUnfreeze: (w: DrawerWallet) => void;
  onSaveNotes:(id: string, notes: string) => void;
}) {
  const [tab, setTab] = useState("overview");

  if (!wallet) return null;

  const sc = STATUS_CFG[wallet.status];
  const isFrozen = wallet.status === "FROZEN";

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 480, zIndex: 201, background: "hsl(222 62% 7%)", borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", boxShadow: "-12px 0 50px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(212,175,55,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Wallet size={17} style={{ color: GOLD }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>@{wallet.username}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: MUTED }}>{wallet.memberId}</span>
                  <button onClick={() => navigator.clipboard.writeText(wallet.memberId)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0, display: "flex" }}><Copy size={9} /></button>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "4px 10px", borderRadius: 6 }}>{sc.label}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, display: "flex" }}><X size={16} /></button>
            </div>
          </div>

          {/* Quick action buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "Adjust", onClick: () => onAdjust(wallet), color: GOLD, border: "rgba(212,175,55,0.3)", bg: "rgba(212,175,55,0.08)" },
              { label: "Transfer", onClick: () => onTransfer(wallet), color: "#60a5fa", border: "rgba(96,165,250,0.3)", bg: "rgba(96,165,250,0.08)" },
              { label: isFrozen ? "Unfreeze" : "Freeze", onClick: () => isFrozen ? onUnfreeze(wallet) : onFreeze(wallet), color: isFrozen ? "#34d399" : "#f87171", border: isFrozen ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)", bg: isFrozen ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)" },
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick} style={{ flex: 1, padding: "7px 0", background: btn.bg, border: `1px solid ${btn.border}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: btn.color }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "11px 14px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent", cursor: "pointer", fontSize: 11, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? GOLD_L : MUTED, whiteSpace: "nowrap", transition: "color 0.15s" }}>
              <t.icon size={11} />
              {t.label}
              {t.id === "alerts" && wallet.alerts.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, background: "#f87171", color: "#fff", borderRadius: 10, padding: "0px 5px", marginLeft: 2 }}>{wallet.alerts.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {tab === "overview" && <OverviewTab w={wallet} />}
          {tab === "queue"    && <QueueTab    w={wallet} />}
          {tab === "txns"     && <TxTab       w={wallet} />}
          {tab === "alerts"   && <AlertsTab   w={wallet} />}
          {tab === "audit"    && <AuditTab    w={wallet} />}
          {tab === "notes"    && <NotesTab notes={wallet.adminNotes} onSave={n => onSaveNotes(wallet.id, n)} />}
        </div>
      </div>
    </>
  );
});

export default WalletDrawer;
