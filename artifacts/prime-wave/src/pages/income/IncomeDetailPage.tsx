import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  TrendingUp, GitMerge, RefreshCw, Users, DollarSign,
  Clock, Award, ChevronRight, X, CheckCircle2, XCircle,
  Zap, ArrowLeft, HelpCircle, ChevronDown, Calculator,
  Target, AlertTriangle, Star, Lightbulb,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getWalletHistory, type Transaction,
  getRoiDetail, getBinaryDetail, getOrbitDetail, getSalaryDetail, getLevelDetail,
  type RoiDetail, type BinaryDetail, type OrbitDetail, type SalaryDetail, type LevelDetail,
} from "@/lib/api";

/* ─────────────────────────────────────────────────────────────────────────────
   Constants
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

const STATUS_CFG = {
  excellent:   { label: "Excellent",      color: "#34d399", bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.2)",  icon: Star        },
  "on-track":  { label: "On Track",       color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.2)",  icon: Target      },
  attention:   { label: "Needs Attention",color: "#f59e0b", bg: "rgba(245,158,11,0.1)",   border: "rgba(245,158,11,0.2)",  icon: AlertTriangle },
  "not-eligible": { label: "Not Eligible",color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   icon: XCircle     },
} as const;
type StatusLevel = keyof typeof STATUS_CFG;

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────────────────── */

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
   Countdown
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
   Shared UI atoms
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
      <motion.div className="h-full rounded-full"
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

