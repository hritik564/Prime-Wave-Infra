import { useState, useCallback, useEffect } from "react";
import {
  Search, RefreshCw, Loader2, Copy, CheckCheck,
  Clock, Wifi, RotateCcw, ExternalLink, CheckCircle2, X,
  ShieldAlert, ShieldX, AlertTriangle, DollarSign,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import {
  adminListDepositVerifications,
  adminRetryDepositVerification,
  adminManualApproveVerification,
  adminRevalidateDepositVerification,
  adminRejectDepositVerification,
  type AdminDepositVerificationItem,
  type DepositVerificationStatus,
  type ListMeta,
} from "@/lib/api";

// ── Status display config ─────────────────────────────────────────────────────

type StatusVariant = "active" | "success" | "warning" | "error" | "muted";

const STATUS_CONFIG: Record<string, { label: string; variant: StatusVariant }> = {
  CREATED:               { label: "Created",     variant: "muted"   },
  TX_SUBMITTED:          { label: "Submitted",   variant: "active"  },
  VERIFYING:             { label: "Verifying",   variant: "active"  },
  VERIFICATION_DELAYED:  { label: "Delayed",     variant: "warning" },
  WAITING_CONFIRMATIONS: { label: "Confirming",  variant: "warning" },
  CONFIRMED:             { label: "Confirmed",   variant: "success" },
  CREDITED:              { label: "Credited",    variant: "success" },
  COMPLETED:             { label: "Completed",   variant: "success" },
  FAILED:                { label: "Failed",      variant: "error"   },
  REJECTED:              { label: "Rejected",    variant: "error"   },
  EXPIRED:               { label: "Expired",     variant: "error"   },
};

const VARIANT_STYLE: Record<StatusVariant, { bg: string; color: string }> = {
  active:  { bg: "rgba(212,175,55,0.12)",  color: "#D4AF37"  },
  success: { bg: "rgba(52,211,153,0.12)",  color: "#34d399"  },
  warning: { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24"  },
  error:   { bg: "rgba(248,113,113,0.12)", color: "#f87171"  },
  muted:   { bg: "rgba(255,255,255,0.05)", color: "rgba(170,179,197,0.6)" },
};

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All",        value: ""                      },
  { label: "Active",     value: "VERIFYING"             },
  { label: "Delayed",    value: "VERIFICATION_DELAYED"  },
  { label: "Confirming", value: "WAITING_CONFIRMATIONS" },
  { label: "Completed",  value: "COMPLETED"             },
  { label: "Failed",     value: "FAILED"                },
  { label: "Rejected",   value: "REJECTED"              },
  { label: "Expired",    value: "EXPIRED"               },
];

// ── Failure classification ────────────────────────────────────────────────────

type FailureCategory = "recoverable" | "permanent" | "unknown";

function classifyFailure(reason: string | null): FailureCategory {
  if (!reason) return "unknown";
  const r = reason.toLowerCase();
  if (
    r.includes("wrong recipient") ||
    r.includes("wrong network")   ||
    r.includes("wrong token")     ||
    r.includes("unsupported network") ||
    r.includes("reverted")        ||
    r.includes("failed on-chain") ||
    r.includes("invalid hash")    ||
    r.includes("duplicate")
  ) return "permanent";
  if (
    r.includes("timeout")         ||
    r.includes("rpc")             ||
    r.includes("unavailable")     ||
    r.includes("network issue")   ||
    r.includes("adapter")         ||
    r.includes("node")            ||
    r.includes("crash recovery")  ||
    r.includes("credit pipeline")
  ) return "recoverable";
  return "unknown";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: string | null) {
  if (!amount) return "—";
  const n = parseFloat(amount);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shorten(hash: string) {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

function bscScanUrl(txHash: string) {
  return `https://bscscan.com/tx/${txHash}`;
}

// ── Small reusable UI pieces ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex h-6 w-6 items-center justify-center rounded transition-all opacity-50 hover:opacity-100"
      style={{ color: "#D4AF37" }}
    >
      {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "muted" as StatusVariant };
  const style = VARIANT_STYLE[cfg.variant];
  const isPulsing = cfg.variant === "active" || status === "VERIFICATION_DELAYED";
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {isPulsing && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: style.color }} />}
      {cfg.label}
    </span>
  );
}

