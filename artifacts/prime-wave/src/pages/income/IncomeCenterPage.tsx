import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, GitMerge, RefreshCw, Users, DollarSign,
  X, Target, BarChart2, Zap, Award, ArrowUpRight, ChevronRight,
  Sparkles,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getIncomeSummary, getIncomeTrend, getWalletHistory,
  type IncomeSummary, type TrendPoint, type Transaction,
} from "@/lib/api";

/* ── Type config ─────────────────────────────────────────────────────────── */

const TYPE_CONFIG = {
  ROI_CLAIM:    { label: "ROI Income",    color: "#D4AF37", bg: "rgba(212,175,55,0.12)",  icon: TrendingUp, short: "ROI"    },
  BINARY_MATCH: { label: "Binary Match",  color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: GitMerge,   short: "Binary" },
  BINARY_ORBIT: { label: "Orbit Income",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: RefreshCw,  short: "Orbit"  },
  LEVEL_INCOME: { label: "Level Income",  color: "#34d399", bg: "rgba(52,211,153,0.12)",  icon: Users,      short: "Level"  },
  SALARY:       { label: "Salary",        color: "#fb923c", bg: "rgba(251,146,60,0.12)",  icon: DollarSign, short: "Salary" },
} as const;

type IncomeTypeKey = keyof typeof TYPE_CONFIG;
const INCOME_TYPES = Object.keys(TYPE_CONFIG) as IncomeTypeKey[];

type TrendPeriod = "7d" | "30d" | "90d" | "1y" | "all";
type FilterKey   = "ALL" | IncomeTypeKey;

/* ── Styling constants ───────────────────────────────────────────────────── */

const CARD  = "hsl(221, 59%, 12%)";
const GOLD  = "#D4AF37";
const MUTED = "rgba(170,179,197,0.55)";
const AXIS  = { fontSize: 11, fill: "rgba(170,179,197,0.45)", fontFamily: "Inter, sans-serif" };

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmt(n: string | number = 0): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!isFinite(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtChartDate(iso: string, period: TrendPeriod): string {
  const d = new Date(iso);
  if (period === "1y" || period === "all") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }) + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function typeConfig(type: string) {
  return TYPE_CONFIG[type as IncomeTypeKey] ?? {
    label: type, color: GOLD, bg: "rgba(212,175,55,0.08)", icon: Sparkles, short: type,
  };
}

/* ── AnimatedNumber ──────────────────────────────────────────────────────── */

function AnimatedNumber({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [disp, setDisp] = useState(0);
  const fromRef = useRef(0);
  const rafRef  = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = fromRef.current;
    const to   = value;
    fromRef.current = to;
    const start = performance.now();
    const dur   = 900;
    const tick  = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(from + (to - from) * e);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return (
    <span className={className} style={style}>
      ${disp.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

/* ── Custom chart tooltips ───────────────────────────────────────────────── */

function TrendTooltip({ active, payload, label, period }: {
  active?: boolean; payload?: Array<{ value: number }>; label?: string; period: TrendPeriod;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0A1628", border: "1px solid rgba(212,175,55,0.25)",
      borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    }}>
      <p style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>
        {label ? fmtChartDate(label, period) : ""}
      </p>
      <p style={{ color: GOLD, fontWeight: 700, fontSize: 17, fontFamily: "Cormorant Garamond, serif" }}>
        +${fmt(payload[0].value)}
      </p>
    </div>
  );
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string; percentage: string } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div style={{
      background: "#0A1628", border: `1px solid ${item.payload.color}33`,
      borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    }}>
      <p style={{ color: MUTED, fontSize: 11, marginBottom: 3 }}>{item.name}</p>
      <p style={{ color: item.payload.color, fontWeight: 700, fontSize: 16, fontFamily: "Cormorant Garamond, serif" }}>
        ${fmt(item.value)}
      </p>
      <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{item.payload.percentage}% of total</p>
    </div>
  );
}

