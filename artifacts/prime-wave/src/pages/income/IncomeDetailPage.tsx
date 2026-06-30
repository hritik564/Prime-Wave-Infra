import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  TrendingUp, GitMerge, RefreshCw, Users, DollarSign,
  Clock, Award, ChevronRight, Sparkles, X, CheckCircle2,
  XCircle, Zap, Timer, ArrowLeft, HelpCircle, ChevronDown,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getWalletHistory, type Transaction,
  getRoiDetail, getBinaryDetail, getOrbitDetail, getSalaryDetail, getLevelDetail,
  type RoiDetail, type BinaryDetail, type OrbitDetail, type SalaryDetail, type LevelDetail,
} from "@/lib/api";

/* ─────────────────────────────────────────────────────────────────────────────
   Constants & helpers
   ───────────────────────────────────────────────────────────────────────────── */

const GOLD  = "#D4AF37";
const CARD  = "hsl(221, 59%, 12%)";
const MUTED = "rgba(170,179,197,0.55)";

const ENGINE_META = {
  roi:    { title: "ROI Income",    icon: TrendingUp, color: "#D4AF37", bg: "rgba(212,175,55,0.12)",  txType: "ROI_CLAIM"    },
  binary: { title: "Binary Income", icon: GitMerge,   color: "#a78bfa", bg: "rgba(167,139,250,0.12)", txType: "BINARY_MATCH" },
  orbit:  { title: "Orbit Income",  icon: RefreshCw,  color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  txType: "BINARY_ORBIT" },
  salary: { title: "Salary",        icon: DollarSign, color: "#fb923c", bg: "rgba(251,146,60,0.12)",  txType: "SALARY"       },
  level:  { title: "Level Income",  icon: Users,      color: "#34d399", bg: "rgba(52,211,153,0.12)",  txType: "LEVEL_INCOME" },
} as const;

type EngineKey = keyof typeof ENGINE_META;

function fmt(n: string | number | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  if (!isFinite(v as number)) return "0.00";
  return (v as number).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtFull(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

function neverZero(v: string, fallback = "Calculating..."): string {
  const n = parseFloat(v);
  if (!isFinite(n) || n === 0) return fallback;
  return `$${fmt(v)}`;
}

function Sk({ className }: { className?: string }) {
  return <div className={`rounded-lg animate-pulse ${className}`} style={{ background: "rgba(255,255,255,0.06)" }} />;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Countdown hook
   ───────────────────────────────────────────────────────────────────────────── */

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
      if (h > 0) setRemaining(`${h}h ${m}m`);
      else if (m > 0) setRemaining(`${m}m ${s}s`);
      else setRemaining(`${s}s`);
    }
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared section components
   ───────────────────────────────────────────────────────────────────────────── */

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: MUTED }}>
      <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
      {title}
    </h2>
  );
}

function MetricRow({ label, value, valueColor, sub }: {
  label: string; value: React.ReactNode; valueColor?: string; sub?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div>
        <span className="text-xs text-foreground">{label}</span>
        {sub && <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>{sub}</p>}
      </div>
      <span className="text-xs font-semibold text-right" style={{ color: valueColor ?? "hsl(var(--foreground))" }}>
        {value}
      </span>
    </div>
  );
}

function ProgressBar({ pct, color = GOLD }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color} 0%, ${color}bb 100%)` }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(pct, 100)}%` }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </div>
  );
}

