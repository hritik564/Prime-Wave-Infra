import { Check } from "lucide-react";
import type { SalaryQualificationSummary, SalarySummaryData } from "@/lib/api";

// ── Official Prime Wave Salary Compensation Plan ──────────────────────────────
// Thresholds match salaryRankConfig in the database.
// Colors are used client-side only for visual distinction.
const RANK_META: Record<string, { color: string }> = {
  Bronze:           { color: "#cd7f32" },
  Silver:           { color: "#C0C0C0" },
  Gold:             { color: "#D4AF37" },
  Platinum:         { color: "#a8c0d0" },
  Sapphire:         { color: "#3a7bd5" },
  Ruby:             { color: "#e05c5c" },
  Emerald:          { color: "#50C878" },
  Diamond:          { color: "#90cdf4" },
  Ambassador:       { color: "#F3D37A" },
  "Sovereign Crown":{ color: "#E5E4E2" },
};

function fmtUSD(value: string | number | null | undefined): string {
  if (value == null) return "$0";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(value: string | number | null | undefined): string {
  if (value == null) return "$0";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "$0";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface RankProgressCardProps {
  salaryQual?:    SalaryQualificationSummary | null;
  salarySummary?: SalarySummaryData          | null;
}

export default function RankProgressCard({
  salaryQual    = null,
  salarySummary = null,
}: RankProgressCardProps) {
  const qualifications = salaryQual?.qualifications ?? [];
  const highestRank    = salaryQual?.highestRank ?? null;
  const nextRank       = salaryQual?.nextRank    ?? null;
  const progressPct    = salaryQual?.progressPct ?? 0;
  const totalBusiness  = fmtFull(salaryQual?.totalBusinessUSD);
  const remaining      = fmtFull(salaryQual?.remaining);
  const nextRequired   = salaryQual?.nextRequiredBusiness
    ? fmtFull(salaryQual.nextRequiredBusiness)
    : "—";

  // Active awarded ranks (from salary engine, may differ from live BV qualification)
  const activeRanks    = new Set(salarySummary?.activeRanks ?? []);
  const activeSalary   = salarySummary?.activeMonthlySalary ?? "0";

  const highestColor   = highestRank ? (RANK_META[highestRank]?.color ?? "#D4AF37") : "rgba(170,179,197,0.4)";
  const nextColor      = nextRank    ? (RANK_META[nextRank]?.color    ?? "#D4AF37") : "#D4AF37";

  const headerTitle = highestRank
    ? `${highestRank} → ${nextRank ?? "All Unlocked"}`
    : `Unranked → ${nextRank ?? "Bronze"}`;

  return (
    <div
      className="rounded-2xl p-5 lg:p-6 mb-5 lg:mb-8"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p
            className="text-xs font-medium uppercase tracking-widest mb-1"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Salary Milestone Progress
          </p>
          <h3 className="text-xl font-bold font-heading text-foreground">
            {headerTitle}
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Team Business:{" "}
            <span className="font-semibold text-foreground">{totalBusiness}</span>
          </p>
        </div>

        {/* Rank badge — highest unlocked */}
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl font-bold font-heading text-sm shrink-0"
          style={{
            background: `${highestColor}18`,
            border: `1px solid ${highestColor}40`,
            color: highestColor,
          }}
        >
          {highestRank ? highestRank.slice(0, 2).toUpperCase() : "—"}
        </div>
      </div>

      {/* ── Active salary benefits pill (if any awarded achievements) ── */}
      {activeRanks.size > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
          style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.15)" }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.7)" }}>
            Active Benefits
          </span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {[...activeRanks].map((r) => (
              <span
                key={r}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{
                  background: `${RANK_META[r]?.color ?? "#D4AF37"}20`,
                  color: RANK_META[r]?.color ?? "#D4AF37",
                  border: `1px solid ${RANK_META[r]?.color ?? "#D4AF37"}40`,
                }}
              >
                {r}
              </span>
            ))}
          </div>
          <span className="text-xs font-bold font-heading shrink-0" style={{ color: "#D4AF37" }}>
            +${parseFloat(activeSalary).toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo
          </span>
        </div>
      )}

      {/* ── Progress bar (current milestone → next) ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: highestColor }}>
            {highestRank ?? "Start"}
          </span>
          <span className="text-xl font-bold font-heading" style={{ color: "#D4AF37" }}>
            {progressPct}%
          </span>
          <span className="text-sm font-semibold" style={{ color: nextColor }}>
            {nextRank ?? "✓ All"}
          </span>
        </div>

        <div
          className="relative h-3 w-full rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-full rounded-full relative overflow-hidden transition-all duration-1000 ease-out"
            style={{
              width: `${progressPct}%`,
              background: "linear-gradient(90deg, #B8941F 0%, #D4AF37 50%, #F3D37A 80%, #D4AF37 100%)",
              boxShadow: "0 0 16px rgba(212,175,55,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                animation: "shimmer 2s infinite",
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Current: {totalBusiness}
          </span>
          {nextRank ? (
            <span className="text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
              <span style={{ color: "#D4AF37" }}>{remaining}</span> to {nextRank} ({nextRequired})
            </span>
          ) : (
            <span className="text-xs font-semibold" style={{ color: "#34d399" }}>
              All milestones unlocked ✓
            </span>
          )}
        </div>
      </div>

      {/* ── All 10 milestones — horizontal scrollable strip ── */}
      <div
        className="overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="flex items-start gap-0 min-w-max">
          {qualifications.map((q, i) => {
            const isUnlocked = q.qualifies;
            const isNext     = !isUnlocked && qualifications.slice(0, i).every((x) => x.qualifies);
            const color      = RANK_META[q.rankName]?.color ?? "#888";
            const isActive   = activeRanks.has(q.rankName);

            return (
              <div key={q.rankName} className="flex flex-col items-center" style={{ minWidth: 64 }}>
                {/* Connector line before dot (except first) */}
                {i > 0 && (
                  <div
                    className="absolute"
                    style={{
                      top: 10, left: -32, width: 32, height: 1,
                      background: isUnlocked || qualifications[i - 1]?.qualifies
                        ? "rgba(212,175,55,0.3)"
                        : "rgba(255,255,255,0.07)",
                    }}
                  />
                )}

                {/* Dot */}
                <div
                  className="relative flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold mb-1.5 transition-all duration-300"
                  style={{
                    background: isUnlocked
                      ? color
                      : isNext
                      ? `${color}22`
                      : "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${
                      isUnlocked || isNext ? `${color}90` : "rgba(255,255,255,0.1)"
                    }`,
                    color:  isUnlocked ? "#050B1A" : color,
                    boxShadow: isActive
                      ? `0 0 12px ${color}60`
                      : isNext
                      ? `0 0 8px ${color}30`
                      : "none",
                  }}
                >
                  {isUnlocked ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    q.rankName.slice(0, 1)
                  )}

                  {/* Active pulsing ring */}
                  {isActive && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        border: `1px solid ${color}50`,
                        animation: "ping 2s cubic-bezier(0,0,0.2,1) infinite",
                        opacity: 0.4,
                      }}
                    />
                  )}
                </div>

                <span
                  className="text-[8px] font-semibold text-center leading-tight"
                  style={{
                    color: isUnlocked
                      ? color
                      : isNext
                      ? `${color}aa`
                      : "rgba(170,179,197,0.3)",
                    maxWidth: 56,
                  }}
                >
                  {q.rankName}
                </span>
                <span
                  className="text-[7px] mt-0.5"
                  style={{ color: "rgba(170,179,197,0.25)" }}
                >
                  {fmtUSD(q.requiredBusiness)}
                </span>
              </div>
            );
          })}

          {/* Fallback placeholder if no ranks loaded yet */}
          {qualifications.length === 0 &&
            ["Bronze","Silver","Gold","Platinum","Sapphire","Ruby","Emerald","Diamond","Ambassador","Sovereign Crown"].map((name) => (
              <div key={name} className="flex flex-col items-center" style={{ minWidth: 64 }}>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold mb-1.5"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)", color: "rgba(170,179,197,0.3)" }}
                >
                  {name.slice(0, 1)}
                </div>
                <span className="text-[8px] font-semibold" style={{ color: "rgba(170,179,197,0.3)" }}>
                  {name}
                </span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
