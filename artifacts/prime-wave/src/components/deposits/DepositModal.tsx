import { useState } from "react";
import { X, Copy, CheckCheck, ArrowDownToLine, AlertCircle, Send, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { submitDepositVerification } from "@/lib/api";

const DEPOSIT_ADDRESS = "0x543780EF4cda835F3541A1BdB305f4119f658BDb";
const NETWORK_LABEL   = "BEP20 (BSC)";

function CopyButton({ text, full = false }: { text: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  if (full) {
    return (
      <button
        onClick={copy}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all duration-200"
        style={{
          background: copied ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)",
          border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "rgba(212,175,55,0.25)"}`,
          color: copied ? "#34d399" : "#D4AF37",
        }}
      >
        {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied!" : "Copy Address"}
      </button>
    );
  }
  return (
    <button
      onClick={copy}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all"
      style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37" }}
      aria-label="Copy address"
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

interface DepositModalProps {
  onClose:   () => void;
  onSuccess: (message: string) => void;
}

export default function DepositModal({ onClose, onSuccess }: DepositModalProps) {
  const [txHash,     setTxHash]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [submitted,  setSubmitted]  = useState(false);

  const isDuplicate = (msg: string) =>
    msg.toLowerCase().includes("duplicate") ||
    msg.toLowerCase().includes("already") ||
    msg.toUpperCase().includes("DUPLICATE_TX_HASH");

  const handleSubmit = async () => {
    if (!txHash.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDepositVerification(txHash.trim(), "BEP20");
      setSubmitted(true);
      onSuccess("Transaction submitted — track progress in your Deposit Wallet.");
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Submission failed. Please try again.";
      if (isDuplicate(raw)) {
        setError("This transaction has already been submitted for verification. Check your Deposit Wallet page to see its progress.");
      } else {
        setError(raw);
      }
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      style={{ background: "rgba(5,11,26,0.85)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative w-full max-w-lg rounded-t-3xl lg:rounded-3xl overflow-hidden"
        style={{
          background: "#0E1B37",
          border: "1px solid rgba(212,175,55,0.2)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <h2 className="text-lg font-bold font-heading text-foreground">New Deposit</h2>
            <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              USDT · {NETWORK_LABEL}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <X className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {submitted ? (
            /* ── Success state ─────────────────────────────────────────────── */
            <div className="text-center py-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full mx-auto mb-4"
                style={{ background: "rgba(52,211,153,0.12)", border: "1.5px solid rgba(52,211,153,0.4)" }}
              >
                <CheckCircle2 className="h-7 w-7" style={{ color: "#34d399" }} />
              </div>
              <h3 className="text-base font-bold mb-2" style={{ color: "#34d399" }}>Transaction Submitted</h3>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                Prime Wave is now verifying your deposit on-chain. Visit your Deposit Wallet to track its progress in real time.
              </p>
              <a
                href="/wallets/deposit"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
                  color: "#0E1B37",
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Track Your Deposit
              </a>
            </div>
          ) : (
            <>
              {/* ── Deposit address ──────────────────────────────────────────── */}
              <div
                className="rounded-2xl p-4 space-y-3"
                style={{ background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.18)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(212,175,55,0.12)" }}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" style={{ color: "#D4AF37" }} />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.7)" }}>
                    Deposit Address
                  </p>
                  <span
                    className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37" }}
                  >
                    {NETWORK_LABEL}
                  </span>
                </div>

                <div
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ background: "rgba(0,0,0,0.2)" }}
                >
                  <p className="flex-1 font-mono text-xs break-all" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {DEPOSIT_ADDRESS}
                  </p>
                  <CopyButton text={DEPOSIT_ADDRESS} />
                </div>

                <CopyButton text={DEPOSIT_ADDRESS} full />

                <div
                  className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)" }}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
                  <span style={{ color: "#fbbf24" }}>
                    Send <strong>USDT BEP20 only</strong>. Other tokens or networks will be permanently lost.
                  </span>
                </div>
              </div>

              {/* ── Transaction hash input ───────────────────────────────────── */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Transaction Hash
                </label>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => { setTxHash(e.target.value); setError(null); }}
                  placeholder="0x…"
                  className="w-full rounded-xl px-4 py-3.5 font-mono text-xs outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                    color: "hsl(var(--foreground))",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(212,175,55,0.4)"; }}
                  onBlur={(e)  => { e.target.style.borderColor = error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"; }}
                />
                <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "rgba(170,179,197,0.45)" }}>
                  Only paste your BEP20 transaction hash. Prime Wave automatically reads the deposited amount directly from the blockchain.
                </p>
              </div>

              {/* ── API error ────────────────────────────────────────────────── */}
              {error && (
                <div
                  className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
                  style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* ── Submit ───────────────────────────────────────────────────── */}
              <button
                onClick={() => { void handleSubmit(); }}
                disabled={!txHash.trim() || submitting}
                className="w-full rounded-xl py-4 font-semibold text-sm transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                style={
                  txHash.trim() && !submitting
                    ? {
                        background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
                        color: "#0E1B37",
                        boxShadow: "0 4px 20px rgba(212,175,55,0.35)",
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(170,179,197,0.4)",
                        cursor: submitting ? "default" : "not-allowed",
                      }
                }
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Submitting…" : "Submit for Verification"}
              </button>

              <p className="text-center text-[11px]" style={{ color: "rgba(170,179,197,0.4)" }}>
                Prime Wave reads the amount directly from the blockchain — no manual entry required.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