function QualBadge({ qualified }: { qualified: boolean }) {
  return qualified
    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
        <CheckCircle2 className="h-3 w-3" />Qualified
      </span>
    : <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
        <XCircle className="h-3 w-3" />Not Qualified
      </span>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Status Hero (Section 1) — same structure for every engine
   ───────────────────────────────────────────────────────────────────────────── */

interface HeroProps {
  engine:    EngineKey;
  qualified: boolean | null;   // null = always active (ROI)
  countdown: string;
  nextLabel: string;           // e.g. "Next Credit" or "Next Salary"
  expected:  string;           // dollar amount string or "Calculating..."
  tagline:   string;           // short sentence
  loading:   boolean;
}

function StatusHero({ engine, qualified, countdown, nextLabel, expected, tagline, loading }: HeroProps) {
  const meta = ENGINE_META[engine];
  const Icon = meta.icon;

  return (
    <div className="rounded-2xl p-6 relative overflow-hidden"
      style={{ background: CARD, border: `1px solid ${meta.color}25` }}>
      {/* Shimmer strip */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${meta.color}60, transparent)` }} />

      {loading ? (
        <div className="space-y-4">
          <Sk className="h-6 w-40" />
          <div className="grid grid-cols-3 gap-3"><Sk className="h-16" /><Sk className="h-16" /><Sk className="h-16" /></div>
          <Sk className="h-4 w-64" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Title row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: meta.bg }}>
                <Icon className="h-5 w-5" style={{ color: meta.color }} />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{meta.title}</p>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Income Engine</p>
              </div>
            </div>
            {qualified !== null && <QualBadge qualified={qualified} />}
            {qualified === null && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
                <CheckCircle2 className="h-3 w-3" />Active
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>{nextLabel}</p>
              <p className="text-xl font-bold" style={{ color: meta.color, fontFamily: "Cormorant Garamond, serif" }}>{countdown}</p>
              <div className="flex items-center gap-1 mt-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#34d399", boxShadow: "0 0 4px #34d399" }} />
                <span className="text-[9px]" style={{ color: "#34d399" }}>Live countdown</span>
              </div>
            </div>

            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>Expected</p>
              <p className="text-xl font-bold" style={{ color: meta.color, fontFamily: "Cormorant Garamond, serif" }}>
                {expected.startsWith("$") || expected === "Calculating..." ? expected : `$${fmt(expected)}`}
              </p>
              {expected === "Calculating..." && (
                <p className="text-[9px] mt-1" style={{ color: MUTED }}>Awaiting engine</p>
              )}
            </div>

            <div className="rounded-xl p-3 col-span-2 sm:col-span-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>About</p>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{tagline}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   How To Earn More (Section 3) — shared
   ───────────────────────────────────────────────────────────────────────────── */

function HowToEarnSection({ tips, color }: { tips: string[]; color: string }) {
  return (
    <section>
      <SectionHeader icon={Zap} title="How To Earn More" />
      <div className="rounded-2xl p-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="space-y-3">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold mt-0.5"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                {i + 1}
              </div>
              <p className="text-sm text-foreground leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   FAQ (Section 5) — shared
   ───────────────────────────────────────────────────────────────────────────── */

function FAQSection({ faqs, color }: { faqs: Array<{ q: string; a: string }>; color: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section>
      <SectionHeader icon={HelpCircle} title="Frequently Asked Questions" />
      <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: i < faqs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="text-sm font-medium text-foreground">{faq.q}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
                style={{ color: open === i ? color : MUTED }}
              />
            </button>
            <AnimatePresence>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-4 text-sm leading-relaxed" style={{ color: MUTED }}>{faq.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   History section (Section 4) — shared, uses wallet transactions
   ───────────────────────────────────────────────────────────────────────────── */

const TX_TYPE_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  ROI_CLAIM:    { label: "ROI Credit",     color: "#D4AF37", bg: "rgba(212,175,55,0.12)",  icon: TrendingUp },
  BINARY_MATCH: { label: "Binary Match",   color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: GitMerge   },
  BINARY_ORBIT: { label: "Orbit Reward",   color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: RefreshCw  },
  SALARY:       { label: "Salary Credit",  color: "#fb923c", bg: "rgba(251,146,60,0.12)",  icon: DollarSign },
  LEVEL_INCOME: { label: "Level Commission", color: "#34d399", bg: "rgba(52,211,153,0.12)", icon: Users     },
};

function HistorySection({ txType }: { txType: string }) {
  const [txs, setTxs]     = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]   = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const meta = TX_TYPE_META[txType] ?? TX_TYPE_META["ROI_CLAIM"]!;
  const Icon = meta.icon;

  const load = useCallback(async (pageNum: number) => {
    if (pageNum === 1) setLoading(true); else setMoreLoading(true);
    try {
      const res = await getWalletHistory({ page: pageNum, limit: 15, types: [txType] });
      if (pageNum === 1) setTxs(res.data);
      else setTxs(prev => [...prev, ...res.data]);
      setHasMore(res.meta.hasNextPage);
      setPage(pageNum);
    } catch { /* keep existing */ }
    finally { setLoading(false); setMoreLoading(false); }
  }, [txType]);

  useEffect(() => { load(1); }, [load]);

  return (
    <section>
      <SectionHeader icon={Clock} title="Transaction History" />
      <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
        {loading ? (
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Sk className="h-9 w-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2"><Sk className="h-4 w-32" /><Sk className="h-3 w-20" /></div>
                <Sk className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl mb-3"
              style={{ background: meta.bg }}>
              <Icon className="h-6 w-6" style={{ color: meta.color }} />
            </div>
            <p className="text-sm font-medium text-foreground">No history yet</p>
            <p className="text-xs mt-1" style={{ color: MUTED }}>
              Your {meta.label.toLowerCase()} transactions will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {txs.map((tx, i) => (
                <motion.button
                  key={tx.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.25) }}
                  onClick={() => setSelected(tx)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: meta.bg }}>
                    <Icon className="h-4 w-4" style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{meta.label}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: MUTED }}>{fmtDate(tx.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold" style={{ color: meta.color }}>+${fmt(tx.amount)}</p>
                    <p className="text-[10px] mt-0.5 px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}>{tx.status}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(170,179,197,0.3)" }} />
                </motion.button>
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center p-4">
                <button
                  onClick={() => load(page + 1)}
                  disabled={moreLoading}
                  className="px-4 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.05)", color: MUTED, border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {moreLoading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
            {!hasMore && txs.length > 0 && (
              <p className="text-center text-xs py-3" style={{ color: MUTED }}>All {txs.length} records shown</p>
            )}
          </>
        )}
      </div>

      {/* Transaction detail drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelected(null)} />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-3xl lg:top-0 lg:bottom-0 lg:left-auto lg:right-0 lg:w-96 lg:rounded-none lg:rounded-l-2xl"
              style={{ background: "hsl(221, 62%, 11%)", border: "1px solid rgba(255,255,255,0.07)", borderBottom: "none", maxHeight: "85vh" }}
              initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: "0%" }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
            >
              <div className="flex justify-center pt-3 pb-1 lg:hidden">
                <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              </div>
              <div className="flex-1 overflow-y-auto p-5 pb-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-semibold text-foreground">Transaction Details</h3>
                  <button onClick={() => setSelected(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    <X className="h-4 w-4" style={{ color: MUTED }} />
                  </button>
                </div>
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-3"
                    style={{ background: meta.bg, border: `1px solid ${meta.color}33` }}>
                    <Icon className="h-7 w-7" style={{ color: meta.color }} />
                  </div>
                  <p className="text-xs uppercase tracking-widest mb-1" style={{ color: MUTED }}>{meta.label}</p>
                  <p className="text-3xl font-bold" style={{ color: meta.color, fontFamily: "Cormorant Garamond, serif" }}>
                    +${fmt(selected.amount)}
                  </p>
                </div>
                <div>
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
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Engine-specific views
   ═════════════════════════════════════════════════════════════════════════════ */

/* ── ROI ───────────────────────────────────────────────────────────────────── */

const ROI_TIPS = [
  "Increase your investment amount to grow your daily return.",
  "Keep your plan active — ROI accrues every cycle until maturity.",
  "Enable Auto Compound on your plan to reinvest earnings automatically and grow your principal over time.",
];

const ROI_FAQS = [
  {
    q: "When is ROI credited?",
    a: "ROI is processed twice daily at 00:00 and 12:00 London time. Earnings are added directly to your income wallet each cycle.",
  },
  {
    q: "What happens when my plan matures?",
    a: "When your investment plan completes its full duration, your original principal becomes available for withdrawal. ROI accrual stops at maturity.",
  },
  {
    q: "What is Auto Compound?",
    a: "Auto Compound reinvests your ROI earnings back into your principal each cycle, growing the base amount your return is calculated from.",
  },
  {
    q: "Why is my claimable ROI not zero?",
    a: "Claimable ROI accumulates between claims. It represents earnings that have been accrued but not yet transferred to your income wallet.",
  },
];

function ROIView() {
  const [data, setData]   = useState<RoiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(data?.nextCreditAt);
  const meta = ENGINE_META.roi;

  useEffect(() => {
    getRoiDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const expected = data ? neverZero(data.claimableROI, "Calculating...") : "—";

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <XCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <StatusHero engine="roi" qualified={null} countdown={countdown}
        nextLabel="Next Credit" expected={expected}
        tagline="ROI is automatically credited to your income wallet every cycle based on your active investment plans."
        loading={loading} />

      {/* Section 2: Current Progress */}
      <section>
        <SectionHeader icon={TrendingUp} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : data ? (
            <>
              <MetricRow label="Active Plans" value={`${data.activeCount} plan${data.activeCount !== 1 ? "s" : ""}`} valueColor={meta.color} />
              <MetricRow label="Total Active Principal" value={`$${fmt(data.totalActivePrincipal)}`} valueColor={meta.color}
                sub="Your invested capital currently generating ROI" />
              <MetricRow label="Today's ROI" value={`$${fmt(data.todayROI)}`} valueColor={meta.color} />
              <MetricRow label="Claimable ROI" value={neverZero(data.claimableROI, "None pending")} valueColor={GOLD} />
              <MetricRow label="Auto Compound" value={data.hasAutoCompound ? "Enabled" : "Disabled"}
                valueColor={data.hasAutoCompound ? "#34d399" : MUTED}
                sub={data.hasAutoCompound ? "Earnings reinvested each cycle" : "Enable to grow your principal automatically"} />
              <MetricRow label="Lifetime ROI Earned" value={`$${fmt(data.lifetimeROI)}`} />
            </>
          ) : null}
        </div>

        {/* Individual investment cards */}
        {!loading && data && data.investments.length > 0 && (
          <div className="mt-3 space-y-2">
            {data.investments.map((inv, i) => (
              <motion.div key={inv.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl p-4 flex items-center justify-between gap-4"
                style={{ background: CARD, border: "1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <p className="text-sm font-semibold text-foreground">{inv.planType}</p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    {parseFloat(inv.dailyROI) * 100}% daily · {inv.durationDays} days
                    {inv.autoCompound && " · Auto Compound ON"}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: MUTED }}>
                    Matures {fmtDate(inv.maturesAt)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold" style={{ color: meta.color, fontFamily: "Cormorant Garamond, serif" }}>
                    ${fmt(inv.principal)}
                  </p>
                  <p className="text-[10px] mt-1 px-2 py-0.5 rounded-full inline-block"
                    style={{
                      background: inv.status === "ACTIVE" ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)",
                      color: inv.status === "ACTIVE" ? "#34d399" : GOLD,
                    }}>
                    {inv.status}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <HowToEarnSection tips={ROI_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={ROI_FAQS} color={meta.color} />
    </div>
  );
}

/* ── Binary ────────────────────────────────────────────────────────────────── */

const BINARY_TIPS = [
  "Grow your weaker leg — income is based on the smaller of your two team sides.",
  "Maintain qualification by keeping at least 2 direct referrals active.",
  "Invite balanced referrals to both left and right legs to maximize matched BV each cycle.",
];

const BINARY_FAQS = [
  {
    q: "How is Binary income calculated?",
    a: "Binary income is paid on matched BV (Business Volume). At each cycle, the weaker leg's volume is matched against the stronger leg. You earn $5 per matched BV unit, capped at $250 per cycle.",
  },
  {
    q: "When is Binary income paid?",
    a: "Binary income is processed twice daily at 00:00 and 12:00 London time, credited directly to your withdrawal wallet.",
  },
  {
    q: "What happens to my carry forward BV?",
    a: "After matching, the unmatched volume from your stronger leg carries forward to the next cycle. It is never lost — it simply waits for the weaker leg to catch up.",
  },
  {
    q: "What happens if I lose qualification?",
    a: "If your direct referral count drops below the minimum, your BV is preserved but no income is paid for that cycle. Qualification is restored as soon as you meet the referral requirement again.",
  },
];

function BinaryView() {
  const [data, setData]   = useState<BinaryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(data?.nextCreditAt);
  const meta = ENGINE_META.binary;

  useEffect(() => {
    getBinaryDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const expected = data
    ? (data.isQualified ? neverZero(data.estimatedPayout, "Calculating...") : "Not qualified")
    : "—";

  const leftBV  = parseFloat(data?.currentLeftBV  ?? "0");
  const rightBV = parseFloat(data?.currentRightBV ?? "0");
  const weaker  = Math.min(leftBV, rightBV);
  const stronger = Math.max(leftBV, rightBV);
  const balancePct = stronger > 0 ? Math.round((weaker / stronger) * 100) : 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <XCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <StatusHero engine="binary" qualified={data?.isQualified ?? false} countdown={countdown}
        nextLabel="Next Matching" expected={expected}
        tagline="Binary income is calculated every 12 hours based on the volume matched between your left and right team legs."
        loading={loading} />

      <section>
        <SectionHeader icon={GitMerge} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : data ? (
            <>
              <MetricRow label="Direct Referrals" value={`${data.directReferralCount}`}
                valueColor={data.isQualified ? "#34d399" : "#ef4444"}
                sub="Minimum 2 required for qualification" />

              {/* Leg balance visualization */}
              <div className="py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground">Team Balance</span>
                  <span className="text-xs" style={{ color: meta.color }}>{balancePct}% balanced</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="rounded-lg p-2.5" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.1)" }}>
                    <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Left Leg</p>
                    <p className="text-sm font-bold" style={{ color: meta.color }}>{fmt(leftBV)} BV</p>
                  </div>
                  <div className="rounded-lg p-2.5" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.1)" }}>
                    <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Right Leg</p>
                    <p className="text-sm font-bold" style={{ color: meta.color }}>{fmt(rightBV)} BV</p>
                  </div>
                </div>
                <ProgressBar pct={balancePct} color={meta.color} />
                <p className="text-[10px] mt-1" style={{ color: MUTED }}>Weaker leg: {fmt(weaker)} BV</p>
              </div>

              <MetricRow label="Matched BV This Cycle" value={`${fmt(data.matchedBV)} BV`} valueColor={meta.color} />
              <MetricRow label="Expected This Cycle" value={expected} valueColor={parseFloat(data.estimatedPayout) > 0 ? meta.color : MUTED} />
              <MetricRow label="Carry Forward BV" value={`${fmt(data.carryForward)} BV`}
                sub="Unmatched stronger-leg volume carried to next cycle" />
              <MetricRow label="Today's Earnings" value={`$${fmt(data.todayEarnings)}`} />
              <MetricRow label="All-Time Cycles" value={`${data.allTimeCycles} cycles`} />
              <MetricRow label="All-Time Income" value={`$${fmt(data.allTimeIncome)}`} />
              <MetricRow label="Lifetime Earnings" value={`$${fmt(data.lifetimeEarnings)}`} />
            </>
          ) : null}
        </div>
      </section>

      <HowToEarnSection tips={BINARY_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={BINARY_FAQS} color={meta.color} />
    </div>
  );
}

/* ── Orbit ─────────────────────────────────────────────────────────────────── */

const ORBIT_TIPS = [
  "Increase matched BV between your legs — Orbit rewards unlock at every 150 BV milestone.",
  "Maintain your qualification by keeping at least 2 active direct referrals.",
  "Help your direct referrals invest to grow both leg volumes simultaneously.",
];

const ORBIT_FAQS = [
  {
    q: "What is an Orbit reward?",
    a: "An Orbit reward is a bonus earned when your matched team volume reaches a multiple of the reward threshold (150 BV by default). Each full orbit milestone earned triggers a $500 reward.",
  },
  {
    q: "When is Orbit income paid?",
    a: "Orbit income is processed at the same time as Binary matching — twice daily at 00:00 and 12:00 London time.",
  },
  {
    q: "What is current orbit progress?",
    a: "This shows how much BV you have accumulated toward your next orbit milestone. Once you reach the threshold, a reward is triggered at the next cycle.",
  },
  {
    q: "What happens to unearned orbits?",
    a: "If you earn more orbit milestones than the per-cycle cap, the excess rewards are not carried forward — only one orbit reward is paid per cycle. Focus on consistent volume growth.",
  },
];

function OrbitView() {
  const [data, setData]   = useState<OrbitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(data?.nextCreditAt);
  const meta = ENGINE_META.orbit;

  useEffect(() => {
    getOrbitDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const expected = data
    ? (data.isQualified ? neverZero(data.estimatedReward, "Calculating...") : "Not qualified")
    : "—";

  const threshold = parseFloat(data?.rewardThreshold ?? "150");
  const progress  = parseFloat(data?.bvProgress ?? "0");
  const pct = threshold > 0 ? Math.round((progress / threshold) * 100) : 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <XCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <StatusHero engine="orbit" qualified={data?.isQualified ?? false} countdown={countdown}
        nextLabel="Next Orbit Cycle" expected={expected}
        tagline="Orbit rewards are earned when your matched team volume crosses a milestone threshold. One reward per cycle."
        loading={loading} />

      <section>
        <SectionHeader icon={RefreshCw} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : data ? (
            <>
              <MetricRow label="Direct Referrals" value={`${data.directReferralCount}`}
                valueColor={data.isQualified ? "#34d399" : "#ef4444"}
                sub="Minimum 2 required for qualification" />

              {/* Orbit progress toward next reward */}
              <div className="py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground">Progress to Next Orbit Reward</span>
                  <span className="text-xs font-semibold" style={{ color: meta.color }}>{pct}%</span>
                </div>
                <ProgressBar pct={pct} color={meta.color} />
                <div className="flex justify-between mt-1.5">
                  <p className="text-[10px]" style={{ color: MUTED }}>{fmt(data.bvProgress)} BV accumulated</p>
                  <p className="text-[10px]" style={{ color: MUTED }}>{fmt(data.rewardThreshold)} BV threshold</p>
                </div>
              </div>

              <MetricRow label="BV Remaining to Next Orbit" value={`${fmt(data.bvRemaining)} BV`} valueColor={meta.color} />
              <MetricRow label="Reward Per Orbit" value={`$${fmt(data.incomePerReward)}`} valueColor={GOLD} />
              <MetricRow label="Orbits Pending This Cycle" value={`${data.pendingRewardCount}`} valueColor={meta.color} />
              <MetricRow label="Expected This Cycle" value={expected} valueColor={parseFloat(data.estimatedReward) > 0 ? meta.color : MUTED} />
              <MetricRow label="Matched BV (Left)" value={`${fmt(data.currentLeftBV)} BV`} />
              <MetricRow label="Matched BV (Right)" value={`${fmt(data.currentRightBV)} BV`} />
              <MetricRow label="Today's Earnings" value={`$${fmt(data.todayEarnings)}`} />
              <MetricRow label="All-Time Cycles" value={`${data.allTimeCycles}`} />
              <MetricRow label="Lifetime Earnings" value={`$${fmt(data.lifetimeEarnings)}`} />
            </>
          ) : null}
        </div>
      </section>

      <HowToEarnSection tips={ORBIT_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={ORBIT_FAQS} color={meta.color} />
    </div>
  );
}

/* ── Salary ────────────────────────────────────────────────────────────────── */

const SALARY_TIPS = [
  "Grow your total team business volume — salary ranks are unlocked by total active investment on both legs.",
  "Help your team members invest to increase business volume on both sides.",
  "Reach the next rank to unlock a higher monthly salary that stacks on top of your current earnings.",
];

const SALARY_FAQS = [
  {
    q: "When is salary credited?",
    a: "Salary is credited once per month at the start of each calendar month (midnight London time). You receive it for every active rank achievement you hold.",
  },
  {
    q: "How are salary ranks determined?",
    a: "Salary ranks are based on the total active investment volume across your binary team legs. Each rank has a required minimum business volume.",
  },
  {
    q: "Can I hold multiple salary ranks?",
    a: "Yes. Salary rewards stack — if you qualify for multiple ranks simultaneously, you receive the monthly salary from all active rank achievements.",
  },
  {
    q: "What happens if my volume drops?",
    a: "Active achievements remain in place as long as they have not expired. Dropping below a rank's threshold prevents you from earning a new achievement for that rank but does not remove existing ones.",
  },
];

function SalaryView() {
  const [data, setData]   = useState<SalaryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(data?.nextSalaryAt);
  const meta = ENGINE_META.salary;

  useEffect(() => {
    getSalaryDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const monthlySalary = data ? parseFloat(data.monthlySalary) : 0;
  const expected = data
    ? (monthlySalary > 0 ? `$${fmt(data.monthlySalary)}/mo` : "No active salary")
    : "—";

  const remaining = parseFloat(data?.remainingBusiness ?? "0");
  const progressPct = data?.progressPct ?? 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <XCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <StatusHero engine="salary" qualified={data?.isQualified ?? false} countdown={countdown}
        nextLabel="Next Salary" expected={expected}
        tagline="Salary is a monthly passive income credited at the start of each month, based on your rank achievements."
        loading={loading} />

      <section>
        <SectionHeader icon={Award} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : data ? (
            <>
              <MetricRow label="Current Rank"
                value={data.currentRank ?? "None"}
                valueColor={data.currentRank ? GOLD : MUTED} />
              <MetricRow label="Monthly Salary"
                value={monthlySalary > 0 ? `$${fmt(data.monthlySalary)}/month` : "Not qualified"}
                valueColor={monthlySalary > 0 ? meta.color : MUTED} />

              {/* Progress to next rank */}
              {data.nextRank && (
                <div className="py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-foreground">Progress to {data.nextRank}</span>
                    <span className="text-xs font-semibold" style={{ color: meta.color }}>{progressPct}%</span>
                  </div>
                  <ProgressBar pct={progressPct} color={meta.color} />
                  <p className="text-[10px] mt-1.5" style={{ color: MUTED }}>
                    ${fmt(remaining)} more in team business volume needed
                  </p>
                </div>
              )}

              <MetricRow label="Left Team Business" value={`$${fmt(data.leftBusinessUSD)}`} />
              <MetricRow label="Right Team Business" value={`$${fmt(data.rightBusinessUSD)}`} />
              <MetricRow label="Total Team Business" value={`$${fmt(data.totalBusinessUSD)}`}
                sub="Sum of active investments across both team legs" />
              <MetricRow label="Active Ranks" value={data.activeRanks.length > 0 ? data.activeRanks.join(", ") : "None"} />
              <MetricRow label="Today's Salary" value={`$${fmt(data.todayEarnings)}`} />
              <MetricRow label="Lifetime Salary" value={`$${fmt(data.lifetimeSalary)}`} />
            </>
          ) : null}
        </div>
      </section>

      <HowToEarnSection tips={SALARY_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={SALARY_FAQS} color={meta.color} />
    </div>
  );
}

/* ── Level Income ──────────────────────────────────────────────────────────── */

const LEVEL_TIPS = [
  "Personally sponsor more members — level 1 income is triggered by every investment your direct referrals make.",
  "Help your direct referrals grow their own networks to earn from deeper levels (up to level 5).",
  "Encourage your team to stay invested — level income is earned each time a referral in your chain creates a new investment.",
];

const LEVEL_FAQS = [
  {
    q: "How does Level Income work?",
    a: "When anyone in your referral chain invests, you receive a percentage of that investment amount as instant income. Levels 1–5 each pay 1%, credited immediately to your withdrawal wallet.",
  },
  {
    q: "When is Level Income credited?",
    a: "Level income is instant — it is credited the moment a qualifying investment is made by someone in your referral chain.",
  },
  {
    q: "How deep does Level Income go?",
    a: "Level income extends up to 5 generations deep in your referral chain. The percentage is the same (1%) at every level.",
  },
  {
    q: "Is there a qualification required?",
    a: "No. Level income is paid to every ancestor in the sponsor chain with no qualification gate — as long as you have a sponsor relationship, you earn.",
  },
];

function LevelView() {
  const [data, setData]   = useState<LevelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const meta = ENGINE_META.level;

  useEffect(() => {
    getLevelDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const countdown = useCountdown(undefined); // Level is instant, no scheduled time
  void countdown;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <XCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Custom hero for Level — always active, instant credit */}
      <div className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: CARD, border: `1px solid ${meta.color}25` }}>
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.color}60, transparent)` }} />

        {loading ? (
          <div className="space-y-4">
            <Sk className="h-6 w-40" />
            <div className="grid grid-cols-3 gap-3"><Sk className="h-16" /><Sk className="h-16" /><Sk className="h-16" /></div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: meta.bg }}>
                  <Users className="h-5 w-5" style={{ color: meta.color }} />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">Level Income</p>
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Income Engine</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
                <Zap className="h-3 w-3" />Instant Credit
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>Earned Today</p>
                <p className="text-xl font-bold" style={{ color: meta.color, fontFamily: "Cormorant Garamond, serif" }}>
                  ${fmt(data?.todayEarnings ?? "0")}
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>This Month</p>
                <p className="text-xl font-bold" style={{ color: meta.color, fontFamily: "Cormorant Garamond, serif" }}>
                  ${fmt(data?.thisMonthEarnings ?? "0")}
                </p>
              </div>
              <div className="rounded-xl p-3 col-span-2 sm:col-span-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: MUTED }}>About</p>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                  Credited instantly each time anyone in your referral chain invests — up to 5 levels deep.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Current Progress + Level Breakdown */}
      <section>
        <SectionHeader icon={Users} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : data ? (
            <>
              <MetricRow label="Earned Today" value={`$${fmt(data.todayEarnings)}`} valueColor={meta.color} />
              <MetricRow label="Earned This Month" value={`$${fmt(data.thisMonthEarnings)}`} valueColor={meta.color} />
              <MetricRow label="Total Commissions Paid" value={`${data.totalPayouts}`} />
              <MetricRow label="Lifetime Level Income" value={`$${fmt(data.lifetimeEarnings)}`} />
            </>
          ) : null}
        </div>

        {/* Level breakdown table */}
        {!loading && data && data.breakdown.length > 0 && (
          <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <p className="text-xs font-semibold text-foreground">Level Breakdown</p>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>1% per level</p>
            </div>
            {[1, 2, 3, 4, 5].map(lvl => {
              const row = data.breakdown.find(b => b.level === lvl);
              const count = row?.count ?? 0;
              const amount = row?.incomeAmount ?? "0.00";
              const pct = row?.percentage ?? 1;
              return (
                <div key={lvl} className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: lvl < 5 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: `${meta.color}18`, color: meta.color }}>L{lvl}</div>
                    <span className="text-xs text-foreground">Level {lvl}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.05)", color: MUTED }}>{pct}%</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold" style={{ color: count > 0 ? meta.color : MUTED }}>
                      ${fmt(amount)}
                    </p>
                    <p className="text-[10px]" style={{ color: MUTED }}>{count} payout{count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <HowToEarnSection tips={LEVEL_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={LEVEL_FAQS} color={meta.color} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Main IncomeDetailPage — dispatches to correct engine view
   ═════════════════════════════════════════════════════════════════════════════ */

export default function IncomeDetailPage({ engine }: { engine: string }) {
  const [, navigate] = useLocation();
  const key = engine as EngineKey;
  const meta = ENGINE_META[key] ?? ENGINE_META.roi;

  const engineViews: Record<string, React.ReactNode> = {
    roi:    <ROIView />,
    binary: <BinaryView />,
    orbit:  <OrbitView />,
    salary: <SalaryView />,
    level:  <LevelView />,
  };

  return (
    <AppLayout pageTitle={meta.title} notificationCount={0}>
      <PageContainer>
        <div className="space-y-6 pb-8">

          {/* Page header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3"
          >
            <button
              onClick={() => navigate("/income")}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-white/[0.06]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <ArrowLeft className="h-4 w-4" style={{ color: MUTED }} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <meta.icon className="h-5 w-5" style={{ color: meta.color }} />
                {meta.title}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                Detailed view · <button onClick={() => navigate("/income")} className="underline decoration-dotted hover:opacity-80">Back to Income Center</button>
              </p>
            </div>
          </motion.div>

          {/* Engine-specific content */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            {engineViews[key] ?? <ROIView />}
          </motion.div>

        </div>
      </PageContainer>
    </AppLayout>
  );
}
