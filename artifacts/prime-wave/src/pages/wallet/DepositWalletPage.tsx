import { useState, useCallback, useEffect, useRef } from "react";
import qrImage from "@assets/QR_PW_1782675415129.png";
import {
  Copy, CheckCheck, ArrowDownToLine, CheckCircle2, Loader2,
  AlertTriangle, Clock, Wifi, RefreshCw, Send, ExternalLink,
  XCircle, ChevronRight,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import { Badge } from "@/components/ui/badge";
import {
  getWallets,
  getDepositHistory,
  submitDepositVerification,
  getDepositVerificationStatus,
  type DepositRequest,
  type DepositVerificationStatusResult,
  type DepositVerificationStatus,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPOSIT_ADDRESS = "0x543780EF4cda835F3541A1BdB305f4119f658BDb";
const POLL_INTERVAL_MS = 5_000;

// ── Status ordering for step logic ────────────────────────────────────────────

const STATUS_ORDER: DepositVerificationStatus[] = [
  "TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS",
  "CONFIRMED", "CREDITED", "COMPLETED",
];

function statusIdx(s: DepositVerificationStatus): number {
  return STATUS_ORDER.indexOf(s);
}

const TERMINAL_ERROR: DepositVerificationStatus[] = ["FAILED", "REJECTED", "EXPIRED"];

// ── Timeline step definitions ─────────────────────────────────────────────────

interface TimelineStep {
  label:      string;
  desc:       string;
  doneAtIdx:  number;
  isConfirm?: boolean;
}

const TIMELINE_STEPS: TimelineStep[] = [
  { label: "Transaction Submitted",          desc: "Transaction hash received by Prime Wave",              doneAtIdx: 0 },
  { label: "Transaction Found on Blockchain",desc: "BSC network scanned — transaction located",           doneAtIdx: 1 },
  { label: "USDT Token Verified",            desc: "Transfer confirmed as USDT",                          doneAtIdx: 2 },
  { label: "Recipient Wallet Verified",      desc: "Funds confirmed sent to Prime Wave's wallet",         doneAtIdx: 2 },
  { label: "Awaiting Block Confirmations",   desc: "Counting confirmations for finality",                 doneAtIdx: 3, isConfirm: true },
  { label: "Deposit Approved",               desc: "Blockchain verification complete",                    doneAtIdx: 4 },
  { label: "Deposit Wallet Credited",        desc: "USDT added to your deposit wallet",                   doneAtIdx: 5 },
];

// ── Failure reason → human-readable ──────────────────────────────────────────

function humanReadableFailure(failureReason: string | null, status: DepositVerificationStatus): string {
  if (status === "EXPIRED") {
    return "The transaction timed out waiting for sufficient blockchain confirmations. Please contact support if your funds were sent.";
  }
  if (!failureReason) {
    return "Verification could not be completed. Please contact support with your transaction hash.";
  }
  const r = failureReason.toLowerCase();
  if (r.includes("wrong recipient") || r.includes("recipient"))
    return "The funds were not sent to Prime Wave's deposit address. Please always use the address shown above.";
  if (r.includes("wrong network") || r.includes("unsupported network") || r.includes("chain"))
    return "This transaction was detected on an unsupported network. Only USDT on BEP20 (BSC) is accepted.";
  if (r.includes("wrong token") || r.includes("not usdt") || r.includes("token"))
    return "The transferred token is not USDT. Only USDT deposits are accepted.";
  if (r.includes("status 0") || r.includes("transaction failed") || r.includes("failed on-chain"))
    return "This transaction failed on the blockchain and cannot be credited. Please send a new transaction.";
  if (r.includes("not found") || r.includes("no transaction"))
    return "No transaction was found for this hash. Please check that you copied the correct hash from your wallet.";
  if (r.includes("duplicate") || r.includes("already"))
    return "This transaction has already been processed.";
  return failureReason;
}

// ── Deposit history helpers ───────────────────────────────────────────────────

const depositStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  APPROVED:   { label: "Approved",   variant: "success"     },
  PENDING:    { label: "Pending",    variant: "warning"     },
  REJECTED:   { label: "Rejected",   variant: "destructive" },
  CONFIRMING: { label: "Confirming", variant: "secondary"   },
};

function fmt(amount: string) {
  const n = parseFloat(amount);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shorten(hash: string) {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function statusLabel(v: DepositVerificationStatus): string {
  const map: Record<string, string> = {
    CREATED: "Created", TX_SUBMITTED: "Submitted", VERIFYING: "Verifying",
    WAITING_CONFIRMATIONS: "Waiting Confirmations", CONFIRMED: "Confirmed",
    CREDITED: "Credited", COMPLETED: "Completed",
    FAILED: "Failed", REJECTED: "Rejected", EXPIRED: "Expired",
  };
  return map[v] ?? v;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const dim  = size === "md" ? "h-9 w-9" : "h-8 w-8";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <button
      onClick={copy}
      className={`flex ${dim} shrink-0 items-center justify-center rounded-lg transition-all`}
      style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37" }}
      aria-label="Copy"
    >
      {copied ? <CheckCheck className={icon} /> : <Copy className={icon} />}
    </button>
  );
}

// ── SubmitTxForm ──────────────────────────────────────────────────────────────

function SubmitTxForm({ onSubmitted }: { onSubmitted: (id: string) => void }) {
  const [txHash,  setTxHash]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<{ msg: string; isDuplicate: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txHash.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await submitDepositVerification(txHash.trim(), "BEP20");
      onSubmitted(result.verificationId);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Submission failed. Please try again.";
      const isDuplicate = raw.toLowerCase().includes("duplicate") ||
                          raw.toLowerCase().includes("already") ||
                          raw.toUpperCase().includes("DUPLICATE_TX_HASH");
      setError({ msg: raw, isDuplicate });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 mb-5 lg:mb-6"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid rgba(212,175,55,0.2)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
        Sent your USDT? Submit the TX hash
      </p>

      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
        {/* Network — static display */}
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.2)" }}
        >
          <span className="text-xs font-semibold" style={{ color: "#D4AF37" }}>Network:</span>
          <span className="text-xs font-bold"     style={{ color: "#D4AF37" }}>BEP20 (BSC)</span>
        </div>

        {/* TX Hash input */}
        <div>
          <div className="relative">
            <input
              type="text"
              value={txHash}
              onChange={(e) => { setTxHash(e.target.value); setError(null); }}
              placeholder="0x… paste your transaction hash"
              className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-xs"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${error ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: "hsl(var(--foreground))",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(212,175,55,0.4)"; }}
              onBlur={(e)  => { e.target.style.borderColor = error ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.08)"; }}
            />
          </div>
          {/* Helper text */}
          <p className="text-[11px] mt-2 leading-relaxed px-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>
            Only paste your BEP20 transaction hash. Prime Wave automatically reads the deposited amount directly from the blockchain.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
            style={{
              background: error.isDuplicate ? "rgba(212,175,55,0.07)" : "rgba(248,113,113,0.07)",
              border:     error.isDuplicate ? "1px solid rgba(212,175,55,0.25)" : "1px solid rgba(248,113,113,0.25)",
              color:      error.isDuplicate ? "#D4AF37" : "#f87171",
            }}
          >
            {error.isDuplicate
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            }
            <span>
              {error.isDuplicate
                ? "This transaction has already been submitted for verification. If it has been completed, it is already credited to your account."
                : error.msg}
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !txHash.trim()}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
            color: "#0E1B37",
          }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? "Submitting…" : "Submit for Verification"}
        </button>
      </form>
    </div>
  );
}

