import { useState, useMemo } from "react";
import { TrendingUp, RefreshCw, Zap, Lock, ChevronRight, Plus, X, Wallet } from "lucide-react";
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

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
function ClaimBtn({ label, available, hint, onClaim }: { label: string; available: boolean; hint: string; onClaim: () => void }) {
  const [done, setDone] = useState(false);
  const handleClick = () => {
    if (!available) return;
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
function InvestmentCard({ inv }: { inv: Investment }) {
  const pct = Math.round((inv.daysCompleted / inv.duration) * 100);
  const daysRemaining = inv.duration - inv.daysCompleted;
  const isCompleted = inv.status === "completed";
  const [autoCompound, setAutoCompound] = useState(true);

  return (
    <div
      className="rounded-2xl overflow-hidden mb-4"
      style={{
        background: "hsl(var(--card))",
        border: `1px solid ${isCompleted ? "rgba(52,211,153,0.2)" : "hsl(var(--border))"}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
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
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Invested",    value: fmt(inv.amount),          color: "rgba(255,255,255,0.9)" },
            { label: "Accum. ROI",  value: fmt(inv.accumulatedRoi),  color: "#34d399" },
            { label: "Days Left",   value: isCompleted ? "Done" : `${daysRemaining}d`, color: isCompleted ? "#34d399" : "#D4AF37" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.5)" }}>{s.label}</p>
              <p className="text-sm font-bold font-heading" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Progress</span>
            <span className="text-xs font-semibold" style={{ color: "#D4AF37" }}>{inv.daysCompleted}/{inv.duration} days · {pct}%</span>
          </div>
          <ProgressBar pct={pct} />
        </div>

        {/* Per-investment Auto Compound */}
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
                {autoCompound ? "ROI added to principal every 12h" : "ROI sent to Income Wallet every 12h"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setAutoCompound((v) => !v)}
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

        <div className="flex gap-3">
          <ClaimBtn
            label="Claim ROI"
            available={inv.accumulatedRoi > 0}
            hint={inv.accumulatedRoi > 0 ? `${fmt(inv.accumulatedRoi)} available` : "No ROI to claim"}
            onClaim={() => {}}
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
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 lg:p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid rgba(212,175,55,0.2)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
              <TrendingUp className="h-4 w-4" style={{ color: "#D4AF37" }} />
            </div>
            <div>
              <p className="text-base font-semibold font-heading text-foreground">New Investment</p>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Select plan and amount</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: "hsl(var(--muted-foreground))" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Deposit wallet balance */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.15)" }}
          >
            <div className="flex items-center gap-2.5">
              <Wallet className="h-4 w-4" style={{ color: "#D4AF37" }} />
              <span className="text-sm" style={{ color: "rgba(170,179,197,0.8)" }}>Deposit Wallet Balance</span>
            </div>
            <span className="text-sm font-semibold font-mono" style={{ color: "#D4AF37" }}>{fmt(depositBalance)}</span>
          </div>

          {/* Plan selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>Select Plan</p>
            <div className="space-y-2">
              {PLANS.map((plan) => {
                const active = selectedPlan.name === plan.name;
                return (
                  <button
                    key={plan.name}
                    onClick={() => setSelectedPlan(plan)}
                    className="w-full rounded-xl px-4 py-3.5 flex items-center justify-between transition-all duration-200 text-left"
                    style={{
                      background: active ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? "rgba(212,175,55,0.35)" : "rgba(255,255,255,0.06)"}`,
                      boxShadow: active ? "0 0 0 1px rgba(212,175,55,0.1)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3.5 w-3.5 rounded-full border-2 shrink-0 transition-all"
                        style={{
                          borderColor: active ? "#D4AF37" : "rgba(170,179,197,0.3)",
                          background: active ? "#D4AF37" : "transparent",
                          boxShadow: active ? "0 0 6px rgba(212,175,55,0.5)" : "none",
                        }}
                      />
                      <div>
                        <p className="text-sm font-semibold font-heading" style={{ color: active ? "#F3D37A" : "hsl(var(--foreground))" }}>
                          {plan.name}
                        </p>
                        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{plan.label}</p>
                      </div>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: active ? "#D4AF37" : "rgba(170,179,197,0.6)" }}
                    >
                      {plan.dailyRoi}%/day
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
              Amount (USDT)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>$</span>
              <input
                type="number"
                min={100}
                step={100}
                value={rawAmount}
                onChange={(e) => setRawAmount(e.target.value)}
                placeholder="100"
                className="w-full rounded-xl pl-8 pr-4 py-3.5 text-lg font-mono font-semibold text-foreground outline-none"
                style={{
                  background: "hsl(var(--input))",
                  border: `1px solid ${amountError ? "rgba(248,113,113,0.5)" : amount > 0 ? "rgba(212,175,55,0.3)" : "hsl(var(--border))"}`,
                }}
              />
            </div>
            {amountError && <p className="text-xs mt-1.5" style={{ color: "#f87171" }}>{amountError}</p>}
            {!amountError && (
              <p className="text-xs mt-1.5" style={{ color: "rgba(170,179,197,0.45)" }}>
                Min $100 · multiples of $100 only
              </p>
            )}
          </div>

          {/* Live preview */}
          {amount >= 100 && !amountError && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {[
                { label: "Investment Amount", value: fmt(amount),        valueColor: "hsl(var(--foreground))" },
                { label: "Daily ROI %",       value: `${selectedPlan.dailyRoi}%`, valueColor: "#D4AF37" },
                { label: "Daily Earnings",    value: fmt(dailyEarnings), valueColor: "#34d399" },
                { label: "Lock Duration",     value: selectedPlan.label, valueColor: "hsl(var(--foreground))" },
              ].map((row, i, arr) => (
                <div key={row.label}>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{row.label}</span>
                    <span className="text-sm font-semibold font-mono" style={{ color: row.valueColor }}>{row.value}</span>
                  </div>
                  {i < arr.length - 1 && <div style={{ height: "1px", background: "rgba(255,255,255,0.04)" }} />}
                </div>
              ))}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitted}
            className="w-full rounded-xl py-3.5 font-semibold text-sm transition-all duration-200 min-h-[52px] flex items-center justify-center gap-2"
            style={
              isValid && !submitted
                ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(170,179,197,0.4)", cursor: "not-allowed" }
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

  const totalActiveInvested = useMemo(() => investments.reduce((s, i) => s + i.amount, 0), [investments]);
  const activePlanCount     = useMemo(() => investments.filter((i) => i.status === "active").length, [investments]);
  const dailyEarnings       = useMemo(() => investments.filter((i) => i.status === "active").reduce((s, i) => s + i.amount * (i.dailyRoi / 100), 0), [investments]);
  const totalRoi            = useMemo(() => investments.reduce((s, i) => s + i.accumulatedRoi, 0), [investments]);
  const monthlyProjection   = dailyEarnings * 30;
  const hasInvestments      = investments.length > 0;

  const handleCreate = (plan: Plan, amount: number) => {
    setDepositBalance((b) => b - amount);
    setInvestments((prev) => [
      {
        id: Date.now(),
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
  };

  return (
    <AppLayout pageTitle="Investments" notificationCount={3}>
      <PageContainer>
        <InvestmentTabs />

        {/* ── New Investment CTA ── */}
        <button
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-semibold text-sm mb-5 lg:mb-6 min-h-[52px] transition-all duration-200 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
            color: "#0E1B37",
            boxShadow: "0 4px 20px rgba(212,175,55,0.35)",
          }}
        >
          <Plus className="h-4 w-4" />
          New Investment
        </button>

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
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(212,175,55,0.65)" }}>Portfolio Overview</p>
                <p
                  className="font-heading font-bold text-3xl lg:text-5xl mb-1"
                  style={{ background: "linear-gradient(135deg, #F3D37A 0%, #D4AF37 50%, #B8941F 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.02em" }}
                >
                  {fmt(totalActiveInvested)}
                </p>
                <p className="text-xs mb-5" style={{ color: "rgba(170,179,197,0.55)" }}>Total active investment across all plans</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Active Plans",   value: `${activePlanCount}` },
                    { label: "Daily Earnings", value: fmt(dailyEarnings) },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.55)" }}>{m.label}</p>
                      <p className="text-base lg:text-lg font-bold font-heading" style={{ color: "rgba(255,255,255,0.9)" }}>{m.value}</p>
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
                  { label: "Daily Earnings",     value: fmt(dailyEarnings),     color: "#34d399" },
                  { label: "Monthly Projection", value: fmt(monthlyProjection),  color: "#60a5fa" },
                  { label: "Total ROI Earned",   value: fmt(totalRoi),           color: "#D4AF37" },
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
            <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Your Plans</h2>
            {investments.map((inv) => (
              <InvestmentCard key={inv.id} inv={inv} />
            ))}
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
    </AppLayout>
  );
}
