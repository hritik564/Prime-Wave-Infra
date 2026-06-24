import { useState, useMemo, useCallback } from "react";
import {
  TrendingUp, RefreshCw, Zap, Lock, ChevronRight,
  Plus, X, Wallet, CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import InvestmentTabs from "@/components/investments/InvestmentTabs";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─── */
interface Investment {
  id: number;
  plan: string;
  amount: number;
  dailyRoi: number;
  duration: number;
  daysCompleted: number;
  accumulatedRoi: number;
  status: "active" | "completed";
}

interface Plan {
  name: string;
  dailyRoi: number;
  duration: number;
  label: string;
}

/* ─── Official plans ─── */
const PLANS: Plan[] = [
  { name: "Prime Wave 90",  dailyRoi: 0.5, duration: 90,  label: "90-day lock" },
  { name: "Prime Wave 180", dailyRoi: 0.6, duration: 180, label: "180-day lock" },
  { name: "Prime Wave 270", dailyRoi: 0.7, duration: 270, label: "270-day lock" },
  { name: "Prime Wave 360", dailyRoi: 0.8, duration: 360, label: "360-day lock" },
];

/* ─── Seed data ─── */
const SEED: Investment[] = [
  { id: 1, plan: "Prime Wave 90",  amount: 500,  dailyRoi: 0.5, duration: 90,  daysCompleted: 45,  accumulatedRoi: 112.50,  status: "active" },
  { id: 2, plan: "Prime Wave 180", amount: 1000, dailyRoi: 0.6, duration: 180, daysCompleted: 60,  accumulatedRoi: 360.00,  status: "active" },
  { id: 3, plan: "Prime Wave 270", amount: 2000, dailyRoi: 0.7, duration: 270, daysCompleted: 270, accumulatedRoi: 3780.00, status: "completed" },
  { id: 4, plan: "Prime Wave 360", amount: 1500, dailyRoi: 0.8, duration: 360, daysCompleted: 30,  accumulatedRoi: 360.00,  status: "active" },
];

const INITIAL_DEPOSIT_BALANCE = 15000;
const LS_KEY = "pw:autoCompound";

/* ─── localStorage helpers ─── */
function loadAcMap(): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Record<number, boolean>) : {};
  } catch {
    return {};
  }
}
function saveAcMap(map: Record<number, boolean>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {}
}

/* ─── Formatters ─── */
function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  label, available, hint, onClaim,
}: {
  label: string; available: boolean; hint: string; onClaim: () => void;
}) {
  const [done, setDone] = useState(false);
  const handleClick = () => {
    if (!available || done) return;
    setDone(true);
    onClaim();
    setTimeout(() => setDone(false), 2500);
  };
  return (
    <div className="flex-1">
      <button
        onClick={handleClick}
        disabled={!available || done}
        className="w-full rounded-xl py-2.5 text-xs font-semibold transition-all duration-200 min-h-[44px]"
        style={
          available && !done
            ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 2px 10px rgba(212,175,55,0.25)" }
            : { background: "rgba(255,255,255,0.05)", color: "rgba(170,179,197,0.35)", cursor: "not-allowed", border: "1px solid rgba(255,255,255,0.05)" }
        }
      >
        {done ? "✓ Claimed" : label}
      </button>
      <p className="text-[10px] mt-1.5 text-center leading-snug px-1" style={{ color: "rgba(170,179,197,0.45)" }}>{hint}</p>
    </div>
  );
}