// ── VerificationTimeline ──────────────────────────────────────────────────────

function VerificationTimeline({ status }: { status: DepositVerificationStatusResult }) {
  const isError    = TERMINAL_ERROR.includes(status.verificationStatus as DepositVerificationStatus);
  const currentIdx = statusIdx(status.verificationStatus);

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "hsl(var(--card))",
        border: `1px solid ${isError ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.18)"}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
          Verification Progress
        </p>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{
            background: isError
              ? "rgba(248,113,113,0.15)"
              : status.isActive
                ? "rgba(212,175,55,0.15)"
                : "rgba(52,211,153,0.15)",
            color: isError
              ? "#f87171"
              : status.isActive
                ? "#D4AF37"
                : "#34d399",
          }}
        >
          {statusLabel(status.verificationStatus)}
        </span>
      </div>

      {/* Error state */}
      {isError && (
        <div
          className="flex items-start gap-3 rounded-xl p-3.5 mb-4"
          style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)" }}
        >
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#f87171" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#f87171" }}>
              Verification {statusLabel(status.verificationStatus)}
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              {humanReadableFailure(status.failureReason, status.verificationStatus)}
            </p>
          </div>
        </div>
      )}

      {/* Timeline steps */}
      {!isError && (
        <div className="space-y-0">
          {TIMELINE_STEPS.map((step, i) => {
            const done    = currentIdx >= step.doneAtIdx;
            const isLast  = i === TIMELINE_STEPS.length - 1;
            // "active" = this step is in-progress (not yet done, but the previous one is)
            const prevDone = i === 0 ? true : currentIdx >= TIMELINE_STEPS[i - 1].doneAtIdx;
            const active  = !done && prevDone && !isError;

            return (
              <div key={i} className="flex gap-3">
                {/* Left column: dot + connector */}
                <div className="flex flex-col items-center" style={{ width: 24, flexShrink: 0 }}>
                  {/* Dot */}
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${active ? "animate-pulse" : ""}`}
                    style={{
                      background: done
                        ? "rgba(52,211,153,0.15)"
                        : active
                          ? "rgba(212,175,55,0.2)"
                          : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${done ? "#34d399" : active ? "#D4AF37" : "rgba(255,255,255,0.1)"}`,
                      color: done ? "#34d399" : active ? "#D4AF37" : "rgba(255,255,255,0.2)",
                    }}
                  >
                    {done ? "✓" : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                  </div>
                  {/* Vertical connector */}
                  {!isLast && (
                    <div
                      className="flex-1 w-px my-1 transition-all duration-500"
                      style={{
                        background: done
                          ? "rgba(52,211,153,0.3)"
                          : "rgba(255,255,255,0.06)",
                        minHeight: 12,
                      }}
                    />
                  )}
                </div>

                {/* Right column: text + optional confirmation bar */}
                <div className={`flex-1 ${isLast ? "pb-0" : "pb-3"}`}>
                  <p
                    className="text-sm font-medium leading-tight"
                    style={{ color: done ? "hsl(var(--foreground))" : active ? "#D4AF37" : "hsl(var(--muted-foreground))", opacity: done || active ? 1 : 0.5 }}
                  >
                    {step.label}
                  </p>
                  {(done || active) && (
                    <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))", opacity: 0.7 }}>
                      {step.desc}
                    </p>
                  )}

                  {/* Confirmation progress — shown on the confirmation step when active or done */}
                  {step.isConfirm && (status.verificationStatus === "WAITING_CONFIRMATIONS" || done) && (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        <span>Block Confirmations</span>
                        <span style={{ color: done ? "#34d399" : "#D4AF37" }}>
                          {status.confirmations} / {status.requiredConfirmations}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, (status.confirmations / status.requiredConfirmations) * 100)}%`,
                            background: done
                              ? "linear-gradient(90deg, #34d399, #6ee7b7)"
                              : "linear-gradient(90deg, #D4AF37, #F3D37A)",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TransactionSummaryCard ────────────────────────────────────────────────────

function TransactionSummaryCard({ status, lastPolled }: { status: DepositVerificationStatusResult; lastPolled: Date | null }) {
  const rows: { label: string; value: string | null; mono?: boolean; copyable?: boolean }[] = [
    { label: "Transaction Hash",      value: status.txHash,            mono: true,  copyable: true },
    { label: "Network",               value: "BEP20 (BSC)",            mono: false },
    { label: "Sender Address",        value: status.senderAddress,     mono: true,  copyable: !!status.senderAddress },
    { label: "Recipient Address",     value: status.recipientAddress ?? DEPOSIT_ADDRESS, mono: true, copyable: true },
    { label: "Detected Amount",       value: status.blockchainAmount ? `${parseFloat(status.blockchainAmount).toFixed(2)} USDT` : null, mono: false },
    { label: "Confirmations",         value: `${status.confirmations} / ${status.requiredConfirmations}`, mono: false },
    { label: "Status",                value: statusLabel(status.verificationStatus), mono: false },
    { label: "Last Updated",          value: lastPolled ? lastPolled.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null, mono: false },
  ];

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
        Transaction Details
      </p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "rgba(170,179,197,0.45)" }}>
              {row.label}
            </p>
            {row.value !== null ? (
              <div className="flex items-center gap-2">
                <p
                  className={`text-xs leading-relaxed break-all flex-1 ${row.mono ? "font-mono" : "font-medium"}`}
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  {row.value}
                </p>
                {row.copyable && row.value && (
                  <CopyButton text={row.value} />
                )}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "rgba(170,179,197,0.35)" }}>—</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CompletionBanner ──────────────────────────────────────────────────────────

function CompletionBanner({
  status,
  onSubmitAnother,
}: {
  status: DepositVerificationStatusResult;
  onSubmitAnother: () => void;
}) {
  const amount = status.blockchainAmount
    ? `${parseFloat(status.blockchainAmount).toFixed(2)} USDT`
    : "your USDT";

  return (
    <div
      className="rounded-2xl p-6 mb-5 lg:mb-6 text-center"
      style={{
        background: "linear-gradient(135deg, rgba(52,211,153,0.07) 0%, rgba(52,211,153,0.03) 100%)",
        border: "1px solid rgba(52,211,153,0.3)",
        boxShadow: "0 4px 32px rgba(52,211,153,0.08)",
      }}
    >
      {/* Icon */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full mx-auto mb-4"
        style={{ background: "rgba(52,211,153,0.12)", border: "1.5px solid rgba(52,211,153,0.4)" }}
      >
        <CheckCircle2 className="h-7 w-7" style={{ color: "#34d399" }} />
      </div>

      <h3 className="text-lg font-bold font-heading mb-1" style={{ color: "#34d399" }}>
        Deposit Successfully Credited
      </h3>
      <p className="text-sm mb-5" style={{ color: "hsl(var(--muted-foreground))" }}>
        <span className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>{amount}</span>{" "}
        has been added to your Deposit Wallet.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href="/wallets/deposit"
          className="flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
            color: "#0E1B37",
          }}
        >
          <ExternalLink className="h-4 w-4" />
          View Deposit Wallet
        </a>
        <button
          onClick={onSubmitAnother}
          className="flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "hsl(var(--muted-foreground))",
          }}
        >
          Submit Another Deposit
        </button>
      </div>
    </div>
  );
}

