import { useState } from "react";
import { TrendingUp, RefreshCw, Zap, Lock, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import InvestmentTabs from "@/components/investments/InvestmentTabs";
import { Badge } from "@/components/ui/badge";

/* ─── Mock data ─── */
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

const investments: Investment[] = [
  {
    id: 1,
    plan: "Elite Growth",
    amount: 5000,
    dailyRoi: 0.85,
    duration: 180,
    daysCompleted: 122,
    accumulatedRoi: 518.7,
    status: "active",
  },
  {
    id: 2,
    plan: "Prime Orbit",
    amount: 7500,
    dailyRoi: 1.0,
    duration: 120,
    daysCompleted: 82,
    accumulatedRoi: 615.0,
    status: "active",
  },
  {
    id: 3,
    plan: "Starter Pack",
    amount: 2500,
    dailyRoi: 0.75,
    duration: 90,
    daysCompleted: 90,
    accumulatedRoi: 168.75,
    status: "completed",
  },
];

const totalActiveInvested = investments.reduce((s, i) => s + i.amount, 0);
const activePlanCount = investments.filter((i) => i.status === "active").length;
const dailyEarnings = investments
  .filter((i) => i.status === "active")
  .reduce((s, i) => s + i.amount * (i.dailyRoi / 100), 0);
const totalRoi = investments.reduce((s, i) => s + i.accumulatedRoi, 0);
const monthlyProjection = dailyEarnings * 30;

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
function ClaimBtn({
  label,
  available,
  hint,
  onClaim,
}: {
  label: string;
  available: boolean;
  hint: string;
  onClaim: () => void;
}) {
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
            ? {
                background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
                color: "#0E1B37",
                boxShadow: "0 2px 10px rgba(212,175,55,0.25)",
              }
            : {
                background: "rgba(255,255,255,0.05)",
                color: "rgba(170,179,197,0.35)",
                cursor: "not-allowed",
                border: "1px solid rgba(255,255,255,0.05)",
              }
        }
      >
        {done ? "✓ Claimed" : label}
      </button>
      <p className="text-[10px] mt-1.5 text-center leading-snug px-1" style={{ color: "rgba(170,179,197,0.45)" }}>
        {hint}
      </p>
    </div>
  );
}

