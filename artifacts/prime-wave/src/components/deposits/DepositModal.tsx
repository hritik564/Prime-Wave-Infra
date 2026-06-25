import { useState } from "react";
import { X, Copy, CheckCheck, ArrowDownToLine, AlertCircle } from "lucide-react";
import { createDepositRequest } from "@/lib/api";

const DEPOSIT_ADDRESS = "0xA1b2C3d4E5f6A7b8C9d0E1f2A3b4C5d6E7f8A9b0";
const NETWORK_LABEL   = "BEP20 (BSC)";

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function DepositModal({ onClose, onSuccess }: DepositModalProps) {
  const [amount, setAmount]   = useState("");
  const [txHash, setTxHash]   = useState("");
  const [touched, setTouched] = useState({ amount: false, txHash: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = parseInt(amount, 10) || 0;

  const amountError =
    !touched.amount ? null
    : amountNum <= 0 ? "Amount is required"
    : amountNum < 100 ? "Minimum deposit is $100"
    : amountNum % 100 !== 0 ? "Amount must be a multiple of $100 (e.g. 100, 200, 500)"
    : null;

  const txHashError =
    !touched.txHash ? null
    : txHash.trim().length === 0 ? "Transaction hash is required"
    : null;

  const isValid =
    amountNum >= 100 &&
    amountNum % 100 === 0 &&
    txHash.trim().length > 0 &&
    !submitting;

  const handleSubmit = async () => {
    setTouched({ amount: true, txHash: true });
    if (!isValid) return;
    setSubmitting(true);
    try {
      await createDepositRequest({
        amount: amountNum,
        network: "BEP20",
        txHash: txHash.trim(),
        companyWallet: DEPOSIT_ADDRESS,
      });
      onSuccess("Deposit submitted successfully. Awaiting admin approval.");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      setError(msg);
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
          {/* Deposit Address */}
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

            {/* Address row */}
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

            {/* Warning */}
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

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              Amount (USDT)
            </label>
            <div className="relative">
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                style={{ color: "rgba(170,179,197,0.5)" }}
              >
                $
              </span>
              <input
                type="number"
                min={100}
                step={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
                placeholder="100"
                className="w-full rounded-xl pl-7 pr-4 py-3.5 text-sm font-semibold outline-none transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${amountError ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: "hsl(var(--foreground))",
                }}
              />
            </div>
            {amountError && (
              <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: "#ef4444" }}>
                <AlertCircle className="h-3 w-3 shrink-0" /> {amountError}
              </p>
            )}
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(170,179,197,0.45)" }}>
              Minimum $100 · Multiples of $100 only
            </p>
          </div>

          {/* Transaction Hash */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              Transaction Hash
            </label>
            <input
              type="text"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, txHash: true }))}
              placeholder="0x..."
              className="w-full rounded-xl px-4 py-3.5 font-mono text-xs outline-none transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${txHashError ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: "hsl(var(--foreground))",
              }}
            />
            {txHashError && (
              <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: "#ef4444" }}>
                <AlertCircle className="h-3 w-3 shrink-0" /> {txHashError}
              </p>
            )}
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(170,179,197,0.45)" }}>
              Copy the transaction hash from your wallet or exchange after sending.
            </p>
          </div>

          {/* Network info */}
          <div
            className="grid grid-cols-2 gap-3 rounded-xl p-3.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {[
              { label: "Network",  value: NETWORK_LABEL },
              { label: "Token",    value: "USDT" },
              { label: "Status",   value: "Pending review" },
              { label: "Processing", value: "1–24 hours" },
            ].map((r) => (
              <div key={r.label}>
                <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "rgba(170,179,197,0.4)" }}>{r.label}</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>{r.value}</p>
              </div>
            ))}
          </div>

          {/* API error */}
          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
              style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full rounded-xl py-4 font-semibold text-sm transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            style={
              isValid
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
            {submitting ? "Submitting…" : "Submit Deposit"}
          </button>

          {/* Footer */}
          <p className="text-center text-[11px]" style={{ color: "rgba(170,179,197,0.4)" }}>
            Your deposit will be reviewed within 1–24 hours. You will receive a notification on approval.
          </p>
        </div>
      </div>
    </div>
  );
}
