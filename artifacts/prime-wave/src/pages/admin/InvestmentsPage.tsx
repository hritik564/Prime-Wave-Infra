import {
  useState, useMemo, useCallback, useEffect, useRef, memo,
} from "react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip,
} from "recharts";
import {
  Search, Filter, Download, RefreshCw, ChevronLeft, ChevronRight,
  MoreHorizontal, Eye, User2,
  ChevronDown, TrendingUp, DollarSign, Clock,
  AlertTriangle, Activity, Zap, X, RotateCw,
  CheckCircle, Layers,
} from "lucide-react";
import {
  getAdminInvestments,
  type AdminInvestmentItem,
  type AdminInvestmentStats,
  type AdminInvestmentPlanDist,
  type AdminInvStatus,
  type AdminPlanType,
} from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

// ─────────────────────────────────────────────────────────────────────────────
// Plan helpers
// ─────────────────────────────────────────────────────────────────────────────
const PLAN_LABEL: Record<AdminPlanType, string> = {
  PLAN_90:  "90-Day",
  PLAN_180: "180-Day",
  PLAN_270: "270-Day",
  PLAN_360: "360-Day",
};

const PLAN_COLORS: Record<AdminPlanType, { color: string; bg: string }> = {
  PLAN_90:  { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  },
  PLAN_180: { color: GOLD,      bg: "rgba(212,175,55,0.1)"  },
  PLAN_270: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  PLAN_360: { color: "#34d399", bg: "rgba(52,211,153,0.1)"  },
};

const PLAN_PIE_FILL: Record<AdminPlanType, string> = {
  PLAN_90:  "#60a5fa",
  PLAN_180: GOLD,
  PLAN_270: "#a78bfa",
  PLAN_360: "#34d399",
};

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<AdminInvStatus, { color: string; bg: string }> = {
  ACTIVE:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  MATURED:   { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  COMPLETED: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
const $     = (n: string | number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const $K    = (n: string | number) => `$${(Number(n) / 1000).toFixed(1)}K`;
const dt    = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dtt   = (s: string) => new Date(s).toLocaleString("en-US",    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const initials = (f: string, l: string) => `${f[0] ?? "?"}${l[0] ?? ""}`.toUpperCase();
const pct   = (s: string) => `${parseFloat(s)}%`;

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AdminInvStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: c.color, background: c.bg, padding: "3px 8px", borderRadius: 5 }}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlanBadge
// ─────────────────────────────────────────────────────────────────────────────
function PlanBadge({ planType, roi }: { planType: AdminPlanType; roi?: string }) {
  const c = PLAN_COLORS[planType];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: c.bg, padding: "2px 7px", borderRadius: 4 }}>
        {PLAN_LABEL[planType]}
      </span>
      {roi !== undefined && (
        <span style={{ fontSize: 10, color: MUTED }}>{pct(roi)}/day</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatCard
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, bg, sub }: {
  icon: React.ElementType; label: string; value: string | number; color: string; bg: string; sub?: string;
}) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", flex: 1, minWidth: 110 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "rgba(255,255,255,0.88)", lineHeight: 1.1, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ inv, size = 28 }: { inv: AdminInvestmentItem; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: "rgba(212,175,55,0.09)", border: "1.5px solid rgba(212,175,55,0.2)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: GOLD, fontSize: size * 0.33, fontWeight: 700, flexShrink: 0,
    }}>{initials(inv.firstName, inv.lastName)}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AutoCompound badge
