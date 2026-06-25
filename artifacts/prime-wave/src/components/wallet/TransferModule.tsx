import { useState, useCallback } from "react";
import { ArrowDown, Send, Loader2, CheckCircle2 } from "lucide-react";
import { transfer } from "@/lib/api";

const FEE_RATE = 0.15;

export default function TransferModule({
  availableBalance = 0,
  onTransferSuccess,
}: {
  availableBalance?: number;
  onTransferSuccess?: (newIncomeBalance: number, newWithdrawalBalance: number) => void;
}) {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>();

  const amount = parseFloat(raw) || 0;
  const fee = amount * FEE_RATE;
  const net = amount - fee;
  const isValid = amount > 0 && amount <= availableBalance;

  const handleSubmit = useCallback(async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await transfer(amount);
      setSuccess(true);
      setRaw("");
      if (onTransferSuccess) {
        onTransferSuccess(
          parseFloat(result.incomeWalletBalance),
          parseFloat(result.withdrawalWalletBalance),
        );
      }
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }, [isValid, submitting, amount, onTransferSuccess]);

  return (
    <div
      className="rounded-2xl overflow-hidden mb-5 lg:mb-6"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        <div>
          <h3 className="text-base font-semibold font-heading text-foreground">Transfer Funds</h3>
          <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Income Wallet → Withdrawal Wallet
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
          <Send className="h-4 w-4" style={{ color: "#D4AF37" }} />
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Amount input */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
            Amount (USDT)
          </label>
          <div className="relative">
            <span
              className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              $
            </span>
            <input
              type="number"
              min="0"
              max={availableBalance}
              step="0.01"
              value={raw}
              onChange={(e) => { setRaw(e.target.value); setError(undefined); }}
              placeholder="0.00"
              className="w-full rounded-xl pl-8 pr-20 py-3.5 text-lg font-mono font-semibold text-foreground outline-none transition-all"
              style={{
                background: "hsl(var(--input))",
                border: `1px solid ${amount > availableBalance ? "rgba(248,113,113,0.5)" : amount > 0 ? "rgba(212,175,55,0.3)" : "hsl(var(--border))"}`,
              }}
            />
            <button
              type="button"
              onClick={() => setRaw(availableBalance.toFixed(2))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-1 rounded-md transition-colors"
              style={{ background: "rgba(212,175,55,0.15)", color: "#D4AF37" }}
            >
              MAX
            </button>
          </div>
          {amount > availableBalance && (
            <p className="text-xs mt-1.5" style={{ color: "#f87171" }}>
              Exceeds available balance of ${availableBalance.toFixed(2)}
            </p>
          )}
        </div>

        {/* Live preview */}
        {amount > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <PreviewRow label="Transfer Amount" value={`$${amount.toFixed(2)}`} />
            <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
            <PreviewRow label={`Management Fee (${(FEE_RATE * 100).toFixed(0)}%)`} value={`-$${fee.toFixed(2)}`} valueColor="#f87171" />
            <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Net Amount Received</span>
              <span className="text-lg font-bold font-heading" style={{ color: "#D4AF37" }}>
                ${net.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {amount === 0 && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <ArrowDown className="h-4 w-4 shrink-0" style={{ color: "rgba(170,179,197,0.4)" }} />
            <p className="text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>
              A 15% management fee applies. Enter an amount to see the breakdown.
            </p>
          </div>
        )}

        {/* Error */}
        {error && <p className="text-xs text-center" style={{ color: "#ef4444" }}>{error}</p>}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 justify-center py-2 rounded-xl" style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
            <CheckCircle2 className="h-4 w-4" style={{ color: "#34d399" }} />
            <p className="text-sm font-medium" style={{ color: "#34d399" }}>Transfer completed</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="w-full rounded-xl py-3.5 font-semibold text-sm transition-all duration-200 min-h-[52px] flex items-center justify-center gap-2"
          style={
            isValid && !submitting
              ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(170,179,197,0.4)", cursor: "not-allowed" }
          }
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Transferring…</>
          ) : (
            <><Send className="h-4 w-4" /> Transfer to Withdrawal Wallet</>
          )}
        </button>
      </div>
    </div>
  );
}

function PreviewRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between">
      <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
      <span className="text-sm font-mono font-semibold" style={{ color: valueColor ?? "hsl(var(--foreground))" }}>{value}</span>
    </div>
  );
}
