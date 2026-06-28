import { useState, useCallback, useEffect, useRef } from "react";
import QRCode from "react-qr-code";
import {
  Copy, CheckCheck, ArrowDownToLine, CheckCircle2, Loader2,
  AlertTriangle, Clock, Wifi, RefreshCw, Send,
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

const DEPOSIT_ADDRESS = "0xA1b2C3d4E5f6A7b8C9d0E1f2A3b4C5d6E7f8A9b0";
const POLL_INTERVAL_MS = 5_000;

// ── Status config ─────────────────────────────────────────────────────────────

const depositStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  APPROVED:  { label: "Approved",  variant: "success"     },
  PENDING:   { label: "Pending",   variant: "warning"     },
  REJECTED:  { label: "Rejected",  variant: "destructive" },
  CONFIRMING:{ label: "Confirming",variant: "secondary"   },
};

const verificationSteps: { status: DepositVerificationStatus[]; label: string; desc: string }[] = [
  { status: ["TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS", "CONFIRMED", "CREDITED", "COMPLETED"],
    label: "Submitted",   desc: "Transaction hash received" },
  { status: ["VERIFYING", "WAITING_CONFIRMATIONS", "CONFIRMED", "CREDITED", "COMPLETED"],
    label: "Locating TX", desc: "Scanning blockchain for your transaction" },
  { status: ["WAITING_CONFIRMATIONS", "CONFIRMED", "CREDITED", "COMPLETED"],
    label: "Confirming",  desc: "Waiting for block confirmations" },
  { status: ["CONFIRMED", "CREDITED", "COMPLETED"],
    label: "Verified",    desc: "Transaction confirmed on-chain" },
  { status: ["CREDITED", "COMPLETED"],
    label: "Credited",    desc: "Funds added to your deposit wallet" },
  { status: ["COMPLETED"],
    label: "Completed",   desc: "Verification complete" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: string) {
  const n = parseFloat(amount);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const dim = size === "md" ? "h-9 w-9" : "h-8 w-8";
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

function VerificationTimeline({ status }: { status: DepositVerificationStatusResult }) {
  const isError = ["FAILED", "REJECTED", "EXPIRED"].includes(status.verificationStatus);

  return (
    <div
      className="rounded-2xl p-5 mb-5 lg:mb-6"
      style={{
        background: "hsl(var(--card))",
        border: `1px solid ${isError ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.2)"}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>
          Verification Progress
        </p>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{
            background: isError ? "rgba(248,113,113,0.15)" : status.isActive ? "rgba(212,175,55,0.15)" : "rgba(52,211,153,0.15)",
            color: isError ? "#f87171" : status.isActive ? "#D4AF37" : "#34d399",
          }}
        >
          {statusLabel(status.verificationStatus)}
        </span>
      </div>

      {/* Confirmations progress (only in WAITING_CONFIRMATIONS) */}
      {status.verificationStatus === "WAITING_CONFIRMATIONS" && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            <span>Block Confirmations</span>
            <span style={{ color: "#D4AF37" }}>{status.confirmations} / {status.requiredConfirmations}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (status.confirmations / status.requiredConfirmations) * 100)}%`,
                background: "linear-gradient(90deg, #D4AF37, #F3D37A)",
              }}
            />
          </div>
        </div>
      )}

      {/* Steps */}
      {!isError && (
        <div className="space-y-3">
          {verificationSteps.map((step, i) => {
            const done    = step.status.includes(status.verificationStatus);
            const current = done && i < verificationSteps.length - 1 && !verificationSteps[i + 1].status.includes(status.verificationStatus);
            return (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all"
                  style={{
                    background: done ? (current ? "rgba(212,175,55,0.2)" : "rgba(52,211,153,0.15)") : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${done ? (current ? "#D4AF37" : "#34d399") : "rgba(255,255,255,0.1)"}`,
                    color: done ? (current ? "#D4AF37" : "#34d399") : "rgba(255,255,255,0.2)",
                  }}
                >
                  {done && !current ? "✓" : i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: done ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                    {step.label}
                    {current && <Loader2 className="inline ml-1.5 h-3 w-3 animate-spin" style={{ color: "#D4AF37" }} />}
                  </p>
                  {current && (
                    <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{step.desc}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: "rgba(248,113,113,0.07)" }}>
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#f87171" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#f87171" }}>Verification {statusLabel(status.verificationStatus)}</p>
            {status.failureReason && (
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{status.failureReason}</p>
            )}
          </div>
        </div>
      )}

      {/* TX hash */}
      <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="text-xs font-mono truncate flex-1" style={{ color: "rgba(170,179,197,0.5)" }}>
          {status.txHash}
        </span>
        <CopyButton text={status.txHash} />
      </div>
    </div>
  );
}

function SubmitTxForm({ onSubmitted }: { onSubmitted: (id: string) => void }) {
  const [txHash,    setTxHash]    = useState("");
  const [network,   setNetwork]   = useState("BEP20");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txHash.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await submitDepositVerification(txHash.trim(), network);
      onSubmitted(result.verificationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
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
        {/* Network selector */}
        <div className="flex gap-2">
          {["BEP20", "TRC20"].map((net) => (
            <button
              key={net}
              type="button"
              onClick={() => setNetwork(net)}
              className="flex-1 py-2 text-xs font-semibold rounded-xl transition-all"
              style={{
                background: network === net ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${network === net ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.07)"}`,
                color: network === net ? "#D4AF37" : "hsl(var(--muted-foreground))",
              }}
            >
              {net}
            </button>
          ))}
        </div>

        {/* TX Hash input */}
        <div className="relative">
          <input
            type="text"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="0x... (paste your transaction hash)"
            className="w-full rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all placeholder:text-xs"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "hsl(var(--foreground))",
            }}
            onFocus={(e) => { e.target.style.borderColor = "rgba(212,175,55,0.4)"; }}
            onBlur={(e)  => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; }}
          />
        </div>

        {error && (
          <p className="text-xs px-1" style={{ color: "#f87171" }}>{error}</p>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DepositWalletPage() {
  const [balance,         setBalance]         = useState<string | null>(null);
  const [deposits,        setDeposits]        = useState<DepositRequest[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [verificationId,  setVerificationId]  = useState<string | null>(null);
  const [verifStatus,     setVerifStatus]     = useState<DepositVerificationStatusResult | null>(null);
  const [toasts,          setToasts]          = useState<{ id: number; message: string; ok: boolean }[]>([]);
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

  // Poll verification status while active
  useEffect(() => {
    if (!verificationId) return;
    if (verifStatus?.isTerminal) return;

    const poll = async () => {
      try {
        const s = await getDepositVerificationStatus(verificationId);
        setVerifStatus(s);
        if (s.isTerminal) {
          clearInterval(pollRef.current!);
          if (s.verificationStatus === "COMPLETED") {
            showToast("Deposit verified and credited to your wallet!", true);
            void load();
          }
        }
      } catch { /* ignore poll errors */ }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationId]);

  const showToast = (message: string, ok = true) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  };

  const handleVerificationSubmitted = (id: string) => {
    setVerificationId(id);
    setVerifStatus(null);
    showToast("Transaction submitted — tracking verification progress…", true);
  };

  const displayBalance = loading ? "Loading…" : balance !== null
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

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            <div className="rounded-2xl p-3" style={{ background: "#ffffff" }}>
              <QRCode
                value={DEPOSIT_ADDRESS}
                size={140}
                style={{ display: "block" }}
              />
            </div>
          </div>

          {/* Address row */}
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

          {/* Network badges */}
          <div className="flex gap-2 mb-3">
            {["BEP20 (BSC)", "TRC20"].map((net) => (
              <span
                key={net}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}
              >
                {net}
              </span>
            ))}
          </div>

          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)", color: "#fbbf24" }}
          >
            ⚠ Send only USDT on BEP20 or TRC20. Other tokens will be lost permanently.
          </div>
        </div>

        {/* ── Verification Timeline (if tracking) ──────────────────────────── */}
        {verifStatus && (
          <VerificationTimeline status={verifStatus} />
        )}

        {/* ── Submit TX hash form ───────────────────────────────────────────── */}
        {(!verificationId || verifStatus?.isTerminal) && (
          <SubmitTxForm onSubmitted={handleVerificationSubmitted} />
        )}

        {/* Active verification in progress indicator */}
        {verificationId && verifStatus && !verifStatus.isTerminal && (
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3 mb-5 lg:mb-6"
            style={{ background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.2)" }}
          >
            <div className="flex items-center gap-2 text-sm" style={{ color: "#D4AF37" }}>
              <Wifi className="h-4 w-4 animate-pulse" />
              <span>Live tracking — updates every 5 seconds</span>
            </div>
            <button
              onClick={() => { setVerificationId(null); setVerifStatus(null); }}
              className="text-xs"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Track another
            </button>
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
