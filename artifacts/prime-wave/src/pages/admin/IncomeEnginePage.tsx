import { useState, useMemo, memo, useCallback } from "react";
import AdminLayout from "./AdminLayout";
import EngineDrawer, {
  EngineRecord, EngineStatus, EngineRun, RecentPayout, EngineWarning, EngineAuditEntry,
} from "./EngineDrawer";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  RefreshCw, Download, Settings, Zap, MoreVertical,
  TrendingUp, Activity, Clock, Shield, BarChart2,
  CheckCircle, AlertTriangle, XCircle, Play, Pause,
  ChevronRight,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const K = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toFixed(0);
const fmtDate  = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDur   = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;
const randf    = (a: number, b: number) => Math.round((Math.random() * (b - a) + a) * 100) / 100;
const randi    = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

const ENGINE_STATUS_CFG: Record<EngineStatus, { label: string; color: string; bg: string; dot: string }> = {
  RUNNING: { label: "Running", color: "#34d399", bg: "rgba(52,211,153,0.12)",  dot: "#34d399" },
  IDLE:    { label: "Idle",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  dot: "#60a5fa" },
  PAUSED:  { label: "Paused",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  dot: "#fbbf24" },
  ERROR:   { label: "Error",   color: "#f87171", bg: "rgba(248,113,113,0.12)", dot: "#f87171" },
};

// ─── Mock data factories ───────────────────────────────────────────────────────
const USERNAMES = ["alex1","ben2","carlos3","diana4","edward5","fatima6","grace7","hassan8","iris9","james10"];

function makeRuns(engineIdx: number): EngineRun[] {
  return Array.from({ length: 10 }, (_, j) => {
    const dur = randi(8, 120);
    const members = randi(10, 200);
    const paid = randf(50, 5000);
    return {
      id: `RUN-${engineIdx}-${j}`,
      startedAt: new Date(Date.now() - (j * 6 + engineIdx) * 3600000),
      completedAt: new Date(Date.now() - (j * 6 + engineIdx) * 3600000 + dur * 1000),
      duration: dur, membersProcessed: members, totalPaid: paid,
      status: (["SUCCESS","SUCCESS","SUCCESS","PARTIAL","FAILED"] as const)[j % 5],
    };
  });
}

function makePayouts(engineIdx: number, typeName: string): RecentPayout[] {
  return Array.from({ length: 10 }, (_, j) => ({
    id: `PAY-${engineIdx}-${j}`,
    username: USERNAMES[j % USERNAMES.length],
    incomeType: typeName,
    amount: randf(5, 500),
    timestamp: new Date(Date.now() - (j * 2 + engineIdx) * 3600000),
    status: (["PAID","PAID","PAID","PENDING","FAILED"] as const)[j % 5],
  }));
}

function makeWarnings(engineIdx: number): EngineWarning[] {
  const pool: EngineWarning[] = [
    { id: `W-${engineIdx}-0`, type: "Large Payout Spike",      message: "Payout volume is 3x above the 7-day average. Manual review recommended.", severity: "warn"  },
    { id: `W-${engineIdx}-1`, type: "Matching Delay",          message: "Binary matching cycle is running 18 minutes behind schedule.",            severity: "warn"  },
    { id: `W-${engineIdx}-2`, type: "Engine Paused",           message: "Engine was manually paused by admin. Resumption required.",               severity: "error" },
    { id: `W-${engineIdx}-3`, type: "Transfer Backlog",        message: "72-hour release queue has 47 transfers older than 80 hours.",             severity: "error" },
    { id: `W-${engineIdx}-4`, type: "High ROI Generation",     message: "ROI generation rate is unusually high — possible config drift.",         severity: "warn"  },
  ];
  return engineIdx % 3 === 0 ? [pool[engineIdx % pool.length]] : engineIdx % 5 === 0 ? [pool[0], pool[2]] : [];
}