/* ─── Investment Card ─── */
function InvestmentCard({ inv }: { inv: Investment }) {
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
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
            style={{ background: isCompleted ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)" }}
          >
            <TrendingUp className="h-5 w-5" style={{ color: isCompleted ? "#34d399" : "#D4AF37" }} />
          </div>
          <div>
            <p className="text-base font-semibold font-heading text-foreground">{inv.plan}</p>
            <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              {inv.dailyRoi}% Daily ROI · {inv.duration}-day plan
            </p>
          </div>
        </div>
        <Badge variant={isCompleted ? "success" : "secondary"}>
          {isCompleted ? "Completed" : "Active"}
        </Badge>
      </div>

      <div className="p-5 space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Invested", value: fmt(inv.amount), color: "rgba(255,255,255,0.9)" },
            { label: "Accum. ROI", value: fmt(inv.accumulatedRoi), color: "#34d399" },
            { label: "Days Left",  value: isCompleted ? "Done" : `${daysRemaining}d`, color: isCompleted ? "#34d399" : "#D4AF37" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-3 text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.5)" }}>
                {s.label}
              </p>
              <p className="text-sm font-bold font-heading" style={{ color: s.color }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              Progress
            </span>
            <span className="text-xs font-semibold" style={{ color: "#D4AF37" }}>
              {inv.daysCompleted}/{inv.duration} days · {pct}%
            </span>
          </div>
          <ProgressBar pct={pct} />
        </div>

        {/* Claim buttons */}
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

/* ─── Page ─── */
export default function InvestmentsPage() {
  const [autoCompound, setAutoCompound] = useState(true);
  const hasInvestments = investments.length > 0;

  return (
    <AppLayout pageTitle="Investments" notificationCount={3}>
      <PageContainer>
        <InvestmentTabs />

        {!hasInvestments ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl mb-5"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}
            >
              <TrendingUp className="h-10 w-10" style={{ color: "rgba(212,175,55,0.5)" }} />
            </div>
            <h3 className="text-xl font-semibold font-heading text-foreground mb-2">
              No active investments yet
            </h3>
            <p className="text-sm max-w-xs mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
              Start your first investment plan and watch your portfolio grow daily.
            </p>
            <button
              className="flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-sm"
              style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
                color: "#0E1B37",
                boxShadow: "0 4px 16px rgba(212,175,55,0.3)",
              }}
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
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse 60% 50% at 10% 50%, rgba(212,175,55,0.07) 0%, transparent 70%)",
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.025]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                }}
              />
              <div className="relative">
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-1"
                  style={{ color: "rgba(212,175,55,0.65)" }}
                >
                  Portfolio Overview
                </p>
                <p
                  className="font-heading font-bold text-3xl lg:text-5xl mb-1"
                  style={{
                    background: "linear-gradient(135deg, #F3D37A 0%, #D4AF37 50%, #B8941F 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {fmt(totalActiveInvested)}
                </p>
                <p className="text-xs mb-5" style={{ color: "rgba(170,179,197,0.55)" }}>
                  Total active investment across all plans
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Active Plans",     value: `${activePlanCount}` },
                    { label: "Daily Earnings",   value: fmt(dailyEarnings) },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl p-3"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.55)" }}>
                        {m.label}
                      </p>
                      <p className="text-base lg:text-lg font-bold font-heading" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Estimated Returns Card */}
            <div
              className="rounded-2xl p-5 mb-5 lg:mb-6"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(212,175,55,0.1)" }}>
                  <Zap className="h-4 w-4" style={{ color: "#D4AF37" }} />
                </div>
                <h3 className="text-base font-semibold font-heading text-foreground">Estimated Returns</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Daily Earnings",    value: fmt(dailyEarnings),    color: "#34d399" },
                  { label: "Monthly Projection", value: fmt(monthlyProjection), color: "#60a5fa" },
                  { label: "Total ROI Earned",  value: fmt(totalRoi),          color: "#D4AF37" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl p-3 text-center"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>
                      {s.label}
                    </p>
                    <p className="text-sm font-bold font-heading" style={{ color: s.color }}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Auto Compound Toggle */}
            <div
              className="rounded-2xl p-5 mb-5 lg:mb-6"
              style={{
                background: "hsl(var(--card))",
                border: `1px solid ${autoCompound ? "rgba(212,175,55,0.25)" : "hsl(var(--border))"}`,
                boxShadow: autoCompound
                  ? "0 0 0 1px rgba(212,175,55,0.08), 0 4px 24px rgba(0,0,0,0.3)"
                  : "0 4px 24px rgba(0,0,0,0.3)",
                transition: "border-color 0.3s, box-shadow 0.3s",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300"
                  style={{ background: autoCompound ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.05)" }}
                >
                  <RefreshCw className="h-5 w-5" style={{ color: autoCompound ? "#D4AF37" : "rgba(170,179,197,0.5)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold font-heading text-foreground">Auto Compound</p>
                      <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Reinvest ROI claims automatically
                      </p>
                    </div>
                    <button
                      onClick={() => setAutoCompound((v) => !v)}
                      className="relative shrink-0 h-7 w-12 rounded-full transition-all duration-300"
                      style={{
                        background: autoCompound
                          ? "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)"
                          : "rgba(255,255,255,0.1)",
                        boxShadow: autoCompound ? "0 0 12px rgba(212,175,55,0.4)" : "none",
                      }}
                      aria-label="Toggle auto compound"
                    >
                      <span
                        className="absolute top-0.5 h-6 w-6 rounded-full shadow-sm transition-all duration-300"
                        style={{ background: "#fff", left: autoCompound ? "calc(100% - 26px)" : "2px" }}
                      />
                    </button>
                  </div>
                  <p className="text-xs mt-2" style={{ color: "rgba(170,179,197,0.55)" }}>
                    {autoCompound
                      ? "Claimed ROI is automatically reinvested, increasing your daily earnings."
                      : "ROI claims land in your Income Wallet. Toggle ON to compound returns."}
                  </p>
                </div>
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
    </AppLayout>
  );
}