function NetworkBadge({ network }: { network: string }) {
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded"
      style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.15)" }}
    >
      {network}
    </span>
  );
}

function ConfirmationBar({ current, required }: { current: number; required: number }) {
  const pct = Math.min(100, (current / required) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: "rgba(170,179,197,0.6)" }}>
        <span>{current}/{required}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", minWidth: 80 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #D4AF37, #F3D37A)" }} />
      </div>
    </div>
  );
}

function FailureCategoryBadge({ category }: { category: FailureCategory }) {
  if (category === "recoverable") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
        <ShieldAlert className="h-3 w-3" /> Recoverable
      </span>
    );
  }
  if (category === "permanent") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}>
        <ShieldX className="h-3 w-3" /> Permanent
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(255,255,255,0.05)", color: "rgba(170,179,197,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <AlertTriangle className="h-3 w-3" /> Unknown
    </span>
  );
}

// ── Manual Credit Dialog ──────────────────────────────────────────────────────

interface ManualCreditDialogProps {
  target:    AdminDepositVerificationItem | null;
  onClose:   () => void;
  onSuccess: () => void;
}

function ManualCreditDialog({ target, onClose, onSuccess }: ManualCreditDialogProps) {
  const [creditAmount,  setCreditAmount]  = useState("");
  const [reason,        setReason]        = useState("");
  const [verified,      setVerified]      = useState(false);
  const [acknowledged,  setAcknowledged]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setCreditAmount(target.blockchainAmount ?? "");
      setReason("");
      setVerified(false);
      setAcknowledged(false);
      setError(null);
    }
  }, [target]);

  if (!target) return null;

  const amountTrimmed = creditAmount.trim();
  const amountNum     = parseFloat(amountTrimmed);
  const amountValid   = /^\d+(\.\d{1,8})?$/.test(amountTrimmed) && !isNaN(amountNum) && amountNum > 0;
  const reasonOk      = reason.trim().length >= 15;

  const blockchainNum   = target.blockchainAmount ? parseFloat(target.blockchainAmount) : null;
  const amountsDiffer   = blockchainNum !== null && amountValid && Math.abs(blockchainNum - amountNum) > 0.000_000_01;
  const diffAmt         = amountsDiffer && blockchainNum !== null ? (amountNum - blockchainNum).toFixed(8) : null;

  const canSubmit = amountValid && reasonOk && verified && acknowledged && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await adminManualApproveVerification(target.id, {
        creditAmount: amountTrimmed,
        reason:       reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Credit failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 z-10 max-h-[90vh] overflow-y-auto"
        style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" style={{ color: "#34d399" }} />
            <h2 className="font-bold text-base text-foreground">Manual Credit</h2>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg opacity-50 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" style={{ color: "rgba(170,179,197,0.7)" }} />
          </button>
        </div>

        {/* Transaction details */}
        <div className="rounded-xl p-3.5 mb-4 text-xs space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex justify-between items-center">
            <span style={{ color: "rgba(170,179,197,0.6)" }}>TX Hash</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-foreground">{shorten(target.txHash)}</span>
              <CopyButton text={target.txHash} />
              <a href={bscScanUrl(target.txHash)} target="_blank" rel="noopener noreferrer"
                className="opacity-50 hover:opacity-100 transition-opacity" style={{ color: "#D4AF37" }}>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <div className="flex justify-between"><span style={{ color: "rgba(170,179,197,0.6)" }}>User</span><span className="font-semibold text-foreground">{target.user.username}</span></div>
          <div className="flex justify-between"><span style={{ color: "rgba(170,179,197,0.6)" }}>Network</span><NetworkBadge network={target.network} /></div>
          <div className="flex justify-between items-center"><span style={{ color: "rgba(170,179,197,0.6)" }}>Status</span><StatusBadge status={target.verificationStatus} /></div>
          <div className="flex justify-between">
            <span style={{ color: "rgba(170,179,197,0.6)" }}>Blockchain Amount</span>
            <span className="font-semibold font-mono" style={{ color: target.blockchainAmount ? "#34d399" : "rgba(170,179,197,0.4)" }}>
              {target.blockchainAmount ? `${target.blockchainAmount} USDT` : "Not detected"}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "rgba(170,179,197,0.6)" }}>Confirmations</span>
            <span className="font-mono text-foreground">{target.confirmations} / {target.requiredConfirmations}</span>
          </div>
          {target.recipientAddress && (
            <div className="flex justify-between items-center">
              <span style={{ color: "rgba(170,179,197,0.6)" }}>Recipient</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-foreground" title={target.recipientAddress}>{shorten(target.recipientAddress)}</span>
                <CopyButton text={target.recipientAddress} />
              </div>
            </div>
          )}
          {target.senderAddress && (
            <div className="flex justify-between items-center">
              <span style={{ color: "rgba(170,179,197,0.6)" }}>Sender</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-foreground" title={target.senderAddress}>{shorten(target.senderAddress)}</span>
                <CopyButton text={target.senderAddress} />
              </div>
            </div>
          )}
          {target.failureReason && (
            <div className="pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs" style={{ color: "#f87171" }}>
                <span style={{ color: "rgba(170,179,197,0.6)" }}>Failure: </span>{target.failureReason}
              </p>
            </div>
          )}
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          {/* Credit Amount */}
          <label className="block text-xs font-semibold mb-2" style={{ color: "rgba(170,179,197,0.8)" }}>
            Admin Credit Amount (USDT) <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            type="text"
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            placeholder="0.00000000"
            className="w-full text-sm rounded-xl px-3 py-2.5 outline-none transition-all mb-1 font-mono"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${amountValid ? "rgba(52,211,153,0.35)" : amountTrimmed ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.08)"}`,
              color: "hsl(var(--foreground))",
            }}
          />
          <p className="text-xs mb-3" style={{ color: !amountTrimmed ? "rgba(170,179,197,0.4)" : amountValid ? "rgba(52,211,153,0.7)" : "#f87171" }}>
            {!amountTrimmed ? "Enter amount to credit (up to 8 decimal places)" :
             amountValid ? `Will credit ${amountTrimmed} USDT to user's wallet` :
             "Must be a positive number with up to 8 decimal places"}
          </p>

          {/* Amount diff warning */}
          {amountsDiffer && diffAmt !== null && (
            <div className="rounded-xl p-3 mb-4 flex items-start gap-2 text-xs"
              style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
              <p style={{ color: "#fbbf24" }}>
                Credit amount differs from blockchain amount by{" "}
                <span className="font-mono font-semibold">
                  {parseFloat(diffAmt) > 0 ? "+" : ""}{diffAmt} USDT
                </span>. Ensure this is intentional before proceeding.
              </p>
            </div>
          )}

          {/* Reason */}
          <label className="block text-xs font-semibold mb-2" style={{ color: "rgba(170,179,197,0.8)" }}>
            Reason for manual credit <span style={{ color: "#f87171" }}>*</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why this deposit is being manually credited (min 15 characters)…"
            className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none transition-all mb-1"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${reasonOk ? "rgba(212,175,55,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: "hsl(var(--foreground))",
            }}
          />
          <p className="text-xs mb-4" style={{ color: reason.trim().length < 15 ? "#f87171" : "rgba(170,179,197,0.4)" }}>
            {reason.trim().length} / 15 min characters
          </p>

          {/* Checkboxes */}
          <div className="space-y-3 mb-5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded accent-yellow-500 flex-shrink-0" />
              <span className="text-xs leading-relaxed" style={{ color: "rgba(170,179,197,0.7)" }}>
                I have independently verified this blockchain transaction.
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded accent-yellow-500 flex-shrink-0" />
              <span className="text-xs leading-relaxed" style={{ color: "rgba(170,179,197,0.7)" }}>
                I understand this operation credits real user funds and cannot be automatically reversed.
              </span>
            </label>
          </div>

          {error && (
            <div className="mb-4 rounded-xl px-3 py-2.5 text-xs" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(170,179,197,0.7)" }}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-40"
              style={{
                background: canSubmit ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canSubmit ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: canSubmit ? "#34d399" : "rgba(170,179,197,0.5)",
              }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Credit Wallet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Manual Reject Dialog ──────────────────────────────────────────────────────

interface ManualRejectDialogProps {
  target:    AdminDepositVerificationItem | null;
  onClose:   () => void;
  onSuccess: () => void;
}

function ManualRejectDialog({ target, onClose, onSuccess }: ManualRejectDialogProps) {
  const [reason,    setReason]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!target) { setReason(""); setError(null); }
  }, [target]);

  if (!target) return null;

  const reasonOk  = reason.trim().length >= 10;
  const canSubmit = reasonOk && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await adminRejectDepositVerification(target.id, { reason: reason.trim() });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Rejection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 z-10"
        style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ShieldX className="h-5 w-5" style={{ color: "#f87171" }} />
            <h2 className="font-bold text-base text-foreground">Reject Verification</h2>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg opacity-50 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" style={{ color: "rgba(170,179,197,0.7)" }} />
          </button>
        </div>

        <div className="rounded-xl p-3.5 mb-4 text-xs space-y-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex justify-between"><span style={{ color: "rgba(170,179,197,0.6)" }}>User</span><span className="font-semibold text-foreground">{target.user.username}</span></div>
          <div className="flex justify-between items-center">
            <span style={{ color: "rgba(170,179,197,0.6)" }}>TX Hash</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-foreground">{shorten(target.txHash)}</span>
              <a href={bscScanUrl(target.txHash)} target="_blank" rel="noopener noreferrer" className="opacity-50 hover:opacity-100 transition-opacity" style={{ color: "#D4AF37" }}>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <div className="flex justify-between items-center"><span style={{ color: "rgba(170,179,197,0.6)" }}>Status</span><StatusBadge status={target.verificationStatus} /></div>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <label className="block text-xs font-semibold mb-2" style={{ color: "rgba(170,179,197,0.8)" }}>
            Rejection reason <span style={{ color: "#f87171" }}>*</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why this verification is being rejected (min 10 characters)…"
            className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none transition-all mb-1"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${reasonOk ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: "hsl(var(--foreground))",
            }}
          />
          <p className="text-xs mb-4" style={{ color: reason.trim().length < 10 ? "#f87171" : "rgba(170,179,197,0.4)" }}>
            {reason.trim().length} / 10 min characters
          </p>

          {error && (
            <div className="mb-4 rounded-xl px-3 py-2.5 text-xs" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171" }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-xl transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(170,179,197,0.7)" }}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-40"
              style={{
                background: canSubmit ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canSubmit ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: canSubmit ? "#f87171" : "rgba(170,179,197,0.5)",
              }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Reject Verification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"];
const NO_CREDIT_STATUSES = ["COMPLETED", "CREDITED", "REJECTED"];

export default function AutoDepositsPage() {
  const [records,        setRecords]        = useState<AdminDepositVerificationItem[]>([]);
  const [meta,           setMeta]           = useState<ListMeta | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [page,           setPage]           = useState(1);
  const [status,         setStatus]         = useState("");
  const [search,         setSearch]         = useState("");
  const [searchInput,    setSearchInput]    = useState("");
  const [retryingId,     setRetryingId]     = useState<string | null>(null);
  const [revalidatingId, setRevalidatingId] = useState<string | null>(null);
  const [approveTarget,  setApproveTarget]  = useState<AdminDepositVerificationItem | null>(null);
  const [rejectTarget,   setRejectTarget]   = useState<AdminDepositVerificationItem | null>(null);

  const load = useCallback(async (overrides?: { page?: number; status?: string; search?: string }) => {
    setLoading(true);
    try {
      const result = await adminListDepositVerifications({
        page:   overrides?.page    ?? page,
        limit:  25,
        status: (overrides?.status  ?? status)  || undefined,
        search: (overrides?.search  ?? search)  || undefined,
      });
      setRecords(result.data as AdminDepositVerificationItem[]);
      setMeta(result.meta);
    } catch { /* keep previous */ } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { void load(); }, [load]);

  const handleTabChange = (val: string) => {
    setStatus(val);
    setPage(1);
    void load({ page: 1, status: val, search });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    void load({ page: 1, status, search: searchInput });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void load({ page: newPage });
  };

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      await adminRetryDepositVerification(id);
      await load();
    } catch { /* keep previous */ } finally {
      setRetryingId(null);
    }
  };

  const handleRevalidate = async (id: string) => {
    setRevalidatingId(id);
    try {
      await adminRevalidateDepositVerification(id);
      await load();
    } catch { /* keep previous */ } finally {
      setRevalidatingId(null);
    }
  };

  return (
    <AdminLayout>
      <ManualCreditDialog
        target={approveTarget}
        onClose={() => setApproveTarget(null)}
        onSuccess={() => { void load(); }}
      />
      <ManualRejectDialog
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSuccess={() => { void load(); }}
      />

      <div className="p-4 md:p-6 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground">Auto Deposits</h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(170,179,197,0.6)" }}>
              Blockchain-verified USDT deposits
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 text-xs rounded-xl px-3 py-2 transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(170,179,197,0.7)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: status === tab.value ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${status === tab.value ? "rgba(212,175,55,0.35)" : "rgba(255,255,255,0.07)"}`,
                color: status === tab.value ? "#D4AF37" : "rgba(170,179,197,0.6)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(170,179,197,0.4)" }} />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by TX hash, username, or email…"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "hsl(var(--foreground))" }}
            />
          </div>
          <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl transition-all"
            style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.25)", color: "#D4AF37" }}>
            Search
          </button>
        </form>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Wifi className="h-8 w-8 opacity-20" style={{ color: "#D4AF37" }} />
              <p className="text-sm" style={{ color: "rgba(170,179,197,0.5)" }}>No verifications found</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["User", "TX Hash", "Network", "Amount", "Confirmations", "Status", "Attempts", "Last Check / Next", "Created", "Actions"].map((h) => (
                        <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(170,179,197,0.5)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => {
                      const isDelayed       = r.verificationStatus === "VERIFICATION_DELAYED";
                      const isFailed        = r.verificationStatus === "FAILED";
                      const isExpired       = r.verificationStatus === "EXPIRED";
                      const isTerminal      = TERMINAL_STATUSES.includes(r.verificationStatus);
                      const isActive        = !isTerminal;
                      const isRevalidatable = isFailed || isExpired || isDelayed;
                      const canCredit       = !NO_CREDIT_STATUSES.includes(r.verificationStatus);
                      const failCat         = isFailed ? classifyFailure(r.failureReason) : "unknown";

                      return (
                        <tr
                          key={r.id}
                          className="transition-colors hover:bg-white/[0.02]"
                          style={{
                            borderBottom: i < records.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                            background: isDelayed ? "rgba(251,191,36,0.025)" : (isFailed || isExpired) ? "rgba(248,113,113,0.015)" : undefined,
                          }}
                        >
                          <td className="px-4 py-3.5">
                            <div>
                              <p className="font-medium text-sm text-foreground">{r.user.username}</p>
                              <p className="text-xs mt-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>{r.user.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs" style={{ color: "rgba(170,179,197,0.6)" }}>{shorten(r.txHash)}</span>
                              <CopyButton text={r.txHash} />
                              <a href={bscScanUrl(r.txHash)} target="_blank" rel="noopener noreferrer"
                                className="flex h-6 w-6 items-center justify-center rounded transition-all opacity-40 hover:opacity-100"
                                style={{ color: "#D4AF37" }} title="View on BscScan">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            {r.failureReason && (
                              <p className="text-xs mt-1 max-w-[200px]" style={{ color: "#f87171" }} title={r.failureReason}>
                                {r.failureReason.length > 60 ? r.failureReason.slice(0, 60) + "…" : r.failureReason}
                              </p>
                            )}
                            {isFailed && <div className="mt-1"><FailureCategoryBadge category={failCat} /></div>}
                          </td>
                          <td className="px-4 py-3.5"><NetworkBadge network={r.network} /></td>
                          <td className="px-4 py-3.5">
                            <span className="font-semibold font-mono" style={{ color: "#34d399" }}>{fmt(r.blockchainAmount)}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <ConfirmationBar current={r.confirmations} required={r.requiredConfirmations} />
                          </td>
                          <td className="px-4 py-3.5"><StatusBadge status={r.verificationStatus} /></td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-sm font-mono" style={{ color: "rgba(170,179,197,0.6)" }}>{r.verificationAttempts}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            {r.lastCheckedAt && (
                              <p className="text-xs whitespace-nowrap" style={{ color: "rgba(170,179,197,0.35)" }}>
                                Last: {fmtDate(r.lastCheckedAt)}
                              </p>
                            )}
                            {r.nextCheckAt && isActive && (
                              <p className="text-xs whitespace-nowrap" style={{ color: isDelayed ? "#fbbf24" : "rgba(170,179,197,0.5)" }}>
                                Next: {fmtDate(r.nextCheckAt)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: "rgba(170,179,197,0.5)" }}>
                            {fmtDate(r.createdAt)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col gap-1.5">
                              {/* Retry: active non-failed states */}
                              {isActive && !isFailed && (
                                <button
                                  onClick={() => { void handleRetry(r.id); }}
                                  disabled={retryingId === r.id}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                                  style={{
                                    background: isDelayed ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                                    border: `1px solid ${isDelayed ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.08)"}`,
                                    color: isDelayed ? "#fbbf24" : "rgba(170,179,197,0.6)",
                                  }}
                                  title="Schedule immediate re-check"
                                >
                                  {retryingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                  Retry
                                </button>
                              )}

                              {/* Re-Validate: FAILED, EXPIRED, VERIFICATION_DELAYED */}
                              {isRevalidatable && (
                                <button
                                  onClick={() => { void handleRevalidate(r.id); }}
                                  disabled={revalidatingId === r.id}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                                  style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}
                                  title="Re-queue for blockchain re-check"
                                >
                                  {revalidatingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                  Re-Validate
                                </button>
                              )}

                              {/* Manual Credit: any status that can still be credited */}
                              {canCredit && (
                                <button
                                  onClick={() => setApproveTarget(r)}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap"
                                  style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }}
                                  title="Manually credit this deposit to user wallet"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Manual Credit
                                </button>
                              )}

                              {/* Reject: FAILED, EXPIRED, VERIFICATION_DELAYED */}
                              {isRevalidatable && (
                                <button
                                  onClick={() => setRejectTarget(r)}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap"
                                  style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}
                                  title="Permanently reject this verification"
                                >
                                  <ShieldX className="h-3 w-3" /> Reject
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                {records.map((r) => {
                  const isDelayed       = r.verificationStatus === "VERIFICATION_DELAYED";
                  const isFailed        = r.verificationStatus === "FAILED";
                  const isExpired       = r.verificationStatus === "EXPIRED";
                  const isTerminal      = TERMINAL_STATUSES.includes(r.verificationStatus);
                  const isActive        = !isTerminal;
                  const isRevalidatable = isFailed || isExpired || isDelayed;
                  const canCredit       = !NO_CREDIT_STATUSES.includes(r.verificationStatus);
                  const failCat         = isFailed ? classifyFailure(r.failureReason) : "unknown";

                  return (
                    <div
                      key={r.id}
                      className="p-4"
                      style={{ background: isDelayed ? "rgba(251,191,36,0.025)" : (isFailed || isExpired) ? "rgba(248,113,113,0.015)" : undefined }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm text-foreground">{r.user.username}</p>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>{r.user.email}</p>
                        </div>
                        <StatusBadge status={r.verificationStatus} />
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>{shorten(r.txHash)}</span>
                        <CopyButton text={r.txHash} />
                        <a href={bscScanUrl(r.txHash)} target="_blank" rel="noopener noreferrer"
                          className="flex h-6 w-6 items-center justify-center rounded opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: "#D4AF37" }}>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <NetworkBadge network={r.network} />
                      </div>

                      <div className="flex items-center justify-between text-xs mb-2" style={{ color: "rgba(170,179,197,0.5)" }}>
                        <span style={{ color: "#34d399", fontWeight: 600 }}>{fmt(r.blockchainAmount)}</span>
                        <span>{fmtDate(r.createdAt)}</span>
                      </div>

                      {isDelayed && r.nextCheckAt && (
                        <div className="mb-2 flex items-center gap-1.5" style={{ color: "#fbbf24" }}>
                          <Clock className="h-3 w-3" />
                          <span className="text-xs">Next check: {fmtDate(r.nextCheckAt)}</span>
                        </div>
                      )}

                      {r.failureReason && (
                        <p className="text-xs mt-1 mb-2" style={{ color: "#f87171" }}>{r.failureReason}</p>
                      )}

                      {isFailed && (
                        <div className="mb-2"><FailureCategoryBadge category={failCat} /></div>
                      )}

                      {/* Actions */}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {/* Retry: active non-failed states */}
                        {isActive && !isFailed && (
                          <button
                            onClick={() => { void handleRetry(r.id); }}
                            disabled={retryingId === r.id}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                            style={{
                              background: isDelayed ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${isDelayed ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.08)"}`,
                              color: isDelayed ? "#fbbf24" : "rgba(170,179,197,0.6)",
                            }}
                          >
                            {retryingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            Retry
                          </button>
                        )}

                        {/* Re-Validate: FAILED, EXPIRED, VERIFICATION_DELAYED */}
                        {isRevalidatable && (
                          <button
                            onClick={() => { void handleRevalidate(r.id); }}
                            disabled={revalidatingId === r.id}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                            style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24" }}>
                            {revalidatingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            Re-Validate
                          </button>
                        )}

                        {/* Manual Credit: any status that can still be credited */}
                        {canCredit && (
                          <button onClick={() => setApproveTarget(r)}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                            style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399" }}>
                            <CheckCircle2 className="h-3 w-3" /> Manual Credit
                          </button>
                        )}

                        {/* Reject: FAILED, EXPIRED, VERIFICATION_DELAYED */}
                        {isRevalidatable && (
                          <button onClick={() => setRejectTarget(r)}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}>
                            <ShieldX className="h-3 w-3" /> Reject
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>
              {meta.total} total · page {meta.page} of {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => handlePageChange(page - 1)} disabled={!meta.hasPrevPage}
                className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(170,179,197,0.7)" }}>
                Previous
              </button>
              <button onClick={() => handlePageChange(page + 1)} disabled={!meta.hasNextPage}
                className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(170,179,197,0.7)" }}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
