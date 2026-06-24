import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import InvestmentTabs from "@/components/investments/InvestmentTabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, CheckCircle2 } from "lucide-react";

interface HistoryItem {
  id: number;
  plan: string;
  amount: number;
  startDate: string;
  endDate: string;
  dailyRoi: number;
  totalRoi: number;
  status: "completed" | "active";
}

const history: HistoryItem[] = [
  { id: 1, plan: "Elite Growth",  amount: 5000, startDate: "Feb 15, 2026", endDate: "Aug 14, 2026", dailyRoi: 0.85, totalRoi: 518.70, status: "active" },
  { id: 2, plan: "Prime Orbit",   amount: 7500, startDate: "Mar 25, 2026", endDate: "Jul 23, 2026",  dailyRoi: 1.00, totalRoi: 615.00, status: "active" },
  { id: 3, plan: "Starter Pack",  amount: 2500, startDate: "Mar 25, 2026", endDate: "Jun 23, 2026",  dailyRoi: 0.75, totalRoi: 168.75, status: "completed" },
  { id: 4, plan: "Apex Binary",   amount: 1000, startDate: "Jan 15, 2026", endDate: "Apr 15, 2026",  dailyRoi: 0.90, totalRoi:  81.00, status: "completed" },
  { id: 5, plan: "Starter Pack",  amount: 500,  startDate: "Mar 01, 2026", endDate: "May 30, 2026",  dailyRoi: 0.75, totalRoi:  33.75, status: "completed" },
];

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvestmentHistoryPage() {
  return (
    <AppLayout pageTitle="Investments" notificationCount={3}>
      <PageContainer>
        <InvestmentTabs />

        {/* Summary bar */}
        <div
          className="grid grid-cols-2 gap-3 mb-5 lg:mb-6"
        >
          {[
            { label: "Total Records",      value: `${history.length}`,                  icon: TrendingUp,   color: "#D4AF37" },
            { label: "Completed",          value: `${history.filter((h) => h.status === "completed").length}`, icon: CheckCircle2, color: "#34d399" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl p-4"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
              }}
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

        {/* Mobile: Cards */}
        <div className="md:hidden space-y-3">
          {history.map((item) => {
            const isCompleted = item.status === "completed";
            return (
              <div
                key={item.id}
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
                      <p className="text-sm font-semibold font-heading text-foreground">{item.plan}</p>
                      <p className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {item.dailyRoi}% daily · {item.startDate}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isCompleted ? "success" : "secondary"}>
                    {isCompleted ? "Completed" : "Active"}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Invested",   value: fmt(item.amount),   color: "rgba(255,255,255,0.85)" },
                    { label: "ROI Earned", value: fmt(item.totalRoi), color: "#34d399" },
                    { label: "End Date",   value: item.endDate,       color: "rgba(170,179,197,0.7)" },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: "rgba(170,179,197,0.45)" }}>
                        {s.label}
                      </p>
                      <p className="text-xs font-semibold" style={{ color: s.color }}>
                        {s.value}
                      </p>
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
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}
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
              {history.map((item, i) => {
                const isCompleted = item.status === "completed";
                return (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-white/[0.02]"
                    style={{ borderBottom: i < history.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: isCompleted ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)" }}
                        >
                          <TrendingUp className="h-3.5 w-3.5" style={{ color: isCompleted ? "#34d399" : "#D4AF37" }} />
                        </div>
                        <span className="font-semibold font-heading text-foreground">{item.plan}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono font-semibold text-foreground">
                      {fmt(item.amount)}
                    </td>
                    <td className="px-5 py-4 font-mono font-semibold" style={{ color: "#34d399" }}>
                      +{fmt(item.totalRoi)}
                    </td>
                    <td className="px-5 py-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {item.startDate}
                    </td>
                    <td className="px-5 py-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {item.endDate}
                    </td>
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
      </PageContainer>
    </AppLayout>
  );
}