function StatusPill({ level }: { level: StatusLevel }) {
  const cfg = STATUS_CFG[level];
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Status Hero
   ───────────────────────────────────────────────────────────────────────────── */

interface HeroProps {
  engine:    EngineKey;
  qualified: boolean | null;
  countdown: string;
  nextLabel: string;
  expected:  string;
  tagline:   string;
  loading:   boolean;
}

function StatusHero({ engine, qualified, countdown, nextLabel, expected, tagline, loading }: HeroProps) {
  const meta = ENGINE_META[engine];
  const Icon = meta.icon;
  return (
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
              {expected === "Calculating..." && <p className="text-[9px] mt-1" style={{ color: MUTED }}>Awaiting engine</p>}
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
   Sprint 26C — Next Best Action card
   ───────────────────────────────────────────────────────────────────────────── */

function NextBestActionCard({
  status, statusMsg, loading, color, children,
}: {
  status: StatusLevel;
  statusMsg: string;
  loading: boolean;
  color: string;
  children?: React.ReactNode;
}) {
  const cfg = STATUS_CFG[status];
  return (
    <section>
      <SectionHeader icon={Lightbulb} title="Your Next Best Action" />
      <div className="rounded-2xl p-5 space-y-4" style={{ background: CARD, border: `1px solid ${cfg.border}` }}>
        {loading ? (
          <div className="space-y-3"><Sk className="h-6 w-24" /><Sk className="h-12" /><Sk className="h-8 w-48" /></div>
        ) : (
          <>
            <StatusPill level={status} />
            <p className="text-sm text-foreground leading-relaxed">{statusMsg}</p>
            {children && (
              <div className="rounded-xl p-4" style={{ background: `${cfg.bg}`, border: `1px solid ${cfg.border}` }}>
                {children}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sprint 26C — Why This Amount card
   ───────────────────────────────────────────────────────────────────────────── */

function WhyThisAmountCard({ loading, children }: { loading: boolean; children?: React.ReactNode }) {
  return (
    <section>
      <SectionHeader icon={Calculator} title="Why This Amount?" />
      <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
        {loading ? (
          <div className="space-y-2 py-4">{[0,1,2].map(i => <Sk key={i} className="h-10" />)}</div>
        ) : children}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sprint 26C — Empty State card
   ───────────────────────────────────────────────────────────────────────────── */

function EmptyStateCard({
  icon: Icon, color, bg, title, description, ctaLabel, onCta,
}: {
  icon: React.ElementType; color: string; bg: string;
  title: string; description: string; ctaLabel: string; onCta: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
        style={{ background: bg, border: `1px solid ${color}33` }}>
        <Icon className="h-7 w-7" style={{ color }} />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm max-w-xs leading-relaxed mb-5" style={{ color: MUTED }}>{description}</p>
      <button onClick={onCta}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
        style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
        {ctaLabel}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared How To Earn + FAQ + History sections
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

function FAQSection({ faqs, color }: { faqs: Array<{ q: string; a: string }>; color: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section>
      <SectionHeader icon={HelpCircle} title="Frequently Asked Questions" />
      <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: i < faqs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]">
              <span className="text-sm font-medium text-foreground">{faq.q}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
                style={{ color: open === i ? color : MUTED }} />
            </button>
            <AnimatePresence>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
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

const TX_TYPE_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  ROI_CLAIM:    { label: "ROI Credit",       color: "#D4AF37", bg: "rgba(212,175,55,0.12)",  icon: TrendingUp },
  BINARY_MATCH: { label: "Binary Match",     color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: GitMerge   },
  BINARY_ORBIT: { label: "Orbit Reward",     color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: RefreshCw  },
  SALARY:       { label: "Salary Credit",    color: "#fb923c", bg: "rgba(251,146,60,0.12)",  icon: DollarSign },
  LEVEL_INCOME: { label: "Level Commission", color: "#34d399", bg: "rgba(52,211,153,0.12)",  icon: Users      },
};

function HistorySection({ txType }: { txType: string }) {
  const [txs, setTxs]         = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [selected, setSelected]       = useState<Transaction | null>(null);
  const meta = TX_TYPE_META[txType] ?? TX_TYPE_META["ROI_CLAIM"]!;
  const Icon = meta.icon;

  const load = useCallback(async (pageNum: number) => {
    if (pageNum === 1) setLoading(true); else setMoreLoading(true);
    try {
      const res = await getWalletHistory({ page: pageNum, limit: 15, types: [txType] });
      if (pageNum === 1) setTxs(res.data); else setTxs(prev => [...prev, ...res.data]);
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
            {[0,1,2,3].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Sk className="h-9 w-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2"><Sk className="h-4 w-32" /><Sk className="h-3 w-20" /></div>
                <Sk className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl mb-3" style={{ background: meta.bg }}>
              <Icon className="h-6 w-6" style={{ color: meta.color }} />
            </div>
            <p className="text-sm font-medium text-foreground">No history yet</p>
            <p className="text-xs mt-1 max-w-xs text-center" style={{ color: MUTED }}>
              Your {meta.label.toLowerCase()} transactions will appear here once income is credited.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {txs.map((tx, i) => (
                <motion.button key={tx.id}
                  initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.25) }}
                  onClick={() => setSelected(tx)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
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
                <button onClick={() => load(page + 1)} disabled={moreLoading}
                  className="px-4 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.05)", color: MUTED, border: "1px solid rgba(255,255,255,0.08)" }}>
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
              exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 26, stiffness: 300 }}>
              <div className="flex justify-center pt-3 pb-1 lg:hidden">
                <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
              </div>
              <div className="flex-1 overflow-y-auto p-5 pb-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-semibold text-foreground">Transaction Details</h3>
                  <button onClick={() => setSelected(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
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
   ROI View
   ═════════════════════════════════════════════════════════════════════════════ */

const ROI_TIPS = [
  "Increase your investment amount to grow your daily return proportionally.",
  "Keep your plan active — ROI accrues every cycle until maturity.",
  "Enable Auto Compound on your plan to reinvest earnings automatically and grow your principal over time.",
];

const ROI_FAQS = [
  { q: "When is ROI credited?", a: "ROI is processed twice daily at 00:00 and 12:00 London time. Earnings are added directly to your income wallet each cycle." },
  { q: "What happens when my plan matures?", a: "When your investment plan completes its full duration, your original principal becomes available for withdrawal. ROI accrual stops at maturity." },
  { q: "What is Auto Compound?", a: "Auto Compound reinvests your ROI earnings back into your principal each cycle, growing the base amount your return is calculated from." },
  { q: "Why is my claimable ROI not zero?", a: "Claimable ROI accumulates between claims. It represents earnings that have been accrued but not yet transferred to your income wallet." },
];

function ROIView() {
  const [, navigate]  = useLocation();
  const [data, setData]       = useState<RoiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const countdown = useCountdown(data?.nextCreditAt);
  const meta = ENGINE_META.roi;

  useEffect(() => {
    getRoiDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const expected = data ? neverZero(data.claimableROI, "Calculating...") : "—";
  const activeInvs = data?.investments.filter(i => i.status === "ACTIVE") ?? [];

  // Status derivation
  const status: StatusLevel = !data ? "attention"
    : data.activeCount === 0   ? "attention"
    : !data.hasAutoCompound    ? "on-track"
    : "excellent";

  const statusMsg = !data ? "Loading your ROI status…"
    : data.activeCount === 0
      ? "You have no active investment. Create an investment to begin generating ROI each cycle."
      : !data.hasAutoCompound
      ? "You are earning ROI. Enable Auto Compound on your plan to reinvest daily earnings and accelerate growth."
      : "Everything is set up optimally. Your ROI is compounding each cycle automatically.";

  // Next action content
  const actionContent: React.ReactNode = data && (
    data.activeCount === 0 ? (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium" style={{ color: STATUS_CFG[status].color }}>
          Start with your first investment to unlock daily ROI credits.
        </p>
        <button onClick={() => navigate("/investments")}
          className="px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all hover:opacity-90"
          style={{ background: meta.color, color: "#000" }}>
          Start Investing
        </button>
      </div>
    ) : !data.hasAutoCompound ? (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Auto Compound is currently <strong>OFF</strong> on your plan. Enabling it means daily ROI gets added
        back to your principal, growing your earnings every cycle instead of waiting for a manual claim.
      </p>
    ) : (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Your fastest way to grow income is to increase your investment principal — higher principal
        means proportionally more ROI credited each cycle.
      </p>
    )
  );

  // Why this amount: expected per cycle across all active investments
  const expectedPerCycle = activeInvs.reduce((sum, inv) => {
    return sum + parseFloat(inv.principal) * parseFloat(inv.dailyROI);
  }, 0);

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

      <NextBestActionCard status={status} statusMsg={statusMsg} loading={loading} color={meta.color}>
        {actionContent}
      </NextBestActionCard>

      {/* Current Progress */}
      <section>
        <SectionHeader icon={TrendingUp} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : data && data.activeCount === 0 ? (
            <EmptyStateCard icon={TrendingUp} color={meta.color} bg={meta.bg}
              title="No Active Investment"
              description="Create your first investment plan to start generating ROI income credited twice daily to your income wallet."
              ctaLabel="Browse Investment Plans" onCta={() => navigate("/investments")} />
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

        {!loading && data && data.investments.length > 0 && (
          <div className="mt-3 space-y-2">
            {data.investments.map((inv, i) => (
              <motion.div key={inv.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-xl p-4 flex items-center justify-between gap-4"
                style={{ background: CARD, border: "1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <p className="text-sm font-semibold text-foreground">{inv.planType}</p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    {(parseFloat(inv.dailyROI) * 100).toFixed(2)}% daily · {inv.durationDays} days
                    {inv.autoCompound && " · Auto Compound ON"}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: MUTED }}>Matures {fmtDate(inv.maturesAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold" style={{ color: meta.color, fontFamily: "Cormorant Garamond, serif" }}>
                    ${fmt(inv.principal)}
                  </p>
                  <p className="text-[10px] mt-1 px-2 py-0.5 rounded-full inline-block"
                    style={{ background: inv.status === "ACTIVE" ? "rgba(52,211,153,0.1)" : "rgba(212,175,55,0.1)", color: inv.status === "ACTIVE" ? "#34d399" : GOLD }}>
                    {inv.status}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Why This Amount */}
      <WhyThisAmountCard loading={loading}>
        {data && data.activeCount > 0 ? (
          <>
            {activeInvs.map(inv => (
              <div key={inv.id}>
                <MetricRow label="Plan" value={inv.planType} />
                <MetricRow label="Principal" value={`$${fmt(inv.principal)}`} />
                <MetricRow label="Daily ROI Rate" value={`${(parseFloat(inv.dailyROI) * 100).toFixed(2)}%`} />
                <MetricRow label="Expected per Cycle" value={`$${fmt(parseFloat(inv.principal) * parseFloat(inv.dailyROI))}`} valueColor={meta.color} />
              </div>
            ))}
            {activeInvs.length > 1 && (
              <MetricRow label="Total Expected per Cycle" value={`$${fmt(expectedPerCycle)}`} valueColor={GOLD}
                sub="Sum across all active plans" />
            )}
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm" style={{ color: MUTED }}>Create an investment to see your expected ROI here.</p>
          </div>
        )}
      </WhyThisAmountCard>

      <HowToEarnSection tips={ROI_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={ROI_FAQS} color={meta.color} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Binary View
   ═════════════════════════════════════════════════════════════════════════════ */

const BINARY_TIPS = [
  "Grow your weaker leg — income is based on the smaller of your two team sides.",
  "Maintain qualification by keeping at least 2 direct referrals active.",
  "Invite balanced referrals to both left and right legs to maximize matched BV each cycle.",
];

const BINARY_FAQS = [
  { q: "How is Binary income calculated?", a: "Binary income is paid on matched BV (Business Volume). At each cycle, the weaker leg's volume is matched against the stronger leg. You earn $5 per matched BV unit, capped at $250 per cycle." },
  { q: "When is Binary income paid?", a: "Binary income is processed twice daily at 00:00 and 12:00 London time, credited directly to your withdrawal wallet." },
  { q: "What happens to my carry forward BV?", a: "After matching, the unmatched volume from your stronger leg carries forward to the next cycle. It is never lost — it simply waits for the weaker leg to catch up." },
  { q: "What happens if I lose qualification?", a: "If your direct referral count drops below the minimum, your BV is preserved but no income is paid for that cycle. Qualification is restored as soon as you meet the referral requirement again." },
];

function BinaryView() {
  const [data, setData]       = useState<BinaryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const countdown = useCountdown(data?.nextCreditAt);
  const meta = ENGINE_META.binary;

  useEffect(() => {
    getBinaryDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const leftBV   = parseFloat(data?.currentLeftBV  ?? "0");
  const rightBV  = parseFloat(data?.currentRightBV ?? "0");
  const weaker   = Math.min(leftBV, rightBV);
  const stronger = Math.max(leftBV, rightBV);
  const balancePct = stronger > 0 ? Math.round((weaker / stronger) * 100) : 0;
  const weakerLeg  = leftBV <= rightBV ? "Left" : "Right";
  const diff       = stronger - weaker;

  const hasAnyBV   = leftBV > 0 || rightBV > 0;
  const expected   = data ? (data.isQualified ? neverZero(data.estimatedPayout, "Calculating...") : "Not qualified") : "—";

  // Status
  const status: StatusLevel = !data ? "attention"
    : !data.isQualified      ? "not-eligible"
    : balancePct >= 70       ? "excellent"
    : "on-track";

  const statusMsg = !data ? "Loading…"
    : !data.isQualified
      ? `You need active referrals on both your left and right teams (currently ${data.directReferralCount} direct referral${data.directReferralCount !== 1 ? "s" : ""}). Each direct referral on both sides qualifies you for binary income.`
      : balancePct >= 70
      ? "Excellent balance. Your team legs are well matched, maximizing your binary income each cycle."
      : `Your ${weakerLeg.toLowerCase()} leg is currently the weaker side. Growing it will increase matched BV and your payout each cycle.`;

  const actionContent: React.ReactNode = data && (
    !data.isQualified ? (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Invite at least one referral to your <strong>left</strong> team and one to your <strong>right</strong> team to qualify for binary matching income.
      </p>
    ) : diff > 0 ? (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Weaker ({weakerLeg})</p>
            <p className="text-sm font-bold" style={{ color: meta.color }}>{fmt(weaker)} BV</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Gap</p>
            <p className="text-sm font-bold text-foreground">{fmt(diff)} BV</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Stronger</p>
            <p className="text-sm font-bold" style={{ color: meta.color }}>{fmt(stronger)} BV</p>
          </div>
        </div>
        <p className="text-xs" style={{ color: STATUS_CFG[status].color }}>
          Adding <strong>{fmt(diff)} BV</strong> to your {weakerLeg.toLowerCase()} team would perfectly balance both legs.
        </p>
      </div>
    ) : (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Both legs are perfectly balanced. Any new volume on either side will match immediately at the next cycle.
      </p>
    )
  );

  // Why this amount
  const matchedBVNum = parseFloat(data?.matchedBV ?? "0");
  const rateNum      = parseFloat(data?.incomePerBV ?? "5");
  const capBV        = parseFloat(data?.maxPayableBVPerCycle ?? "50");
  const payableBV    = Math.min(matchedBVNum, capBV);
  const expectedNum  = payableBV * rateNum;

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

      <NextBestActionCard status={status} statusMsg={statusMsg} loading={loading} color={meta.color}>
        {actionContent}
      </NextBestActionCard>

      {/* Current Progress */}
      <section>
        <SectionHeader icon={GitMerge} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : !hasAnyBV && data?.allTimeCycles === 0 ? (
            <EmptyStateCard icon={GitMerge} color={meta.color} bg={meta.bg}
              title="No Business Volume Yet"
              description="Binary income grows with your team. Build both your left and right teams to start matching BV at every cycle."
              ctaLabel="View My Network" onCta={() => {}} />
          ) : data ? (
            <>
              <MetricRow label="Direct Referrals" value={`${data.directReferralCount}`}
                valueColor={data.isQualified ? "#34d399" : "#ef4444"}
                sub="Minimum 2 required for qualification" />

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
              <MetricRow label="Lifetime Earnings" value={`$${fmt(data.lifetimeEarnings)}`} />
            </>
          ) : null}
        </div>
      </section>

      {/* Why This Amount */}
      <WhyThisAmountCard loading={loading}>
        {data ? (
          <>
            <MetricRow label="Current Weaker Leg" value={`${fmt(weaker)} BV`} />
            <MetricRow label="Matched BV This Cycle" value={`${fmt(matchedBVNum)} BV`} />
            <MetricRow label="Per-Cycle Cap" value={`${fmt(capBV)} BV`} sub="Maximum BV eligible for income per cycle" />
            <MetricRow label="Eligible BV" value={`${fmt(payableBV)} BV`} />
            <MetricRow label="Rate" value={`$${fmt(rateNum)} per BV`} />
            <MetricRow label="Expected Payout" value={data.isQualified ? `$${fmt(expectedNum)}` : "Not qualified"} valueColor={data.isQualified ? meta.color : MUTED} />
          </>
        ) : null}
      </WhyThisAmountCard>

      <HowToEarnSection tips={BINARY_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={BINARY_FAQS} color={meta.color} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Orbit View
   ═════════════════════════════════════════════════════════════════════════════ */

const ORBIT_TIPS = [
  "Increase matched BV between your legs — Orbit rewards unlock at every 150 BV milestone.",
  "Maintain your qualification by keeping at least 2 active direct referrals.",
  "Help your direct referrals invest to grow both leg volumes simultaneously.",
];

const ORBIT_FAQS = [
  { q: "What is an Orbit reward?", a: "An Orbit reward is a bonus earned when your matched team volume reaches a multiple of the reward threshold (150 BV by default). Each full orbit milestone earned triggers a $500 reward." },
  { q: "When is Orbit income paid?", a: "Orbit income is processed at the same time as Binary matching — twice daily at 00:00 and 12:00 London time." },
  { q: "What is current orbit progress?", a: "This shows how much BV you have accumulated toward your next orbit milestone. Once you reach the threshold, a reward is triggered at the next cycle." },
  { q: "What happens to unearned orbits?", a: "If you earn more orbit milestones than the per-cycle cap, the excess rewards are not carried forward — only one orbit reward is paid per cycle. Focus on consistent volume growth." },
];

function OrbitView() {
  const [data, setData]       = useState<OrbitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const countdown = useCountdown(data?.nextCreditAt);
  const meta = ENGINE_META.orbit;

  useEffect(() => {
    getOrbitDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const threshold  = parseFloat(data?.rewardThreshold ?? "150");
  const progress   = parseFloat(data?.bvProgress ?? "0");
  const remaining  = parseFloat(data?.bvRemaining ?? threshold.toString());
  const pct        = threshold > 0 ? Math.round((progress / threshold) * 100) : 0;
  const expected   = data ? (data.isQualified ? neverZero(data.estimatedReward, "Calculating...") : "Not qualified") : "—";
  const hasHistory = (data?.allTimeCycles ?? 0) > 0;

  // Status
  const status: StatusLevel = !data ? "attention"
    : !data.isQualified         ? "not-eligible"
    : data.pendingRewardCount > 0 ? "excellent"
    : pct >= 50                   ? "on-track"
    : "on-track";

  const statusMsg = !data ? "Loading…"
    : !data.isQualified
      ? `You need active referrals on both team sides to qualify for Orbit rewards (currently ${data.directReferralCount} direct referral${data.directReferralCount !== 1 ? "s" : ""}).`
      : data.pendingRewardCount > 0
      ? `You have ${data.pendingRewardCount} Orbit reward${data.pendingRewardCount !== 1 ? "s" : ""} ready this cycle — worth $${fmt(parseFloat(data.incomePerReward) * data.pendingRewardCount)}.`
      : `You need ${fmt(remaining)} more BV to unlock your next Orbit reward. Keep building both legs.`;

  const actionContent: React.ReactNode = data && (
    !data.isQualified ? (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Invite at least 2 referrals — one on each team side — to become eligible for Orbit income.
      </p>
    ) : (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Accumulated</p>
            <p className="text-sm font-bold" style={{ color: meta.color }}>{fmt(progress)} BV</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Needed</p>
            <p className="text-sm font-bold" style={{ color: meta.color }}>{fmt(remaining)} BV</p>
          </div>
        </div>
        <ProgressBar pct={pct} color={meta.color} />
        <p className="text-xs" style={{ color: STATUS_CFG[status].color }}>
          Add <strong>{fmt(remaining)} BV</strong> across both legs to unlock the next Orbit reward worth <strong>${fmt(data.incomePerReward)}</strong>.
        </p>
      </div>
    )
  );

  const orbitCount    = data?.pendingRewardCount ?? 0;
  const incomePerReward = parseFloat(data?.incomePerReward ?? "500");
  const orbitExpected   = orbitCount * incomePerReward;

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

      <NextBestActionCard status={status} statusMsg={statusMsg} loading={loading} color={meta.color}>
        {actionContent}
      </NextBestActionCard>

      {/* Current Progress */}
      <section>
        <SectionHeader icon={RefreshCw} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : !hasHistory && !(data?.isQualified) ? (
            <EmptyStateCard icon={RefreshCw} color={meta.color} bg={meta.bg}
              title="No Orbit Rewards Yet"
              description="Orbit rewards unlock when your matched team volume reaches the 150 BV threshold. Build both your team legs to get started."
              ctaLabel="View My Network" onCta={() => {}} />
          ) : data ? (
            <>
              <MetricRow label="Direct Referrals" value={`${data.directReferralCount}`}
                valueColor={data.isQualified ? "#34d399" : "#ef4444"}
                sub="Minimum 2 required for qualification" />
              <div className="py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground">Progress to Next Orbit Reward</span>
                  <span className="text-xs font-semibold" style={{ color: meta.color }}>{pct}%</span>
                </div>
                <ProgressBar pct={pct} color={meta.color} />
                <div className="flex justify-between mt-1.5">
                  <p className="text-[10px]" style={{ color: MUTED }}>{fmt(progress)} BV accumulated</p>
                  <p className="text-[10px]" style={{ color: MUTED }}>{fmt(threshold)} BV threshold</p>
                </div>
              </div>
              <MetricRow label="BV Remaining to Next Orbit" value={`${fmt(remaining)} BV`} valueColor={meta.color} />
              <MetricRow label="Reward Per Orbit" value={`$${fmt(data.incomePerReward)}`} valueColor={GOLD} />
              <MetricRow label="Orbits Pending This Cycle" value={`${orbitCount}`} valueColor={meta.color} />
              <MetricRow label="Today's Earnings" value={`$${fmt(data.todayEarnings)}`} />
              <MetricRow label="All-Time Cycles" value={`${data.allTimeCycles}`} />
              <MetricRow label="Lifetime Earnings" value={`$${fmt(data.lifetimeEarnings)}`} />
            </>
          ) : null}
        </div>
      </section>

      {/* Why This Amount */}
      <WhyThisAmountCard loading={loading}>
        {data ? (
          <>
            <MetricRow label="Left Leg BV" value={`${fmt(data.currentLeftBV)} BV`} />
            <MetricRow label="Right Leg BV" value={`${fmt(data.currentRightBV)} BV`} />
            <MetricRow label="Matched BV" value={`${fmt(data.matchedBV)} BV`} sub="Smaller of the two legs" />
            <MetricRow label="Orbit Threshold" value={`${fmt(threshold)} BV per orbit`} />
            <MetricRow label="Orbits Earned" value={`${orbitCount}`} />
            <MetricRow label="Reward per Orbit" value={`$${fmt(incomePerReward)}`} />
            <MetricRow label="Expected This Cycle"
              value={data.isQualified && orbitCount > 0 ? `$${fmt(orbitExpected)}` : "No orbits earned yet"}
              valueColor={orbitCount > 0 ? meta.color : MUTED} />
          </>
        ) : null}
      </WhyThisAmountCard>

      <HowToEarnSection tips={ORBIT_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={ORBIT_FAQS} color={meta.color} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Salary View
   ═════════════════════════════════════════════════════════════════════════════ */

const SALARY_TIPS = [
  "Grow your total team business volume — salary ranks are unlocked by total active investment on both legs.",
  "Help your team members invest to increase business volume on both sides.",
  "Reach the next rank to unlock a higher monthly salary that stacks on top of your current earnings.",
];

const SALARY_FAQS = [
  { q: "When is salary credited?", a: "Salary is credited once per month at the start of each calendar month (midnight London time). You receive it for every active rank achievement you hold." },
  { q: "How are salary ranks determined?", a: "Salary ranks are based on the total active investment volume across your binary team legs. Each rank has a required minimum business volume." },
  { q: "Can I hold multiple salary ranks?", a: "Yes. Salary rewards stack — if you qualify for multiple ranks simultaneously, you receive the monthly salary from all active rank achievements." },
  { q: "What happens if my volume drops?", a: "Active achievements remain in place as long as they have not expired. Dropping below a rank's threshold prevents you from earning a new achievement for that rank but does not remove existing ones." },
];

function SalaryView() {
  const [data, setData]       = useState<SalaryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const countdown = useCountdown(data?.nextSalaryAt);
  const meta = ENGINE_META.salary;

  useEffect(() => {
    getSalaryDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const monthlySalary   = parseFloat(data?.monthlySalary ?? "0");
  const progressPct     = data?.progressPct ?? 0;
  const remainingBiz    = parseFloat(data?.remainingBusiness ?? "0");
  const expected        = data ? (monthlySalary > 0 ? `$${fmt(data.monthlySalary)}/mo` : "No active salary") : "—";

  // Status
  const status: StatusLevel = !data ? "attention"
    : !data.isQualified && progressPct === 0 ? "not-eligible"
    : !data.isQualified     ? "on-track"
    : data.nextRank !== null ? "on-track"
    : "excellent";

  const statusMsg = !data ? "Loading…"
    : !data.isQualified
      ? "You have no active salary rank. Build team business volume to unlock your first rank and begin earning monthly salary."
      : !data.nextRank
      ? "You are at the highest salary rank. Maintain your team volume to continue receiving monthly salary income."
      : `You are earning $${fmt(data.monthlySalary)}/month. Add $${fmt(remainingBiz)} more in team business to unlock ${data.nextRank} and a higher salary.`;

  const actionContent: React.ReactNode = data && (
    !data.isQualified ? (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Build active investments across your team network. Each dollar of active investment on your left or right side counts toward your salary rank threshold.
      </p>
    ) : data.nextRank ? (
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Current Rank</p>
            <p className="text-sm font-bold" style={{ color: GOLD }}>{data.currentRank}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0" style={{ color: MUTED }} />
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: MUTED }}>Next Rank</p>
            <p className="text-sm font-bold" style={{ color: meta.color }}>{data.nextRank}</p>
          </div>
        </div>
        <ProgressBar pct={progressPct} color={meta.color} />
        <p className="text-xs" style={{ color: STATUS_CFG[status].color }}>
          You need <strong>${fmt(remainingBiz)}</strong> additional business volume to reach {data.nextRank}.
        </p>
      </div>
    ) : (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Maximum rank achieved. Maintain your team volume to ensure your salary achievement remains active each month.
      </p>
    )
  );

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

      <NextBestActionCard status={status} statusMsg={statusMsg} loading={loading} color={meta.color}>
        {actionContent}
      </NextBestActionCard>

      {/* Current Progress */}
      <section>
        <SectionHeader icon={Award} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3,4].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : !data?.isQualified && progressPct === 0 ? (
            <EmptyStateCard icon={DollarSign} color={meta.color} bg={meta.bg}
              title="No Active Salary Rank"
              description="Reach a salary rank by building team investment volume across both legs. Your first rank unlocks monthly salary income."
              ctaLabel="View My Network" onCta={() => {}} />
          ) : data ? (
            <>
              <MetricRow label="Current Rank" value={data.currentRank ?? "None"} valueColor={data.currentRank ? GOLD : MUTED} />
              <MetricRow label="Monthly Salary" value={monthlySalary > 0 ? `$${fmt(data.monthlySalary)}/month` : "Not qualified"}
                valueColor={monthlySalary > 0 ? meta.color : MUTED} />
              {data.nextRank && (
                <div className="py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-foreground">Progress to {data.nextRank}</span>
                    <span className="text-xs font-semibold" style={{ color: meta.color }}>{progressPct}%</span>
                  </div>
                  <ProgressBar pct={progressPct} color={meta.color} />
                  <p className="text-[10px] mt-1.5" style={{ color: MUTED }}>
                    ${fmt(remainingBiz)} more in team business volume needed
                  </p>
                </div>
              )}
              <MetricRow label="Left Team Business" value={`$${fmt(data.leftBusinessUSD)}`} />
              <MetricRow label="Right Team Business" value={`$${fmt(data.rightBusinessUSD)}`} />
              <MetricRow label="Total Team Business" value={`$${fmt(data.totalBusinessUSD)}`}
                sub="Sum of active investments across both team legs" />
              <MetricRow label="Active Ranks" value={data.activeRanks.length > 0 ? data.activeRanks.join(", ") : "None"} />
              <MetricRow label="Lifetime Salary" value={`$${fmt(data.lifetimeSalary)}`} />
            </>
          ) : null}
        </div>
      </section>

      {/* Why This Amount */}
      <WhyThisAmountCard loading={loading}>
        {data ? (
          monthlySalary > 0 ? (
            <>
              <MetricRow label="Active Rank" value={data.currentRank ?? "—"} valueColor={GOLD} />
              <MetricRow label="Monthly Salary" value={`$${fmt(data.monthlySalary)}`} valueColor={meta.color} />
              <MetricRow label="Next Credit" value={new Date(data.nextSalaryAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
              {data.activeRanks.length > 1 && (
                <MetricRow label="Active Rank Count" value={`${data.activeRanks.length} ranks`}
                  sub="Salary stacks across all active rank achievements" />
              )}
            </>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm" style={{ color: MUTED }}>Qualify for a salary rank to see your payout breakdown here.</p>
            </div>
          )
        ) : null}
      </WhyThisAmountCard>

      <HowToEarnSection tips={SALARY_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={SALARY_FAQS} color={meta.color} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Level View
   ═════════════════════════════════════════════════════════════════════════════ */

const LEVEL_TIPS = [
  "Personally sponsor more members — level 1 income is triggered by every investment your direct referrals make.",
  "Help your direct referrals grow their own networks to earn from deeper levels (up to level 5).",
  "Encourage your team to stay invested — level income is earned each time a referral in your chain creates a new investment.",
];

const LEVEL_FAQS = [
  { q: "How does Level Income work?", a: "When anyone in your referral chain invests, you receive a percentage of that investment amount as instant income. Levels 1–5 each pay 1%, credited immediately to your withdrawal wallet." },
  { q: "When is Level Income credited?", a: "Level income is instant — it is credited the moment a qualifying investment is made by someone in your referral chain." },
  { q: "How deep does Level Income go?", a: "Level income extends up to 5 generations deep in your referral chain. The percentage is the same (1%) at every level." },
  { q: "Is there a qualification required?", a: "No. Level income is paid to every ancestor in the sponsor chain with no qualification gate — as long as you have a sponsor relationship, you earn." },
];

function LevelView() {
  const [data, setData]       = useState<LevelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const meta = ENGINE_META.level;

  useEffect(() => {
    getLevelDetail()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const directRefs  = data?.directReferralCount ?? 0;
  const totalPayouts = data?.totalPayouts ?? 0;
  const breakdown   = data?.breakdown ?? [];
  const bestLevel   = breakdown.length > 0
    ? breakdown.reduce((best, b) => parseFloat(b.incomeAmount) > parseFloat(best.incomeAmount) ? b : best, breakdown[0]!)
    : null;

  // Status
  const status: StatusLevel = !data ? "attention"
    : totalPayouts > 0     ? "excellent"
    : directRefs > 0       ? "on-track"
    : "attention";

  const statusMsg = !data ? "Loading…"
    : totalPayouts > 0
      ? `You have earned ${totalPayouts} level commission${totalPayouts !== 1 ? "s" : ""} in total. Help your direct referrals grow their own networks to earn from deeper levels.`
      : directRefs > 0
      ? `You have ${directRefs} direct referral${directRefs !== 1 ? "s" : ""}. Encourage them to invest — every investment they make earns you an instant commission.`
      : "Invite your first referral to start earning level commissions from their investments.";

  const actionContent: React.ReactNode = data && (
    totalPayouts > 0 && bestLevel ? (
      <div className="space-y-2">
        <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
          Your strongest earning level is <strong>Level {bestLevel.level}</strong> (${fmt(bestLevel.incomeAmount)} earned).
          Helping your Level {bestLevel.level} referrals sponsor their own members will unlock Level {bestLevel.level + 1} income for you.
        </p>
      </div>
    ) : directRefs > 0 ? (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        You have {directRefs} direct referral{directRefs !== 1 ? "s" : ""}. Each time they invest,
        you earn an instant <strong>1% commission</strong> on the investment amount — credited immediately.
      </p>
    ) : (
      <p className="text-sm" style={{ color: STATUS_CFG[status].color }}>
        Use your referral link to invite your first member. Every investment they make earns you a 1% commission instantly.
      </p>
    )
  );

  // Paying levels count
  const activeLevels = breakdown.filter(b => b.count > 0).length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          <XCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* Custom Level Hero — instant credit, no scheduled countdown */}
      <div className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: CARD, border: `1px solid ${meta.color}25` }}>
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.color}60, transparent)` }} />
        {loading ? (
          <div className="space-y-4"><Sk className="h-6 w-40" />
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

      <NextBestActionCard status={status} statusMsg={statusMsg} loading={loading} color={meta.color}>
        {actionContent}
      </NextBestActionCard>

      {/* Current Progress */}
      <section>
        <SectionHeader icon={Users} title="Current Progress" />
        <div className="rounded-2xl px-5" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="space-y-2 py-4">{[0,1,2,3].map(i => <Sk key={i} className="h-10" />)}</div>
          ) : totalPayouts === 0 ? (
            <EmptyStateCard icon={Users} color={meta.color} bg={meta.bg}
              title="No Level Commissions Yet"
              description="Level income is triggered when people in your referral chain invest. Invite your first referral to begin earning instant commissions."
              ctaLabel="Invite a Referral" onCta={() => {}} />
          ) : data ? (
            <>
              <MetricRow label="Direct Referrals" value={`${directRefs}`} valueColor={directRefs > 0 ? meta.color : MUTED} />
              <MetricRow label="Active Earning Levels" value={`${activeLevels} of 5`} valueColor={meta.color} />
              <MetricRow label="Earned Today" value={`$${fmt(data.todayEarnings)}`} valueColor={meta.color} />
              <MetricRow label="Earned This Month" value={`$${fmt(data.thisMonthEarnings)}`} valueColor={meta.color} />
              <MetricRow label="Total Commissions Paid" value={`${totalPayouts}`} />
              <MetricRow label="Lifetime Level Income" value={`$${fmt(data.lifetimeEarnings)}`} />
            </>
          ) : null}
        </div>

        {/* Level breakdown table */}
        {!loading && data && breakdown.length > 0 && (
          <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <p className="text-xs font-semibold text-foreground">Level Breakdown</p>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>1% per level</p>
            </div>
            {[1, 2, 3, 4, 5].map(lvl => {
              const row = breakdown.find(b => b.level === lvl);
              const count = row?.count ?? 0;
              const amount = row?.incomeAmount ?? "0.00";
              const pct   = row?.percentage ?? 1;
              const isTop = bestLevel?.level === lvl && count > 0;
              return (
                <div key={lvl} className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: lvl < 5 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: `${meta.color}18`, color: meta.color }}>L{lvl}</div>
                    <span className="text-xs text-foreground">Level {lvl}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.05)", color: MUTED }}>{pct}%</span>
                    {isTop && <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}>Top</span>}
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

      {/* Why This Amount */}
      <WhyThisAmountCard loading={loading}>
        {data && totalPayouts > 0 ? (
          <>
            {[1, 2, 3, 4, 5].map(lvl => {
              const row = breakdown.find(b => b.level === lvl);
              if (!row || row.count === 0) return null;
              return (
                <MetricRow key={lvl}
                  label={`Level ${lvl} (${row.percentage}%)`}
                  value={`$${fmt(row.incomeAmount)}`}
                  valueColor={bestLevel?.level === lvl ? meta.color : undefined}
                  sub={`${row.count} commission${row.count !== 1 ? "s" : ""} paid`} />
              );
            })}
            <MetricRow label="Total Earned" value={`$${fmt(data.lifetimeEarnings)}`} valueColor={GOLD} />
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm" style={{ color: MUTED }}>No commissions yet. Level earnings will appear here as your team invests.</p>
          </div>
        )}
      </WhyThisAmountCard>

      <HowToEarnSection tips={LEVEL_TIPS} color={meta.color} />
      <HistorySection txType={meta.txType} />
      <FAQSection faqs={LEVEL_FAQS} color={meta.color} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   Main dispatcher
   ═════════════════════════════════════════════════════════════════════════════ */

export default function IncomeDetailPage({ engine }: { engine: string }) {
  const [, navigate] = useLocation();
  const key  = engine as EngineKey;
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
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="flex items-center gap-3">
            <button onClick={() => navigate("/income")}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-white/[0.06]"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ArrowLeft className="h-4 w-4" style={{ color: MUTED }} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <meta.icon className="h-5 w-5" style={{ color: meta.color }} />
                {meta.title}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                Detailed view ·{" "}
                <button onClick={() => navigate("/income")} className="underline decoration-dotted hover:opacity-80">
                  Back to Income Center
                </button>
              </p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            {engineViews[key] ?? <ROIView />}
          </motion.div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