function makeAudit(engineIdx: number): EngineAuditEntry[] {
  const admins = ["superadmin@primewave.io","rewards@primewave.io","finance@primewave.io"];
  return [
    { id: `EA-${engineIdx}-0`, timestamp: new Date(Date.now() - 48 * 3600000), admin: admins[engineIdx % 3], action: "Engine Cycle Run",   detail: "Manual run triggered by admin." },
    { id: `EA-${engineIdx}-1`, timestamp: new Date(Date.now() - 96 * 3600000), admin: admins[(engineIdx+1)%3], action: "Engine Paused",    detail: "Paused for maintenance window." },
    { id: `EA-${engineIdx}-2`, timestamp: new Date(Date.now() - 144 * 3600000),admin: admins[(engineIdx+2)%3], action: "Engine Resumed",   detail: "Resumed after maintenance." },
    { id: `EA-${engineIdx}-3`, timestamp: new Date(Date.now() - 192 * 3600000),admin: admins[engineIdx % 3], action: "Config Reviewed",    detail: "Configuration reviewed, no changes." },
  ];
}

interface ReleaseQueueEntry { id: string; username: string; amount: number; hoursElapsed: number; status: "PROCESSING" | "COMPLETED" | "PENDING" }

const RELEASE_QUEUE: ReleaseQueueEntry[] = [
  { id: "RQ1", username: "ben2",     amount: 1200,  hoursElapsed: 58, status: "PROCESSING" },
  { id: "RQ2", username: "diana4",   amount: 850,   hoursElapsed: 72, status: "COMPLETED"  },
  { id: "RQ3", username: "carlos3",  amount: 3400,  hoursElapsed: 14, status: "PENDING"    },
  { id: "RQ4", username: "grace7",   amount: 640,   hoursElapsed: 68, status: "PROCESSING" },
  { id: "RQ5", username: "james10",  amount: 2100,  hoursElapsed: 72, status: "COMPLETED"  },
  { id: "RQ6", username: "fatima6",  amount: 475,   hoursElapsed: 3,  status: "PENDING"    },
  { id: "RQ7", username: "hassan8",  amount: 1800,  hoursElapsed: 48, status: "PROCESSING" },
];

