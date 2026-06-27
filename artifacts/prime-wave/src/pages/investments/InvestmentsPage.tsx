import { useState, useMemo, useCallback, useEffect } from "react";
import {
  TrendingUp, RefreshCw, Zap, Lock, Plus, X, Wallet, CheckCircle2, Loader2,
  ChevronDown, Clock,
} from "lucide-react";
import { Link } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import InvestmentTabs from "@/components/investments/InvestmentTabs";
import { Badge } from "@/components/ui/badge";
import {
  listInvestments, createInvestment, claimRoi, claimPrincipal, toggleAutoCompound,
  getWallets, getInvestmentEarnings, type ApiInvestment, type EarningsEntry,
} from "@/lib/api";

/* ─── Plan config ─── */
interface PlanInfo {
  key: "PLAN_90" | "PLAN_180" | "PLAN_270" | "PLAN_360";
  name: string;
  dailyRoi: number;
  duration: number;
  label: string;
}

const PLANS: PlanInfo[] = [
  { key: "PLAN_90",  name: "Prime Wave 90",  dailyRoi: 0.5, duration: 90,  label: "90-day lock"  },
  { key: "PLAN_180", name: "Prime Wave 180", dailyRoi: 0.6, duration: 180, label: "180-day lock" },
  { key: "PLAN_270", name: "Prime Wave 270", dailyRoi: 0.7, duration: 270, label: "270-day lock" },
  { key: "PLAN_360", name: "Prime Wave 360", dailyRoi: 0.8, duration: 360, label: "360-day lock" },
];

const PLAN_MAP: Record<string, PlanInfo> = Object.fromEntries(PLANS.map(p => [p.key, p]));

/* ─── Helpers ─── */
function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysElapsed(startedAt: string): number {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000);
}

/* ─── Toast ─── */
interface ToastItem { id: number; message: string; type: "success" | "error" }

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-2xl px-4 py-3.5 shadow-xl pointer-events-auto"
          style={{
            background: t.type === "success" ? "rgba(16,40,30,0.97)" : "rgba(40,16,16,0.97)",
            border: `1px solid ${t.type === "success" ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`,
            backdropFilter: "blur(12px)",
          }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: t.type === "success" ? "#34d399" : "#ef4444" }} />
          <p className="text-sm font-medium" style={{ color: t.type === "success" ? "#34d399" : "#ef4444" }}>
            {t.message}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─── Progress Bar ─── */
function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
      <div
        className="h-2 rounded-full transition-all duration-500"
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: "linear-gradient(90deg, #D4AF37 0%, #F3D37A 100%)",
          boxShadow: "0 0 8px rgba(212,175,55,0.4)",
        }}
      />
    </div>
  );
}

/* ─── Claim button ─── */
function ClaimBtn({
  label, available, hint, loading, onClaim,
}: {
  label: string; available: boolean; hint: string; loading?: boolean; onClaim: () => void;
}) {
  return (
    <div className="flex-1">
      <button
        onClick={onClaim}
        disabled={!available || loading}
        className="w-full rounded-xl py-2.5 text-xs font-semibold transition-all duration-200 min-h-[44px] flex items-center justify-center gap-1.5"
        style={
          available && !loading
            ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 2px 10px rgba(212,175,55,0.25)" }
            : { background: "rgba(255,255,255,0.05)", color: "rgba(170,179,197,0.35)", cursor: "not-allowed", border: "1px solid rgba(255,255,255,0.05)" }
        }
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : label}
      </button>
      <p className="text-[10px] mt-1.5 text-center leading-snug px-1" style={{ color: "rgba(170,179,197,0.45)" }}>{hint}</p>
    </div>
  );
}

