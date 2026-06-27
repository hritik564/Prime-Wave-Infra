import { useState, useCallback, useEffect, useRef } from "react";
import { Send, Loader2, CheckCircle2, Clock, TrendingUp, RefreshCw } from "lucide-react";
import { transfer, type IncomeTransfer } from "@/lib/api";

const GOLD = "#D4AF37";
const TOTAL_HOURS = 72;

function fmt(n: number | string) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(done: number) {
  return `${Math.min(100, done).toFixed(1)}%`;
}

function useCountdown(nextReleaseAt: string | null | undefined) {
  const [secs, setSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!nextReleaseAt) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(nextReleaseAt).getTime() - Date.now()) / 1000));
      setSecs(diff);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [nextReleaseAt]);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ActiveTransferCard({ t }: { t: IncomeTransfer }) {
  const countdown = useCountdown(t.status === "ACTIVE" ? t.nextReleaseAt : null);

  const barPct = t.completionPercent;

  return (
    <div
      className="rounded-2xl overflow-hidden mb-4"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {t.status === "COMPLETED" ? "Transfer Completed" : "Transfer In Progress"}
          </h4>
          <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Started {new Date(t.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div
          className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
          style={
            t.status === "COMPLETED"
              ? { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }
              : { background: "rgba(212,175,55,0.12)", color: GOLD, border: "1px solid rgba(212,175,55,0.3)" }
          }
        >
          {t.status === "COMPLETED" ? "Completed" : "Active"}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span style={{ color: "hsl(var(--muted-foreground))" }}>Progress</span>
            <span className="font-semibold" style={{ color: GOLD }}>{pct(barPct)}</span>
          </div>
          <div className="rounded-full overflow-hidden h-2" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barPct}%`, background: `linear-gradient(90deg, ${GOLD} 0%, #F3D37A 100%)` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Transfer Amount", value: fmt(t.totalAmount) },
            { label: "Released",        value: fmt(t.releasedAmount), color: "#34d399" },
            { label: "Remaining",       value: fmt(t.remainingAmount) },
            { label: "Hourly Release",  value: fmt(t.hourlySlice) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{s.label}</p>
              <p className="text-sm font-bold font-mono" style={{ color: s.color ?? "hsl(var(--foreground))" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Hours + countdown */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <TrendingUp className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>Hours</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {t.hoursCompleted} / {TOTAL_HOURS}
              </p>
            </div>
          </div>
          {t.status === "ACTIVE" && (
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Clock className="h-4 w-4 shrink-0" style={{ color: "#60a5fa" }} />
              <div>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>Next Release</p>
                <p className="text-sm font-bold font-mono text-foreground">{countdown}</p>
              </div>
            </div>
          )}
        </div>

        {/* Est. completion */}
        {t.status === "ACTIVE" && t.estimatedCompletionAt && (
          <p className="text-xs text-center" style={{ color: "rgba(170,179,197,0.5)" }}>
            Est. completion: {new Date(t.estimatedCompletionAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}

        {/* Recent releases */}
        {t.releases.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>Recent Releases</p>
            <div className="space-y-1.5">
              {t.releases.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span style={{ color: "rgba(170,179,197,0.6)" }}>
                    Hour {r.hourNumber} · {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="font-mono font-semibold" style={{ color: "#34d399" }}>+{fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransferModule({
  availableBalance = 0,
  transfers = [],
  onTransferCreated,
}: {
  availableBalance?: number;
  transfers?: IncomeTransfer[];
  onTransferCreated?: (newIncomeBalance: number) => void;
}) {
  const [raw, setRaw]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState<string>();

  const amount  = parseFloat(raw) || 0;
  const isValid = amount > 0 && amount <= availableBalance;

  const activeTransfers    = transfers.filter((t) => t.status === "ACTIVE");
  const completedTransfers = transfers.filter((t) => t.status === "COMPLETED");

  const handleSubmit = useCallback(async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await transfer(amount);
      setSuccess(true);
      setRaw("");
      onTransferCreated?.(parseFloat(result.incomeWalletBalance));
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  }, [isValid, submitting, amount, onTransferCreated]);

  return (
    <div>
      {/* ── How it works info box ── */}
      <div
        className="rounded-xl px-4 py-3.5 mb-5 flex items-start gap-3"
        style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)" }}
      >
        <RefreshCw className="h-4 w-4 mt-0.5 shrink-0" style={{ color: GOLD }} />
        <p className="text-xs leading-relaxed" style={{ color: "rgba(170,179,197,0.7)" }}>
          Transfers enter a <strong style={{ color: GOLD }}>72-hour release queue</strong>. Exactly{" "}
          <strong style={{ color: GOLD }}>1/72</strong> of your amount is credited to your Withdrawal Wallet
          every hour. No fee applies.
        </p>
      </div>

      {/* ── Active transfers ── */}
      {activeTransfers.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">
            Active Transfers ({activeTransfers.length})
          </p>
          {activeTransfers.map((t) => <ActiveTransferCard key={t.id} t={t} />)}
        </div>
      )}

      {/* ── Create new transfer ── */}
      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <div>
            <h3 className="text-base font-semibold font-heading text-foreground">New Transfer</h3>
            <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
              Income Wallet → 72-hour queue → Withdrawal Wallet
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
            <Send className="h-4 w-4" style={{ color: GOLD }} />
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
              Amount (USDT)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>$</span>
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
                style={{ background: "rgba(212,175,55,0.15)", color: GOLD }}
              >
                MAX
              </button>
            </div>
            {amount > availableBalance && (
              <p className="text-xs mt-1.5" style={{ color: "#f87171" }}>
                Exceeds available balance of {fmt(availableBalance)}
              </p>
            )}
          </div>

          {amount > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <PreviewRow label="Transfer Amount" value={fmt(amount)} />
              <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
              <PreviewRow label="Hourly Release (÷72)" value={`≈${fmt(amount / TOTAL_HOURS)}`} />
              <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">You Receive (72 hrs)</span>
                <span className="text-lg font-bold font-heading" style={{ color: GOLD }}>{fmt(amount)}</span>
              </div>
            </div>
          )}

          {error  && <p className="text-xs text-center" style={{ color: "#ef4444" }}>{error}</p>}

          {success && (
            <div className="flex items-center gap-2 justify-center py-2 rounded-xl" style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
              <CheckCircle2 className="h-4 w-4" style={{ color: "#34d399" }} />
              <p className="text-sm font-medium" style={{ color: "#34d399" }}>Transfer queued! Releases start in ~1 hour.</p>
            </div>
          )}

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
              <><Loader2 className="h-4 w-4 animate-spin" /> Queuing Transfer…</>
            ) : (
              <><Send className="h-4 w-4" /> Start 72-Hour Transfer</>
            )}
          </button>
        </div>
      </div>

      {/* ── Completed transfers ── */}
      {completedTransfers.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">
            Completed Transfers ({completedTransfers.length})
          </p>
          {completedTransfers.slice(0, 3).map((t) => <ActiveTransferCard key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between">
      <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
      <span className="text-sm font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}
