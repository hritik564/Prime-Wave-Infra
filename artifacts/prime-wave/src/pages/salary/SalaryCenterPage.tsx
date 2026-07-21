import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import AppLayout from "@/components/layout/AppLayout";
import {
  DollarSign, Lock, Unlock, TrendingUp, Award, Clock,
  Info, ChevronLeft, ChevronRight, Calendar, CheckCircle2, XCircle,
} from "lucide-react";
import {
  getSalaryQualifications,
  getSalarySummary,
  getSalaryAchievements,
  getSalaryHistoryMember,
  getSalaryUpcomingRun,
  type SalaryQualificationSummary,
  type SalarySummaryData,
  type SalaryAchievementItem,
  type MemberSalaryHistoryItem,
  type SalaryUpcomingRun,
} from "@/lib/api";

// ── Design tokens ─────────────────────────────────────────────────────────────

const ORANGE = "#fb923c";
const MUTED  = "rgba(170,179,197,0.55)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "rgba(255,255,255,0.035)";
const GREEN  = "#34d399";
const BLUE   = "#60a5fa";
const YELLOW = "#fbbf24";
const RED    = "#f87171";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined, dec = 2): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(m: number, y: number): string {
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:    { label: "Pending",    color: YELLOW,    bg: "rgba(251,191,36,0.10)"   },
  APPROVED:   { label: "Approved",   color: BLUE,      bg: "rgba(96,165,250,0.10)"   },
  PAID:       { label: "Paid",       color: GREEN,     bg: "rgba(52,211,153,0.10)"   },
  ACTIVE:     { label: "Active",     color: GREEN,     bg: "rgba(52,211,153,0.10)"   },
  EXPIRED:    { label: "Expired",    color: MUTED,     bg: "rgba(170,179,197,0.08)"  },
  FAILED:     { label: "Failed",     color: RED,       bg: "rgba(248,113,113,0.10)"  },
  GENERATING: { label: "Generating", color: ORANGE,    bg: "rgba(251,146,60,0.10)"   },
  GENERATED:  { label: "Generated",  color: BLUE,      bg: "rgba(96,165,250,0.10)"   },
  APPROVING:  { label: "Approving",  color: "#a78bfa", bg: "rgba(167,139,250,0.10)"  },
  PAYING:     { label: "Paying",     color: GREEN,     bg: "rgba(52,211,153,0.10)"   },
  COMPLETED:  { label: "Completed",  color: GREEN,     bg: "rgba(52,211,153,0.10)"   },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] ?? { label: status, color: MUTED, bg: BORDER };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 10px",
      borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
      color: s.color, background: s.bg, border: `1px solid ${s.color}30`,
      whiteSpace: "nowrap",
    }}>{s.label}</span>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <Info
        size={13}
        style={{ color: MUTED, cursor: "pointer", flexShrink: 0 }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
      />
      {show && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)", width: 240, padding: "10px 12px",
          background: "#1a1f2e", border: `1px solid ${BORDER}`,
          borderRadius: 10, fontSize: 12, color: "rgba(220,225,235,0.85)",
          lineHeight: 1.6, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          whiteSpace: "normal", pointerEvents: "none",
        }}>{text}</span>
      )}
    </span>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct, color = ORANGE, height = 10 }: { pct: number; color?: string; height?: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(100, Math.max(0, pct))), 120);
    return () => clearTimeout(t);
  }, [pct]);
  const clr = w >= 100 ? GREEN : color;
  return (
    <div style={{ height, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 99, background: clr,
        width: `${w}%`, transition: "width 0.9s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: w > 0 ? `0 0 10px ${clr}55` : "none",
      }} />
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skel({ w = "100%", h = 18 }: { w?: string; h?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 8,
      background: "rgba(255,255,255,0.05)",
      animation: "salary-pulse 1.5s ease-in-out infinite",
    }} />
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 16, padding: 20, ...style,
    }}>{children}</div>
  );
}

// ── Section Label ─────────────────────────────────────────────────────────────

function SLabel({ children }: { children: ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: MUTED, marginBottom: 14,
    }}>{children}</p>
  );
}

// ── Business Pool Row ─────────────────────────────────────────────────────────