/* ── SkeletonBlock ───────────────────────────────────────────────────────── */

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-pulse ${className}`}
      style={{ background: "rgba(255,255,255,0.06)" }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════════════════════════════════ */

const PERIOD_LABELS: { key: TrendPeriod; label: string }[] = [
  { key: "7d",  label: "7D"  },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "1y",  label: "1Y"  },
  { key: "all", label: "All" },
];

const HERO_PERIODS = [
  { key: "today",    label: "Today"     },
  { key: "week",     label: "This Week" },
  { key: "month",    label: "This Month"},
  { key: "lifetime", label: "Lifetime"  },
] as const;

type HeroPeriod = "today" | "week" | "month" | "lifetime";

export default function IncomeCenterPage() {
  /* ── Data state ─────────────────────────────────────────────────────── */
  const [summary, setSummary]         = useState<IncomeSummary | null>(null);
  const [trend, setTrend]             = useState<TrendPoint[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("30d");
  const [txs, setTxs]                 = useState<Transaction[]>([]);
  const [txPage, setTxPage]           = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter]           = useState<FilterKey>("ALL");
  const [heroPeriod, setHeroPeriod]   = useState<HeroPeriod>("today");
  const [selected, setSelected]       = useState<Transaction | null>(null);
  const [loading, setLoading]         = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);
  const [goal, setGoal] = useState<number>(() => {
    const s = localStorage.getItem("pw_income_goal");
    return s ? parseFloat(s) : 0;
  });
  const [editGoal, setEditGoal]   = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterRef   = useRef<FilterKey>(filter);
  filterRef.current = filter;

  /* ── Loaders ────────────────────────────────────────────────────────── */

  useEffect(() => {
    (async () => {
      try {
        const s = await getIncomeSummary();
        setSummary(s);
      } catch { /* empty state */ }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    setTrendLoading(true);
    getIncomeTrend(trendPeriod)
      .then(setTrend)
      .catch(() => setTrend([]))
      .finally(() => setTrendLoading(false));
  }, [trendPeriod]);

  const loadTxs = useCallback(async (pageNum: number, currentFilter: FilterKey) => {
    setLoadingMore(true);
    try {
      const types = currentFilter === "ALL" ? INCOME_TYPES : [currentFilter];
      const res = await getWalletHistory({ page: pageNum, limit: 20, types });
      if (pageNum === 1) {
        setTxs(res.data);
      } else {
        setTxs(prev => [...prev, ...res.data]);
      }
      setHasMore(res.meta.hasNextPage);
      setTxPage(pageNum);
    } catch { /* keep existing */ }
    finally { setLoadingMore(false); }
  }, []);

  useEffect(() => {
    setTxs([]);
    setTxPage(1);
    setHasMore(true);
    loadTxs(1, filter);
  }, [filter, loadTxs]);

  /* ── Infinite scroll ────────────────────────────────────────────────── */

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          loadTxs(txPage + 1, filterRef.current);
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, txPage, loadTxs]);

  /* ── Derived values ─────────────────────────────────────────────────── */

  const heroValue = summary ? parseFloat(summary.periods[heroPeriod]) : 0;
  const monthTotal = summary ? parseFloat(summary.periods.month) : 0;
  const goalPct = goal > 0 ? Math.min((monthTotal / goal) * 100, 100) : 0;

  const donutData = (summary?.breakdown ?? [])
    .filter(b => parseFloat(b.total) > 0)
    .map(b => {
      const cfg = typeConfig(b.type);
      return { name: cfg.label, value: parseFloat(b.total), color: cfg.color, percentage: b.percentage };
    });

  const chartData = trend.map(p => ({
    date:  p.date,
    total: p.total,
  }));

  /* ── Save goal ──────────────────────────────────────────────────────── */

  function saveGoal() {
    const val = parseFloat(goalInput);
    if (!isNaN(val) && val > 0) {
      setGoal(val);
      localStorage.setItem("pw_income_goal", String(val));
    }
    setEditGoal(false);
    setGoalInput("");
  }

  /* ─────────────────────────────────────────────────────────────────────
     Render
     ───────────────────────────────────────────────────────────────────── */

  return (
    <AppLayout pageTitle="Income Center" notificationCount={0}>
      <PageContainer>
        <div className="space-y-5 pb-6">

          {/* ── HERO ──────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div
              className="relative overflow-hidden rounded-2xl p-5 lg:p-7"
              style={{
                background: "linear-gradient(135deg, hsl(221,65%,13%) 0%, hsl(230,55%,18%) 100%)",
                border: "1px solid rgba(212,175,55,0.18)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
              }}
            >
              {/* Glow */}
              <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)" }} />

              {/* Header */}
              <div className="flex items-center gap-2 mb-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.2)" }}>
                  <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: GOLD }}>
                    Income Center
                  </p>
                  <p className="text-[11px]" style={{ color: MUTED }}>All earnings in one view</p>
                </div>
              </div>

              {/* Period tabs */}
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {HERO_PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setHeroPeriod(p.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                    style={{
                      background: heroPeriod === p.key ? "rgba(212,175,55,0.18)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${heroPeriod === p.key ? "rgba(212,175,55,0.35)" : "rgba(255,255,255,0.06)"}`,
                      color: heroPeriod === p.key ? GOLD : MUTED,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Main number */}
              {loading ? (
                <Skeleton className="h-14 w-56 mb-2" />
              ) : (
                <AnimatedNumber
                  value={heroValue}
                  className="block text-4xl lg:text-5xl font-bold"
                  style={{ fontFamily: "Cormorant Garamond, serif", color: GOLD }}
                />
              )}
              <p className="text-sm mt-1" style={{ color: MUTED }}>
                {HERO_PERIODS.find(p => p.key === heroPeriod)?.label} earnings
              </p>

              {/* Sub-period row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                {HERO_PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setHeroPeriod(p.key)}
                    className="text-left rounded-xl p-3 transition-all duration-150"
                    style={{
                      background: heroPeriod === p.key ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${heroPeriod === p.key ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.05)"}`,
                    }}
                  >
                    <p className="text-[10px] mb-1 uppercase tracking-wider" style={{ color: MUTED }}>{p.label}</p>
                    {loading ? <Skeleton className="h-5 w-16" /> : (
                      <p className="text-sm font-semibold" style={{ color: heroPeriod === p.key ? GOLD : "hsl(var(--foreground))" }}>
                        ${fmt(summary?.periods[p.key])}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── MONTHLY GOAL ──────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            <div
              className="rounded-2xl p-4 lg:p-5"
              style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" style={{ color: GOLD }} />
                  <span className="text-sm font-semibold text-foreground">Monthly Goal</span>
                </div>
                <button
                  onClick={() => { setEditGoal(true); setGoalInput(goal > 0 ? String(goal) : ""); }}
                  className="text-xs px-2 py-1 rounded-lg transition-colors"
                  style={{ background: "rgba(212,175,55,0.08)", color: GOLD, border: "1px solid rgba(212,175,55,0.15)" }}
                >
                  {goal > 0 ? "Edit" : "Set Goal"}
                </button>
              </div>

              {goal > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: MUTED }}>
                      ${fmt(monthTotal)} earned
                    </span>
                    <span className="text-xs font-medium" style={{ color: GOLD }}>
                      {goalPct.toFixed(1)}% of ${fmt(goal)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${GOLD} 0%, #F3D37A 100%)` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${goalPct}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: MUTED }}>
                    ${fmt(Math.max(0, goal - monthTotal))} remaining this month
                  </p>
                </>
              ) : (
                <p className="text-sm" style={{ color: MUTED }}>
                  Set a monthly income goal to track your progress
                </p>
              )}

              {/* Edit goal input */}
              <AnimatePresence>
                {editGoal && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 flex gap-2"
                  >
                    <input
                      type="number"
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      placeholder="Enter monthly goal ($)"
                      className="flex-1 rounded-lg px-3 py-2 text-sm bg-transparent text-foreground"
                      style={{ border: "1px solid rgba(212,175,55,0.25)", outline: "none" }}
                      onKeyDown={e => e.key === "Enter" && saveGoal()}
                      autoFocus
                    />
                    <button
                      onClick={saveGoal}
                      className="px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ background: "rgba(212,175,55,0.15)", color: GOLD, border: "1px solid rgba(212,175,55,0.25)" }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditGoal(false)}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ background: "rgba(255,255,255,0.05)", color: MUTED }}
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* ── BREAKDOWN CARDS ───────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <h2 className="text-sm font-semibold text-foreground mb-2.5 flex items-center gap-2">
              <BarChart2 className="h-4 w-4" style={{ color: GOLD }} />
              Income Sources
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {INCOME_TYPES.map((type, i) => {
                const cfg = typeConfig(type);
                const b   = summary?.breakdown.find(x => x.type === type);
                const Icon = cfg.icon;
                return (
                  <motion.div
                    key={type}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                  >
                    <div
                      className="rounded-2xl p-4 cursor-pointer transition-all duration-200"
                      style={{
                        background: CARD,
                        border: filter === type
                          ? `1px solid ${cfg.color}55`
                          : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: filter === type ? `0 0 16px ${cfg.color}18` : undefined,
                      }}
                      onClick={() => setFilter(filter === type ? "ALL" : type)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{ background: cfg.bg }}
                        >
                          <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {loading ? "—" : `${b?.percentage ?? "0"}%`}
                        </span>
                      </div>
                      <p className="text-[11px] mb-0.5" style={{ color: MUTED }}>{cfg.label}</p>
                      {loading ? (
                        <Skeleton className="h-6 w-20" />
                      ) : (
                        <p className="text-base font-bold" style={{ color: cfg.color, fontFamily: "Cormorant Garamond, serif" }}>
                          ${fmt(b?.total)}
                        </p>
                      )}
                      <p className="text-[10px] mt-1" style={{ color: MUTED }}>
                        Today: <span style={{ color: "hsl(var(--foreground))" }}>${fmt(b?.today)}</span>
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* ── CHARTS ROW ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Donut chart */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12 }}
            >
              <div
                className="rounded-2xl p-5 h-full"
                style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <h3 className="text-sm font-semibold text-foreground mb-1">Portfolio Mix</h3>
                <p className="text-xs mb-4" style={{ color: MUTED }}>Income by source</p>

                {loading || donutData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40">
                    {loading
                      ? <Skeleton className="h-32 w-32 rounded-full" />
                      : <p className="text-sm text-center" style={{ color: MUTED }}>No income recorded yet</p>
                    }
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%" cy="50%"
                        innerRadius={52} outerRadius={78}
                        dataKey="value"
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {donutData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<DonutTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}

                {/* Legend */}
                <div className="space-y-1.5 mt-2">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-xs" style={{ color: MUTED }}>{d.name}</span>
                      </div>
                      <span className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>
                        {d.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Trend chart */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 }}
            >
              <div
                className="rounded-2xl p-5 h-full"
                style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Earnings Trend</h3>
                    <p className="text-xs" style={{ color: MUTED }}>Daily income over time</p>
                  </div>
                  <div className="flex gap-1">
                    {PERIOD_LABELS.map(p => (
                      <button
                        key={p.key}
                        onClick={() => setTrendPeriod(p.key)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                        style={{
                          background: trendPeriod === p.key ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${trendPeriod === p.key ? "rgba(212,175,55,0.3)" : "rgba(255,255,255,0.05)"}`,
                          color: trendPeriod === p.key ? GOLD : MUTED,
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {trendLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-48">
                    <p className="text-sm" style={{ color: MUTED }}>No data for this period</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={195}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={GOLD} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={AXIS}
                        axisLine={false} tickLine={false}
                        tickFormatter={d => fmtChartDate(d, trendPeriod)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={AXIS}
                        axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`}
                      />
                      <Tooltip
                        content={<TrendTooltip period={trendPeriod} />}
                        cursor={{ stroke: "rgba(212,175,55,0.15)", strokeWidth: 1 }}
                      />
                      <Area
                        type="monotone" dataKey="total"
                        stroke={GOLD} strokeWidth={2}
                        fill="url(#incGrad)"
                        dot={false}
                        activeDot={{ r: 5, fill: GOLD, stroke: "#0A1628", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          </div>

          {/* ── ANALYTICS PANEL ───────────────────────────────────────── */}
          {summary && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.16 }}
            >
              <div
                className="rounded-2xl p-5"
                style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Zap className="h-4 w-4" style={{ color: GOLD }} />
                  Analytics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    {
                      label: "Highest Source",
                      value: summary.analytics.highestSource
                        ? typeConfig(summary.analytics.highestSource).short
                        : "—",
                      icon: Award,
                      color: summary.analytics.highestSource
                        ? typeConfig(summary.analytics.highestSource).color
                        : GOLD,
                    },
                    {
                      label: "Largest Reward",
                      value: `$${fmt(summary.analytics.largestReward)}`,
                      icon: ArrowUpRight,
                      color: GOLD,
                    },
                    {
                      label: "Avg Daily",
                      value: `$${fmt(summary.analytics.avgDailyIncome)}`,
                      icon: BarChart2,
                      color: "#60a5fa",
                    },
                    {
                      label: "Avg Monthly",
                      value: `$${fmt(summary.analytics.avgMonthlyIncome)}`,
                      icon: BarChart2,
                      color: "#34d399",
                    },
                    {
                      label: "ROI Share",
                      value: `${summary.analytics.roiVsNetworkRoi}%`,
                      icon: TrendingUp,
                      color: GOLD,
                    },
                    {
                      label: "Total Txns",
                      value: summary.analytics.totalTransactions.toLocaleString(),
                      icon: ChevronRight,
                      color: "#a78bfa",
                    },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div
                      key={label}
                      className="rounded-xl p-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                        <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>{label}</p>
                      </div>
                      <p className="text-sm font-semibold" style={{ color }}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── UNIFIED TIMELINE ──────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
          >
            {/* Filter chips */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground mr-1">History</h2>
              {([
                { key: "ALL" as FilterKey,    label: "All" },
                { key: "ROI_CLAIM" as FilterKey, label: "ROI" },
                { key: "BINARY_MATCH" as FilterKey, label: "Binary" },
                { key: "BINARY_ORBIT" as FilterKey, label: "Orbit" },
                { key: "LEVEL_INCOME" as FilterKey, label: "Level" },
                { key: "SALARY" as FilterKey, label: "Salary" },
              ]).map(({ key, label }) => {
                const active = filter === key;
                const color  = key === "ALL" ? GOLD : typeConfig(key).color;
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-150"
                    style={{
                      background: active ? `${color}18` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? `${color}50` : "rgba(255,255,255,0.08)"}`,
                      color: active ? color : MUTED,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Transaction list */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {txs.length === 0 && !loadingMore ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl mb-3"
                    style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.12)" }}>
                    <Sparkles className="h-6 w-6" style={{ color: GOLD }} />
                  </div>
                  <p className="text-sm font-medium text-foreground">No income yet</p>
                  <p className="text-xs mt-1 text-center max-w-xs" style={{ color: MUTED }}>
                    {filter === "ALL"
                      ? "Once your investments start generating income it will appear here."
                      : `No ${typeConfig(filter as string).label.toLowerCase()} income recorded yet.`}
                  </p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  {txs.map((tx, i) => {
                    const cfg = typeConfig(tx.type);
                    const Icon = cfg.icon;
                    return (
                      <motion.button
                        key={tx.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.025, 0.4) }}
                        onClick={() => setSelected(tx)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                      >
                        {/* Icon */}
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                          style={{ background: cfg.bg }}
                        >
                          <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{cfg.label}</p>
                          <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>
                            {tx.description ?? fmtFull(tx.createdAt).split("·")[0].trim()}
                          </p>
                        </div>

                        {/* Amount + date */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold" style={{ color: cfg.color }}>
                            +${fmt(tx.amount)}
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                            {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        </div>

                        <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(170,179,197,0.3)" }} />
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Loading more */}
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-transparent"
                    style={{ borderTopColor: GOLD }} />
                </div>
              )}

              {/* Sentinel for infinite scroll */}
              <div ref={sentinelRef} className="h-1" />

              {!hasMore && txs.length > 0 && (
                <p className="text-center text-xs py-4" style={{ color: MUTED }}>
                  All {txs.length} records loaded
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </PageContainer>

      {/* ── DETAILS DRAWER ────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.6)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />

            {/* Panel — bottom sheet on mobile, right sidebar on desktop */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-3xl lg:top-0 lg:bottom-0 lg:left-auto lg:right-0 lg:w-96 lg:rounded-none lg:rounded-l-2xl"
              style={{
                background: "hsl(221, 62%, 11%)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderBottom: "none",
                maxHeight: "85vh",
              }}
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: "0%" }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 lg:hidden">
                <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              </div>

              <div className="flex-1 overflow-y-auto p-5 pb-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-semibold text-foreground">Transaction Details</h3>
                  <button
                    onClick={() => setSelected(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <X className="h-4 w-4" style={{ color: MUTED }} />
                  </button>
                </div>

                {/* Type badge */}
                {(() => {
                  const cfg = typeConfig(selected.type);
                  const Icon = cfg.icon;
                  return (
                    <div className="flex flex-col items-center text-center mb-6">
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-2xl mb-3"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}
                      >
                        <Icon className="h-7 w-7" style={{ color: cfg.color }} />
                      </div>
                      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: MUTED }}>
                        {cfg.label}
                      </p>
                      <p
                        className="text-3xl font-bold"
                        style={{ color: cfg.color, fontFamily: "Cormorant Garamond, serif" }}
                      >
                        +${fmt(selected.amount)}
                      </p>
                    </div>
                  );
                })()}

                {/* Detail rows */}
                <div className="space-y-0">
                  {[
                    { label: "Status",    value: selected.status },
                    { label: "Date",      value: fmtFull(selected.createdAt).split("·")[0].trim() },
                    { label: "Time",      value: fmtFull(selected.createdAt).split("·")[1]?.trim() },
                    { label: "Reference", value: selected.id },
                    ...(selected.description ? [{ label: "Note", value: selected.description }] : []),
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex items-start justify-between py-3"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <span className="text-xs" style={{ color: MUTED }}>{label}</span>
                      <span className="text-xs text-right text-foreground font-medium max-w-[60%] break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
