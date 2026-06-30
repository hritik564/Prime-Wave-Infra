import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  TrendingUp, GitMerge, RefreshCw, Users, DollarSign,
  Clock, Award, ChevronRight, Sparkles, X, CheckCircle2,
  XCircle, Zap, Timer,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getIncomeDashboard, getWalletHistory,
  type IncomeDashboard, type Transaction,
} from "@/lib/api";

/* ── Constants ───────────────────────────────────────────────────────────── */

const GOLD  = "#D4AF37";
const CARD  = "hsl(221, 59%, 12%)";
const MUTED = "rgba(170,179,197,0.55)";

const TYPE_CONFIG: Record<string, {
  label: string; color: string; bg: string;
  icon: React.ElementType; short: string;
}> = {
  ROI_CLAIM:    { label: "ROI Income",   color: "#D4AF37", bg: "rgba(212,175,55,0.12)",  icon: TrendingUp, short: "ROI"    },
  BINARY_MATCH: { label: "Binary Match", color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: GitMerge,   short: "Binary" },
  BINARY_ORBIT: { label: "Orbit Income", color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: RefreshCw,  short: "Orbit"  },
  LEVEL_INCOME: { label: "Level Income", color: "#34d399", bg: "rgba(52,211,153,0.12)",  icon: Users,      short: "Level"  },
  SALARY:       { label: "Salary",       color: "#fb923c", bg: "rgba(251,146,60,0.12)",  icon: DollarSign, short: "Salary" },
};

type FilterKey = "ALL" | "ROI_CLAIM" | "BINARY_MATCH" | "BINARY_ORBIT" | "LEVEL_INCOME" | "SALARY";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmt(n: string | number | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  if (!isFinite(v as number)) return "0.00";
  return (v as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFull(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function typeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, color: GOLD, bg: "rgba(212,175,55,0.08)", icon: Sparkles, short: type };
}

function dayLabel(isoString: string): string {
  const d        = new Date(isoString);
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString())    return "TODAY";
  if (d.toDateString() === tomorrow.toDateString()) return "TOMORROW";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
}

function fmtTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/* "Unknown" vs "zero" — never show an estimated $0 */
function safeEst(amount: string | null | undefined, qualified: boolean): string {
  if (!qualified) return "Pending next cycle";
  if (!amount) return "Calculating...";
  const v = parseFloat(amount);
  if (!isFinite(v) || v === 0) return "Calculating...";
  return `~$${fmt(amount)}`;
}

/* ── Skeleton ─────────────────────────────────────────────────────────────── */

function Sk({ className }: { className?: string }) {
  return (
    <div className={`rounded-lg animate-pulse ${className}`}
      style={{ background: "rgba(255,255,255,0.06)" }} />
  );
}

/* ── Countdown hook ──────────────────────────────────────────────────────── */

