import { useState, useEffect, useCallback, memo } from "react";
import AdminLayout from "./AdminLayout";
import { Skeleton, SkeletonRows } from "@/components/admin/Skeleton";
import EngineDrawer, {
  EngineRecord, EngineStatus, EngineRun, RecentPayout, EngineWarning, EngineAuditEntry,
} from "./EngineDrawer";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import { useResponsive } from "@/hooks/useResponsive";
import {
  RefreshCw, Download, Settings, Zap, MoreVertical,
  TrendingUp, Activity, Clock, Shield, BarChart2,
  CheckCircle, ChevronRight,
} from "lucide-react";
import {
  getEngineDashboard,
  getEngineList,
  getEngineDetail,
  saveEngineNotes,
  getEngineReleaseQueue,
  adminTriggerMatching,
  adminTriggerOrbit,
  type EngineDashboard,
  type EngineListItem,
  type ReleaseQueueItem,
  type EngineId,
} from "@/lib/api";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDur  = (s: number) => s <= 0 ? "—" : s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

const ENGINE_STATUS_CFG: Record<EngineStatus, { label: string; color: string; bg: string; dot: string }> = {
  RUNNING: { label: "Running", color: "#34d399", bg: "rgba(52,211,153,0.12)",  dot: "#34d399" },
  IDLE:    { label: "Idle",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  dot: "#60a5fa" },
  PAUSED:  { label: "Paused",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  dot: "#fbbf24" },
  ERROR:   { label: "Error",   color: "#f87171", bg: "rgba(248,113,113,0.12)", dot: "#f87171" },
};

// ─── Static engine definitions (UI metadata only — no mock data) ───────────────
const STATIC_DEFS: Record<string, {
  name: string; shortName: string; color: string;
  config: { key: string; label: string; value: string; unit?: string }[];
}> = {
  roi: {
    name: "ROI Engine", shortName: "ROI", color: GOLD,
    config: [
      { key: "roi.daily_rate",    label: "Daily ROI Rate",    value: "0.5",  unit: "%" },
      { key: "roi.max_cap",       label: "Max ROI Cap",       value: "200",  unit: "%" },
      { key: "roi.auto_compound", label: "Auto-Compound",     value: "true"             },
      { key: "roi.window_hours",  label: "Processing Window", value: "12",   unit: "h" },
      { key: "roi.min_principal", label: "Minimum Principal", value: "100",  unit: "$" },
    ],
  },
  binary: {
    name: "Binary Matching", shortName: "Binary", color: "#818cf8",
    config: [
      { key: "binary.match_rate",  label: "Matching Rate",     value: "$5",  unit: "/BV" },
      { key: "binary.carry_cap",   label: "Max BV Per Cycle",  value: "50",  unit: "BV" },
      { key: "binary.min_refs",    label: "Min Referrals",     value: "2"               },
      { key: "binary.flush_cycle", label: "Flush Cycle",       value: "12",  unit: "h" },
    ],
  },
  orbit: {
    name: "Binary Orbit", shortName: "Orbit", color: "#a78bfa",
    config: [
      { key: "orbit.reward_amount", label: "Orbit Reward",   value: "$500", unit: "/orbit" },
      { key: "orbit.bv_per_reward", label: "BV Per Orbit",   value: "150",  unit: "BV"    },
      { key: "orbit.max_per_cycle", label: "Max Per Cycle",  value: "1"                    },
      { key: "orbit.min_refs",      label: "Min Referrals",  value: "2"                    },
    ],
  },
  salary: {
    name: "Salary Engine", shortName: "Salary", color: "#34d399",
    config: [
      { key: "salary.min_rank",    label: "Min Rank",         value: "STARTER"            },
      { key: "salary.payout_day",  label: "Payout Schedule",  value: "Monthly"            },
      { key: "salary.max_ranks",   label: "Rank Levels",      value: "6"                  },
    ],
  },
  level: {
    name: "Level Income", shortName: "Level", color: "#60a5fa",
    config: [
      { key: "level.max_depth",   label: "Max Depth",    value: "5", unit: "levels" },
      { key: "level.level1_rate", label: "Level 1 Rate", value: "5", unit: "%"      },
      { key: "level.level2_rate", label: "Level 2 Rate", value: "3", unit: "%"      },
      { key: "level.level3_rate", label: "Level 3 Rate", value: "2", unit: "%"      },
      { key: "level.level4_rate", label: "Level 4 Rate", value: "1", unit: "%"      },
      { key: "level.level5_rate", label: "Level 5 Rate", value: "1", unit: "%"      },
    ],
  },
  release: {
    name: "Transfer Release Engine", shortName: "Release", color: "#fbbf24",
    config: [
      { key: "release.window_hours", label: "Release Window", value: "72",  unit: "h" },
      { key: "release.batch_size",   label: "Batch Size",     value: "50"             },
      { key: "release.retry_limit",  label: "Retry Limit",    value: "3"              },
    ],
  },
  notify: {
    name: "Notification Engine", shortName: "Notify", color: "#f87171",
    config: [
      { key: "notify.queue_limit", label: "Queue Limit",  value: "1000"            },
      { key: "notify.retry_delay", label: "Retry Delay",  value: "30",   unit: "s" },
      { key: "notify.provider",    label: "Provider",     value: "In-App"          },
    ],
  },
};