const ENGINE_DEFS = [
  {
    id: "roi",      name: "ROI Engine",              shortName: "ROI",     color: GOLD,
    status: "RUNNING" as EngineStatus, cpu: 32, memoryMB: 280, queueSize: 12, workers: 3, maxWorkers: 8, cronActive: true, dbOk: true,
    todayPayout: 18420, weekPayout: 128000, monthPayout: 510000, beneficiaries: 312, successfulJobs: 48, failedJobs: 0,
    avgRuntime: 42,
    config: [
      { key: "roi.daily_rate",    label: "Daily ROI Rate",       value: "0.5",  unit: "%" },
      { key: "roi.max_cap",       label: "Max ROI Cap",          value: "200",  unit: "%" },
      { key: "roi.auto_compound", label: "Auto-Compound",        value: "true"             },
      { key: "roi.window_hours",  label: "Processing Window",    value: "24",   unit: "h" },
      { key: "roi.min_principal", label: "Minimum Principal",    value: "100",  unit: "$" },
    ],
  },
  {
    id: "binary",   name: "Binary Matching",         shortName: "Binary",  color: "#818cf8",
    status: "IDLE" as EngineStatus, cpu: 18, memoryMB: 195, queueSize: 5, workers: 2, maxWorkers: 6, cronActive: true, dbOk: true,
    todayPayout: 9870, weekPayout: 67000, monthPayout: 278000, beneficiaries: 208, successfulJobs: 36, failedJobs: 1,
    avgRuntime: 78,
    config: [
      { key: "binary.match_rate",   label: "Matching Rate",      value: "10",   unit: "%" },
      { key: "binary.carry_cap",    label: "Carry Forward Cap",  value: "50000",unit: "BV"},
      { key: "binary.daily_limit",  label: "Daily Match Limit",  value: "10000",unit: "$" },
      { key: "binary.flush_cycle",  label: "Flush Cycle",        value: "24",   unit: "h" },
    ],
  },
  {
    id: "orbit",    name: "Binary Orbit",             shortName: "Orbit",   color: "#a78bfa",
    status: "IDLE" as EngineStatus, cpu: 12, memoryMB: 148, queueSize: 3, workers: 1, maxWorkers: 4, cronActive: true, dbOk: true,
    todayPayout: 3240, weekPayout: 22000, monthPayout: 88000, beneficiaries: 87, successfulJobs: 22, failedJobs: 0,
    avgRuntime: 35,
    config: [
      { key: "orbit.reward_cap",    label: "Orbit Reward Cap",   value: "5000", unit: "$" },
      { key: "orbit.min_bv",        label: "Minimum BV",         value: "500",  unit: "BV"},
      { key: "orbit.cycle_hours",   label: "Cycle Window",       value: "48",   unit: "h" },
    ],
  },
  {
    id: "salary",   name: "Salary Engine",            shortName: "Salary",  color: "#34d399",
    status: "IDLE" as EngineStatus, cpu: 8, memoryMB: 112, queueSize: 2, workers: 1, maxWorkers: 4, cronActive: true, dbOk: true,
    todayPayout: 5500, weekPayout: 38500, monthPayout: 154000, beneficiaries: 28, successfulJobs: 28, failedJobs: 0,
    avgRuntime: 18,
    config: [
      { key: "salary.monthly_cap",  label: "Monthly Salary Cap", value: "25000",unit: "$" },
      { key: "salary.rank_min",     label: "Min Rank Required",  value: "ELITE"           },
      { key: "salary.payout_day",   label: "Payout Day",         value: "1st"             },
    ],
  },
  {
    id: "level",    name: "Level Income",             shortName: "Level",   color: "#60a5fa",
    status: "RUNNING" as EngineStatus, cpu: 55, memoryMB: 340, queueSize: 28, workers: 4, maxWorkers: 8, cronActive: true, dbOk: true,
    todayPayout: 7320, weekPayout: 51000, monthPayout: 204000, beneficiaries: 445, successfulJobs: 62, failedJobs: 2,
    avgRuntime: 94,
    config: [
      { key: "level.max_depth",     label: "Max Depth",          value: "10",   unit: "levels" },
      { key: "level.rates",         label: "Level 1 Rate",       value: "5",    unit: "%" },
      { key: "level.min_invest",    label: "Min Investment",     value: "100",  unit: "$" },
    ],
  },
  {
    id: "release",  name: "Transfer Release Engine",  shortName: "Release", color: "#fbbf24",
    status: "RUNNING" as EngineStatus, cpu: 71, memoryMB: 410, queueSize: 47, workers: 6, maxWorkers: 8, cronActive: true, dbOk: true,
    todayPayout: 12800, weekPayout: 89000, monthPayout: 356000, beneficiaries: 134, successfulJobs: 134, failedJobs: 3,
    avgRuntime: 120,
    config: [
      { key: "release.window_hours",label: "Release Window",     value: "72",   unit: "h" },
      { key: "release.batch_size",  label: "Batch Size",         value: "50"              },
      { key: "release.retry_limit", label: "Retry Limit",        value: "3"               },
    ],
  },
  {
    id: "notify",   name: "Notification Engine",      shortName: "Notify",  color: "#f87171",
    status: "ERROR" as EngineStatus, cpu: 92, memoryMB: 512, queueSize: 183, workers: 8, maxWorkers: 8, cronActive: false, dbOk: false,
    todayPayout: 0, weekPayout: 0, monthPayout: 0, beneficiaries: 0, successfulJobs: 182, failedJobs: 47,
    avgRuntime: 5,
    config: [
      { key: "notify.queue_limit",  label: "Queue Limit",        value: "1000"            },
      { key: "notify.retry_delay",  label: "Retry Delay",        value: "30",   unit: "s" },
      { key: "notify.provider",     label: "Provider",           value: "FCM+Email"       },
    ],
  },
];