// ─────────────────────────────────────────────────────────────────────────────
function AcBadge({ on }: { on: boolean }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: on ? "#34d399" : MUTED, background: on ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)", padding: "2px 7px", borderRadius: 4 }}>
      {on ? "ON" : "OFF"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row action dropdown — view-only actions, no approve/reject
// ─────────────────────────────────────────────────────────────────────────────
const ROW_ACTIONS = [
  { icon: Eye,   label: "View Details", color: "rgba(255,255,255,0.72)" },
  { icon: User2, label: "View Member",  color: "#60a5fa"                },
];

const ActionDropdown = memo(function ActionDropdown({
  open, onToggle, onClose, onViewDetails,
}: { open: boolean; onToggle: () => void; onClose: () => void; onViewDetails: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        style={{ background: open ? "rgba(255,255,255,0.06)" : "none", border: `1px solid ${open ? BORDER : "transparent"}`, borderRadius: 6, cursor: "pointer", padding: "4px 7px", color: MUTED, display: "flex", alignItems: "center", transition: "all 0.15s" }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100, background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 9, minWidth: 155, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          {ROW_ACTIONS.map((a) => (
            <div
              key={a.label}
              onClick={e => { e.stopPropagation(); onClose(); if (a.label === "View Details") onViewDetails(); }}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 13px", cursor: "pointer", color: a.color, fontSize: 12, transition: "background 0.12s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              <a.icon size={13} style={{ flexShrink: 0 }} /> {a.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// InvestmentRow
// ─────────────────────────────────────────────────────────────────────────────
interface InvRowProps {
  inv:             AdminInvestmentItem;
  selected:        boolean;
  onSelect:        (id: string) => void;
  onOpen:          (inv: AdminInvestmentItem) => void;
  dropdownOpen:    boolean;
  onDropdownToggle: (id: string) => void;
  onDropdownClose: () => void;
}

const InvestmentRow = memo(function InvestmentRow({
  inv, selected, onSelect, onOpen, dropdownOpen, onDropdownToggle, onDropdownClose,
}: InvRowProps) {
  const ref = useRef<HTMLTableRowElement>(null);
  const onEnter = useCallback(() => { if (ref.current) ref.current.style.background = "rgba(255,255,255,0.025)"; }, []);
  const onLeave = useCallback(() => { if (ref.current) ref.current.style.background = selected ? "rgba(212,175,55,0.04)" : "transparent"; }, [selected]);

  const TD: React.CSSProperties = { padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.72)", borderBottom: `1px solid rgba(255,255,255,0.04)`, verticalAlign: "middle" };

  return (
    <tr ref={ref} onClick={() => onOpen(inv)} onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{ cursor: "pointer", background: selected ? "rgba(212,175,55,0.04)" : "transparent", transition: "background 0.12s" }}>
      <td style={{ ...TD, width: 36 }} onClick={e => { e.stopPropagation(); onSelect(inv.id); }}>
        <div style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${selected ? GOLD : BORDER}`, background: selected ? GOLD : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          {selected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="hsl(222 62% 7%)" strokeWidth="1.5" strokeLinecap="round"/></svg>}
        </div>
      </td>
      <td style={{ ...TD, fontFamily: "monospace", fontSize: 11, color: MUTED }}>{inv.id.slice(0, 10)}…</td>
      <td style={TD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar inv={inv} size={26} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{inv.username}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{inv.userId.slice(0, 10)}…</div>
          </div>
        </div>
      </td>
      <td style={TD}><PlanBadge planType={inv.planType} roi={inv.dailyROI} /></td>
      <td style={{ ...TD, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "monospace" }}>{$(inv.amount)}</td>
      <td style={{ ...TD, fontSize: 11, color: "#34d399" }}>{pct(inv.dailyROI)}</td>
      <td style={{ ...TD, fontSize: 11, color: MUTED }}>{inv.durationDays}d</td>
      <td style={TD}><AcBadge on={inv.autoCompound} /></td>
      <td style={TD}><StatusBadge status={inv.status} /></td>
      <td style={{ ...TD, fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>{dt(inv.startedAt)}</td>
      <td style={{ ...TD, fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>{dt(inv.maturesAt)}</td>
      <td style={{ ...TD, width: 48 }} onClick={e => e.stopPropagation()}>
        <ActionDropdown
          open={dropdownOpen}
          onToggle={() => onDropdownToggle(inv.id)}
          onClose={onDropdownClose}
          onViewDetails={() => onOpen(inv)}
        />
      </td>
    </tr>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────────────────────
function Timeline({ inv }: { inv: AdminInvestmentItem }) {
  const matured   = inv.status === "MATURED"   || inv.status === "COMPLETED";
  const completed = inv.status === "COMPLETED";
  const steps = [
    { label: "Activated", date: inv.startedAt,   done: true      },
    { label: "Matured",   date: inv.maturesAt,   done: matured   },
    { label: "Completed", date: inv.completedAt, done: completed },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: s.done ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${s.done ? "#34d399" : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
              {s.done && <svg width="7" height="6" viewBox="0 0 7 6" fill="none"><path d="M1 3L2.8 5L6 1" stroke="#34d399" strokeWidth="1.3" strokeLinecap="round"/></svg>}
            </div>
            {i < steps.length - 1 && <div style={{ width: 1, height: 20, background: s.done ? "rgba(52,211,153,0.2)" : BORDER, margin: "2px 0" }} />}
          </div>
          <div style={{ paddingBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: s.done ? "rgba(255,255,255,0.8)" : MUTED }}>{s.label}</div>
            {s.date && <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{dtt(s.date)}</div>}
            {!s.date && !s.done && <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>—</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DrawerRow
// ─────────────────────────────────────────────────────────────────────────────
function DrawerRow({ label, value, mono, accent }: { label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)`, gap: 8 }}>
      <span style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: accent ? GOLD_L : "rgba(255,255,255,0.8)", fontFamily: mono ? "monospace" : undefined, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvestmentDrawer — view-only, monitoring/audit purpose
// ─────────────────────────────────────────────────────────────────────────────
function InvestmentDrawer({ inv, onClose }: {
  inv: AdminInvestmentItem | null; onClose: () => void;
}) {
  const visible = !!inv;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none", transition: "opacity 0.22s ease" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: 400, background: "hsl(222 62% 7%)", borderLeft: `1px solid ${BORDER}`, boxShadow: "-20px 0 60px rgba(0,0,0,0.5)", transform: visible ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.32,0.72,0,1)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {inv && (
          <>
            {/* Header */}
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "hsl(222 62% 7%)", zIndex: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}>{inv.id}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4, display: "flex", gap: 6 }}>
                  <StatusBadge status={inv.status} />
                  <PlanBadge planType={inv.planType} />
                </div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "18px 18px 24px", flex: 1 }}>

              {/* Summary */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 10 }}>INVESTMENT SUMMARY</div>
              <DrawerRow label="Amount"          value={$(inv.amount)}                accent />
              <DrawerRow label="Current Principal" value={$(inv.currentPrincipal)} />
              <DrawerRow label="Plan"            value={<PlanBadge planType={inv.planType} />} />
              <DrawerRow label="Daily ROI"       value={`${pct(inv.dailyROI)} / day`} />
              <DrawerRow label="Duration"        value={`${inv.durationDays} days`} />
              <DrawerRow label="Auto-Compound"   value={<AcBadge on={inv.autoCompound} />} />
              <DrawerRow label="Status"          value={<StatusBadge status={inv.status} />} />

              {/* Earnings */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>EARNINGS</div>
              <DrawerRow label="Claimable ROI"       value={$(inv.claimableROI)} />
              <DrawerRow label="Claimable Principal" value={$(inv.claimablePrincipal)} />

              {/* Member */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>MEMBER</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <Avatar inv={inv} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{inv.username}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{inv.firstName} {inv.lastName}</div>
                  {inv.sponsorUsername && <div style={{ fontSize: 11, color: "#60a5fa" }}>via @{inv.sponsorUsername}</div>}
                </div>
              </div>
              <DrawerRow label="Email"  value={inv.email} />
              <DrawerRow label="UserID" value={inv.userId} mono />

              {/* Timeline */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>TIMELINE</div>
              <Timeline inv={inv} />

              {/* Audit */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, margin: "18px 0 10px" }}>AUDIT</div>
              <DrawerRow label="Started"  value={dtt(inv.startedAt)} />
              <DrawerRow label="Matures"  value={dtt(inv.maturesAt)} />
              {inv.completedAt && <DrawerRow label="Completed" value={dtt(inv.completedAt)} />}
              <DrawerRow label="Created"  value={dtt(inv.createdAt)} />

              {/* Info note */}
              <div style={{ marginTop: 20, padding: "10px 12px", background: "rgba(212,175,55,0.05)", border: `1px solid rgba(212,175,55,0.12)`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: MUTED }}>
                  Investments activate immediately and run autonomously. No manual approval required.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvestmentAnalytics — live data from API
// ─────────────────────────────────────────────────────────────────────────────
const RECHARTS_STYLE = { fontSize: 11, fill: MUTED };

function InvestmentAnalytics({
  planDistribution,
  stats,
  investments,
}: {
  planDistribution: AdminInvestmentPlanDist[];
  stats: AdminInvestmentStats;
  investments: AdminInvestmentItem[];
}) {
  const planPie = planDistribution.map(p => ({
    name:  PLAN_LABEL[p.planType],
    value: p.count,
    fill:  PLAN_PIE_FILL[p.planType],
  }));

  const statusBar = [
    { label: "Active",    count: stats.activeCount,    fill: "#34d399" },
    { label: "Matured",   count: stats.maturedCount,   fill: "#fbbf24" },
    { label: "Completed", count: stats.completedCount, fill: "#60a5fa" },
  ];

  const highValue = [...investments]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>Investment Analytics</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>

        {/* Plan Distribution */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Plan Distribution</div>
          {planPie.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: MUTED }}>No data</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <PieChart width={100} height={100}>
                <Pie data={planPie} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={3} dataKey="value" stroke="none">
                  {planPie.map(d => <Cell key={d.name} fill={d.fill} />)}
                </Pie>
              </PieChart>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {planPie.map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                    <span style={{ color: "rgba(255,255,255,0.65)" }}>{d.name}</span>
                    <span style={{ color: MUTED, marginLeft: "auto" }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status Breakdown */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 16px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Status Breakdown</div>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={statusBar} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(222 62% 9%)", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {statusBar.map(s => <Cell key={s.label} fill={s.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Capital by plan */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 16px 8px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Capital by Plan (current page)</div>
          {(() => {
            const byPlan = Object.fromEntries(
              (["PLAN_90","PLAN_180","PLAN_270","PLAN_360"] as AdminPlanType[]).map(p => [p, 0])
            );
            for (const inv of investments) byPlan[inv.planType] = (byPlan[inv.planType] ?? 0) + Number(inv.amount);
            const data = Object.entries(byPlan).map(([planType, amount]) => ({
              name:  PLAN_LABEL[planType as AdminPlanType],
              amount: Math.round(amount),
              fill:   PLAN_PIE_FILL[planType as AdminPlanType],
            }));
            return (
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
                  <YAxis tick={RECHARTS_STYLE} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(222 62% 9%)", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Capital"]} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {data.map(d => <Cell key={d.name} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </div>

        {/* ROI rate guide */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", marginBottom: 14 }}>Plan ROI Reference</div>
          {(["PLAN_90","PLAN_180","PLAN_270","PLAN_360"] as AdminPlanType[]).map(p => {
            const roiMap: Record<AdminPlanType, string> = { PLAN_90: "0.5", PLAN_180: "0.6", PLAN_270: "0.7", PLAN_360: "0.8" };
            const c = PLAN_COLORS[p];
            return (
              <div key={p} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{PLAN_LABEL[p]}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{roiMap[p]}%/day</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* High value table */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>Highest Value (current page)</span>
          </div>
          {highValue.length === 0 ? (
            <div style={{ fontSize: 12, color: MUTED, textAlign: "center", padding: "16px 0" }}>No investments</div>
          ) : highValue.map(inv => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar inv={inv} size={22} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>@{inv.username}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>{inv.id.slice(0, 10)}…</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{$(inv.amount)}</div>
                <PlanBadge planType={inv.planType} />
              </div>
            </div>
          ))}
        </div>

        {/* Claimable ROI summary */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={13} style={{ color: GOLD }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)" }}>Platform Overview</span>
          </div>
          {[
            { label: "Active Investments",  value: String(stats.activeCount),    color: "#34d399" },
            { label: "Matured (unclaimed)", value: String(stats.maturedCount),   color: "#fbbf24" },
            { label: "Completed",           value: String(stats.completedCount), color: "#60a5fa" },
            { label: "Total Capital (active)", value: $K(stats.totalCapital),    color: GOLD      },
            { label: "Claimable ROI (active)", value: $K(stats.totalClaimableROI), color: "#a78bfa" },
          ].map(f => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{f.label}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: f.color }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────
interface Filters { status: string; planType: string; sort: string }
const SEL: React.CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 28px 6px 10px", fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer", outline: "none", appearance: "none" as never };

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonRow() {
  const s = { background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 12 };
  const TD: React.CSSProperties = { padding: "12px", borderBottom: `1px solid rgba(255,255,255,0.04)` };
  return (
    <tr>{[36,90,140,80,90,40,50,50,70,80,90,36].map((w,i) => (
      <td key={i} style={TD}><div style={{ ...s, width: w, opacity: 0.4 + (i % 4) * 0.15 }} /></td>
    ))}</tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────
function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const btnSt = (active?: boolean): React.CSSProperties => ({ minWidth: 30, height: 30, borderRadius: 6, border: `1px solid ${active ? GOLD : BORDER}`, background: active ? "rgba(212,175,55,0.12)" : "transparent", color: active ? GOLD_L : MUTED, cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px" });
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", padding: "12px 0 4px" }}>
      <span style={{ fontSize: 11, color: MUTED, marginRight: 8 }}>{(page-1)*perPage+1}–{Math.min(page*perPage,total)} of {total}</span>
      <button style={btnSt()} onClick={() => onChange(Math.max(1, page-1))} disabled={page===1}><ChevronLeft size={14} /></button>
      {visible.map((p, i) => (
        <span key={p} style={{ display: "contents" }}>
          {i > 0 && visible[i-1] !== p-1 && <span style={{ fontSize: 12, color: MUTED, padding: "0 4px" }}>…</span>}
          <button style={btnSt(p===page)} onClick={() => onChange(p)}>{p}</button>
        </span>
      ))}
      <button style={btnSt()} onClick={() => onChange(Math.min(pages, page+1))} disabled={page===pages}><ChevronRight size={14} /></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const PER_PAGE = 20;

function parseSortParams(sort: string): { sortBy: "createdAt" | "amount"; sortOrder: "asc" | "desc" } {
  if (sort === "Oldest")         return { sortBy: "createdAt", sortOrder: "asc"  };
  if (sort === "Highest Amount") return { sortBy: "amount",    sortOrder: "desc" };
  if (sort === "Lowest Amount")  return { sortBy: "amount",    sortOrder: "asc"  };
  return                                { sortBy: "createdAt", sortOrder: "desc" };
}

export default function InvestmentsPage() {
  const [investments,      setInvestments]      = useState<AdminInvestmentItem[]>([]);
  const [stats,            setStats]            = useState<AdminInvestmentStats>({ totalCount: 0, activeCount: 0, maturedCount: 0, completedCount: 0, totalCapital: "0.00", totalClaimableROI: "0.00" });
  const [planDistribution, setPlanDistribution] = useState<AdminInvestmentPlanDist[]>([]);
  const [totalCount,       setTotalCount]       = useState(0);
  const [search,           setSearch]           = useState("");
  const [filters,          setFilters]          = useState<Filters>({ status: "All Status", planType: "All Plans", sort: "Newest" });
  const [page,             setPage]             = useState(1);
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set());
  const [drawer,           setDrawer]           = useState<AdminInvestmentItem | null>(null);
  const [dropdown,         setDropdown]         = useState<string | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [showFilters,      setShowFilters]      = useState(false);

  const { toasts, toast, dismiss } = useToast();

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const { sortBy, sortOrder } = parseSortParams(filters.sort);
      const result = await getAdminInvestments({
        page:      p,
        limit:     PER_PAGE,
        status:    filters.status   !== "All Status" ? filters.status   as AdminInvStatus : undefined,
        planType:  filters.planType !== "All Plans"  ? filters.planType as AdminPlanType  : undefined,
        search:    search.trim() || undefined,
        sortBy,
        sortOrder,
      });
      setInvestments(result.investments);
      setStats(result.stats);
      setPlanDistribution(result.planDistribution);
      setTotalCount(result.meta.total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load investments";
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [filters, search, toast]);

  useEffect(() => {
    fetchData(page);
  }, [page, filters]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchData(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    setSelectedIds(new Set());
  }, []);

  const allOnPage  = investments.length > 0 && investments.every(inv => selectedIds.has(inv.id));
  const someOnPage = investments.some(inv => selectedIds.has(inv.id));

  const toggleAll    = useCallback(() => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      allOnPage ? investments.forEach(i => n.delete(i.id)) : investments.forEach(i => n.add(i.id));
      return n;
    });
  }, [allOnPage, investments]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(f => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };

  const TH: React.CSSProperties = { padding: "10px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, background: "hsl(222 62% 9%)", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 5 };

  const avgAmount = useMemo(() => {
    if (stats.totalCount === 0) return "—";
    const activeTotal  = Number(stats.totalCapital);
    const activeCount  = stats.activeCount || 1;
    return `$${Math.round(activeTotal / activeCount).toLocaleString()}`;
  }, [stats]);

  const dailyROIOut = useMemo(() => {
    const base = Number(stats.totalCapital);
    return `$${Math.round(base * 0.006).toLocaleString()}`;
  }, [stats]);

  return (
    <AdminLayout>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 3 }}>Investment Center</h1>
          <p style={{ fontSize: 12, color: MUTED }}>Monitor and audit every investment across the platform.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { icon: RotateCw, label: "Refresh",  action: () => fetchData(page) },
            { icon: Download, label: "Export",   action: () => toast("Export not yet implemented", "error") },
          ].map(b => (
            <button key={b.label} onClick={b.action}
              style={{ display: "flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)", transition: "opacity 0.15s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.75"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            >
              <b.icon size={13} /> {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard icon={TrendingUp} label="Total Investments" value={stats.totalCount}         color="#60a5fa" bg="rgba(96,165,250,0.1)"  />
        <StatCard icon={Zap}        label="Active"            value={stats.activeCount}         color="#34d399" bg="rgba(52,211,153,0.1)"  />
        <StatCard icon={Clock}      label="Matured"           value={stats.maturedCount}        color="#fbbf24" bg="rgba(251,191,36,0.1)"  />
        <StatCard icon={CheckCircle} label="Completed"        value={stats.completedCount}      color="#60a5fa" bg="rgba(96,165,250,0.1)"  />
        <StatCard icon={DollarSign} label="Active Capital"    value={$K(stats.totalCapital)}    color="#34d399" bg="rgba(52,211,153,0.1)"  />
        <StatCard icon={Activity}   label="Avg Active Inv."   value={avgAmount}                 color="#a78bfa" bg="rgba(167,139,250,0.1)" />
        <StatCard icon={Layers}     label="Active Plans"      value={4}                         color={GOLD}    bg="rgba(212,175,55,0.1)"  />
        <StatCard icon={AlertTriangle} label="Est. Daily ROI" value={dailyROIOut}               color="#f87171" bg="rgba(248,113,113,0.1)" />
      </div>

      {/* Search + filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "8px 12px", flex: 1, maxWidth: 420 }}>
          <Search size={14} style={{ color: MUTED, flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by investment ID, username, email…"
            style={{ background: "none", border: "none", outline: "none", fontSize: 12.5, color: "rgba(255,255,255,0.75)", width: "100%" }}
          />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2 }}><X size={12} /></button>}
        </div>
        <button onClick={() => setShowFilters(f => !f)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: showFilters ? "rgba(212,175,55,0.08)" : CARD, border: `1px solid ${showFilters ? "rgba(212,175,55,0.25)" : BORDER}`, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, color: showFilters ? GOLD_L : "rgba(255,255,255,0.6)" }}>
          <Filter size={13} /> Filters {showFilters && <X size={11} />}
        </button>
      </div>

      {showFilters && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {([
            { key: "status",   opts: ["All Status","ACTIVE","MATURED","COMPLETED"] },
            { key: "planType", opts: ["All Plans","PLAN_90","PLAN_180","PLAN_270","PLAN_360"] },
            { key: "sort",     opts: ["Newest","Oldest","Highest Amount","Lowest Amount"] },
          ] as const).map(f => (
            <div key={f.key} style={{ position: "relative" }}>
              <select style={SEL} value={filters[f.key]} onChange={set(f.key)}>
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown size={10} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(212,175,55,0.06)", border: `1px solid rgba(212,175,55,0.2)`, borderRadius: 9, padding: "9px 14px", marginBottom: 12 }}>
          <RefreshCw size={14} style={{ color: GOLD }} />
          <span style={{ fontSize: 12, color: GOLD_L, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <div style={{ flex: 1 }} />
          <button style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.65)" }}>Export Selected</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 440px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 36 }}>
                  <div onClick={toggleAll} style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${allOnPage && investments.length > 0 ? GOLD : BORDER}`, background: allOnPage && investments.length > 0 ? GOLD : someOnPage ? "rgba(212,175,55,0.3)" : "transparent", cursor: "pointer" }} />
                </th>
                {["Inv ID","Member","Plan","Amount","ROI/Day","Duration","Auto-Comp","Status","Started","Matures",""].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
              ) : error ? (
                <tr><td colSpan={12} style={{ padding: 60, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <AlertTriangle size={24} style={{ color: "#f87171" }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>Failed to load</div>
                    <div style={{ fontSize: 12, color: MUTED }}>{error}</div>
                    <button onClick={() => fetchData(page)} style={{ marginTop: 4, padding: "6px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 7, cursor: "pointer", fontSize: 12, color: "#f87171" }}>Retry</button>
                  </div>
                </td></tr>
              ) : investments.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 60, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <TrendingUp size={20} style={{ color: MUTED }} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{search ? `No results for "${search}"` : "No investments found"}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>Adjust your filters to see investments.</div>
                  </div>
                </td></tr>
              ) : investments.map(inv => (
                <InvestmentRow
                  key={inv.id} inv={inv}
                  selected={selectedIds.has(inv.id)}
                  onSelect={toggleSelect}
                  onOpen={setDrawer}
                  dropdownOpen={dropdown === inv.id}
                  onDropdownToggle={id => setDropdown(p => p === id ? null : id)}
                  onDropdownClose={() => setDropdown(null)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!loading && totalCount > 0 && (
          <div style={{ padding: "6px 16px 10px", borderTop: `1px solid ${BORDER}` }}>
            <Pagination page={page} total={totalCount} perPage={PER_PAGE} onChange={handlePageChange} />
          </div>
        )}
      </div>

      {/* Analytics */}
      <InvestmentAnalytics
        planDistribution={planDistribution}
        stats={stats}
        investments={investments}
      />

      {/* Drawer */}
      <InvestmentDrawer inv={drawer} onClose={() => setDrawer(null)} />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </AdminLayout>
  );
}