function PoolRow({ label, value, locked, tooltip, accent }: {
  label: string; value: number; locked: boolean; tooltip: string; accent?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "11px 0", borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {locked
          ? <Lock size={13} style={{ color: MUTED, flexShrink: 0 }} />
          : <Unlock size={13} style={{ color: GREEN, flexShrink: 0 }} />}
        <span style={{ fontSize: 14, color: locked ? MUTED : "var(--foreground)" }}>{label}</span>
        <InfoTip text={tooltip} />
      </div>
      <span style={{
        fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums",
        color: locked ? MUTED : (accent ?? "var(--foreground)"),
      }}>
        {locked ? "—" : `$${fmt(value)}`}
      </span>
    </div>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "When is salary credited?",
    a: "Salary is credited once per month at the start of each calendar month. You receive payment for every active rank achievement you hold at the time of the monthly run.",
  },
  {
    q: "How are salary ranks determined?",
    a: "Salary ranks are based on total active investment volume across your binary team. Each rank requires a minimum total business volume threshold to qualify.",
  },
  {
    q: "What is the difference between Direct, Downline, and Power business?",
    a: "Direct Business is investment by your personally sponsored members. Downline Business is from your broader team network below your directs. Power Business comes from your stronger leg. Pre-Gold, only Direct counts. After achieving Gold, all three pools are included in your effective total.",
  },
  {
    q: "What happens if I lose my rank?",
    a: "If your team volume drops below the rank threshold, your achievement for that rank becomes inactive and you stop receiving that monthly salary. Your business volume is preserved — requalify by rebuilding the required amount.",
  },
  {
    q: "Can I hold multiple salary ranks at the same time?",
    a: "Your monthly salary reflects your highest active rank. If multiple achievements are active simultaneously, the highest rank amount is used.",
  },
  {
    q: "Is salary the same every month?",
    a: "Salary is fixed at your current rank amount each month. It only changes when your rank changes — either from advancing, losing qualification, or achievement expiry.",
  },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {FAQS.map((faq, i) => (
        <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${BORDER}` : "none" }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: "100%", textAlign: "left", padding: "14px 0",
              background: "none", border: "none", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{faq.q}</span>
            <ChevronRight size={15} style={{
              color: MUTED, flexShrink: 0,
              transform: open === i ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }} />
          </button>
          {open === i && (
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, paddingBottom: 14 }}>{faq.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SalaryCenterPage() {
  const [qual, setQual]           = useState<SalaryQualificationSummary | null>(null);
  const [summary, setSummary]     = useState<SalarySummaryData | null>(null);
  const [upcoming, setUpcoming]   = useState<SalaryUpcomingRun | null | "loading">("loading");
  const [history, setHistory]     = useState<MemberSalaryHistoryItem[]>([]);
  const [histMeta, setHistMeta]   = useState<{
    total: number; page: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean;
  } | null>(null);
  const [achievements, setAchievements] = useState<SalaryAchievementItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [histPage, setHistPage]   = useState(1);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      getSalaryQualifications(),
      getSalarySummary(),
      getSalaryUpcomingRun(),
      getSalaryHistoryMember({ page: 1, limit: 10 }),
      getSalaryAchievements(),
    ]).then(([q, s, u, h, a]) => {
      if (q.status === "fulfilled") setQual(q.value);
      if (s.status === "fulfilled") setSummary(s.value);
      setUpcoming(u.status === "fulfilled" ? u.value : null);
      if (h.status === "fulfilled") {
        setHistory(h.value.data);
        setHistMeta(h.value.meta);
      }
      if (a.status === "fulfilled") setAchievements(a.value);
      setLoading(false);
    });
  }, []);

  async function loadHistPage(page: number) {
    setHistLoading(true);
    try {
      const r = await getSalaryHistoryMember({ page, limit: 10 });
      setHistory(r.data);
      setHistMeta(r.meta);
      setHistPage(page);
    } finally { setHistLoading(false); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const monthlySalary     = parseFloat(summary?.activeMonthlySalary  ?? "0");
  const lifetimeSalary    = parseFloat(summary?.lifetimeSalaryIncome ?? "0");
  const highestRank       = qual?.highestRank ?? null;
  const isGoldUnlocked    = qual?.isGoldUnlocked ?? false;
  const directBusiness    = parseFloat(qual?.directBusiness    ?? "0");
  const downlineBusiness  = parseFloat(qual?.downlineBusiness  ?? "0");
  const powerBusiness     = parseFloat(qual?.powerBusiness     ?? "0");
  const effectiveBusiness = parseFloat(qual?.effectiveBusiness ?? "0");
  const progressPct       = qual?.progressPct ?? 0;
  const nextRank          = qual?.nextRank ?? null;
  const remaining         = parseFloat(qual?.remaining         ?? "0");
  const nextRequired      = parseFloat(qual?.nextRequiredBusiness ?? "0");
  const allRanks          = qual?.qualifications ?? [];
  const activeAchievements = summary?.activeAchievements ?? [];
  const topAchievement    = achievements.find(a => a.isActive && a.rankName === highestRank)
                         ?? achievements.find(a => a.isActive);
  const upcomingRun       = upcoming === "loading" ? null : upcoming;
  const nextRankEntry     = allRanks.find(r => r.rankName === nextRank);

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <style>{`@keyframes salary-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 80px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(251,146,60,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <DollarSign size={22} style={{ color: ORANGE }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Skel w="140px" h={22} />
              <Skel w="220px" h={14} />
            </div>
          </div>
          {[80, 160, 140, 110, 200].map((h, i) => (
            <div key={i} style={{ borderRadius: 16, background: CARD, border: `1px solid ${BORDER}`, height: h }} />
          ))}
        </div>
      </AppLayout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <style>{`
        @keyframes salary-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .sc-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .sc-table { width:100%; border-collapse:collapse; font-size:13px; }
        .sc-table th { padding:10px 12px; text-align:left; font-size:11px; font-weight:700;
          letter-spacing:0.08em; text-transform:uppercase; color:${MUTED};
          border-bottom:1px solid ${BORDER}; }
        .sc-table td { padding:12px 12px; vertical-align:middle; border-bottom:1px solid ${BORDER}; }
        .sc-table tr:last-child td { border-bottom:none; }
        .sc-btn { display:inline-flex; align-items:center; gap:4px; padding:6px 14px;
          border-radius:8px; font-size:12px; font-weight:600; border:1px solid ${BORDER};
          cursor:pointer; background:rgba(255,255,255,0.05); color:var(--foreground);
          transition:background 0.15s; }
        .sc-btn:disabled { opacity:0.35; cursor:not-allowed; }
        .sc-btn:not(:disabled):hover { background:rgba(255,255,255,0.1); }
        @media(max-width:640px){ .sc-grid2{ grid-template-columns:1fr; } }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 80px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <DollarSign size={22} style={{ color: ORANGE }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>Salary Center</h1>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
              Monthly passive income based on your salary rank achievements
            </p>
          </div>
          {highestRank && monthlySalary > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
              background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)",
              borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 700, color: GREEN,
            }}>
              <CheckCircle2 size={13} /> Active
            </span>
          )}
        </div>

        {/* ── Section 1: Hero stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {([
            {
              label: "Monthly Salary",
              value: monthlySalary > 0 ? `$${fmt(monthlySalary)}/mo` : "—",
              sub:   monthlySalary > 0
                ? `${activeAchievements.length} active rank${activeAchievements.length !== 1 ? "s" : ""}`
                : "No active rank",
              color: monthlySalary > 0 ? ORANGE : MUTED,
            },
            {
              label: "Lifetime Earnings",
              value: `$${fmt(lifetimeSalary)}`,
              sub:   "Total salary received",
              color: "var(--foreground)",
            },
            {
              label: "Next Rank",
              value: nextRank ?? (highestRank ? "Max Rank" : "Silver"),
              sub:   nextRank
                ? `$${fmt(remaining)} more needed`
                : (highestRank ? "Highest rank reached" : "Start building volume"),
              color: nextRank ? BLUE : MUTED,
            },
          ] as const).map(stat => (
            <Card key={stat.label} style={{ textAlign: "center", padding: "18px 12px" }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>
                {stat.label}
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, color: stat.color, marginBottom: 4, fontVariantNumeric: "tabular-nums", wordBreak: "break-word" }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 12, color: MUTED }}>{stat.sub}</p>
            </Card>
          ))}
        </div>

        {/* ── Section 2 + 8: Current rank | Upcoming run ── */}
        <div className="sc-grid2">

          {/* Current Rank */}
          <Card>
            <SLabel>Current Rank</SLabel>
            {highestRank ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: "rgba(251,146,60,0.15)", border: `2px solid ${ORANGE}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Award size={26} style={{ color: ORANGE }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 20, fontWeight: 800, color: ORANGE }}>{highestRank}</p>
                    <p style={{ fontSize: 12, color: MUTED }}>Active salary rank</p>
                  </div>
                </div>

                {activeAchievements.map(a => (
                  <div key={a.rankName} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", borderRadius: 10,
                    background: "rgba(251,146,60,0.07)", marginBottom: 8,
                  }}>
                    <span style={{ fontSize: 13, color: "var(--foreground)" }}>{a.rankName}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: ORANGE, fontVariantNumeric: "tabular-nums" }}>
                      ${fmt(a.monthlyAmount)}/mo
                    </span>
                  </div>
                ))}

                {topAchievement && (
                  <p style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                    Achieved {fmtDate(topAchievement.achievedAt)}
                    {topAchievement.expiresAt
                      ? ` · Expires ${fmtDate(topAchievement.expiresAt)}`
                      : " · No expiry"}
                  </p>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <XCircle size={30} style={{ color: MUTED, display: "block", margin: "0 auto 10px" }} />
                <p style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}>No active rank</p>
                <p style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
                  Build team business volume to unlock your first salary rank.
                </p>
              </div>
            )}
          </Card>

          {/* Upcoming Run */}
          <Card>
            <SLabel>Upcoming Salary Run</SLabel>
            {upcoming === "loading" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Skel /><Skel w="70%" /><Skel w="50%" />
              </div>
            ) : upcomingRun ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <p style={{ fontSize: 16, fontWeight: 700 }}>
                    {monthLabel(upcomingRun.month, upcomingRun.year)}
                  </p>
                  <StatusBadge status={upcomingRun.status} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {([
                    {
                      label: "Your Expected Amount",
                      value: upcomingRun.estimatedAmount
                        ? `$${fmt(upcomingRun.estimatedAmount)}`
                        : "Pending generation",
                    },
                    { label: "Rank for This Run", value: upcomingRun.rankName ?? "—" },
                    ...(upcomingRun.incomeStatus
                      ? [{ label: "Income Status", value: <StatusBadge status={upcomingRun.incomeStatus} /> }]
                      : []),
                    ...(upcomingRun.paidAt
                      ? [{ label: "Paid On", value: fmtDate(upcomingRun.paidAt) }]
                      : []),
                  ]).map((row, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                      <span style={{ color: MUTED }}>{row.label}</span>
                      <span style={{ fontWeight: 600 }}>{row.value as ReactNode}</span>
                    </div>
                  ))}
                </div>
                {upcomingRun.generatedCount > 0 && (
                  <p style={{ fontSize: 12, color: MUTED, marginTop: 14 }}>
                    {upcomingRun.generatedCount.toLocaleString()} member records generated
                  </p>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Calendar size={30} style={{ color: MUTED, display: "block", margin: "0 auto 10px" }} />
                <p style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}>No active run</p>
                <p style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
                  The next monthly salary run has not started yet.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* ── Section 3: Business Breakdown ── */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
            <SLabel>Salary Business Breakdown</SLabel>
            {isGoldUnlocked ? (
              <span style={{ fontSize: 11, color: GREEN, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
                <Unlock size={11} /> All pools unlocked
              </span>
            ) : (
              <span style={{ fontSize: 11, color: YELLOW, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
                <Lock size={11} /> Pre-Gold: Direct only
              </span>
            )}
          </div>

          <PoolRow
            label="Direct Business"
            value={directBusiness}
            locked={false}
            accent={ORANGE}
            tooltip="Active investment placed by your personally sponsored direct referrals. Always counts toward salary rank qualification."
          />
          <PoolRow
            label="Downline Business"
            value={downlineBusiness}
            locked={!isGoldUnlocked}
            tooltip={
              isGoldUnlocked
                ? "Active investment volume from your indirect team members below your directs. Unlocked after achieving Gold rank."
                : "Locked until you achieve the Gold salary rank. Reach Gold first to include downline business in your effective qualification total."
            }
          />
          <PoolRow
            label="Power Business"
            value={powerBusiness}
            locked={!isGoldUnlocked}
            tooltip={
              isGoldUnlocked
                ? "Investment from your power leg (stronger binary side). Unlocked after achieving Gold rank."
                : "Locked until you achieve the Gold salary rank. Reach Gold to unlock this pool."
            }
          />

          {/* Effective Business total */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 0 2px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={14} style={{ color: ORANGE, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>Effective Business</span>
              <InfoTip text={
                isGoldUnlocked
                  ? "All three pools are active: Direct + Downline + Power business all count toward your rank qualification."
                  : "Pre-Gold: only Direct Business counts. Achieve Gold rank to unlock Downline and Power pools."
              } />
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: ORANGE, fontVariantNumeric: "tabular-nums" }}>
              ${fmt(effectiveBusiness)}
            </span>
          </div>
        </Card>

        {/* ── Section 4: Next Rank Progress ── */}
        <Card>
          <SLabel>
            {nextRank
              ? `Progress Toward ${nextRank}`
              : highestRank
                ? "Maximum Rank Achieved"
                : "Progress Toward First Rank"}
          </SLabel>

          {nextRank ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: MUTED }}>
                  {highestRank ? `${highestRank} → ${nextRank}` : `Unranked → ${nextRank}`}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: ORANGE }}>{progressPct}%</span>
              </div>
              <ProgressBar pct={progressPct} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontSize: 12, color: MUTED }}>
                  Current: ${fmt(qual?.totalBusinessUSD ?? "0")} total BV
                </span>
                <span style={{ fontSize: 12, color: MUTED }}>
                  Target: ${fmt(nextRequired)} total BV
                </span>
              </div>

              <div style={{
                marginTop: 14, padding: "12px 16px", borderRadius: 10,
                background: "rgba(251,146,60,0.06)", border: `1px solid ${ORANGE}22`,
              }}>
                <p style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.6 }}>
                  Build{" "}
                  <strong style={{ color: ORANGE }}>${fmt(remaining)}</strong>
                  {" "}more in team business volume to unlock{" "}
                  <strong style={{ color: ORANGE }}>{nextRank}</strong>
                  {nextRankEntry && (
                    <> and earn <strong style={{ color: ORANGE }}>${fmt(nextRankEntry.monthlySalary)}/mo</strong></>
                  )}.
                </p>
              </div>
            </>
          ) : highestRank ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <ProgressBar pct={100} />
              <p style={{ marginTop: 14, fontSize: 14, color: GREEN, fontWeight: 700 }}>
                🎉 You have reached the highest salary rank!
              </p>
              <p style={{ marginTop: 6, fontSize: 12, color: MUTED }}>
                Maintain your team volume each month to keep your rank active.
              </p>
            </div>
          ) : (
            <>
              <ProgressBar pct={progressPct} />
              <p style={{ marginTop: 10, fontSize: 13, color: MUTED }}>
                No business volume recorded yet. Grow your team to unlock your first salary rank.
              </p>
            </>
          )}
        </Card>

        {/* ── Section 5: Rank Qualification Ladder ── */}
        {allRanks.length > 0 && (
          <Card>
            <SLabel>Rank Qualification Ladder</SLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allRanks.map((rank, i) => {
                const isCurrent = rank.rankName === highestRank;
                const isNext    = rank.rankName === nextRank && !isCurrent;
                const qualifies = rank.qualifies;
                return (
                  <div key={rank.rankName} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderRadius: 12,
                    background: isCurrent ? "rgba(251,146,60,0.08)" : isNext ? "rgba(96,165,250,0.05)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isCurrent ? `${ORANGE}33` : isNext ? `${BLUE}22` : BORDER}`,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: qualifies ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${qualifies ? GREEN : BORDER}`,
                    }}>
                      {qualifies
                        ? <CheckCircle2 size={14} style={{ color: GREEN }} />
                        : <span style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>{i + 1}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: isCurrent ? ORANGE : "var(--foreground)" }}>
                          {rank.rankName}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 10, color: ORANGE, fontWeight: 700, letterSpacing: "0.05em" }}>
                            ● CURRENT
                          </span>
                        )}
                        {isNext && (
                          <span style={{ fontSize: 10, color: BLUE, fontWeight: 700, letterSpacing: "0.05em" }}>
                            ▲ NEXT
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                        Requires ${fmt(rank.requiredBusiness)} total business
                      </p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: qualifies ? ORANGE : MUTED, fontVariantNumeric: "tabular-nums" }}>
                        ${fmt(rank.monthlySalary)}/mo
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── Section 6: Achievement History ── */}
        {achievements.length > 0 && (
          <Card>
            <SLabel>Achievement History</SLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {achievements.map(a => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderRadius: 10, gap: 12,
                  background: a.isActive ? "rgba(251,146,60,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${a.isActive ? `${ORANGE}22` : BORDER}`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: a.isActive ? ORANGE : MUTED }}>
                      {a.rankName}
                    </p>
                    <p style={{ fontSize: 12, color: MUTED }}>
                      Achieved {fmtDate(a.achievedAt)}
                      {a.expiresAt ? ` · Expires ${fmtDate(a.expiresAt)}` : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: a.isActive ? ORANGE : MUTED, fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
                      ${fmt(a.monthlyAmount)}/mo
                    </p>
                    <StatusBadge status={a.isActive ? "ACTIVE" : "EXPIRED"} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Section 7: Salary History ── */}
        <Card>
          <SLabel>Salary Payment History</SLabel>
          {history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <DollarSign size={30} style={{ color: MUTED, display: "block", margin: "0 auto 10px" }} />
              <p style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}>No salary payments yet</p>
              <p style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
                Payments appear here once you qualify and a monthly run is processed.
              </p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table className="sc-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Rank</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Paid On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{monthLabel(item.month, item.year)}</td>
                        <td style={{ color: MUTED }}>{item.rankName}</td>
                        <td style={{ fontWeight: 700, color: ORANGE, fontVariantNumeric: "tabular-nums" }}>
                          ${fmt(item.amount)}
                        </td>
                        <td><StatusBadge status={item.status} /></td>
                        <td style={{ color: MUTED }}>{fmtDate(item.paidAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {histMeta && histMeta.totalPages > 1 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BORDER}`,
                  flexWrap: "wrap", gap: 10,
                }}>
                  <p style={{ fontSize: 12, color: MUTED }}>
                    Page {histMeta.page} of {histMeta.totalPages} · {histMeta.total.toLocaleString()} records
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="sc-btn"
                      disabled={!histMeta.hasPrevPage || histLoading}
                      onClick={() => loadHistPage(histPage - 1)}
                    >
                      <ChevronLeft size={13} /> Prev
                    </button>
                    <button
                      className="sc-btn"
                      disabled={!histMeta.hasNextPage || histLoading}
                      onClick={() => loadHistPage(histPage + 1)}
                    >
                      Next <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── Section 8: How To Earn More ── */}
        <Card>
          <SLabel>How to Increase Your Salary</SLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                icon: TrendingUp, color: ORANGE,
                title: "Build Team Business Volume",
                body: "Every dollar of active investment across your team network counts toward your salary rank threshold. The more your team invests, the higher your rank.",
              },
              {
                icon: Award, color: BLUE,
                title: "Achieve Gold Rank",
                body: "Reaching Gold unlocks the Downline and Power business pools, multiplying the effective business that counts toward higher salary ranks.",
              },
              {
                icon: DollarSign, color: GREEN,
                title: "Advance to Higher Ranks",
                body: "Each higher salary rank comes with a larger monthly amount. Advancing your rank is the most direct way to increase your monthly salary income.",
              },
              {
                icon: Clock, color: YELLOW,
                title: "Maintain Active Status Monthly",
                body: "Salary runs check your status at generation time. Keep your team volume above rank thresholds to ensure you qualify at each monthly cycle.",
              },
            ].map(({ icon: Icon, color, title, body }) => (
              <div key={title} style={{ display: "flex", gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</p>
                  <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.65 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Section 9: FAQ ── */}
        <Card>
          <SLabel>Frequently Asked Questions</SLabel>
          <FAQSection />
        </Card>

      </div>
    </AppLayout>
  );
}