/* ─── Investment Card ─── */
function InvestmentCard({
  inv,
  autoCompound,
  onToggleAutoCompound,
  onClaimRoi,
}: {
  inv: Investment;
  autoCompound: boolean;
  onToggleAutoCompound: () => void;
  onClaimRoi: () => void;
}) {
  const pct = Math.round((inv.daysCompleted / inv.duration) * 100);
  const daysRemaining = inv.duration - inv.daysCompleted;
  const isCompleted = inv.status === "completed";

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
            <p className="text-base font-semibold font-heading text-foreground">{inv.plan}</p>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{inv.dailyRoi}% Daily ROI · {inv.duration}-day plan</p>
          </div>
        </div>
        <Badge variant={isCompleted ? "success" : "secondary"}>{isCompleted ? "Completed" : "Active"}</Badge>
      </div>

      <div className="p-5 space-y-4">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Invested",   value: fmt(inv.amount),         color: "rgba(255,255,255,0.9)" },
            { label: "Accum. ROI", value: fmt(inv.accumulatedRoi), color: "#34d399" },
            { label: "Days Left",  value: isCompleted ? "Done" : `${daysRemaining}d`, color: isCompleted ? "#34d399" : "#D4AF37" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.5)" }}>{s.label}</p>
              <p className="text-sm font-bold font-heading" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Progress</span>
            <span className="text-xs font-semibold" style={{ color: "#D4AF37" }}>{inv.daysCompleted}/{inv.duration} days · {pct}%</span>
          </div>
          <ProgressBar pct={pct} />
        </div>

        {/* Per-investment Auto Compound toggle */}
        {!isCompleted && (
          <div
            className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{
              background: autoCompound ? "rgba(212,175,55,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${autoCompound ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.05)"}`,
              transition: "background 0.25s, border-color 0.25s",
            }}
          >
            <div className="flex items-center gap-2.5">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" style={{ color: autoCompound ? "#D4AF37" : "rgba(170,179,197,0.4)" }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: autoCompound ? "#F3D37A" : "hsl(var(--muted-foreground))" }}>
                  Auto Compound
                </p>
                <p className="text-[10px] leading-snug" style={{ color: "rgba(170,179,197,0.45)" }}>
                  {autoCompound ? "ROI compounds automatically every 12 hours" : "ROI can be claimed manually"}
                </p>
              </div>
            </div>
            <button
              onClick={onToggleAutoCompound}
              className="relative shrink-0 h-6 w-10 rounded-full transition-all duration-300 ml-3"
              style={{
                background: autoCompound ? "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)" : "rgba(255,255,255,0.1)",
                boxShadow: autoCompound ? "0 0 8px rgba(212,175,55,0.35)" : "none",
              }}
              aria-label={`Toggle auto compound for ${inv.plan}`}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full shadow-sm transition-all duration-300"
                style={{ background: "#fff", left: autoCompound ? "calc(100% - 22px)" : "2px" }}
              />
            </button>
          </div>
        )}

        {/* Claim buttons */}
        <div className="flex gap-3">
          <ClaimBtn
            label="Claim ROI"
            available={!autoCompound && inv.accumulatedRoi > 0 && !isCompleted}
            hint={
              isCompleted
                ? "Plan completed"
                : autoCompound
                ? "ROI compounds automatically every 12 hours"
                : inv.accumulatedRoi > 0
                ? `${fmt(inv.accumulatedRoi)} available`
                : "Available after next ROI cycle"
            }
            onClaim={onClaimRoi}
          />
          <ClaimBtn
            label={isCompleted ? "Claim Principal" : "Principal Locked"}
            available={isCompleted}
            hint={isCompleted ? "Plan complete — claim now" : `Unlocks after day ${inv.duration}`}
            onClaim={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Create Investment Modal ─── */
function CreateInvestmentModal({
  depositBalance,
  onClose,
  onCreate,
}: {
  depositBalance: number;
  onClose: () => void;
  onCreate: (plan: Plan, amount: number) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[0]);
  const [rawAmount, setRawAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const amount = parseInt(rawAmount, 10) || 0;
  const dailyEarnings = amount * (selectedPlan.dailyRoi / 100);

  const amountError =
    amount > 0 && amount < 100
      ? "Minimum investment is $100"
      : amount > 0 && amount % 100 !== 0
      ? "Amount must be a multiple of $100"
      : amount > depositBalance
      ? `Exceeds available balance of ${fmt(depositBalance)}`
      : null;

  const isValid = amount >= 100 && amount % 100 === 0 && amount <= depositBalance;

  const handleSubmit = () => {
    if (!isValid || submitted) return;
    setSubmitted(true);
    setTimeout(() => {
      onCreate(selectedPlan, amount);
      onClose();
    }, 1200);
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
                const active = selectedPlan.name === plan.name;
                return (
                  <button
                    key={plan.name}
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
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>Investment Amount</p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "rgba(170,179,197,0.5)" }}>$</span>
              <input
                type="number"
                min={100}
                step={100}
                value={rawAmount}
                onChange={(e) => setRawAmount(e.target.value)}
                placeholder="100"
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
          {amount >= 100 && !amountError && (
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

          {/* Confirm button */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitted}
            className="w-full rounded-xl py-4 font-semibold text-sm transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            style={
              isValid && !submitted
                ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 20px rgba(212,175,55,0.35)" }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(170,179,197,0.4)", cursor: submitted ? "default" : "not-allowed" }
            }
          >
            {submitted ? (
              <>✓ Investment Created</>
            ) : (
              <><Plus className="h-4 w-4" /> Confirm Investment</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>(SEED);
  const [depositBalance, setDepositBalance] = useState(INITIAL_DEPOSIT_BALANCE);
  const [modalOpen, setModalOpen] = useState(false);

  /* ── Auto Compound — localStorage-backed, survives reload & navigation ── */
  const [acMap, setAcMap] = useState<Record<number, boolean>>(loadAcMap);

  const getAc = useCallback((id: number): boolean => acMap[id] ?? true, [acMap]);

  const toggleAc = useCallback((id: number) => {
    setAcMap((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) };
      saveAcMap(next);
      return next;
    });
  }, []);

  /* ── Toast notifications ── */
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem["type"] = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  /* ── Claim ROI ── */
  const handleClaimRoi = useCallback((inv: Investment) => {
    if (inv.accumulatedRoi <= 0) return;
    const amount = inv.accumulatedRoi;
    setInvestments((prev) =>
      prev.map((i) => i.id === inv.id ? { ...i, accumulatedRoi: 0 } : i)
    );
    addToast(`${fmt(amount)} ROI credited to Income Wallet`);
  }, [addToast]);

  /* ── Create investment ── */
  const handleCreate = useCallback((plan: Plan, amount: number) => {
    setDepositBalance((b) => b - amount);
    const newId = Date.now();
    setInvestments((prev) => [
      {
        id: newId,
        plan: plan.name,
        amount,
        dailyRoi: plan.dailyRoi,
        duration: plan.duration,
        daysCompleted: 0,
        accumulatedRoi: 0,
        status: "active",
      },
      ...prev,
    ]);
    // New investments default to autoCompound ON — persist immediately
    setAcMap((prev) => {
      const next = { ...prev, [newId]: true };
      saveAcMap(next);
      return next;
    });
  }, []);

  /* ── Derived stats ── */
  const totalActiveInvested = useMemo(() => investments.reduce((s, i) => s + i.amount, 0), [investments]);
  const activePlanCount     = useMemo(() => investments.filter((i) => i.status === "active").length, [investments]);
  const dailyEarnings       = useMemo(() => investments.filter((i) => i.status === "active").reduce((s, i) => s + i.amount * (i.dailyRoi / 100), 0), [investments]);
  const totalRoi            = useMemo(() => investments.reduce((s, i) => s + i.accumulatedRoi, 0), [investments]);
  const monthlyProjection   = dailyEarnings * 30;
  const hasInvestments      = investments.length > 0;

  return (
    <AppLayout pageTitle="Investments" notificationCount={3}>
      <PageContainer>
        <InvestmentTabs />

        {/* ── New Investment CTA — sticky on mobile ── */}
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

        {!hasInvestments ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl mb-5"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}
            >
              <TrendingUp className="h-10 w-10" style={{ color: "rgba(212,175,55,0.5)" }} />
            </div>
            <h3 className="text-xl font-semibold font-heading text-foreground mb-2">No active investments yet</h3>
            <p className="text-sm max-w-xs mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
              Start your first investment plan and watch your portfolio grow daily.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-sm"
              style={{ background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" }}
            >
              Start First Investment <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div
              className="relative rounded-2xl overflow-hidden p-5 lg:p-8 mb-5 lg:mb-6"
              style={{
                background: "linear-gradient(135deg, #0A1628 0%, #0E1B37 50%, #0A1628 100%)",
                border: "1px solid rgba(212,175,55,0.22)",
                boxShadow: "0 0 0 1px rgba(212,175,55,0.06), 0 8px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 50% at 10% 50%, rgba(212,175,55,0.07) 0%, transparent 70%)" }} />
              <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{ backgroundImage: "linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
              <div className="relative">
                <div className="mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.7)" }}>Portfolio Overview</span>
                </div>
                <p className="text-3xl lg:text-4xl font-bold font-heading mb-1" style={{ color: "#F3D37A" }}>
                  {fmt(totalActiveInvested)}
                </p>
                <p className="text-sm mb-5" style={{ color: "rgba(170,179,197,0.6)" }}>Total active investment across all plans</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Active Plans",  value: activePlanCount },
                    { label: "Daily Earnings", value: fmt(dailyEarnings) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.5)" }}>{s.label}</p>
                      <p className="text-base font-bold font-heading text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Estimated Returns Card */}
            <div className="rounded-2xl p-5 mb-5 lg:mb-6" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(212,175,55,0.1)" }}>
                  <Zap className="h-4 w-4" style={{ color: "#D4AF37" }} />
                </div>
                <h3 className="text-base font-semibold font-heading text-foreground">Estimated Returns</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Daily Earnings",     value: fmt(dailyEarnings),    color: "#34d399" },
                  { label: "Monthly Projection", value: fmt(monthlyProjection), color: "#60a5fa" },
                  { label: "Total ROI Earned",   value: fmt(totalRoi),          color: "#D4AF37" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>{s.label}</p>
                    <p className="text-sm font-bold font-heading" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* History link */}
            <Link
              href="/investments/history"
              className="flex items-center justify-between w-full rounded-xl px-4 py-3.5 mb-5 transition-all hover:bg-white/[0.03]"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
                <span className="text-sm font-medium text-foreground">Investment History</span>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
            </Link>

            {/* Investment Cards */}
            <div className="mb-2">
              <h3 className="text-base font-semibold font-heading text-foreground mb-4">Your Plans</h3>
              {investments.map((inv) => (
                <InvestmentCard
                  key={inv.id}
                  inv={inv}
                  autoCompound={getAc(inv.id)}
                  onToggleAutoCompound={() => toggleAc(inv.id)}
                  onClaimRoi={() => handleClaimRoi(inv)}
                />
              ))}
            </div>
          </>
        )}
      </PageContainer>

      {/* Create Investment Modal */}
      {modalOpen && (
        <CreateInvestmentModal
          depositBalance={depositBalance}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} />
    </AppLayout>
  );
}