const ENGINE_ORDER: EngineId[] = ["roi", "binary", "orbit", "salary", "level", "release", "notify"];

// Engines that have a backend trigger endpoint
const TRIGGER_SUPPORTED = new Set<EngineId>(["binary", "orbit"]);

// ─── Map API item → EngineRecord ───────────────────────────────────────────────
function mapApiEngine(item: EngineListItem): EngineRecord {
  const def = STATIC_DEFS[item.id] ?? { name: item.id, shortName: item.id, color: MUTED, config: [] };
  return {
    id:             item.id,
    name:           def.name,
    shortName:      def.shortName,
    color:          def.color,
    config:         def.config,
    status:         item.status as EngineStatus,
    lastRun:        item.lastRun ? new Date(item.lastRun) : new Date(0),
    nextRun:        item.nextRun ? new Date(item.nextRun) : new Date(0),
    avgRuntime:     item.avgRuntime,
    todayPayout:    item.todayPayout,
    weekPayout:     item.weekPayout,
    monthPayout:    item.monthPayout,
    beneficiaries:  item.beneficiaries,
    successfulJobs: item.successfulJobs,
    failedJobs:     item.failedJobs,
    adminNotes:     item.adminNotes,
    cpu:            item.cpu,
    memoryMB:       item.memoryMB,
    queueSize:      item.queueSize,
    workers:        item.workers,
    maxWorkers:     item.maxWorkers,
    cronActive:     item.cronActive,
    dbOk:           item.dbOk,
    runHistory:     [],
    recentPayouts:  [],
    warnings:       [],
    auditLog:       [],
  };
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} style={{ color }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── Engine Status Panel ───────────────────────────────────────────────────────
function EngineStatusPanel({ engines, onOpen, loading }: {
  engines: EngineRecord[]; onOpen: (e: EngineRecord) => void; loading: boolean;
}) {
  const { isMobile } = useResponsive();
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.07em" }}>ENGINE STATUS PANEL</div>
        <div style={{ fontSize: 10, color: MUTED }}>Live · {ENGINE_ORDER.length} engines</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 4 : 7}, 1fr)`, gap: 8 }}>
        {engines.map(eng => {
          const sc = ENGINE_STATUS_CFG[eng.status];
          return (
            <button key={eng.id} onClick={() => onOpen(eng)} disabled={loading}
              style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${sc.color}28`, borderRadius: 10, padding: "12px 8px", cursor: loading ? "default" : "pointer", textAlign: "center", opacity: loading ? 0.5 : 1 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.color, margin: "0 auto 8px", boxShadow: `0 0 6px ${sc.color}70` }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.82)", marginBottom: 3, lineHeight: 1.2 }}>{eng.shortName}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: sc.color }}>{sc.label}</div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{fmtDur(eng.avgRuntime)} avg</div>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
        {Object.entries(ENGINE_STATUS_CFG).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: v.dot }} />
            <span style={{ fontSize: 10, color: MUTED }}>{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 72-Hour Release Monitor ───────────────────────────────────────────────────
function ReleaseMonitor({ items, loading }: { items: ReleaseQueueItem[]; loading: boolean }) {
  const waiting    = items.filter(r => r.status === "PENDING").length;
  const processing = items.filter(r => r.status === "PROCESSING").length;
  const completed  = items.filter(r => r.status === "COMPLETED").length;
  const STATUS_COL: Record<string, string> = { PROCESSING: "#fbbf24", COMPLETED: "#34d399", PENDING: "#60a5fa" };

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.07em", marginBottom: 14 }}>72-HOUR RELEASE MONITOR</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Waiting",    value: loading ? "—" : String(waiting),    color: "#60a5fa" },
          { label: "Processing", value: loading ? "—" : String(processing), color: "#fbbf24" },
          { label: "Completed",  value: loading ? "—" : String(completed),  color: "#34d399" },
          { label: "Total",      value: loading ? "—" : String(items.length), color: MUTED   },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 10, letterSpacing: "0.07em" }}>RELEASE QUEUE</div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "6px 0" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={44} borderRadius={8} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: "#34d399", textAlign: "center", padding: "16px 0" }}>
          <CheckCircle size={16} style={{ display: "block", margin: "0 auto 6px" }} />
          No pending releases
        </div>
      ) : (
        items.slice(0, 6).map(item => {
          const pct = Math.min(100, Math.round((item.hoursElapsed / 72) * 100));
          const col = STATUS_COL[item.status];
          return (
            <div key={item.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: GOLD_L }}>@{item.username}</span>
                  <span style={{ fontSize: 10, color: "#34d399" }}>{$(item.amount)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: MUTED }}>{item.hoursElapsed}h / 72h</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: col, background: `${col}18`, padding: "1px 7px", borderRadius: 4 }}>{item.status}</span>
                </div>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{ height: "100%", borderRadius: 3, background: col, width: `${pct}%`, transition: "width 0.3s" }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Row actions dropdown ──────────────────────────────────────────────────────