function useCountdown(targetIso: string | undefined): string {
  const [remaining, setRemaining] = useState("—");
  useEffect(() => {
    if (!targetIso) return;
    const iso = targetIso;
    function update() {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) { setRemaining("Now"); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      if (h > 0)      setRemaining(`${h}h ${m}m`);
      else if (m > 0) setRemaining(`${m}m ${s}s`);
      else            setRemaining(`${s}s`);
    }
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

/* ── Standard snapshot card ──────────────────────────────────────────────── */

interface SnapCardProps {
  label:      string;
  value:      React.ReactNode;
  sub?:       React.ReactNode;
  icon:       React.ElementType;
  iconColor?: string;
  iconBg?:    string;
  loading?:   boolean;
  progress?:  { pct: number; label: string };
}

function SnapCard({ label, value, sub, icon: Icon, iconColor = GOLD, iconBg, loading, progress }: SnapCardProps) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: iconBg ?? "rgba(212,175,55,0.1)", border: `1px solid ${iconColor}25` }}>
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: MUTED }}>{label}</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Sk className="h-8 w-32" />
          <Sk className="h-4 w-24" />
        </div>
      ) : (
        <>
          <div className="text-2xl font-bold" style={{ color: "hsl(var(--foreground))", fontFamily: "Cormorant Garamond, serif" }}>
            {value}
          </div>
          {sub && <p className="text-xs leading-snug" style={{ color: MUTED }}>{sub}</p>}
          {progress && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${GOLD} 0%, #F3D37A 100%)` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.pct}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
              <p className="text-[10px]" style={{ color: MUTED }}>{progress.label}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Emphasized Next Credit card ─────────────────────────────────────────── */

function NextCreditCard({ countdown, nextCreditAt, loading }: {
  countdown: string; nextCreditAt: string | undefined; loading: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden"
      style={{
        background: CARD,
        border:     "1px solid rgba(212,175,55,0.3)",
        boxShadow:  "0 0 20px rgba(212,175,55,0.06)",
      }}
    >
      {/* Subtle gold shimmer strip at top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)" }}
      />

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)" }}>
          <Timer className="h-4 w-4" style={{ color: "#34d399" }} />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Next Credit</p>
        {/* Live indicator */}
        <div className="flex items-center gap-1 ml-auto">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "#34d399", boxShadow: "0 0 4px #34d399" }}
          />
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#34d399" }}>Live</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Sk className="h-10 w-28" />
          <Sk className="h-4 w-24" />
        </div>
      ) : (
        <>
          <div className="text-3xl font-bold" style={{ color: GOLD, fontFamily: "Cormorant Garamond, serif", letterSpacing: "-0.01em" }}>
            {countdown}
          </div>
          <p className="text-xs leading-snug" style={{ color: MUTED }}>
            ROI · Binary · Orbit
            {nextCreditAt && ` · ${fmtTime(nextCreditAt)}`}
          </p>
        </>
      )}
    </div>
  );
}

/* ── Source card — per-engine hierarchy, fully clickable ─────────────────── */

interface SourceCardProps {
  engine:  string;
  loading?: boolean;
  snap:    IncomeDashboard | null;
}

function DataRow({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px]" style={{ color: MUTED }}>{label}</span>
      <span className="text-[11px] font-semibold text-right" style={{ color: valueColor ?? "hsl(var(--foreground))" }}>
        {value}
      </span>
    </div>
  );
}