// ── FailureBanner ─────────────────────────────────────────────────────────────

function FailureBanner({
  status,
  onTryAgain,
}: {
  status: DepositVerificationStatusResult;
  onTryAgain: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-5 mb-5 lg:mb-6"
      style={{
        background: "rgba(248,113,113,0.05)",
        border: "1px solid rgba(248,113,113,0.25)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)" }}
        >
          <XCircle className="h-4 w-4" style={{ color: "#f87171" }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#f87171" }}>
            Verification {statusLabel(status.verificationStatus)}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            {humanReadableFailure(status.failureReason, status.verificationStatus)}
          </p>
        </div>
      </div>

      <button
        onClick={onTryAgain}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <ChevronRight className="h-4 w-4" />
        Try a Different Transaction
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DepositWalletPage() {
  const [balance,        setBalance]        = useState<string | null>(null);
  const [deposits,       setDeposits]       = useState<DepositRequest[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verifStatus,    setVerifStatus]    = useState<DepositVerificationStatusResult | null>(null);
  const [lastPolled,     setLastPolled]     = useState<Date | null>(null);
  const [showForm,       setShowForm]       = useState(true);
  const [toasts,         setToasts]         = useState<{ id: number; message: string; ok: boolean }[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [walletData, historyData] = await Promise.all([
        getWallets(),
        getDepositHistory({ limit: 50 }),
      ]);
      setBalance(walletData.depositWallet);
      setDeposits(historyData.data);
    } catch { /* keep whatever we have */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll verification status while tracking
  useEffect(() => {
    if (!verificationId || !showForm === false) return;
    if (verifStatus?.isTerminal) return;

    const poll = async () => {
      try {
        const s = await getDepositVerificationStatus(verificationId);
        setVerifStatus(s);
        setLastPolled(new Date());
        if (s.isTerminal) {
          clearInterval(pollRef.current!);
          if (s.verificationStatus === "COMPLETED") {
            showToast("Deposit verified and credited to your wallet!", true);
            void load();
          }
        }
      } catch { /* ignore transient poll errors */ }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationId]);

  const showToast = (message: string, ok = true) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  };

  const handleVerificationSubmitted = (id: string) => {
    setVerificationId(id);
    setVerifStatus(null);
    setLastPolled(null);
    setShowForm(false);
    showToast("Transaction submitted — tracking verification in real time…", true);
  };

  const handleReset = () => {
    clearInterval(pollRef.current!);
    setVerificationId(null);
    setVerifStatus(null);
    setLastPolled(null);
    setShowForm(true);
  };

  const isTracking = !!verificationId && !showForm;
  const isCompleted = verifStatus?.verificationStatus === "COMPLETED";
  const isError     = verifStatus ? TERMINAL_ERROR.includes(verifStatus.verificationStatus as DepositVerificationStatus) : false;

  const displayBalance = loading ? "Loading…"
    : balance !== null
      ? `$${parseFloat(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "$0.00";

  return (
    <AppLayout pageTitle="Wallets" notificationCount={3}>
      <PageContainer>
        <WalletTabs />

        <WalletHero
          walletName="Deposit Wallet"
          balance={displayBalance}
          description="Your principal investment balance across all active plans"
        />

        {/* ── Company Wallet Address ────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-5 mb-5 lg:mb-6"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid rgba(212,175,55,0.2)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
            Send USDT to This Address
          </p>

          <div className="flex justify-center mb-4">
            <div className="rounded-2xl p-3" style={{ background: "#ffffff" }}>
              <img src={qrImage} alt="USDT BEP20 deposit QR code" width={140} height={140} style={{ display: "block" }} />
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-2.5 flex items-center gap-3 mb-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(212,175,55,0.1)" }}>
              <ArrowDownToLine className="h-3.5 w-3.5" style={{ color: "#D4AF37" }} />
            </div>
            <p className="font-mono text-xs text-foreground flex-1 break-all leading-relaxed">{DEPOSIT_ADDRESS}</p>
            <CopyButton text={DEPOSIT_ADDRESS} size="md" />
          </div>

          <div className="flex gap-2 mb-3">
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}
            >
              BEP20 (BSC)
            </span>
          </div>

          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)", color: "#fbbf24" }}
          >
            ⚠ Send only USDT on BEP20 (BSC). Other tokens will be lost permanently.
          </div>
        </div>

        {/* ── Completion Banner ─────────────────────────────────────────────── */}
        {isCompleted && verifStatus && (
          <CompletionBanner status={verifStatus} onSubmitAnother={handleReset} />
        )}

        {/* ── Failure Banner ────────────────────────────────────────────────── */}
        {isError && verifStatus && !isCompleted && (
          <FailureBanner status={verifStatus} onTryAgain={handleReset} />
        )}

        {/* ── Live Tracking: timeline + summary side by side ─────────────────── */}
        {isTracking && verifStatus && !isCompleted && !isError && (
          <>
            {/* Live tracking pulse indicator */}
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3 mb-4"
              style={{ background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.2)" }}
            >
              <div className="flex items-center gap-2 text-sm" style={{ color: "#D4AF37" }}>
                <Wifi className="h-4 w-4 animate-pulse" />
                <span>Live tracking — updates every 5 seconds</span>
              </div>
              <button
                onClick={handleReset}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Cancel
              </button>
            </div>

            {/* Two-column on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5 lg:mb-6">
              <VerificationTimeline status={verifStatus} />
              <TransactionSummaryCard status={verifStatus} lastPolled={lastPolled} />
            </div>
          </>
        )}

        {/* ── Completed tracking: show summary below the banner ─────────────── */}
        {isCompleted && verifStatus && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5 lg:mb-6">
            <VerificationTimeline status={verifStatus} />
            <TransactionSummaryCard status={verifStatus} lastPolled={lastPolled} />
          </div>
        )}

        {/* ── Error tracking: show summary below failure banner ─────────────── */}
        {isError && verifStatus && (
          <div className="mb-5 lg:mb-6">
            <TransactionSummaryCard status={verifStatus} lastPolled={lastPolled} />
          </div>
        )}

        {/* ── Submit TX hash form ───────────────────────────────────────────── */}
        {showForm && (
          <SubmitTxForm onSubmitted={handleVerificationSubmitted} />
        )}

        {/* ── Tracking initiated but no status yet (first poll pending) ────── */}
        {isTracking && !verifStatus && (
          <div
            className="flex items-center justify-center gap-3 rounded-2xl p-8 mb-5 lg:mb-6"
            style={{ background: "hsl(var(--card))", border: "1px solid rgba(212,175,55,0.2)" }}
          >
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#D4AF37" }} />
            <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Connecting to blockchain…
            </span>
          </div>
        )}

        {/* ── Deposit History ───────────────────────────────────────────────── */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold font-heading text-foreground">Deposit History</h2>
            <button
              onClick={() => void load()}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : deposits.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            >
              <Clock className="h-8 w-8 mx-auto mb-3 opacity-30" style={{ color: "#D4AF37" }} />
              <p className="text-sm font-medium mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>No deposits yet</p>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))", opacity: 0.6 }}>
                Send USDT to the address above, then submit your TX hash
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {deposits.map((dep) => {
                  const s = depositStatusConfig[dep.status] ?? depositStatusConfig.PENDING;
                  return (
                    <div
                      key={dep.id}
                      className="rounded-xl p-4"
                      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 2px 12px rgba(0,0,0,0.25)" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold font-heading" style={{ color: "#34d399" }}>+{fmt(dep.amount)}</span>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{dep.network}</span>
                        <span>{fmtDate(dep.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs font-mono truncate max-w-[160px]" style={{ color: "rgba(170,179,197,0.55)" }}>
                          Tx: {shorten(dep.txHash)}
                        </span>
                        <CopyButton text={dep.txHash} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div
                className="hidden md:block rounded-2xl overflow-hidden"
                style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                      {["Amount", "Network", "Status", "Date", "Tx Hash"].map((h) => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.map((dep, i) => {
                      const s = depositStatusConfig[dep.status] ?? depositStatusConfig.PENDING;
                      return (
                        <tr key={dep.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: i < deposits.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <td className="px-5 py-4"><span className="font-semibold font-mono" style={{ color: "#34d399" }}>+{fmt(dep.amount)}</span></td>
                          <td className="px-5 py-4"><span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37" }}>{dep.network}</span></td>
                          <td className="px-5 py-4"><Badge variant={s.variant}>{s.label}</Badge></td>
                          <td className="px-5 py-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtDate(dep.createdAt)}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs truncate max-w-[140px]" style={{ color: "rgba(170,179,197,0.55)" }}>{shorten(dep.txHash)}</span>
                              <CopyButton text={dep.txHash} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </PageContainer>

      {/* Toast */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-xl"
              style={{
                background: "#0E1B37",
                border: `1px solid ${t.ok ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"}`,
                color: t.ok ? "#34d399" : "#f87171",
              }}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
