import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { Transaction } from "@/lib/api";

const CARD_BG   = "hsl(221, 59%, 14%)";
const BORDER    = "rgba(255,255,255,0.06)";
const GOLD      = "#D4AF37";
const GREEN     = "#34d399";
const MUTED     = "rgba(170,179,197,0.45)";
const AXIS_FONT = { fontSize: 11, fill: MUTED, fontFamily: "Inter, sans-serif" };

/* ── Helpers ── */

function buildPortfolioData(txs: Transaction[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      year:  d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString("en-US", { month: "short" }),
    };
  });

  let cumulative = 0;
  return months.map(({ year, month, label }) => {
    const monthTotal = txs
      .filter(tx => {
        const d = new Date(tx.createdAt);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    cumulative += monthTotal;
    return { month: label, value: Math.round(cumulative * 100) / 100 };
  });
}

function buildWeeklyData(txs: Transaction[]) {
  const now = Date.now();
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  return [3, 2, 1, 0].map(weeksBefore => {
    const end   = now - weeksBefore * MS_PER_WEEK;
    const start = end - MS_PER_WEEK;
    const total = txs
      .filter(tx => {
        const t = new Date(tx.createdAt).getTime();
        return t >= start && t < end;
      })
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const label = weeksBefore === 0 ? "This week"
      : weeksBefore === 1 ? "Last week"
      : `${weeksBefore}w ago`;
    return { week: label, total: Math.round(total * 100) / 100 };
  });
}

/* ── Tooltips ── */

interface TooltipProps { active?: boolean; payload?: Array<{ value: number }>; label?: string }

function PortfolioTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0A1628", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "10px", padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <p style={{ color: MUTED, fontSize: "11px", marginBottom: "4px" }}>{label}</p>
      <p style={{ color: GOLD, fontWeight: 700, fontSize: "16px", fontFamily: "Cormorant Garamond, serif" }}>
        ${payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function EarningsTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0A1628", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "10px", padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
      <p style={{ color: MUTED, fontSize: "11px", marginBottom: "4px" }}>{label}</p>
      <p style={{ color: GREEN, fontWeight: 700, fontSize: "16px", fontFamily: "Cormorant Garamond, serif" }}>
        +${payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

/* ── Shared card wrapper ── */

function ChartCard({ title, description, children, isEmpty }: {
  title: string; description?: string; children: React.ReactNode; isEmpty?: boolean;
}) {
  return (
    <div className="rounded-2xl p-5 lg:p-6"
      style={{ background: CARD_BG, border: `1px solid ${BORDER}`, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
      <div className="mb-4">
        <h3 className="text-base font-semibold font-heading text-foreground">{title}</h3>
        {description && <p className="text-xs mt-0.5" style={{ color: MUTED }}>{description}</p>}
      </div>
      {isEmpty ? (
        <div className="flex items-center justify-center h-[180px]">
          <p className="text-sm" style={{ color: MUTED }}>No data yet — check back after activity begins.</p>
        </div>
      ) : children}
    </div>
  );
}

/* ── Exported chart components ── */

export function PortfolioGrowthChart({ transactions }: { transactions: Transaction[] }) {
  const data    = buildPortfolioData(transactions);
  const isEmpty = data.every(d => d.value === 0);
  const maxVal  = Math.max(...data.map(d => d.value), 1);

  return (
    <ChartCard title="Portfolio Growth" description="Cumulative investment — last 6 months" isEmpty={isEmpty}>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.25} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="month" tick={AXIS_FONT} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_FONT} axisLine={false} tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
            domain={[0, maxVal * 1.1]} />
          <Tooltip content={<PortfolioTooltip />} cursor={{ stroke: "rgba(212,175,55,0.15)", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="value" stroke={GOLD} strokeWidth={2}
            fill="url(#goldGradient)" dot={false}
            activeDot={{ r: 5, fill: GOLD, stroke: "#0A1628", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function EarningsTrendChart({ transactions }: { transactions: Transaction[] }) {
  const data    = buildWeeklyData(transactions);
  const isEmpty = data.every(d => d.total === 0);

  return (
    <ChartCard title="Weekly Earnings" description="Income from all sources — last 4 weeks" isEmpty={isEmpty}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="week" tick={AXIS_FONT} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_FONT} axisLine={false} tickLine={false}
            tickFormatter={(v: number) => `$${v}`} />
          <Tooltip content={<EarningsTooltip />} cursor={{ fill: "rgba(212,175,55,0.04)" }} />
          <Bar dataKey="total" radius={[6, 6, 0, 0]}
            fill="rgba(212,175,55,0.15)" stroke={GOLD} strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