function SourceCard({ engine, loading, snap }: SourceCardProps) {
  const cfg  = typeConfig(engine);
  const Icon = cfg.icon;
  const [, navigate] = useLocation();

  const ROUTE_MAP: Record<string, string> = {
    ROI_CLAIM:    "/income/roi",
    BINARY_MATCH: "/income/binary",
    BINARY_ORBIT: "/income/orbit",
    SALARY:       "/income/salary",
    LEVEL_INCOME: "/income/level",
  };

  const src  = snap?.sources;
  const nextCreditIso =
    engine === "ROI_CLAIM"    ? src?.roi.nextCreditAt
    : engine === "BINARY_MATCH" ? src?.binary.nextCycleAt
    : engine === "BINARY_ORBIT" ? src?.orbit.nextCycleAt
    : engine === "SALARY"       ? src?.salary.nextSalaryAt
    : undefined;

  const countdown = useCountdown(nextCreditIso);

  /* Per-engine content rows */
  function renderRows(): React.ReactNode {
    if (!src) return null;

    if (engine === "ROI_CLAIM") {
      return (
        <>
          <DataRow label="Status" value={
            <span style={{ color: "#34d399" }} className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />Active
            </span>
          } />
          <DataRow
            label="Next Credit"
            value={nextCreditIso ? countdown : "—"}
            valueColor={GOLD}
          />
          <DataRow
            label="Today's ROI"
            value={`$${fmt(src.roi.todayEarnings)}`}
            valueColor={cfg.color}
          />
        </>
      );
    }

    if (engine === "BINARY_MATCH") {
      const q   = src.binary.isQualified;
      const est = safeEst(src.binary.estimatedNextPayout, q);
      return (
        <>
          <DataRow label="Status" value={
            q
              ? <span style={{ color: "#34d399" }} className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Qualified</span>
              : <span style={{ color: "#ef4444" }} className="flex items-center gap-1"><XCircle className="h-3 w-3" />Not qualified</span>
          } />
          <DataRow
            label="Next Matching"
            value={nextCreditIso ? countdown : "—"}
            valueColor={MUTED}
          />
          <DataRow
            label="Est. Next Payout"
            value={est}
            valueColor={est.startsWith("~") ? cfg.color : MUTED}
          />
        </>
      );
    }

    if (engine === "BINARY_ORBIT") {
      const q   = src.orbit.isQualified;
      const est = safeEst(src.orbit.estimatedNextPayout, q);
      return (
        <>
          <DataRow label="Status" value={
            q
              ? <span style={{ color: "#34d399" }} className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Qualified</span>
              : <span style={{ color: "#ef4444" }} className="flex items-center gap-1"><XCircle className="h-3 w-3" />Not qualified</span>
          } />
          <DataRow
            label="Next Orbit Cycle"
            value={nextCreditIso ? countdown : "—"}
            valueColor={MUTED}
          />
          <DataRow
            label="Est. Reward"
            value={est}
            valueColor={est.startsWith("~") ? cfg.color : MUTED}
          />
        </>
      );
    }

    if (engine === "SALARY") {
      const q = src.salary.isQualified;
      const monthlySalaryAmt = parseFloat(src.salary.monthlySalary);
      const rank = src.salary.activeRanks[0] ?? snap?.snapshot.currentRank ?? "—";
      return (
        <>
          <DataRow label="Status" value={
            q
              ? <span style={{ color: "#34d399" }} className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Qualified</span>
              : <span style={{ color: "#ef4444" }} className="flex items-center gap-1"><XCircle className="h-3 w-3" />Not qualified</span>
          } />
          <DataRow
            label="Monthly Salary"
            value={monthlySalaryAmt > 0 ? `$${fmt(monthlySalaryAmt)}/mo` : "—"}
            valueColor={monthlySalaryAmt > 0 ? cfg.color : MUTED}
          />
          <DataRow
            label="Next Salary"
            value={nextCreditIso ? fmtDate(nextCreditIso) : "—"}
            valueColor="hsl(var(--foreground))"
          />
          <DataRow
            label="Current Rank"
            value={rank}
            valueColor={GOLD}
          />
        </>
      );
    }

    /* LEVEL_INCOME */
    return (
      <>
        <DataRow label="Credit Type" value={
          <span style={{ color: "#34d399" }} className="flex items-center gap-1">
            <Zap className="h-3 w-3" />Instant
          </span>
        } />
        <DataRow
          label="Earned Today"
          value={`$${fmt(src.levelIncome.todayEarnings)}`}
          valueColor={cfg.color}
        />
        <DataRow
          label="This Month"
          value={`$${fmt(src.levelIncome.thisMonthEarnings)}`}
          valueColor="hsl(var(--foreground))"
        />
      </>
    );
  }

  const engineLabel: Record<string, string> = {
    ROI_CLAIM:    "ROI",
    BINARY_MATCH: "Binary",
    BINARY_ORBIT: "Orbit",
    SALARY:       "Salary",
    LEVEL_INCOME: "Level Income",
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-all duration-150 hover:scale-[1.01] hover:border-white/10 focus:outline-none focus-visible:ring-2"
      style={{
        background:   CARD,
        border:       "1px solid rgba(255,255,255,0.06)",
        userSelect:   "none",
      }}
      onClick={() => navigate(ROUTE_MAP[engine] ?? "/income")}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate(ROUTE_MAP[engine] ?? "/income"); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: cfg.bg }}>
            <Icon className="h-4 w-4" style={{ color: cfg.color }} />
          </div>
          <span className="text-sm font-semibold text-foreground">{engineLabel[engine] ?? cfg.label}</span>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "rgba(170,179,197,0.3)" }} />
      </div>

      {/* Rows */}
      {loading ? (
        <div className="space-y-2">
          <Sk className="h-4 w-full" />
          <Sk className="h-4 w-4/5" />
          <Sk className="h-4 w-3/5" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {renderRows()}
        </div>
      )}
    </div>
  );
}

/* ── Timeline section ────────────────────────────────────────────────────── */

interface TimelineEvent {
  engine:          string;
  label:           string;
  scheduledAt:     string;
  estimatedAmount: string | null;
  isEstimated:     boolean;
  isQualified:     boolean | null;
}