const RowActions = memo(function RowActions({ eng, onView, onRun, onPause, onResume }: {
  eng: EngineRecord;
  onView:   (e: EngineRecord) => void;
  onRun:    (e: EngineRecord) => void;
  onPause:  (e: EngineRecord) => void;
  onResume: (e: EngineRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const isPaused = eng.status === "PAUSED";
  const items = [
    { label: "View Details",                            onClick: () => onView(eng),   color: "rgba(255,255,255,0.75)" },
    { label: TRIGGER_SUPPORTED.has(eng.id as EngineId) ? "Run Cycle" : "Run Cycle (not available)",
                                                        onClick: () => onRun(eng),    color: TRIGGER_SUPPORTED.has(eng.id as EngineId) ? GOLD_L : MUTED },
    { label: isPaused ? "Resume Engine (not available)" : "Pause Engine (not available)",
                                                        onClick: () => isPaused ? onResume(eng) : onPause(eng),
                                                        color: MUTED },
    { label: "View Audit",                              onClick: () => onView(eng),   color: MUTED     },
    { label: "Engine Health",                           onClick: () => onView(eng),   color: "#60a5fa" },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", color: MUTED }}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 51, background: "hsl(222 62% 10%)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "4px 0", minWidth: 210, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
            {items.map(item => (
              <button key={item.label} onClick={e => { e.stopPropagation(); item.onClick(); setOpen(false); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: item.color }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// ─── Income table row ──────────────────────────────────────────────────────────
const EngineRow = memo(function EngineRow({ eng, onView, onRun, onPause, onResume, hovered, onHover }: {
  eng: EngineRecord;
  onView:   (e: EngineRecord) => void;
  onRun:    (e: EngineRecord) => void;
  onPause:  (e: EngineRecord) => void;
  onResume: (e: EngineRecord) => void;
  hovered: boolean; onHover: (id: string | null) => void;
}) {
  const sc = ENGINE_STATUS_CFG[eng.status];
  const td: React.CSSProperties = { padding: "13px 14px", fontSize: 12, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", borderBottom: `1px solid ${BORDER}` };
  const lastRunDate = eng.lastRun.getTime() === 0 ? null : eng.lastRun;
  return (
    <tr onClick={() => onView(eng)} onMouseEnter={() => onHover(eng.id)} onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer", background: hovered ? "rgba(255,255,255,0.025)" : "transparent", transition: "background 0.12s" }}>
      <td style={{ ...td, paddingLeft: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${eng.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Zap size={14} style={{ color: eng.color }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{eng.name}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{eng.beneficiaries} beneficiaries</div>
          </div>
        </div>
      </td>
      <td style={{ ...td, color: GOLD, fontWeight: 700 }}>{$(eng.todayPayout)}</td>
      <td style={{ ...td, color: "#a78bfa" }}>{$(eng.weekPayout)}</td>
      <td style={{ ...td, color: "#60a5fa" }}>{$(eng.monthPayout)}</td>
      <td style={td}>{eng.beneficiaries}</td>
      <td style={{ ...td, fontSize: 11, color: MUTED }}>{lastRunDate ? fmtDate(lastRunDate) : "—"}</td>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, flexShrink: 0, boxShadow: `0 0 5px ${sc.dot}70` }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: sc.color }}>{sc.label}</span>
        </div>
      </td>
      <td style={{ ...td, paddingRight: 18 }} onClick={e => e.stopPropagation()}>
        <RowActions eng={eng} onView={onView} onRun={onRun} onPause={onPause} onResume={onResume} />
      </td>
    </tr>
  );
});

// ─── Mobile engine card ───────────────────────────────────────────────────────
function MobileEngineCard({ eng, onView }: { eng: EngineRecord; onView: (e: EngineRecord) => void }) {
  const sc = ENGINE_STATUS_CFG[eng.status];
  const lastRunDate = eng.lastRun.getTime() === 0 ? null : eng.lastRun;
  return (
    <div onClick={() => onView(eng)} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 14px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer" }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${eng.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Zap size={16} style={{ color: eng.color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{eng.name}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, boxShadow: `0 0 5px ${sc.dot}70` }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: sc.color }}>{sc.label}</span>
          </span>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>{eng.beneficiaries} beneficiaries · {lastRunDate ? fmtDate(lastRunDate) : "Never run"}</div>
        <div style={{ display: "flex", gap: 16 }}>
          <div><div style={{ fontSize: 9, color: MUTED }}>TODAY</div><div style={{ fontSize: 12, fontWeight: 600, color: GOLD }}>{$(eng.todayPayout)}</div></div>
          <div><div style={{ fontSize: 9, color: MUTED }}>THIS WEEK</div><div style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa" }}>{$(eng.weekPayout)}</div></div>
          <div><div style={{ fontSize: 9, color: MUTED }}>THIS MONTH</div><div style={{ fontSize: 12, fontWeight: 600, color: "#60a5fa" }}>{$(eng.monthPayout)}</div></div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function IncomeEnginePage() {
  const { isMobile } = useResponsive();
  const { toasts, toast, dismiss } = useToast();

  // ── Data state ───────────────────────────────────────────────────────────────
  const [engines,       setEngines]       = useState<EngineRecord[]>(() =>
    ENGINE_ORDER.map(id => mapApiEngine({
      id, status: "IDLE", lastRun: null, nextRun: null, avgRuntime: 0,
      todayPayout: 0, weekPayout: 0, monthPayout: 0, beneficiaries: 0,
      successfulJobs: 0, failedJobs: 0, adminNotes: "", cpu: 0, memoryMB: 0,
      queueSize: 0, workers: 1, maxWorkers: 1, cronActive: true, dbOk: true,
    }))
  );
  const [dashboard,     setDashboard]     = useState<EngineDashboard | null>(null);
  const [releaseQueue,  setReleaseQueue]  = useState<ReleaseQueueItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [drawer,        setDrawer]        = useState<EngineRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hovered,       setHovered]       = useState<string | null>(null);
  const [cycling,       setCycling]       = useState(false);

  // ── Fetch list + dashboard ────────────────────────────────────────────────────
  const fetchEngineData = useCallback(() => {
    setLoading(true);
    Promise.all([getEngineDashboard(), getEngineList()])
      .then(([dash, list]) => {
        setDashboard(dash);
        setEngines(
          ENGINE_ORDER.map(id => {
            const item = list.engines.find(e => e.id === id);
            if (!item) return mapApiEngine({
              id, status: "IDLE", lastRun: null, nextRun: null, avgRuntime: 0,
              todayPayout: 0, weekPayout: 0, monthPayout: 0, beneficiaries: 0,
              successfulJobs: 0, failedJobs: 0, adminNotes: "", cpu: 0, memoryMB: 0,
              queueSize: 0, workers: 1, maxWorkers: 1, cronActive: true, dbOk: true,
            });
            return mapApiEngine(item);
          })
        );
      })
      .catch((err: Error) => {
        toast(err.message ?? "Failed to load engine data", "error");
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const fetchReleaseQueue = useCallback(() => {
    setReleaseLoading(true);
    getEngineReleaseQueue()
      .then(r => setReleaseQueue(r.items))
      .catch(() => setReleaseQueue([]))
      .finally(() => setReleaseLoading(false));
  }, []);

  useEffect(() => {
    fetchEngineData();
    fetchReleaseQueue();
  }, [fetchEngineData, fetchReleaseQueue]);

  // ── Lazy-load drawer detail ───────────────────────────────────────────────────
  useEffect(() => {
    if (!drawer) return;
    const id = drawer.id as EngineId;
    let cancelled = false;
    setDetailLoading(true);

    getEngineDetail(id)
      .then(detail => {
        if (cancelled) return;
        const enriched: EngineRecord = {
          ...mapApiEngine(detail),
          runHistory: detail.runHistory.map(r => ({
            id: r.id, startedAt: new Date(r.startedAt), completedAt: new Date(r.completedAt),
            duration: r.duration, membersProcessed: r.membersProcessed,
            totalPaid: r.totalPaid, status: r.status,
          })) as EngineRun[],
          recentPayouts: detail.recentPayouts.map(p => ({
            id: p.id, username: p.username, incomeType: p.incomeType,
            amount: p.amount, timestamp: new Date(p.timestamp), status: p.status,
          })) as RecentPayout[],
          warnings: detail.warnings as EngineWarning[],
          auditLog: detail.auditLog.map(a => ({
            id: a.id, timestamp: new Date(a.timestamp),
            admin: a.admin, action: a.action, detail: a.detail,
          })) as EngineAuditEntry[],
          adminNotes: detail.adminNotes,
        };
        setEngines(es => es.map(e => e.id === id ? enriched : e));
        setDrawer(enriched);
        setDetailLoading(false);
      })
      .catch(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => { cancelled = true; };
  }, [drawer?.id]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const NOT_AVAILABLE_MSG = "This action is not available in the current backend implementation.";

  const handleRun = useCallback(async (eng: EngineRecord) => {
    const id = eng.id as EngineId;
    if (!TRIGGER_SUPPORTED.has(id)) {
      toast(NOT_AVAILABLE_MSG, "info");
      return;
    }
    try {
      if (id === "binary") await adminTriggerMatching();
      if (id === "orbit")  await adminTriggerOrbit();
      toast(`${eng.name} cycle executed successfully.`, "success");
      fetchEngineData();
    } catch (err: unknown) {
      toast((err instanceof Error ? err.message : null) ?? `Failed to run ${eng.name}`, "error");
    }
  }, [toast, fetchEngineData]);

  const handlePause  = useCallback((_eng: EngineRecord) => { toast(NOT_AVAILABLE_MSG, "info"); }, [toast]);
  const handleResume = useCallback((_eng: EngineRecord) => { toast(NOT_AVAILABLE_MSG, "info"); }, [toast]);

  const handleRunAll = useCallback(async () => {
    setCycling(true);
    try {
      await Promise.all([adminTriggerMatching(), adminTriggerOrbit()]);
      toast("Binary and Orbit engines executed. Other engines run on their own schedule.", "success");
      fetchEngineData();
    } catch (err: unknown) {
      toast((err instanceof Error ? err.message : null) ?? "Failed to trigger cycle", "error");
    } finally {
      setCycling(false);
    }
  }, [toast, fetchEngineData]);

  const handleRefresh = useCallback(() => {
    fetchEngineData();
    fetchReleaseQueue();
  }, [fetchEngineData, fetchReleaseQueue]);

  const handleSaveNotes = useCallback(async (engineId: string, notes: string) => {
    await saveEngineNotes(engineId as EngineId, notes);
    toast(`Notes saved for ${STATIC_DEFS[engineId]?.name ?? engineId}`, "success");
  }, [toast]);

  const liveDrawer = drawer ? (engines.find(e => e.id === drawer.id) ?? drawer) : null;

  // ── KPI aggregates ────────────────────────────────────────────────────────────
  const kpis = dashboard ? {
    payToday:  dashboard.todayTotal,
    roi:       dashboard.todayRoi,
    binary:    dashboard.todayBinary + dashboard.todayOrbit,
    level:     dashboard.todayLevel,
    salary:    dashboard.todaySalary,
    orbit:     dashboard.todayOrbit,
    pending72: dashboard.pendingReleases,
    healthPct: dashboard.engineHealth,
  } : {
    payToday: 0, roi: 0, binary: 0, level: 0, salary: 0, orbit: 0, pending72: 0, healthPct: 0,
  };

  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", letterSpacing: "0.07em", position: "sticky", top: 0, background: CARD, borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const COLS = ["INCOME ENGINE", "TODAY", "THIS WEEK", "THIS MONTH", "BENEFICIARIES", "LAST EXECUTION", "STATUS", ""];

  return (
    <AdminLayout>
      <div style={{ padding: isMobile ? "16px 12px" : "24px 28px", minHeight: "100vh", background: BG, boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Income Engine Control Center</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Monitor, simulate and manage every compensation engine across the platform.</p>
          </div>
          {!isMobile ? (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {[
                { icon: RefreshCw, label: "Refresh",         onClick: handleRefresh },
                { icon: Download,  label: "Export",           onClick: undefined     },
                { icon: Settings,  label: "Engine Settings",  onClick: undefined     },
              ].map(b => (
                <button key={b.label} onClick={b.onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                  <b.icon size={13} />{b.label}
                </button>
              ))}
              <button onClick={handleRunAll} disabled={cycling}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: cycling ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: cycling ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: cycling ? MUTED : GOLD_L }}>
                <Zap size={13} />{cycling ? "Running…" : "Run Income Cycle"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleRefresh} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                <RefreshCw size={12} />Refresh
              </button>
              <button onClick={handleRunAll} disabled={cycling}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", background: cycling ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: cycling ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: cycling ? MUTED : GOLD_L }}>
                <Zap size={12} />{cycling ? "Running…" : "Run Cycle"}
              </button>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 12, marginBottom: 14 }}>
          <KpiCard icon={TrendingUp}  label="TODAY'S TOTAL PAYOUT"    value={loading ? "—" : $(kpis.payToday)} sub="All engines"            color={GOLD}    />
          <KpiCard icon={Zap}         label="ROI GENERATED"            value={loading ? "—" : $(kpis.roi)}      sub="Daily ROI engine"        color={GOLD}    />
          <KpiCard icon={BarChart2}   label="BINARY INCOME"            value={loading ? "—" : $(kpis.binary)}   sub="Matching + Orbit"        color="#818cf8" />
          <KpiCard icon={Activity}    label="LEVEL INCOME"             value={loading ? "—" : $(kpis.level)}    sub="5-level distribution"    color="#60a5fa" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 12, marginBottom: 22 }}>
          <KpiCard icon={Clock}       label="SALARY INCOME"            value={loading ? "—" : $(kpis.salary)}   sub="Rank-based payouts"      color="#34d399" />
          <KpiCard icon={Zap}         label="ORBIT INCOME"             value={loading ? "—" : $(kpis.orbit)}    sub="Binary orbit rewards"    color="#a78bfa" />
          <KpiCard icon={ChevronRight}label="PENDING 72-HR RELEASES"   value={loading ? "—" : String(kpis.pending72)} sub="Transfers in queue" color="#fbbf24" />
          <KpiCard icon={Shield}      label="ENGINE HEALTH"            value={loading ? "—" : `${kpis.healthPct}%`}  sub={kpis.healthPct >= 80 ? "All systems nominal" : "Issues detected"} color={kpis.healthPct >= 80 ? "#34d399" : "#f87171"} />
        </div>

        {/* Engine Status Panel */}
        <EngineStatusPanel engines={engines} onOpen={setDrawer} loading={loading} />

        {/* Two-column layout: Release Monitor + Income Table */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "340px 1fr", gap: 16 }}>
          <ReleaseMonitor items={releaseQueue} loading={releaseLoading} />

          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", alignSelf: "start" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.07em" }}>INCOME SOURCE TABLE</div>
              <div style={{ fontSize: 10, color: MUTED }}>{ENGINE_ORDER.length} engines</div>
            </div>
            {isMobile ? (
              <div>
                {loading && engines.length === 0
                  ? Array.from({ length: 5 }, (_, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderBottom: `1px solid ${BORDER}` }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ width: 120, height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 7 }} />
                          <div style={{ width: 80, height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 4 }} />
                        </div>
                      </div>
                    ))
                  : engines.map(eng => <MobileEngineCard key={eng.id} eng={eng} onView={setDrawer} />)
                }
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
                  <thead>
                    <tr>
                      {COLS.map((h, i) => (
                        <th key={h + i} style={{ ...TH, paddingLeft: i === 0 ? 18 : 14, paddingRight: i === COLS.length - 1 ? 18 : 14 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading && engines.length === 0
                      ? <SkeletonRows rows={6} cols={8} />
                      : engines.map(eng => (
                          <EngineRow key={eng.id} eng={eng}
                            onView={setDrawer}
                            onRun={handleRun}
                            onPause={handlePause}
                            onResume={handleResume}
                            hovered={hovered === eng.id}
                            onHover={setHovered}
                          />
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>

      <EngineDrawer
        engine={liveDrawer}
        detailLoading={detailLoading}
        onClose={() => setDrawer(null)}
        onPause={handlePause}
        onResume={handleResume}
        onRunCycle={handleRun}
        onSaveNotes={handleSaveNotes}
      />
    </AdminLayout>
  );
}