/* ─── Investment Card ─── */
function InvestmentCard({
  inv,
  onToggleAutoCompound,
  onClaimRoi,
  onClaimPrincipal,
  roiLoading,
  principalLoading,
  acLoading,
}: {
  inv: ApiInvestment;
  onToggleAutoCompound: () => void;
  onClaimRoi: () => void;
  onClaimPrincipal: () => void;
  roiLoading: boolean;
  principalLoading: boolean;
  acLoading: boolean;
}) {
  const plan = PLAN_MAP[inv.planType];
  const days = daysElapsed(inv.startedAt);
  const daysCompleted = Math.min(days, inv.durationDays);
  const daysRemaining = Math.max(0, inv.durationDays - days);
  const pct = Math.round((daysCompleted / inv.durationDays) * 100);
  const claimableRoi = parseFloat(inv.claimableROI);
  const isCompleted = inv.status === "COMPLETED";
  const isMatured = inv.status === "MATURED";

  const [showHistory, setShowHistory] = useState(false);
  const [earnings, setEarnings] = useState<EarningsEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const handleToggleHistory = useCallback(() => {
    if (!showHistory && !historyLoaded) {
      setHistoryLoading(true);
      getInvestmentEarnings(inv.id)
        .then((r) => { setEarnings(r.data); setHistoryLoaded(true); })
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    }
    setShowHistory((h) => !h);
  }, [showHistory, historyLoaded, inv.id]);

  return (
    <div
      className="rounded-2xl overflow-hidden mb-4"
      style={{
        background: "hsl(var(--card))",
        border: `1px solid ${isCompleted ? "rgba(52,211,153,0.2)" : "hsl(var(--border))"}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Card header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0" style={{ background: isCompleted ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)" }}>
            <TrendingUp className="h-5 w-5" style={{ color: isCompleted ? "#34d399" : "#D4AF37" }} />
          </div>
          <div>
            <p className="text-base font-semibold font-heading text-foreground">{plan?.name ?? inv.planType}</p>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              {plan?.dailyRoi ?? parseFloat(inv.dailyROI)}% Daily ROI · {inv.durationDays}-day plan
            </p>
          </div>
        </div>
        <Badge variant={isCompleted ? "success" : isMatured ? "secondary" : "secondary"}>
          {isCompleted ? "Completed" : isMatured ? "Matured" : "Active"}
        </Badge>
      </div>

      <div className="p-5 space-y-4">
        {/* Stat row — auto compound shows compounded value instead of claimable */}
        {inv.autoCompound && !isCompleted && !isMatured ? (
          (() => {
            const original  = parseFloat(inv.amount);
            const current   = parseFloat(inv.currentPrincipal);
            const gained    = current - original;
            const gainedPct = original > 0 ? ((gained / original) * 100).toFixed(2) : "0.00";
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Original",      value: fmt(original), color: "rgba(255,255,255,0.7)" },
                    { label: "Current Value", value: fmt(current),  color: "#D4AF37" },
                    { label: "Days Left",     value: `${daysRemaining}d`, color: "#D4AF37" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.5)" }}>{s.label}</p>
                      <p className="text-sm font-bold font-heading" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {gained > 0 && (
                  <div className="flex items-center justify-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.18)" }}>
                    <RefreshCw className="h-3 w-3 shrink-0" style={{ color: "#D4AF37" }} />
                    <span className="text-xs font-semibold" style={{ color: "#D4AF37" }}>
                      +{fmt(gained)} compounded ({gainedPct}% growth)
                    </span>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Invested",   value: fmt(parseFloat(inv.amount)),       color: "rgba(255,255,255,0.9)" },
              { label: "Claimable",  value: fmt(claimableRoi),                 color: "#34d399" },
              { label: "Days Left",  value: isCompleted ? "Done" : `${daysRemaining}d`, color: isCompleted ? "#34d399" : "#D4AF37" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.5)" }}>{s.label}</p>
                <p className="text-sm font-bold font-heading" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Progress</span>
            <span className="text-xs font-semibold" style={{ color: "#D4AF37" }}>{daysCompleted}/{inv.durationDays} days · {pct}%</span>
          </div>
          <ProgressBar pct={pct} />
        </div>

        {/* Per-investment Auto Compound toggle */}
        {!isCompleted && (
          <div
            className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{
              background: inv.autoCompound ? "rgba(212,175,55,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${inv.autoCompound ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.05)"}`,
              transition: "background 0.25s, border-color 0.25s",
            }}
          >
            <div className="flex items-center gap-2.5">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" style={{ color: inv.autoCompound ? "#D4AF37" : "rgba(170,179,197,0.4)" }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: inv.autoCompound ? "#F3D37A" : "hsl(var(--muted-foreground))" }}>
                  Auto Compound
                </p>
                <p className="text-[10px] leading-snug" style={{ color: "rgba(170,179,197,0.45)" }}>
                  {inv.autoCompound ? "ROI compounds automatically every 12 hours" : "ROI can be claimed manually"}
                </p>
              </div>
            </div>
            <button
              onClick={onToggleAutoCompound}
              disabled={acLoading}
              className="relative shrink-0 h-6 w-10 rounded-full transition-all duration-300 ml-3"
              style={{
                background: inv.autoCompound ? "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)" : "rgba(255,255,255,0.1)",
                boxShadow: inv.autoCompound ? "0 0 8px rgba(212,175,55,0.35)" : "none",
                opacity: acLoading ? 0.5 : 1,
              }}
              aria-label={`Toggle auto compound for ${plan?.name}`}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full shadow-sm transition-all duration-300"
                style={{ background: "#fff", left: inv.autoCompound ? "calc(100% - 22px)" : "2px" }}
              />
            </button>
          </div>
        )}

        {/* Compound earnings history — only when autoCompound is ON and plan active */}
        {inv.autoCompound && !isCompleted && !isMatured && (
          <div>
            <button
              onClick={handleToggleHistory}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors duration-200"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" style={{ color: "rgba(170,179,197,0.45)" }} />
                <span className="text-xs font-medium" style={{ color: "rgba(170,179,197,0.55)" }}>
                  Compound History
                </span>
                {historyLoaded && earnings.length > 0 && (
                  <span
                    className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                    style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37" }}
                  >
                    {earnings.length}
                  </span>
                )}
              </div>
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform duration-200"
                style={{ color: "rgba(170,179,197,0.35)", transform: showHistory ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
            {showHistory && (
              <div
                className="mt-1.5 rounded-xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                {historyLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#D4AF37" }} />
                  </div>
                ) : earnings.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-xs" style={{ color: "rgba(170,179,197,0.4)" }}>No compound entries yet</p>
                  </div>
                ) : (
                  <>
                    {earnings.slice(0, 10).map((e, i) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between px-3 py-2.5"
                        style={{ borderBottom: i < Math.min(earnings.length, 10) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                      >
                        <div>
                          <p className="text-xs font-semibold" style={{ color: "#D4AF37" }}>
                            +{fmt(parseFloat(e.amount))}
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color: "rgba(170,179,197,0.45)" }}>
                            {new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {" · "}{fmt(parseFloat(e.principalSnapshot))} principal
                          </p>
                        </div>
                        <span
                          className="text-[10px] font-semibold px-2 py-1 rounded-md shrink-0"
                          style={{ background: "rgba(212,175,55,0.08)", color: "rgba(212,175,55,0.65)" }}
                        >
                          {parseFloat(e.dailyROIApplied).toFixed(2)}% daily
                        </span>
                      </div>
                    ))}
                    {earnings.length > 10 && (
                      <p className="px-3 py-2 text-[10px] text-center" style={{ color: "rgba(170,179,197,0.35)" }}>
                        +{earnings.length - 10} more entries
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Claim buttons */}
        <div className="flex gap-3">
          <ClaimBtn
            label="Claim ROI"
            available={!inv.autoCompound && claimableRoi > 0 && !isCompleted && !isMatured}
            loading={roiLoading}
            hint={
              isCompleted || isMatured
                ? "Plan completed"
                : inv.autoCompound
                ? "ROI compounds automatically every 12 hours"
                : claimableRoi > 0
                ? `${fmt(claimableRoi)} available`
                : "Available after next ROI cycle"
            }
            onClaim={onClaimRoi}
          />
          <ClaimBtn
            label={isMatured ? "Claim Principal" : isCompleted ? "✓ Claimed" : "Principal Locked"}
            available={isMatured}
            loading={principalLoading}
            hint={
              isCompleted ? "Principal already claimed" :
              isMatured ? "Plan complete — claim now" :
              `Unlocks after day ${inv.durationDays}`
            }
            onClaim={onClaimPrincipal}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Create Investment Modal ─── */
function CreateInvestmentModal({
  depositBalance,
  existingCount,
  onClose,
  onCreate,
}: {
  depositBalance: number;
  existingCount: number;
  onClose: () => void;
  onCreate: (planKey: string, amount: number) => Promise<void>;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanInfo>(PLANS[0]);
  const [rawAmount, setRawAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const amount = parseInt(rawAmount, 10) || 0;
  const minAmount = (existingCount + 1) * 100;
  const dailyEarnings = amount * (selectedPlan.dailyRoi / 100);

  const amountError =
    amount > 0 && amount < minAmount
      ? `Minimum for your ${existingCount + 1}${ordinalSuffix(existingCount + 1)} investment is $${minAmount}`
      : amount > 0 && amount % 100 !== 0
      ? "Amount must be a multiple of $100"
      : amount > depositBalance
      ? `Exceeds available balance of ${fmt(depositBalance)}`
      : null;

  const isValid = amount >= minAmount && amount % 100 === 0 && amount <= depositBalance;

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await onCreate(selectedPlan.key, amount);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Creation failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" style={{ background: "rgba(5,11,26,0.8)", backdropFilter: "blur(4px)" }}>
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
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h2 className="text-lg font-bold font-heading text-foreground">New Investment</h2>
            <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>Select a plan and enter amount</p>
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
          {/* Deposit balance */}
          <div className="flex items-center gap-3 rounded-xl p-3.5" style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.15)" }}>
            <Wallet className="h-4 w-4 shrink-0" style={{ color: "#D4AF37" }} />
            <div>
              <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "rgba(212,175,55,0.6)" }}>Available Deposit Balance</p>
              <p className="text-sm font-bold" style={{ color: "#F3D37A" }}>{fmt(depositBalance)}</p>
            </div>
          </div>

          {/* Plan selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2.5" style={{ color: "hsl(var(--muted-foreground))" }}>Select Plan</p>
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map((plan) => {
                const active = selectedPlan.key === plan.key;
                return (
                  <button
                    key={plan.key}
                    onClick={() => setSelectedPlan(plan)}
                    className="rounded-xl p-3.5 text-left transition-all duration-200"
                    style={{
                      background: active ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.06)"}`,
                      boxShadow: active ? "0 0 12px rgba(212,175,55,0.12)" : "none",
                    }}
                  >
                    <p className="text-xs font-bold font-heading" style={{ color: active ? "#F3D37A" : "hsl(var(--foreground))" }}>{plan.name}</p>
                    <p className="text-[10px] mt-0.5 font-semibold" style={{ color: active ? "#D4AF37" : "hsl(var(--muted-foreground))" }}>{plan.dailyRoi}%/day · {plan.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              Investment Amount <span style={{ color: "rgba(170,179,197,0.5)", fontWeight: 400, fontSize: "10px" }}>(min ${minAmount})</span>
            </p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "rgba(170,179,197,0.5)" }}>$</span>
              <input
                type="number"
                min={minAmount}
                step={100}
                value={rawAmount}
                onChange={(e) => setRawAmount(e.target.value)}
                placeholder={String(minAmount)}
                className="w-full rounded-xl pl-7 pr-4 py-3.5 text-sm font-semibold outline-none transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${amountError ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: "hsl(var(--foreground))",
                }}
              />
            </div>
            {amountError && <p className="text-xs mt-1.5" style={{ color: "#ef4444" }}>{amountError}</p>}
          </div>

          {/* Live preview */}
          {amount >= minAmount && !amountError && (
            <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.15)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-3" style={{ color: "rgba(212,175,55,0.6)" }}>Projection</p>
              {[
                { label: "Daily Earnings",   value: fmt(dailyEarnings) },
                { label: "30-Day Earnings",  value: fmt(dailyEarnings * 30) },
                { label: "Total ROI (plan)", value: fmt(dailyEarnings * selectedPlan.duration) },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "rgba(170,179,197,0.6)" }}>{s.label}</span>
                  <span className="text-xs font-bold" style={{ color: "#F3D37A" }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {submitError && <p className="text-xs text-center" style={{ color: "#ef4444" }}>{submitError}</p>}

          {/* Confirm button */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="w-full rounded-xl py-4 font-semibold text-sm transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            style={
              isValid && !submitting
                ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 20px rgba(212,175,55,0.35)" }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(170,179,197,0.4)", cursor: submitting ? "default" : "not-allowed" }
            }
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              <><Plus className="h-4 w-4" /> Confirm Investment</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ordinalSuffix(n: number): string {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th";
}

/* ─── Page ─── */
export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<ApiInvestment[]>([]);
  const [depositBalance, setDepositBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [roiLoading, setRoiLoading] = useState<Record<string, boolean>>({});
  const [principalLoading, setPrincipalLoading] = useState<Record<string, boolean>>({});
  const [acLoading, setAcLoading] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem["type"] = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [invResult, wallets] = await Promise.all([
        listInvestments({ limit: 100 }),
        getWallets(),
      ]);
      setInvestments(invResult.data);
      setDepositBalance(parseFloat(wallets.depositWallet));
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to load investments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleClaimRoi = useCallback(async (inv: ApiInvestment) => {
    setRoiLoading((m) => ({ ...m, [inv.id]: true }));
    try {
      const result = await claimRoi(inv.id);
      addToast(`${fmt(parseFloat(result.amountClaimed))} ROI credited to Income Wallet`);
      void loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "ROI claim failed", "error");
    } finally {
      setRoiLoading((m) => ({ ...m, [inv.id]: false }));
    }
  }, [addToast, loadData]);

  const handleClaimPrincipal = useCallback(async (inv: ApiInvestment) => {
    setPrincipalLoading((m) => ({ ...m, [inv.id]: true }));
    try {
      const result = await claimPrincipal(inv.id);
      addToast(`${fmt(parseFloat(result.principalCredited))} principal credited to Income Wallet`);
      void loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Principal claim failed", "error");
    } finally {
      setPrincipalLoading((m) => ({ ...m, [inv.id]: false }));
    }
  }, [addToast, loadData]);

  const handleToggleAutoCompound = useCallback(async (inv: ApiInvestment) => {
    setAcLoading((m) => ({ ...m, [inv.id]: true }));
    try {
      const updated = await toggleAutoCompound(inv.id, !inv.autoCompound);
      setInvestments((prev) => prev.map((i) => i.id === inv.id ? updated : i));
      addToast(`Auto compound ${updated.autoCompound ? "enabled" : "disabled"}`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setAcLoading((m) => ({ ...m, [inv.id]: false }));
    }
  }, [addToast]);

  const handleCreate = useCallback(async (planKey: string, amount: number) => {
    const newInv = await createInvestment({ amount, planType: planKey, autoCompound: false });
    setInvestments((prev) => [newInv, ...prev]);
    setDepositBalance((b) => b - amount);
    addToast("Investment created successfully");
  }, [addToast]);

  /* ── Derived stats ── */
  const totalActiveInvested = useMemo(
    () => investments.filter(i => i.status === "ACTIVE").reduce((s, i) => s + parseFloat(i.currentPrincipal), 0),
    [investments],
  );
  const activePlanCount = useMemo(() => investments.filter(i => i.status === "ACTIVE").length, [investments]);
  const dailyEarnings = useMemo(
    () => investments.filter(i => i.status === "ACTIVE" && !i.autoCompound)
      .reduce((s, i) => s + parseFloat(i.currentPrincipal) * (parseFloat(i.dailyROI) / 100), 0),
    [investments],
  );
  const monthlyProjection = dailyEarnings * 30;
  const hasInvestments = investments.length > 0;

  return (
    <AppLayout pageTitle="Investments" notificationCount={0}>
      <PageContainer>
        <InvestmentTabs />

        {/* ── New Investment CTA ── */}
        <div
          className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 mb-5 lg:static lg:mx-0 lg:px-0 lg:pt-0 lg:pb-0 lg:mb-6"
          style={{ background: "#050B1A" }}
        >
          <button
            onClick={() => setModalOpen(true)}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-semibold text-sm min-h-[52px] transition-all duration-200 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
              color: "#0E1B37",
              boxShadow: "0 4px 20px rgba(212,175,55,0.35)",
            }}
          >
            <Plus className="h-4 w-4" />
            New Investment
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading investments…</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && pageError && (
          <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-sm font-medium" style={{ color: "#ef4444" }}>{pageError}</p>
            <button onClick={() => { setPageError(undefined); setLoading(true); void loadData(); }} className="mt-3 text-xs underline" style={{ color: "#D4AF37" }}>
              Try again
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !pageError && !hasInvestments && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl mb-5"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}
            >
              <TrendingUp className="h-10 w-10" style={{ color: "rgba(212,175,55,0.5)" }} />
            </div>
            <h3 className="text-xl font-semibold font-heading text-foreground mb-2">No active investments yet</h3>
            <p className="text-sm max-w-xs mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
              Fund your Deposit Wallet and start your first plan to watch your portfolio grow daily.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-sm"
              style={{ background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37" }}
            >
              <Plus className="h-4 w-4" /> Start Investing
            </button>
          </div>
        )}

        {/* ── Stats summary ── */}
        {!loading && !pageError && hasInvestments && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Active Capital",    value: fmt(totalActiveInvested), icon: Zap,         color: "#D4AF37", bg: "rgba(212,175,55,0.08)" },
                { label: "Active Plans",      value: String(activePlanCount),  icon: TrendingUp,  color: "#34d399", bg: "rgba(52,211,153,0.08)"  },
                { label: "Daily Earnings",    value: fmt(dailyEarnings),       icon: RefreshCw,   color: "#60a5fa", bg: "rgba(96,165,250,0.08)"  },
                { label: "30-Day Projection", value: fmt(monthlyProjection),   icon: Lock,        color: "#c084fc", bg: "rgba(192,132,252,0.08)" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="rounded-xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg mb-2" style={{ background: bg }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <p className="text-lg font-bold font-heading" style={{ color }}>{value}</p>
                  <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</p>
                </div>
              ))}
            </div>

            {/* ── Investment list ── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold font-heading text-foreground">Your Plans</h2>
                <Link href="/investments/history" className="text-xs font-medium" style={{ color: "#D4AF37" }}>
                  View History →
                </Link>
              </div>
              {investments.map((inv) => (
                <InvestmentCard
                  key={inv.id}
                  inv={inv}
                  onToggleAutoCompound={() => handleToggleAutoCompound(inv)}
                  onClaimRoi={() => handleClaimRoi(inv)}
                  onClaimPrincipal={() => handleClaimPrincipal(inv)}
                  roiLoading={!!roiLoading[inv.id]}
                  principalLoading={!!principalLoading[inv.id]}
                  acLoading={!!acLoading[inv.id]}
                />
              ))}
            </div>
          </>
        )}
      </PageContainer>

      {modalOpen && (
        <CreateInvestmentModal
          depositBalance={depositBalance}
          existingCount={investments.length}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      )}

      <ToastContainer toasts={toasts} />
    </AppLayout>
  );
}