function engineColor(engine: string): string {
  const map: Record<string, string> = {
    ROI:    "#D4AF37",
    Binary: "#a78bfa",
    Orbit:  "#60a5fa",
    Salary: "#fb923c",
  };
  return map[engine] ?? GOLD;
}

function engineIcon(engine: string): React.ElementType {
  const map: Record<string, React.ElementType> = {
    ROI:    TrendingUp,
    Binary: GitMerge,
    Orbit:  RefreshCw,
    Salary: DollarSign,
  };
  return map[engine] ?? Sparkles;
}

function TimelineRow({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const color = engineColor(event.engine);
  const Icon  = engineIcon(event.engine);

  /* Use safe estimate — never show "Estimated $0.00" */
  const isQual = event.isQualified ?? true;
  let amountText: string;
  let amountColor: string;

  if (event.estimatedAmount != null) {
    const v = parseFloat(event.estimatedAmount);
    if (isFinite(v) && v > 0) {
      amountText  = event.isEstimated ? `~$${fmt(event.estimatedAmount)}` : `$${fmt(event.estimatedAmount)}`;
      amountColor = color;
    } else {
      amountText  = isQual ? "Calculating..." : "Pending next cycle";
      amountColor = MUTED;
    }
  } else {
    amountText  = isQual ? "Calculating..." : "Pending next cycle";
    amountColor = MUTED;
  }

  function qualBadge() {
    if (event.isQualified === null) return null;
    if (event.engine === "ROI") return null;
    return event.isQualified
      ? <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>Qualified</span>
      : <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>Not qualified</span>;
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-0.5" style={{ minWidth: 32 }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
          style={{ background: `${color}18`, border: `1px solid ${color}35` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        {!isLast && <div className="flex-1 w-px mt-2" style={{ background: "rgba(255,255,255,0.06)" }} />}
      </div>

      <div className={`flex-1 flex items-start justify-between gap-3 ${isLast ? "pb-1" : "pb-5"}`}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">{event.label}</p>
            {qualBadge()}
          </div>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>{fmtTime(event.scheduledAt)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold" style={{ color: amountColor, fontFamily: "Cormorant Garamond, serif" }}>
            {amountText}
          </p>
          {event.isEstimated && event.estimatedAmount != null && parseFloat(event.estimatedAmount) > 0 && (
            <p className="text-[10px]" style={{ color: MUTED }}>Estimated</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineSection({ events, loading }: { events: TimelineEvent[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(i => <Sk key={i} className="h-14" />)}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm" style={{ color: MUTED }}>No upcoming payouts to display</p>
      </div>
    );
  }

  const groups: { dayLabel: string; events: TimelineEvent[] }[] = [];
  for (const ev of events) {
    const dl = dayLabel(ev.scheduledAt);
    const g  = groups.find(x => x.dayLabel === dl);
    if (g) g.events.push(ev);
    else groups.push({ dayLabel: dl, events: [ev] });
  }

  return (
    <div className="space-y-4">
      {groups.map(grp => (
        <div key={grp.dayLabel}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
              style={{ background: "rgba(212,175,55,0.12)", color: GOLD }}>
              {grp.dayLabel}
            </span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
          <div>
            {grp.events.map((ev, i) => (
              <TimelineRow key={`${ev.engine}-${ev.scheduledAt}`} event={ev} isLast={i === grp.events.length - 1} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main page
   ═══════════════════════════════════════════════════════════════════════════ */

export default function IncomeCenterPage() {
  const [dash, setDash]     = useState<IncomeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [filter, setFilter]   = useState<FilterKey>("ALL");
  const [txs, setTxs]         = useState<Transaction[]>([]);
  const [txPage, setTxPage]   = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [historyInitialized, setHistoryInitialized] = useState(false);

  const filterRef = useRef<FilterKey>(filter);
  filterRef.current = filter;

  const INCOME_TYPES_LIST = ["ROI_CLAIM", "BINARY_MATCH", "BINARY_ORBIT", "LEVEL_INCOME", "SALARY"] as const;

  /* ── Load dashboard ──────────────────────────────────────────────────── */

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIncomeDashboard();
      setDash(data);
      setLastRefresh(new Date());
      if (!historyInitialized) {
        setTxs(data.recentIncome as unknown as Transaction[]);
        setHasMore(data.recentIncome.length >= 20);
        setHistoryInitialized(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load income data");
    } finally {
      setLoading(false);
    }
  }, [historyInitialized]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  /* ── Load more history ───────────────────────────────────────────────── */

  const loadMoreTxs = useCallback(async (pageNum: number, currentFilter: FilterKey) => {
    setTxLoading(true);
    try {
      const types = currentFilter === "ALL" ? [...INCOME_TYPES_LIST] : [currentFilter];
      const res   = await getWalletHistory({ page: pageNum, limit: 20, types });
      if (pageNum === 1) setTxs(res.data);
      else setTxs(prev => [...prev, ...res.data]);
      setHasMore(res.meta.hasNextPage);
      setTxPage(pageNum);
    } catch { /* keep existing */ }
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => {
    if (!historyInitialized) return;
    if (filter === "ALL" && txPage === 1) return;
    setTxPage(1);
    setHasMore(true);
    loadMoreTxs(1, filter);
  }, [filter]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Snapshot counters ───────────────────────────────────────────────── */

  const nextCredit = useCountdown(dash?.snapshot.nextCreditAt);
  const nextSalary = useCountdown(dash?.snapshot.salaryNextAt);
  void nextSalary; // available for future use

  /* ── Expected Next Credits display ──────────────────────────────────── */

  function pendingDisplay(): { value: React.ReactNode; sub: string } {
    if (!dash) return { value: "—", sub: "" };
    const { pendingThisCycle, isQualifiedForAny } = dash.snapshot;
    if (!isQualifiedForAny) {
      return {
        value: <span style={{ color: MUTED, fontSize: "1rem" }}>Not qualified</span>,
        sub:   "Refer 2+ members on each leg to qualify",
      };
    }
    const amt = parseFloat(pendingThisCycle);
    if (!isFinite(amt) || amt === 0) {
      return {
        value: <span style={{ color: MUTED, fontSize: "1rem" }}>Calculating…</span>,
        sub:   "Available after next matching cycle",
      };
    }
    return {
      value: <span style={{ color: GOLD }}>~${fmt(pendingThisCycle)}</span>,
      sub:   "Expected income from your upcoming payout cycle.",
    };
  }

  const pending = pendingDisplay();

  /* ── Monthly salary display ──────────────────────────────────────────── */

  function salaryDisplay(): { value: React.ReactNode; sub: string } {
    if (!dash) return { value: "—", sub: "" };
    const { monthlySalary, activeRanks } = dash.snapshot;
    const amt = parseFloat(monthlySalary);
    if (!isFinite(amt) || amt === 0) {
      return {
        value: <span style={{ color: MUTED, fontSize: "1rem" }}>Not qualified</span>,
        sub:   "Reach Bronze rank to unlock salary",
      };
    }
    return {
      value: <span style={{ color: "#fb923c" }}>${fmt(monthlySalary)}<span style={{ fontSize: "0.75rem", fontWeight: 400 }}>/mo</span></span>,
      sub:   activeRanks.join(" + "),
    };
  }

  const salaryDisp = salaryDisplay();

  /* ── Rank display ────────────────────────────────────────────────────── */

  function rankDisplay(): { value: React.ReactNode; sub: string; progress?: { pct: number; label: string } } {
    if (!dash) return { value: "—", sub: "" };
    const { currentRank, nextRank, rankProgressPct } = dash.snapshot;
    if (!currentRank) {
      return {
        value:    <span style={{ color: MUTED, fontSize: "1rem" }}>No rank yet</span>,
        sub:      "Build your network to qualify for Bronze",
        progress: nextRank ? { pct: rankProgressPct, label: `${rankProgressPct}% toward ${nextRank}` } : undefined,
      };
    }
    return {
      value:    <span style={{ color: GOLD }}>{currentRank}</span>,
      sub:      nextRank ? `${rankProgressPct}% toward ${nextRank}` : "All ranks achieved",
      progress: nextRank ? { pct: rankProgressPct, label: `${rankProgressPct}% toward ${nextRank}` } : undefined,
    };
  }

  const rankDisp = rankDisplay();

  /* ─────────────────────────────────────────────────────────────────────
     Render
     ───────────────────────────────────────────────────────────────────── */

  return (
    <AppLayout pageTitle="Income Center" notificationCount={0}>
      <PageContainer>
        <div className="space-y-6 pb-8">

          {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center justify-between flex-wrap gap-3"
          >
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
                Income Center
              </h1>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                Your complete earnings overview — all in one view
                {lastRefresh && (
                  <span> · Updated {lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                )}
              </p>
            </div>
            <button
              onClick={loadDashboard}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(212,175,55,0.08)", color: GOLD, border: "1px solid rgba(212,175,55,0.2)" }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </motion.div>

          {/* Error banner */}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ────────────────────────────────────────────────────────────────
              SECTION 1 — TODAY'S SNAPSHOT
          ──────────────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"
              style={{ color: MUTED }}>
              <Zap className="h-3.5 w-3.5" style={{ color: GOLD }} />
              Today's Snapshot
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

              {/* Today's Earnings */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
                <SnapCard
                  label="Today's Earnings"
                  value={<span style={{ color: GOLD }}>${fmt(dash?.snapshot.todayEarnings)}</span>}
                  sub="All income credited today"
                  icon={Sparkles}
                  loading={loading}
                />
              </motion.div>

              {/* Expected Next Credits */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
                <SnapCard
                  label="Expected Next Credits"
                  value={pending.value}
                  sub={pending.sub}
                  icon={Clock}
                  iconColor="#60a5fa"
                  iconBg="rgba(96,165,250,0.1)"
                  loading={loading}
                />
              </motion.div>

              {/* Next Credit — emphasized */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}>
                <NextCreditCard
                  countdown={nextCredit}
                  nextCreditAt={dash?.snapshot.nextCreditAt}
                  loading={loading}
                />
              </motion.div>

              {/* Monthly Salary */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
                <SnapCard
                  label="Monthly Salary"
                  value={salaryDisp.value}
                  sub={salaryDisp.sub}
                  icon={DollarSign}
                  iconColor="#fb923c"
                  iconBg="rgba(251,146,60,0.1)"
                  loading={loading}
                />
              </motion.div>

              {/* Current Rank */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                <SnapCard
                  label="Current Rank"
                  value={rankDisp.value}
                  sub={rankDisp.sub}
                  icon={Award}
                  loading={loading}
                  progress={rankDisp.progress}
                />
              </motion.div>
            </div>
          </section>

          {/* ────────────────────────────────────────────────────────────────
              SECTION 2 — INCOME SOURCES
          ──────────────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"
              style={{ color: MUTED }}>
              <TrendingUp className="h-3.5 w-3.5" style={{ color: GOLD }} />
              Income Sources
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {["ROI_CLAIM", "BINARY_MATCH", "BINARY_ORBIT", "SALARY", "LEVEL_INCOME"].map((engine, i) => (
                <motion.div
                  key={engine}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 + i * 0.04 }}
                >
                  <SourceCard engine={engine} loading={loading} snap={dash} />
                </motion.div>
              ))}
            </div>
          </section>

          {/* ────────────────────────────────────────────────────────────────
              SECTION 3 — UPCOMING PAYOUTS
          ──────────────────────────────────────────────────────────────── */}
          <section>
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
            >
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2"
                style={{ color: MUTED }}>
                <Clock className="h-3.5 w-3.5" style={{ color: GOLD }} />
                Upcoming Payouts
              </h2>
              <div className="rounded-2xl p-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
                <TimelineSection events={dash?.timeline ?? []} loading={loading} />
              </div>
            </motion.div>
          </section>

          {/* ────────────────────────────────────────────────────────────────
              SECTION 4 — RECENT INCOME
          ──────────────────────────────────────────────────────────────── */}
          <section>
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26 }}
            >
              {/* Filter chips */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 mr-1"
                  style={{ color: MUTED }}>
                  <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
                  Recent Income
                </h2>
                {([
                  { key: "ALL" as FilterKey,         label: "All"    },
                  { key: "ROI_CLAIM" as FilterKey,    label: "ROI"    },
                  { key: "BINARY_MATCH" as FilterKey, label: "Binary" },
                  { key: "BINARY_ORBIT" as FilterKey, label: "Orbit"  },
                  { key: "LEVEL_INCOME" as FilterKey, label: "Level"  },
                  { key: "SALARY" as FilterKey,       label: "Salary" },
                ]).map(({ key, label }) => {
                  const active = filter === key;
                  const color  = key === "ALL" ? GOLD : typeConfig(key).color;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                      style={{
                        background: active ? `${color}18` : "rgba(255,255,255,0.04)",
                        border:     `1px solid ${active ? `${color}50` : "rgba(255,255,255,0.08)"}`,
                        color:      active ? color : MUTED,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Transaction list */}
              <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
                {loading ? (
                  <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                        <Sk className="h-9 w-9 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Sk className="h-4 w-32" />
                          <Sk className="h-3 w-20" />
                        </div>
                        <Sk className="h-5 w-16" />
                      </div>
                    ))}
                  </div>
                ) : txs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl mb-3"
                      style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.12)" }}>
                      <Sparkles className="h-6 w-6" style={{ color: GOLD }} />
                    </div>
                    <p className="text-sm font-medium text-foreground">No income yet</p>
                    <p className="text-xs mt-1 text-center max-w-xs" style={{ color: MUTED }}>
                      {filter === "ALL"
                        ? "Once your investments start generating income, it will appear here."
                        : `No ${typeConfig(filter).label.toLowerCase()} income recorded yet.`}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                    {txs.map((tx, i) => {
                      const cfg  = typeConfig(tx.type);
                      const Icon = cfg.icon;
                      return (
                        <motion.button
                          key={tx.id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.02, 0.3) }}
                          onClick={() => setSelected(tx)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: cfg.bg }}>
                            <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{cfg.label}</p>
                            <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>
                              {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold" style={{ color: cfg.color }}>+${fmt(tx.amount)}</p>
                            <p className="text-[10px] mt-0.5 px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}>
                              {tx.status}
                            </p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(170,179,197,0.3)" }} />
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Load more */}
                {!loading && hasMore && (
                  <div className="flex justify-center p-4">
                    <button
                      onClick={() => loadMoreTxs(txPage + 1, filterRef.current)}
                      disabled={txLoading}
                      className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", color: MUTED, border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {txLoading ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
                {!loading && !hasMore && txs.length > 0 && (
                  <p className="text-center text-xs py-4" style={{ color: MUTED }}>
                    All {txs.length} records shown
                  </p>
                )}
              </div>
            </motion.div>
          </section>

        </div>
      </PageContainer>

      {/* ── TRANSACTION DETAIL DRAWER ────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.6)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-3xl lg:top-0 lg:bottom-0 lg:left-auto lg:right-0 lg:w-96 lg:rounded-none lg:rounded-l-2xl"
              style={{
                background:   "hsl(221, 62%, 11%)",
                border:       "1px solid rgba(255,255,255,0.07)",
                borderBottom: "none",
                maxHeight:    "85vh",
              }}
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: "0%" }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
            >
              <div className="flex justify-center pt-3 pb-1 lg:hidden">
                <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              </div>
              <div className="flex-1 overflow-y-auto p-5 pb-8">
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
                {(() => {
                  const cfg  = typeConfig(selected.type);
                  const Icon = cfg.icon;
                  return (
                    <div className="flex flex-col items-center text-center mb-6">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-3"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
                        <Icon className="h-7 w-7" style={{ color: cfg.color }} />
                      </div>
                      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: MUTED }}>{cfg.label}</p>
                      <p className="text-3xl font-bold" style={{ color: cfg.color, fontFamily: "Cormorant Garamond, serif" }}>
                        +${fmt(selected.amount)}
                      </p>
                    </div>
                  );
                })()}
                <div className="space-y-0">
                  {[
                    { label: "Status",    value: selected.status },
                    { label: "Date",      value: fmtFull(selected.createdAt).split("·")[0]?.trim() },
                    { label: "Time",      value: fmtFull(selected.createdAt).split("·")[1]?.trim() },
                    { label: "Reference", value: selected.id },
                    ...(selected.description ? [{ label: "Note", value: selected.description }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between py-3"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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
