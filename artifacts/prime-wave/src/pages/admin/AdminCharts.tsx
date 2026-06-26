import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const GOLD   = "#D4AF37";
const MUTED  = "rgba(170,179,197,0.3)";
const BORDER = "rgba(255,255,255,0.07)";

const tooltipStyle: React.CSSProperties = {
  background: "hsl(222 62% 8%)",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  fontSize: 11,
  color: "rgba(255,255,255,0.75)",
};

interface ChartData { d: string; v: number }
interface AdminChartsProps {
  memberGrowth: ChartData[];
  investmentVolume: ChartData[];
  revenueTrend: ChartData[];
  ChartCard: React.ComponentType<{
    title: string; subtitle?: string;
    children: React.ReactNode; style?: React.CSSProperties;
  }>;
  Card: React.ComponentType<{ children: React.ReactNode; style?: React.CSSProperties }>;
}

export default function AdminCharts({
  memberGrowth, investmentVolume, revenueTrend, ChartCard,
}: AdminChartsProps) {
  return (
    <>
      {/* Row 1: member growth + investment volume */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <ChartCard title="Member Growth" subtitle="Last 7 days">
          <ResponsiveContainer width="100%" height={165}>
            <AreaChart data={memberGrowth} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
              <XAxis dataKey="d" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} domain={["dataMin - 20", "dataMax + 10"]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(96,165,250,0.2)" }} formatter={(v: number) => [v.toLocaleString(), "Members"]} />
              <Area type="monotone" dataKey="v" stroke="#60a5fa" strokeWidth={2} fill="url(#mg)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Investment Volume" subtitle="Last 7 days ($K)">
          <ResponsiveContainer width="100%" height={165}>
            <BarChart data={investmentVolume} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
              <XAxis dataKey="d" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(v: number) => [`$${v}K`, "Volume"]} />
              <Bar dataKey="v" fill={GOLD} opacity={0.85} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: revenue trend (full width) */}
      <ChartCard title="Revenue Trend" subtitle="Last 8 weeks ($K)" style={{ marginBottom: 20 }}>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={revenueTrend} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="d" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(167,139,250,0.2)" }} formatter={(v: number) => [`$${v}K`, "Revenue"]} />
            <Line type="monotone" dataKey="v" stroke="#a78bfa" strokeWidth={2} dot={{ fill: "#a78bfa", r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}
