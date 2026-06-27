import { useState, memo, useCallback } from "react";
import {
  X, Zap, FileText, Clock, ShieldAlert, Settings, BarChart2,
  Play, Pause, Search, Download, ChevronRight, CheckCircle,
  AlertTriangle, XCircle, Activity, Database, Cpu,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

export type EngineStatus = "RUNNING" | "IDLE" | "PAUSED" | "ERROR";
export type RunStatus    = "SUCCESS" | "PARTIAL" | "FAILED";
export type PayoutStatus = "PAID" | "PENDING" | "FAILED";

export interface EngineRun {
  id: string; startedAt: Date; completedAt: Date;
  duration: number; membersProcessed: number; totalPaid: number;
  status: RunStatus;
}

export interface RecentPayout {
  id: string; username: string; incomeType: string;
  amount: number; timestamp: Date; status: PayoutStatus;
}

export interface EngineWarning {
  id: string; type: string; message: string; severity: "warn" | "error";
}

export interface EngineConfigEntry {
  key: string; label: string; value: string; unit?: string;
}

export interface EngineAuditEntry {
  id: string; timestamp: Date; admin: string; action: string; detail: string;
}

export interface EngineRecord {
  id: string; name: string; shortName: string; color: string;
  status: EngineStatus;
  lastRun: Date; nextRun: Date;
  avgRuntime: number; todayPayout: number; weekPayout: number; monthPayout: number;
  beneficiaries: number; successfulJobs: number; failedJobs: number;
  runHistory: EngineRun[]; recentPayouts: RecentPayout[];
  warnings: EngineWarning[]; auditLog: EngineAuditEntry[];
  config: EngineConfigEntry[];
  adminNotes?: string;
  // health
  cpu: number; memoryMB: number; queueSize: number; workers: number; maxWorkers: number; cronActive: boolean; dbOk: boolean;
}

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const K = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toString();
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDur  = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

const ENGINE_STATUS_CFG: Record<EngineStatus, { label: string; color: string; bg: string }> = {
  RUNNING: { label: "Running", color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  IDLE:    { label: "Idle",    color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  PAUSED:  { label: "Paused",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  ERROR:   { label: "Error",   color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

const RUN_STATUS_CFG: Record<RunStatus, { icon: React.ElementType; color: string }> = {
  SUCCESS: { icon: CheckCircle, color: "#34d399" },
  PARTIAL: { icon: AlertTriangle, color: "#fbbf24" },
  FAILED:  { icon: XCircle,     color: "#f87171" },
};

const PAYOUT_STATUS_CFG: Record<PayoutStatus, { color: string }> = {
  PAID:    { color: "#34d399" },
  PENDING: { color: "#fbbf24" },
  FAILED:  { color: "#f87171" },
};

const TABS = [
  { id: "summary",  icon: BarChart2,   label: "Summary"  },
  { id: "config",   icon: Settings,    label: "Config"   },
  { id: "history",  icon: Clock,       label: "History"  },
  { id: "payouts",  icon: Zap,         label: "Payouts"  },
  { id: "warnings", icon: ShieldAlert, label: "Warnings" },
  { id: "audit",    icon: FileText,    label: "Audit"    },
];

// ─── Summary tab ───────────────────────────────────────────────────────────────
function SummaryTab({ eng }: { eng: EngineRecord }) {
  const sc = ENGINE_STATUS_CFG[eng.status];
  const healthColor = eng.cpu < 70 && eng.dbOk && eng.cronActive ? "#34d399" : eng.cpu < 90 ? "#fbbf24" : "#f87171";

  return (
    <div>
      {/* Status chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${eng.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Zap size={18} style={{ color: eng.color }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{eng.name}</div>
          <div style={{ fontSize: 11, color: MUTED }}>Last run: {fmtDate(eng.lastRun)}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "4px 10px", borderRadius: 6 }}>{sc.label}</span>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Today's Payout",   value: $(eng.todayPayout),   color: GOLD      },
          { label: "Week Payout",      value: $(eng.weekPayout),    color: "#a78bfa" },
          { label: "Avg Runtime",      value: fmtDur(eng.avgRuntime), color: "#60a5fa" },
          { label: "Beneficiaries",    value: String(eng.beneficiaries), color: "#34d399" },
          { label: "Successful Jobs",  value: String(eng.successfulJobs), color: "#34d399" },
          { label: "Failed Jobs",      value: String(eng.failedJobs), color: eng.failedJobs > 0 ? "#f87171" : MUTED },
        ].map(s => (
          <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 600 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Schedule */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 10, letterSpacing: "0.08em" }}>SCHEDULE</div>
        {[
          { label: "Last Execution", value: fmtDate(eng.lastRun) },
          { label: "Next Execution", value: fmtDate(eng.nextRun) },
          { label: "Avg Processing", value: fmtDur(eng.avgRuntime) },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Engine Health */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.08em" }}>ENGINE HEALTH</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: healthColor }}>{healthColor === "#34d399" ? "Healthy" : healthColor === "#fbbf24" ? "Moderate" : "Degraded"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { icon: Cpu,      label: "CPU",       value: `${eng.cpu}%`,               ok: eng.cpu < 80  },
            { icon: Database, label: "DB Conn",   value: eng.dbOk ? "OK" : "ERROR",   ok: eng.dbOk      },
            { icon: Activity, label: "Queue",     value: `${eng.queueSize} jobs`,     ok: eng.queueSize < 100 },
            { icon: Zap,      label: "Workers",   value: `${eng.workers}/${eng.maxWorkers}`, ok: eng.workers < eng.maxWorkers },
            { icon: Clock,    label: "Cron",      value: eng.cronActive ? "Active" : "Paused", ok: eng.cronActive },
            { icon: BarChart2,label: "Memory",    value: `${eng.memoryMB} MB`,        ok: eng.memoryMB < 512 },
          ].map(h => (
            <div key={h.label} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px" }}>
              <h.icon size={12} style={{ color: h.ok ? "#34d399" : "#f87171", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 9, color: MUTED }}>{h.label}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: h.ok ? "rgba(255,255,255,0.8)" : "#f87171" }}>{h.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Config tab ────────────────────────────────────────────────────────────────
function ConfigTab({ eng }: { eng: EngineRecord }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, lineHeight: 1.6 }}>
        Read-only engine configuration. Changes require a deployment and admin approval.
      </div>
      {eng.config.map(c => (
        <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.82)" }}>{c.label}</div>
            <div style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>{c.key}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD_L, fontFamily: "monospace" }}>{c.value}</span>
            {c.unit && <span style={{ fontSize: 10, color: MUTED }}>{c.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── History tab ───────────────────────────────────────────────────────────────
function HistoryTab({ eng }: { eng: EngineRecord }) {
  if (eng.runHistory.length === 0)
    return <div style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 12 }}>No execution history.</div>;
  return (
    <div>
      {eng.runHistory.map((run, i) => {
        const sc = RUN_STATUS_CFG[run.status];
        const isLast = i === eng.runHistory.length - 1;
        return (
          <div key={run.id} style={{ display: "flex", gap: 12, paddingBottom: isLast ? 0 : 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${sc.color}18`, border: `1.5px solid ${sc.color}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <sc.icon size={13} style={{ color: sc.color }} />
              </div>
              {!isLast && <div style={{ width: 1, flex: 1, background: BORDER, margin: "4px 0" }} />}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{run.status} — {fmtDur(run.duration)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>{$(run.totalPaid)}</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                {run.membersProcessed} members · {fmtDate(run.startedAt)}
              </div>
              <div style={{ fontSize: 10, color: MUTED }}>Completed: {fmtDate(run.completedAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Payouts tab ───────────────────────────────────────────────────────────────
function PayoutsTab({ eng }: { eng: EngineRecord }) {
  const TH: React.CSSProperties = { padding: "8px 10px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const TD: React.CSSProperties = { padding: "10px 10px", fontSize: 11, color: "rgba(255,255,255,0.75)", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["USERNAME","TYPE","AMOUNT","TIME","STATUS"].map(h => <th key={h} style={TH}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {eng.recentPayouts.map(p => {
            const sc = PAYOUT_STATUS_CFG[p.status];
            return (
              <tr key={p.id}>
                <td style={{ ...TD, color: GOLD_L, fontWeight: 600 }}>@{p.username}</td>
                <td style={{ ...TD, color: MUTED, fontSize: 10 }}>{p.incomeType}</td>
                <td style={{ ...TD, color: "#34d399", fontWeight: 600 }}>{$(p.amount)}</td>
                <td style={{ ...TD, color: MUTED, fontSize: 10 }}>{fmtDate(p.timestamp)}</td>
                <td style={TD}><span style={{ fontSize: 9, fontWeight: 700, color: sc.color, padding: "2px 7px", borderRadius: 4, background: `${sc.color}18` }}>{p.status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Warnings tab ──────────────────────────────────────────────────────────────
function WarningsTab({ eng }: { eng: EngineRecord }) {
  if (eng.warnings.length === 0)
    return <div style={{ textAlign: "center", padding: "48px 0", color: "#34d399", fontSize: 12 }}>✓ No active warnings for this engine.</div>;
  return (
    <div>
      {eng.warnings.map(w => {
        const color = w.severity === "error" ? "#f87171" : "#fbbf24";
        const bg    = w.severity === "error" ? "rgba(248,113,113,0.07)" : "rgba(251,191,36,0.07)";
        return (
          <div key={w.id} style={{ background: bg, border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <AlertTriangle size={12} style={{ color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color }}>{w.type}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{w.message}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Audit tab ─────────────────────────────────────────────────────────────────
function AuditTab({ eng, onSaveNotes }: {
  eng: EngineRecord;
  onSaveNotes?: (id: string, notes: string) => Promise<void>;
}) {
  const [q,       setQ]       = useState("");
  const [notes,   setNotes]   = useState(eng.adminNotes ?? "");
  const [saving,  setSaving]  = useState(false);

  const handleSave = useCallback(async () => {
    if (!onSaveNotes) return;
    setSaving(true);
    try { await onSaveNotes(eng.id, notes); } finally { setSaving(false); }
  }, [eng.id, notes, onSaveNotes]);

  const entries = eng.auditLog.filter(e => !q || e.action.toLowerCase().includes(q.toLowerCase()) || e.admin.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      {/* Admin Notes */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 8 }}>ADMIN NOTES</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          placeholder="Add internal notes about this engine…"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 11px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={handleSave} disabled={saving || !onSaveNotes}
            style={{ padding: "6px 14px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 7, cursor: (saving || !onSaveNotes) ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: saving ? MUTED : GOLD_L, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Notes"}
          </button>
        </div>
      </div>

      {/* Audit log search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search audit…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px 7px 28px", fontSize: 12, color: "rgba(255,255,255,0.75)", outline: "none", boxSizing: "border-box" }} />
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: MUTED }}>
          <Download size={11} /> Export
        </button>
      </div>
      {entries.map(e => (
        <div key={e.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{e.action}</span>
            <span style={{ fontSize: 10, color: MUTED }}>{fmtDate(e.timestamp)}</span>
          </div>
          <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 3 }}>Admin: {e.admin}</div>
          <div style={{ fontSize: 11, color: MUTED }}>{e.detail}</div>
        </div>
      ))}
      {entries.length === 0 && <div style={{ textAlign: "center", padding: "32px 0", color: MUTED, fontSize: 12 }}>No audit entries found.</div>}
    </div>
  );
}

// ─── Main Drawer ───────────────────────────────────────────────────────────────
const EngineDrawer = memo(function EngineDrawer({ engine, detailLoading, onClose, onPause, onResume, onRunCycle, onSaveNotes }: {
  engine:       EngineRecord | null;
  detailLoading?: boolean;
  onClose:      () => void;
  onPause:      (e: EngineRecord) => void;
  onResume:     (e: EngineRecord) => void;
  onRunCycle:   (e: EngineRecord) => void;
  onSaveNotes?: (id: string, notes: string) => Promise<void>;
}) {
  const [tab, setTab] = useState("summary");

  if (!engine) return null;
  const sc = ENGINE_STATUS_CFG[engine.status];
  const isPaused = engine.status === "PAUSED";

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 500, maxWidth: "100vw", zIndex: 201, background: "hsl(222 62% 7%)", borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", boxShadow: "-12px 0 50px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${engine.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={17} style={{ color: engine.color }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{engine.name}</div>
                <div style={{ fontSize: 10, color: MUTED }}>Last run: {fmtDate(engine.lastRun)}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "4px 10px", borderRadius: 6 }}>{sc.label}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, display: "flex" }}><X size={16} /></button>
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onRunCycle(engine)} style={{ flex: 1, padding: "7px 0", background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: GOLD_L, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Zap size={10} /> Run Cycle
            </button>
            {isPaused ? (
              <button onClick={() => onResume(engine)} style={{ flex: 1, padding: "7px 0", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Play size={10} /> Resume
              </button>
            ) : (
              <button onClick={() => onPause(engine)} style={{ flex: 1, padding: "7px 0", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Pause size={10} /> Pause
              </button>
            )}
            <button style={{ flex: 1, padding: "7px 0", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <FileText size={10} /> View Logs
            </button>
            <button style={{ flex: 1, padding: "7px 0", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <Settings size={10} /> Settings
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 14px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent", cursor: "pointer", fontSize: 10, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? GOLD_L : MUTED, whiteSpace: "nowrap" }}>
              <t.icon size={10} />{t.label}
              {t.id === "warnings" && engine.warnings.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, background: "#f87171", color: "#fff", borderRadius: 10, padding: "0 5px" }}>{engine.warnings.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {tab === "summary"  && <SummaryTab  eng={engine} />}
          {tab === "config"   && <ConfigTab   eng={engine} />}
          {tab === "history"  && <HistoryTab  eng={engine} />}
          {tab === "payouts"  && <PayoutsTab  eng={engine} />}
          {tab === "warnings" && <WarningsTab eng={engine} />}
          {tab === "audit"    && <AuditTab    eng={engine} onSaveNotes={onSaveNotes} />}
        </div>
      </div>
    </>
  );
});

export default EngineDrawer;