const INITIAL_ENGINES: EngineRecord[] = ENGINE_DEFS.map((def, i) => ({
  ...def,
  lastRun:  new Date(Date.now() - randi(1, 6) * 3600000),
  nextRun:  new Date(Date.now() + randi(1, 6) * 3600000),
  runHistory:    makeRuns(i),
  recentPayouts: makePayouts(i, def.shortName),
  warnings:      makeWarnings(i),
  auditLog:      makeAudit(i),
}));

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
function EngineStatusPanel({ engines, onOpen }: { engines: EngineRecord[]; onOpen: (e: EngineRecord) => void }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.07em" }}>ENGINE STATUS PANEL</div>
        <div style={{ fontSize: 10, color: MUTED }}>Live · 7 engines</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {engines.map(eng => {
          const sc = ENGINE_STATUS_CFG[eng.status];
          return (
            <button key={eng.id} onClick={() => onOpen(eng)}
              style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${sc.color}28`, borderRadius: 10, padding: "12px 8px", cursor: "pointer", textAlign: "center" }}>
              {/* Status dot */}
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.color, margin: "0 auto 8px", boxShadow: `0 0 6px ${sc.color}70` }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.82)", marginBottom: 3, lineHeight: 1.2 }}>{eng.shortName}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: sc.color }}>{sc.label}</div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{fmtDur(eng.avgRuntime)} avg</div>
            </button>
          );
        })}
      </div>
      {/* Legend */}
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
function ReleaseMonitor() {
  const waiting     = RELEASE_QUEUE.filter(r => r.status === "PENDING").length;
  const processing  = RELEASE_QUEUE.filter(r => r.status === "PROCESSING").length;
  const completed   = RELEASE_QUEUE.filter(r => r.status === "COMPLETED").length;
  const avgRelease  = "58h 24m";
  const STATUS_COL: Record<string, string> = { PROCESSING: "#fbbf24", COMPLETED: "#34d399", PENDING: "#60a5fa" };

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.07em", marginBottom: 14 }}>72-HOUR RELEASE MONITOR</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Waiting",     value: String(waiting),    color: "#60a5fa" },
          { label: "Processing",  value: String(processing), color: "#fbbf24" },
          { label: "Completed",   value: String(completed),  color: "#34d399" },
          { label: "Avg Release", value: avgRelease,         color: MUTED    },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 10, letterSpacing: "0.07em" }}>RELEASE QUEUE</div>
      {RELEASE_QUEUE.slice(0, 6).map(item => {
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
      })}
    </div>
  );
}

// ─── Row actions dropdown ──────────────────────────────────────────────────────
const RowActions = memo(function RowActions({ eng, onView, onRun, onPause, onResume }: {
  eng: EngineRecord;
  onView:    (e: EngineRecord) => void;
  onRun:     (e: EngineRecord) => void;
  onPause:   (e: EngineRecord) => void;
  onResume:  (e: EngineRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const isPaused = eng.status === "PAUSED";
  const items = [
    { label: "View Details",    onClick: () => onView(eng), color: "rgba(255,255,255,0.75)" },
    { label: "Run Mock Cycle",  onClick: () => onRun(eng),  color: GOLD_L                   },
    { label: isPaused ? "Resume Engine" : "Pause Engine",
                                onClick: () => isPaused ? onResume(eng) : onPause(eng),
                                color: isPaused ? "#34d399" : "#fbbf24"                      },
    { label: "View Audit",      onClick: () => onView(eng), color: MUTED                    },
    { label: "Engine Health",   onClick: () => onView(eng), color: "#60a5fa"                },
    { label: "Settings",        onClick: () => onView(eng), color: MUTED                    },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", color: MUTED }}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 51, background: "hsl(222 62% 10%)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "4px 0", minWidth: 170, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
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
      <td style={{ ...td, fontSize: 11, color: MUTED }}>{fmtDate(eng.lastRun)}</td>
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

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function IncomeEnginePage() {
  const { toasts, toast, dismiss } = useToast();
  const [engines,  setEngines]  = useState<EngineRecord[]>(() => INITIAL_ENGINES);
  const [drawer,   setDrawer]   = useState<EngineRecord | null>(null);
  const [hovered,  setHovered]  = useState<string | null>(null);
  const [cycling,  setCycling]  = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const updateEngine = useCallback((id: string, patch: Partial<EngineRecord>) => {
    setEngines(es => es.map(e => e.id === id ? { ...e, ...patch } : e));
    setDrawer(d => d?.id === id ? { ...d, ...patch } : d);
  }, []);

  const handleRun = useCallback((eng: EngineRecord) => {
    const newRun: EngineRun = {
      id: `RUN-NOW-${Date.now()}`, startedAt: new Date(),
      completedAt: new Date(Date.now() + eng.avgRuntime * 1000),
      duration: eng.avgRuntime, membersProcessed: randi(10, 200),
      totalPaid: randf(50, 5000), status: "SUCCESS",
    };
    const newAudit: EngineAuditEntry = {
      id: `EA-RUN-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io",
      action: "Engine Cycle Run", detail: "Manual cycle triggered from admin panel.",
    };
    const newPayout: RecentPayout = {
      id: `PAY-NOW-${Date.now()}`, username: USERNAMES[randi(0, 9)],
      incomeType: eng.shortName, amount: randf(10, 300), timestamp: new Date(), status: "PAID",
    };
    updateEngine(eng.id, {
      lastRun: new Date(), status: "IDLE",
      runHistory:    [newRun,    ...eng.runHistory.slice(0, 9)],
      recentPayouts: [newPayout, ...eng.recentPayouts.slice(0, 9)],
      auditLog:      [newAudit,  ...eng.auditLog],
      successfulJobs: eng.successfulJobs + 1,
    });
    toast(`${eng.name} cycle executed successfully.`, "success");
  }, [updateEngine, toast]);

  const handlePause = useCallback((eng: EngineRecord) => {
    const newAudit: EngineAuditEntry = {
      id: `EA-PAUSE-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io",
      action: "Engine Paused", detail: "Engine manually paused by admin.",
    };
    const newWarn: EngineWarning = {
      id: `W-PAUSE-${Date.now()}`, type: "Engine Paused",
      message: "Engine was manually paused by admin. Resume when ready.",
      severity: "error",
    };
    updateEngine(eng.id, {
      status: "PAUSED", cronActive: false,
      auditLog: [newAudit, ...eng.auditLog],
      warnings: [newWarn, ...eng.warnings],
    });
    toast(`${eng.name} has been paused.`, "info");
  }, [updateEngine, toast]);

  const handleResume = useCallback((eng: EngineRecord) => {
    const newAudit: EngineAuditEntry = {
      id: `EA-RESUME-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io",
      action: "Engine Resumed", detail: "Engine manually resumed by admin.",
    };
    updateEngine(eng.id, {
      status: "IDLE", cronActive: true,
      warnings: eng.warnings.filter(w => w.type !== "Engine Paused"),
      auditLog: [newAudit, ...eng.auditLog],
    });
    toast(`${eng.name} has been resumed.`, "success");
  }, [updateEngine, toast]);

  const handleRunAll = useCallback(() => {
    setCycling(true);
    setTimeout(() => {
      setCycling(false);
      toast("Income cycle executed across all active engines. All rewards distributed.", "success");
    }, 2200);
  }, [toast]);

  // ── KPI aggregates ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const payToday  = engines.reduce((s, e) => s + e.todayPayout, 0);
    const roiEng    = engines.find(e => e.id === "roi");
    const binEng    = engines.find(e => e.id === "binary");
    const lvlEng    = engines.find(e => e.id === "level");
    const salEng    = engines.find(e => e.id === "salary");
    const orbitEng  = engines.find(e => e.id === "orbit");
    const relEng    = engines.find(e => e.id === "release");
    const healthy   = engines.filter(e => e.status !== "ERROR" && e.status !== "PAUSED").length;
    const healthPct = Math.round((healthy / engines.length) * 100);
    const pending72 = RELEASE_QUEUE.filter(r => r.status !== "COMPLETED").length;
    return {
      payToday, roi: roiEng?.todayPayout ?? 0, binary: binEng?.todayPayout ?? 0,
      level: lvlEng?.todayPayout ?? 0, salary: salEng?.todayPayout ?? 0,
      orbit: orbitEng?.todayPayout ?? 0, pending72, healthPct,
    };
  }, [engines]);

  const liveDrawer = drawer ? engines.find(e => e.id === drawer.id) ?? drawer : null;

  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", letterSpacing: "0.07em", position: "sticky", top: 0, background: "hsl(222 62% 8%)", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const COLS = ["INCOME ENGINE", "TODAY", "THIS WEEK", "THIS MONTH", "BENEFICIARIES", "LAST EXECUTION", "STATUS", ""];

  return (
    <AdminLayout>
      <div style={{ padding: "24px 28px", minHeight: "100vh", background: BG, boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Income Engine Control Center</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Monitor, simulate and manage every compensation engine across the platform.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              { icon: RefreshCw, label: "Refresh",         gold: false },
              { icon: Download,  label: "Export",          gold: false },
              { icon: Settings,  label: "Engine Settings", gold: false },
            ].map(b => (
              <button key={b.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                <b.icon size={13} />{b.label}
              </button>
            ))}
            <button onClick={handleRunAll} disabled={cycling}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: cycling ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: cycling ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: cycling ? MUTED : GOLD_L }}>
              <Zap size={13} />{cycling ? "Running…" : "Run Income Cycle"}
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
          <KpiCard icon={TrendingUp}  label="TODAY'S TOTAL PAYOUT"   value={$(kpis.payToday)}        sub="All engines"          color={GOLD}    />
          <KpiCard icon={Zap}         label="ROI GENERATED"           value={$(kpis.roi)}             sub="Daily ROI engine"     color={GOLD}    />
          <KpiCard icon={BarChart2}   label="BINARY INCOME"           value={$(kpis.binary)}          sub="Matching + Orbit"     color="#818cf8" />
          <KpiCard icon={Activity}    label="LEVEL INCOME"            value={$(kpis.level)}           sub="10-level distribution"color="#60a5fa" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
          <KpiCard icon={Clock}       label="SALARY INCOME"           value={$(kpis.salary)}          sub="Rank-based payouts"   color="#34d399" />
          <KpiCard icon={Zap}         label="ORBIT INCOME"            value={$(kpis.orbit)}           sub="Binary orbit rewards" color="#a78bfa" />
          <KpiCard icon={ChevronRight}label="PENDING 72-HR RELEASES"  value={String(kpis.pending72)}  sub="Transfers in queue"   color="#fbbf24" />
          <KpiCard icon={Shield}      label="ENGINE HEALTH"           value={`${kpis.healthPct}%`}    sub={kpis.healthPct >= 80 ? "All systems nominal" : "Issues detected"} color={kpis.healthPct >= 80 ? "#34d399" : "#f87171"} />
        </div>

        {/* Engine Status Panel */}
        <EngineStatusPanel engines={engines} onOpen={setDrawer} />

        {/* Two-column layout: Release Monitor + Income Table */}
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, marginBottom: 0 }}>
          {/* 72-Hour Release Monitor */}
          <ReleaseMonitor />

          {/* Income Source Table */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", alignSelf: "start" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.07em" }}>INCOME SOURCE TABLE</div>
              <div style={{ fontSize: 10, color: MUTED }}>{engines.length} engines</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
                <thead>
                  <tr>
                    {COLS.map((h, i) => (
                      <th key={h + i} style={{ ...TH, paddingLeft: i === 0 ? 18 : 14, paddingRight: i === COLS.length - 1 ? 18 : 14, background: CARD }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {engines.map(eng => (
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
          </div>
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>

      <EngineDrawer
        engine={liveDrawer}
        onClose={() => setDrawer(null)}
        onPause={handlePause}
        onResume={handleResume}
        onRunCycle={handleRun}
      />
    </AdminLayout>
  );
}
