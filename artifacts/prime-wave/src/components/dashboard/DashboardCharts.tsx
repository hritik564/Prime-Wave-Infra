import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const portfolioData = [
  { month: "Jan", value: 5000 },
  { month: "Feb", value: 8500 },
  { month: "Mar", value: 7800 },
  { month: "Apr", value: 11200 },
  { month: "May", value: 13600 },
  { month: "Jun", value: 15000 },
];

const earningsData = [
  { week: "Week 1", total: 355 },
  { week: "Week 2", total: 415 },
  { week: "Week 3", total: 390 },
  { week: "Week 4", total: 465 },
];

const CARD_BG = "hsl(221, 59%, 14%)";
const BORDER = "rgba(255,255,255,0.06)";
const GOLD = "#D4AF37";
const MUTED = "rgba(170,179,197,0.45)";
const AXIS_FONT = { fontSize: 11, fill: MUTED, fontFamily: "Inter, sans-serif" };

interface PortfolioTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function PortfolioTooltip({ active, payload, label }: PortfolioTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0A1628",
        border: "1px solid rgba(212,175,55,0.2)",
        borderRadius: "10px",
        padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <p style={{ color: MUTED, fontSize: "11px", marginBottom: "4px" }}>{label}</p>
      <p style={{ color: GOLD, fontWeight: 700, fontSize: "16px", fontFamily: "Cormorant Garamond, serif" }}>
        ${payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

interface EarningsTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function EarningsTooltip({ active, payload, label }: EarningsTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0A1628",
        border: "1px solid rgba(212,175,55,0.2)",
        borderRadius: "10px",
        padding: "10px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <p style={{ color: MUTED, fontSize: "11px", marginBottom: "4px" }}>{label}</p>
      <p style={{ color: "#34d399", fontWeight: 700, fontSize: "16px", fontFamily: "Cormorant Garamond, serif" }}>
        +${payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5 lg:p-6"
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="mb-4">
        <h3 className="text-base font-semibold font-heading text-foreground">{title}</h3>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function PortfolioGrowthChart() {
  return (
    <ChartCard title="Portfolio Growth" description="6-month performance">
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={portfolioData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.25} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={AXIS_FONT}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_FONT}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v / 1000}k`}
          />
          <Tooltip content={<PortfolioTooltip />} cursor={{ stroke: "rgba(212,175,55,0.15)", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={GOLD}
            strokeWidth={2}
            fill="url(#goldGradient)"
            dot={false}
            activeDot={{ r: 5, fill: GOLD, stroke: "#0A1628", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function EarningsTrendChart() {
  return (
    <ChartCard title="Weekly Earnings" description="Last 4 weeks">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={earningsData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="week"
            tick={AXIS_FONT}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_FONT}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip content={<EarningsTooltip />} cursor={{ fill: "rgba(212,175,55,0.04)" }} />
          <Bar
            dataKey="total"
            radius={[6, 6, 0, 0]}
            fill="rgba(212,175,55,0.15)"
            stroke={GOLD}
            strokeWidth={1}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
