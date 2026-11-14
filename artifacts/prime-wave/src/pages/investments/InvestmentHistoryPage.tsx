import { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import InvestmentTabs from "@/components/investments/InvestmentTabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, CheckCircle2, Loader2 } from "lucide-react";
import { listInvestments, type ApiInvestment } from "@/lib/api";

const PLAN_LABELS: Record<string, string> = {
  PLAN_90:  "Prime Wave 90",
  PLAN_180: "Prime Wave 180",
  PLAN_270: "Prime Wave 270",
  PLAN_360: "Prime Wave 360",
  SINGLE: "Prime Wave Single",
};

function fmt(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function roiEarned(inv: ApiInvestment): number {
  return Number(inv.totalRoiEarned ?? 0);
}

export default function InvestmentHistoryPage() {
  const [investments, setInvestments] = useState<ApiInvestment[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    listInvestments({ limit: 100 })
      .then((res) => setInvestments(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const completedCount = investments.filter((i) => i.status !== "ACTIVE").length;

  return (
    <AppLayout pageTitle="Investments" notificationCount={3}>
      <PageContainer>
        <InvestmentTabs />

        {/* Summary bar */}
        <div className="grid grid-cols-2 gap-3 mb-5 lg:mb-6">
          {[
            { label: "Total Records", value: loading ? "…" : `${investments.length}`, icon: TrendingUp,   color: "#D4AF37" },
            { label: "Completed",     value: loading ? "…" : `${completedCount}`,     icon: CheckCircle2, color: "#34d399" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl p-4"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 2px 12px rgba(0,0,0,0.25)" }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}1a` }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "rgba(170,179,197,0.5)" }}>{label}</p>
                <p className="text-lg font-bold font-heading text-foreground">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
          </div>
        ) : investments.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          >
            <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-30" style={{ color: "#D4AF37" }} />
            <p className="text-sm font-medium text-foreground">No investments yet</p>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              Create your first investment plan to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile: Cards */}
            <div className="md:hidden space-y-3">
              {investments.map((inv) => {
                const isCompleted = inv.status !== "ACTIVE";
                const earned = roiEarned(inv);
                return (
                  <div
                    key={inv.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "hsl(var(--card))",
                      border: `1px solid ${isCompleted ? "rgba(52,211,153,0.15)" : "hsl(var(--border))"}`,
                      boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                          style={{ background: isCompleted ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)" }}
                        >
                          <TrendingUp className="h-3.5 w-3.5" style={{ color: isCompleted ? "#34d399" : "#D4AF37" }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold font-heading text-foreground">
                            {PLAN_LABELS[inv.planType] ?? inv.planType}
                          </p>
                          <p className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {parseFloat(inv.dailyROI)}% daily · {fmtDate(inv.startedAt)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={isCompleted ? "success" : "secondary"}>
                        {isCompleted ? "Completed" : "Active"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Invested",   value: fmt(inv.amount),  color: "rgba(255,255,255,0.85)" },
                        { label: "ROI Earned", value: fmt(earned),       color: "#34d399" },
                        { label: "End Date", value: inv.planType === "SINGLE" ? "No fixed maturity" : fmtDate(inv.maturesAt), color: "rgba(170,179,197,0.7)" },
                      ].map((s) => (
                        <div key={s.label} className="text-center">
                          <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: "rgba(170,179,197,0.45)" }}>
                            {s.label}
                          </p>
                          <p className="text-xs font-semibold" style={{ color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Table */}
            <div
              className="hidden md:block rounded-2xl overflow-hidden"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                    {["Plan", "Amount", "ROI Earned", "Start Date", "End Date", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "hsl(var(--muted-foreground))" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {investments.map((inv, i) => {
                    const isCompleted = inv.status !== "ACTIVE";
                    const earned = roiEarned(inv);
                    return (
                      <tr
                        key={inv.id}
                        className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: i < investments.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: isCompleted ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)" }}
                            >
                              <TrendingUp className="h-3.5 w-3.5" style={{ color: isCompleted ? "#34d399" : "#D4AF37" }} />
                            </div>
                            <span className="font-semibold font-heading text-foreground">
                              {PLAN_LABELS[inv.planType] ?? inv.planType}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono font-semibold text-foreground">{fmt(inv.amount)}</td>
                        <td className="px-5 py-4 font-mono font-semibold" style={{ color: "#34d399" }}>+{fmt(earned)}</td>
                        <td className="px-5 py-4" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtDate(inv.startedAt)}</td>
                        <td className="px-5 py-4" style={{ color: "hsl(var(--muted-foreground))" }}>{inv.planType === "SINGLE" ? "No fixed maturity" : fmtDate(inv.maturesAt)}</td>
                        <td className="px-5 py-4">
                          <Badge variant={isCompleted ? "success" : "secondary"}>
                            {isCompleted ? "Completed" : "Active"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
}
