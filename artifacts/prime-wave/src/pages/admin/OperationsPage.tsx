import { useState, useMemo, useCallback, memo } from "react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  BarChart2, Bell, FileText, Terminal, Shield, Wrench,
  Settings, Database, Info, Download, Search, Filter,
  RefreshCw, Plus, Check, X, ChevronRight, Activity,
  TrendingUp, Users, DollarSign, AlertTriangle, CheckCircle,
  Clock, Send, Eye, Trash2, RotateCcw, Save, Play,
  Zap, Globe, Mail, Smartphone, Calendar,
} from "lucide-react";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Types ─────────────────────────────────────────────────────────────────────
type SectionId = "reports" | "notifications" | "audit" | "logs" | "roles" | "maintenance" | "settings" | "backup" | "about";

const NAV_ITEMS: { id: SectionId; icon: React.ElementType; label: string }[] = [
  { id: "reports",       icon: BarChart2,   label: "Reports"           },
  { id: "notifications", icon: Bell,        label: "Notifications"     },
  { id: "audit",         icon: FileText,    label: "Audit Center"      },
  { id: "logs",          icon: Terminal,    label: "System Logs"       },
  { id: "roles",         icon: Shield,      label: "Roles & Permissions"},
  { id: "maintenance",   icon: Wrench,      label: "Maintenance"       },
  { id: "settings",      icon: Settings,    label: "Platform Settings" },
  { id: "backup",        icon: Database,    label: "Backup & Restore"  },
  { id: "about",         icon: Info,        label: "About Platform"    },
];

// ─── Mock data ─────────────────────────────────────────────────────────────────
const DAILY_REVENUE = [
  { day: "Mon", value: 48200 }, { day: "Tue", value: 52400 },
  { day: "Wed", value: 61800 }, { day: "Thu", value: 57300 },
  { day: "Fri", value: 73900 }, { day: "Sat", value: 44100 },
  { day: "Sun", value: 38600 },
];
const INCOME_DIST = [
  { label: "ROI",    value: 38, color: GOLD      },
  { label: "Binary", value: 22, color: "#818cf8" },
  { label: "Level",  value: 18, color: "#60a5fa" },
  { label: "Salary", value: 12, color: "#34d399" },
  { label: "Orbit",  value: 7,  color: "#a78bfa" },
  { label: "Other",  value: 3,  color: MUTED     },
];

type NotifType = "PUSH" | "EMAIL" | "IN_APP";
interface Notification { id: string; type: NotifType; title: string; message: string; target: string; sentAt: Date; status: "SENT" | "SCHEDULED" | "FAILED"; recipients: number }
const INITIAL_NOTIFS: Notification[] = [
  { id: "N1", type: "PUSH",   title: "Weekly Income Distributed",    message: "Your weekly income has been credited to your wallet.",               target: "All Members", sentAt: new Date(Date.now()-2*3600000),   status: "SENT",      recipients: 1487 },
  { id: "N2", type: "EMAIL",  title: "New Plan Launch: Elite Plus",  message: "We're excited to announce our new Elite Plus investment plan.",       target: "VIP Members", sentAt: new Date(Date.now()-8*3600000),   status: "SENT",      recipients: 76   },
  { id: "N3", type: "IN_APP", title: "Maintenance Window Tonight",   message: "Scheduled maintenance from 02:00–04:00 UTC. Plan accordingly.",       target: "All Members", sentAt: new Date(Date.now()-24*3600000),  status: "SENT",      recipients: 1487 },
  { id: "N4", type: "PUSH",   title: "Binary Cycle Complete",        message: "Binary matching cycle has been executed. Check your income wallet.",  target: "Active",      sentAt: new Date(Date.now()-48*3600000),  status: "SENT",      recipients: 843  },
  { id: "N5", type: "EMAIL",  title: "Monthly Salary Release",       message: "Monthly salary for Diamond and above ranks has been released.",       target: "Diamond+",    sentAt: new Date(Date.now()-5*86400000),  status: "SENT",      recipients: 64   },
  { id: "N6", type: "IN_APP", title: "System Update v2.4.1",         message: "Platform updated with performance improvements and bug fixes.",        target: "All Members", sentAt: new Date(Date.now()+86400000),    status: "SCHEDULED", recipients: 0    },
];

interface AuditEntry { id: string; timestamp: Date; admin: string; module: string; action: string; detail: string; status: "SUCCESS" | "FAILED" | "PENDING" }
const INITIAL_AUDIT: AuditEntry[] = [
  { id: "A1",  timestamp: new Date(Date.now()-1*3600000),   admin: "superadmin",  module: "Plans",   action: "Config Update",     detail: "ROI rate updated from 0.4% to 0.5%",        status: "SUCCESS" },
  { id: "A2",  timestamp: new Date(Date.now()-3*3600000),   admin: "finance",     module: "Wallets", action: "Adjustment",        detail: "Manual credit $500 to member @diana4",      status: "SUCCESS" },
  { id: "A3",  timestamp: new Date(Date.now()-6*3600000),   admin: "superadmin",  module: "Engine",  action: "Cycle Run",         detail: "ROI engine manual cycle executed",           status: "SUCCESS" },
  { id: "A4",  timestamp: new Date(Date.now()-12*3600000),  admin: "rewards",     module: "Members", action: "Status Change",     detail: "Member @carlos3 suspended",                 status: "SUCCESS" },
  { id: "A5",  timestamp: new Date(Date.now()-18*3600000),  admin: "finance",     module: "Withdrawal","action": "Approval",      detail: "Withdrawal $2,400 approved for @iris9",     status: "SUCCESS" },
  { id: "A6",  timestamp: new Date(Date.now()-24*3600000),  admin: "superadmin",  module: "Binary",  action: "Carry Reset",       detail: "Carry forward reset for @edward5",          status: "SUCCESS" },
  { id: "A7",  timestamp: new Date(Date.now()-36*3600000),  admin: "support",     module: "Members", action: "KYC Review",        detail: "KYC approved for @hassan8",                 status: "SUCCESS" },
  { id: "A8",  timestamp: new Date(Date.now()-48*3600000),  admin: "finance",     module: "Engine",  action: "Engine Paused",     detail: "Notification engine paused for maintenance", status: "SUCCESS" },
  { id: "A9",  timestamp: new Date(Date.now()-60*3600000),  admin: "rewards",     module: "Plans",   action: "Plan Archived",     detail: "Legacy plan archived",                      status: "SUCCESS" },
  { id: "A10", timestamp: new Date(Date.now()-72*3600000),  admin: "superadmin",  module: "Roles",   action: "Permission Update", detail: "Finance role: withdrawals access removed",   status: "SUCCESS" },
  { id: "A11", timestamp: new Date(Date.now()-96*3600000),  admin: "finance",     module: "Wallets", action: "Transfer",          detail: "Inter-wallet transfer failed: insufficient", status: "FAILED"  },
];

type LogType = "APP" | "CRON" | "ENGINE" | "ERROR" | "API";
interface LogEntry { id: string; timestamp: Date; level: "INFO" | "WARN" | "ERROR" | "DEBUG"; type: LogType; message: string }
const MOCK_LOGS: LogEntry[] = [
  { id: "L1",  timestamp: new Date(Date.now()-2*60000),    level: "INFO",  type: "APP",    message: "[APP] Server started on port 5000"                                 },
  { id: "L2",  timestamp: new Date(Date.now()-5*60000),    level: "INFO",  type: "CRON",   message: "[CRON] ROI engine scheduled run initiated — 0 0 * * *"              },
  { id: "L3",  timestamp: new Date(Date.now()-8*60000),    level: "INFO",  type: "ENGINE", message: "[ENGINE] ROI distributed to 312 members — total $18,420.00"         },
  { id: "L4",  timestamp: new Date(Date.now()-15*60000),   level: "WARN",  type: "ENGINE", message: "[ENGINE] Binary queue backlog: 47 items pending"                    },
  { id: "L5",  timestamp: new Date(Date.now()-22*60000),   level: "ERROR", type: "ENGINE", message: "[ENGINE] Notification engine: DB connection timeout after 30s"      },
  { id: "L6",  timestamp: new Date(Date.now()-30*60000),   level: "INFO",  type: "API",    message: "[API] POST /api/auth/login 200 — 42ms"                              },
  { id: "L7",  timestamp: new Date(Date.now()-45*60000),   level: "INFO",  type: "API",    message: "[API] GET /api/users/profile 200 — 18ms"                            },
  { id: "L8",  timestamp: new Date(Date.now()-60*60000),   level: "ERROR", type: "ERROR",  message: "[ERROR] UnhandledPromiseRejection: prisma.user.findUnique timeout"  },
  { id: "L9",  timestamp: new Date(Date.now()-90*60000),   level: "INFO",  type: "CRON",   message: "[CRON] Transfer release engine: 134 transfers processed"             },
  { id: "L10", timestamp: new Date(Date.now()-120*60000),  level: "DEBUG", type: "APP",    message: "[APP] Prisma connection pool: 8/10 connections active"              },
  { id: "L11", timestamp: new Date(Date.now()-180*60000),  level: "WARN",  type: "API",    message: "[API] Rate limit hit: /api/auth/login — IP 103.12.44.88"            },
  { id: "L12", timestamp: new Date(Date.now()-240*60000),  level: "INFO",  type: "ENGINE", message: "[ENGINE] Level income distributed to 445 members — total $7,320.00" },
];

interface Role { id: string; name: string; color: string; members: number; description: string }
const ROLES: Role[] = [
  { id: "admin",      name: "Administrator",  color: GOLD,      members: 2, description: "Full platform access. Can modify all settings and configurations." },
  { id: "finance",    name: "Finance",        color: "#34d399", members: 3, description: "Access to financial operations, withdrawals, and wallet management." },
  { id: "support",    name: "Support",        color: "#60a5fa", members: 5, description: "Member management, KYC review, and support ticket handling." },
  { id: "compliance", name: "Compliance",     color: "#a78bfa", members: 2, description: "Read-only financial data plus audit log access and reporting." },
  { id: "readonly",   name: "Read Only",      color: MUTED,     members: 1, description: "Dashboard and reports access only. Cannot modify any data." },
];
const PERMS = ["Dashboard","Members","Investments","Withdrawals","Binary","Income","Plans","Reports","Audit","Notifications"];
const PERM_MATRIX: Record<string, Record<string, boolean>> = {
  admin:      { Dashboard:true, Members:true, Investments:true, Withdrawals:true, Binary:true, Income:true, Plans:true, Reports:true, Audit:true, Notifications:true  },
  finance:    { Dashboard:true, Members:true, Investments:true, Withdrawals:true, Binary:false,Income:false,Plans:false,Reports:true, Audit:true, Notifications:false },
  support:    { Dashboard:true, Members:true, Investments:false,Withdrawals:false,Binary:false,Income:false,Plans:false,Reports:true, Audit:false,Notifications:true  },
  compliance: { Dashboard:true, Members:true, Investments:true, Withdrawals:true, Binary:false,Income:false,Plans:false,Reports:true, Audit:true, Notifications:false },
  readonly:   { Dashboard:true, Members:false,Investments:false,Withdrawals:false,Binary:false,Income:false,Plans:false,Reports:true, Audit:false,Notifications:false },
};

interface Backup { id: string; timestamp: Date; size: string; type: "MANUAL" | "AUTO"; status: "COMPLETE" | "FAILED" }
const INITIAL_BACKUPS: Backup[] = [
  { id: "B1", timestamp: new Date(Date.now()-4*3600000),   size: "2.4 GB", type: "AUTO",   status: "COMPLETE" },
  { id: "B2", timestamp: new Date(Date.now()-28*3600000),  size: "2.3 GB", type: "MANUAL", status: "COMPLETE" },
  { id: "B3", timestamp: new Date(Date.now()-52*3600000),  size: "2.2 GB", type: "AUTO",   status: "COMPLETE" },
  { id: "B4", timestamp: new Date(Date.now()-76*3600000),  size: "2.1 GB", type: "AUTO",   status: "FAILED"   },
  { id: "B5", timestamp: new Date(Date.now()-100*3600000), size: "2.1 GB", type: "AUTO",   status: "COMPLETE" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const $ = (n: number) => "$" + n.toLocaleString("en-US");
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const timeAgo = (d: Date) => { const h = Math.round((Date.now()-d.getTime())/3600000); return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h/24)}d ago`; };

// ─── Shared: Section Header ────────────────────────────────────────────────────
function SectionHead({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{title}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{sub}</div>
      </div>
      {action}
    </div>
  );
}

// ─── REPORTS ───────────────────────────────────────────────────────────────────
function ReportsSection({ onToast }: { onToast: (m: string) => void }) {
  const maxRev = Math.max(...DAILY_REVENUE.map(d => d.value));
  return (
    <div>
      <SectionHead title="Reports" sub="Platform performance metrics and income distribution."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onToast("PDF report exported successfully.")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: MUTED }}><Download size={12} /> Export PDF</button>
            <button onClick={() => onToast("CSV report exported successfully.")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: MUTED }}><Download size={12} /> Export CSV</button>
          </div>
        }
      />
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Daily Revenue",     value: "$57,150",   color: GOLD,      icon: DollarSign },
          { label: "New Members",       value: "12 today",  color: "#34d399", icon: Users      },
          { label: "Active Investments",value: "1,499",     color: "#60a5fa", icon: TrendingUp },
          { label: "Withdrawals Today", value: "$8,240",    color: "#a78bfa", icon: Activity   },
        ].map(k => (
          <div key={k.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${k.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <k.icon size={14} style={{ color: k.color }} />
              </div>
              <span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{k.label.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>
      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        {/* Daily revenue bar chart */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 16 }}>DAILY REVENUE (LAST 7 DAYS)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140 }}>
            {DAILY_REVENUE.map(d => {
              const pct = Math.round((d.value / maxRev) * 100);
              return (
                <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 9, color: MUTED, fontFamily: "monospace" }}>{(d.value/1000).toFixed(0)}K</div>
                  <div style={{ width: "100%", height: `${pct}%`, background: `linear-gradient(to top, ${GOLD}cc, ${GOLD}44)`, borderRadius: "4px 4px 0 0", minHeight: 4 }} />
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Income distribution */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 16 }}>INCOME DISTRIBUTION</div>
          {INCOME_DIST.map(d => (
            <div key={d.label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: d.color }}>{d.value}%</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{ height: "100%", borderRadius: 3, background: d.color, width: `${d.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
function NotificationsSection({ notifs, setNotifs, onToast }: { notifs: Notification[]; setNotifs: React.Dispatch<React.SetStateAction<Notification[]>>; onToast: (m: string) => void }) {
  const [type, setType]     = useState<NotifType>("PUSH");
  const [title, setTitle]   = useState("");
  const [msg, setMsg]       = useState("");
  const [target, setTarget] = useState("All Members");
  const [sched, setSched]   = useState("Send Now");
  const [sending, setSending] = useState(false);

  const NOTIF_ICON: Record<NotifType, React.ElementType> = { PUSH: Smartphone, EMAIL: Mail, IN_APP: Bell };
  const NOTIF_COL: Record<NotifType, string> = { PUSH: "#34d399", EMAIL: "#60a5fa", IN_APP: GOLD };
  const STATUS_COL = { SENT: "#34d399", SCHEDULED: "#fbbf24", FAILED: "#f87171" } as const;

  const handleSend = () => {
    if (!title || !msg) return;
    setSending(true);
    setTimeout(() => {
      const n: Notification = { id: `N-${Date.now()}`, type, title, message: msg, target, sentAt: sched === "Send Now" ? new Date() : new Date(Date.now()+86400000), status: sched === "Send Now" ? "SENT" : "SCHEDULED", recipients: sched === "Send Now" ? 1487 : 0 };
      setNotifs(ns => [n, ...ns]);
      setSending(false);
      setTitle(""); setMsg("");
      onToast(`Notification ${sched === "Send Now" ? "sent" : "scheduled"} successfully.`);
    }, 1200);
  };

  const TH: React.CSSProperties = { padding: "9px 12px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const TD: React.CSSProperties = { padding: "11px 12px", fontSize: 11, color: "rgba(255,255,255,0.7)", borderBottom: `1px solid ${BORDER}` };

  return (
    <div>
      <SectionHead title="Notifications" sub="Broadcast platform-wide notifications to members." />
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
        {/* Composer */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 14 }}>COMPOSE NOTIFICATION</div>
          {/* Type */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>TYPE</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["PUSH","EMAIL","IN_APP"] as NotifType[]).map(t => {
                const Ic = NOTIF_ICON[t];
                return (
                  <button key={t} onClick={() => setType(t)} style={{ flex: 1, padding: "7px 0", background: type === t ? `${NOTIF_COL[t]}12` : "rgba(255,255,255,0.03)", border: `1px solid ${type === t ? NOTIF_COL[t]+"44" : BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 9, fontWeight: 700, color: type === t ? NOTIF_COL[t] : MUTED, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <Ic size={13} />{t}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Fields */}
          {[
            { label: "TITLE", val: title, set: setTitle, ph: "Notification title…" },
            { label: "MESSAGE", val: msg, set: setMsg, ph: "Notification body…", multi: true },
          ].map(f => (
            <div key={f.label} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>{f.label}</label>
              {f.multi ? (
                <textarea value={f.val} onChange={e => f.set(e.target.value)} rows={3} placeholder={f.ph} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              ) : (
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
              )}
            </div>
          ))}
          {/* Target */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>TARGET AUDIENCE</label>
            <select value={target} onChange={e => setTarget(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", cursor: "pointer" }}>
              {["All Members","Active Members","VIP Members","Diamond+","Crown","Custom"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {/* Schedule */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>SEND</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["Send Now","Scheduled"].map(s => (
                <button key={s} onClick={() => setSched(s)} style={{ flex: 1, padding: "7px 0", background: sched === s ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${sched === s ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: sched === s ? GOLD_L : MUTED }}>{s}</button>
              ))}
            </div>
          </div>
          <button onClick={handleSend} disabled={!title || !msg || sending}
            style={{ width: "100%", padding: "10px 0", background: title && msg ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.03)", border: `1px solid ${title && msg ? "rgba(212,175,55,0.25)" : BORDER}`, borderRadius: 9, cursor: title && msg ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, color: title && msg ? GOLD_L : MUTED, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Send size={13} />{sending ? "Sending…" : sched === "Scheduled" ? "Schedule Notification" : "Send Now"}
          </button>
        </div>
        {/* History */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.07em" }}>NOTIFICATION HISTORY</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["TYPE","TITLE","TARGET","RECIPIENTS","SENT AT","STATUS"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {notifs.map(n => {
                const Ic = NOTIF_ICON[n.type];
                const col = NOTIF_COL[n.type];
                return (
                  <tr key={n.id}>
                    <td style={{ ...TD, paddingLeft: 14 }}><span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: col }}><Ic size={11} />{n.type}</span></td>
                    <td style={{ ...TD, color: "rgba(255,255,255,0.85)", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</td>
                    <td style={{ ...TD, color: MUTED, fontSize: 10 }}>{n.target}</td>
                    <td style={TD}>{n.recipients > 0 ? n.recipients.toLocaleString() : "—"}</td>
                    <td style={{ ...TD, color: MUTED, fontSize: 10 }}>{n.status === "SCHEDULED" ? "Tomorrow" : fmtDate(n.sentAt)}</td>
                    <td style={TD}><span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COL[n.status], background: `${STATUS_COL[n.status]}18`, padding: "2px 7px", borderRadius: 4 }}>{n.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── AUDIT CENTER ──────────────────────────────────────────────────────────────
function AuditSection({ entries, onExport }: { entries: AuditEntry[]; onExport: () => void }) {
  const [q, setQ]           = useState("");
  const [modFilter, setMod] = useState("All");
  const modules = ["All", ...Array.from(new Set(entries.map(e => e.module)))];
  const STATUS_COL = { SUCCESS: "#34d399", FAILED: "#f87171", PENDING: "#fbbf24" } as const;
  const filtered = useMemo(() => entries.filter(e =>
    (modFilter === "All" || e.module === modFilter) &&
    (!q || e.admin.includes(q.toLowerCase()) || e.action.toLowerCase().includes(q.toLowerCase()) || e.detail.toLowerCase().includes(q.toLowerCase()))
  ), [entries, modFilter, q]);
  const TH: React.CSSProperties = { padding: "9px 12px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const TD: React.CSSProperties = { padding: "11px 12px", fontSize: 11, color: "rgba(255,255,255,0.7)", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  return (
    <div>
      <SectionHead title="Audit Center" sub="Complete audit trail of all admin actions." action={
        <button onClick={onExport} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: MUTED }}><Download size={12} /> Export</button>
      } />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search admin, action, detail…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px 8px 30px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
        </div>
        <select value={modFilter} onChange={e => setMod(e.target.value)} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: MUTED, outline: "none", cursor: "pointer" }}>
          {modules.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["TIME","ADMIN","MODULE","ACTION","DETAIL","STATUS"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id}>
                <td style={{ ...TD, color: MUTED, fontSize: 10 }}>{fmtDate(e.timestamp)}</td>
                <td style={{ ...TD, color: "#60a5fa", fontWeight: 600 }}>{e.admin}</td>
                <td style={TD}><span style={{ fontSize: 9, fontWeight: 700, color: GOLD_L, background: "rgba(212,175,55,0.1)", padding: "2px 7px", borderRadius: 4 }}>{e.module}</span></td>
                <td style={{ ...TD, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{e.action}</td>
                <td style={{ ...TD, color: MUTED, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{e.detail}</td>
                <td style={TD}><span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COL[e.status], background: `${STATUS_COL[e.status]}18`, padding: "2px 7px", borderRadius: 4 }}>{e.status}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: MUTED, fontSize: 12 }}>No entries found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SYSTEM LOGS ───────────────────────────────────────────────────────────────
function SystemLogsSection({ onToast }: { onToast: (m: string) => void }) {
  const [logType, setLogType] = useState<LogType>("APP");
  const [q, setQ] = useState("");
  const LOG_TYPES: LogType[] = ["APP","CRON","ENGINE","ERROR","API"];
  const LEVEL_COL = { INFO: "#60a5fa", WARN: "#fbbf24", ERROR: "#f87171", DEBUG: MUTED } as const;
  const filtered = useMemo(() => MOCK_LOGS.filter(l => l.type === logType && (!q || l.message.toLowerCase().includes(q.toLowerCase()))), [logType, q]);
  return (
    <div>
      <SectionHead title="System Logs" sub="Real-time application, engine, and error log viewer." action={
        <button onClick={() => onToast("Log file downloaded.")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: MUTED }}><Download size={12} /> Download</button>
      } />
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {LOG_TYPES.map(t => (
          <button key={t} onClick={() => setLogType(t)} style={{ padding: "6px 14px", background: logType === t ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${logType === t ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, color: logType === t ? GOLD_L : MUTED }}>
            {t}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search logs…" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px 7px 30px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", width: 200 }} />
        </div>
      </div>
      <div style={{ background: "hsl(222 62% 5%)", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px", fontFamily: "monospace", fontSize: 11, maxHeight: 480, overflowY: "auto" }}>
        {filtered.length === 0 && <div style={{ color: MUTED, textAlign: "center", padding: "32px 0" }}>No log entries for this filter.</div>}
        {filtered.map(l => (
          <div key={l.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <span style={{ color: MUTED, flexShrink: 0, fontSize: 10 }}>{fmtDate(l.timestamp)}</span>
            <span style={{ color: LEVEL_COL[l.level], fontWeight: 700, flexShrink: 0, fontSize: 10, width: 44 }}>{l.level}</span>
            <span style={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ROLES & PERMISSIONS ───────────────────────────────────────────────────────
function RolesSection({ onToast }: { onToast: (m: string) => void }) {
  const [matrix, setMatrix] = useState(PERM_MATRIX);
  const toggle = (roleId: string, perm: string) => {
    if (roleId === "admin") return; // admin always has all
    setMatrix(m => ({ ...m, [roleId]: { ...m[roleId], [perm]: !m[roleId][perm] } }));
    onToast(`Permission updated for ${roleId}.`);
  };
  return (
    <div>
      <SectionHead title="Roles & Permissions" sub="Manage admin roles and their platform access." action={
        <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700, color: GOLD_L }}><Plus size={12} /> Create Role</button>
      } />
      {/* Role cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {ROLES.map(r => (
          <div key={r.id} style={{ background: CARD, border: `1px solid ${r.color}28`, borderRadius: 12, padding: "14px 14px" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `${r.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Shield size={14} style={{ color: r.color }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)", marginBottom: 3 }}>{r.name}</div>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 8, lineHeight: 1.4 }}>{r.description}</div>
            <div style={{ fontSize: 10, color: r.color, fontWeight: 600 }}>{r.members} admin{r.members !== 1 ? "s" : ""}</div>
          </div>
        ))}
      </div>
      {/* Permission matrix */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "auto" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em" }}>PERMISSION MATRIX</div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, width: 140 }}>ROLE</th>
              {PERMS.map(p => <th key={p} style={{ padding: "10px 10px", fontSize: 9, fontWeight: 700, color: MUTED, textAlign: "center", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>{p.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROLES.map(r => (
              <tr key={r.id}>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.82)" }}>{r.name}</span>
                  </div>
                </td>
                {PERMS.map(p => {
                  const on = matrix[r.id]?.[p];
                  return (
                    <td key={p} style={{ textAlign: "center", padding: "12px 10px", borderBottom: `1px solid ${BORDER}` }}>
                      <button onClick={() => toggle(r.id, p)} style={{ width: 22, height: 22, borderRadius: 6, background: on ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${on ? "#34d399" : BORDER}`, cursor: r.id === "admin" ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        {on ? <Check size={11} style={{ color: "#34d399" }} /> : <X size={11} style={{ color: MUTED }} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAINTENANCE ───────────────────────────────────────────────────────────────
function MaintenanceSection() {
  const FLAGS = [
    { label: "Maintenance Mode",      val: false, desc: "Suspends all member-facing operations.", danger: true  },
    { label: "Registration Enabled",  val: true,  desc: "New member registration.",              danger: false },
    { label: "Investment Enabled",    val: true,  desc: "New investment creation.",              danger: false },
    { label: "Withdrawal Enabled",    val: true,  desc: "Withdrawal request submission.",        danger: false },
    { label: "Income Engine",         val: true,  desc: "All income distribution engines.",      danger: false },
    { label: "Notifications",         val: true,  desc: "Push, email, and in-app notifications.",danger: false },
  ];
  return (
    <div>
      <SectionHead title="Maintenance" sub="Platform operations overview. Manage flags in Plans → Global Config." />
      <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <AlertTriangle size={14} style={{ color: "#fbbf24", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#fbbf24" }}>Read-only preview. To change these flags, go to <b>Plans → Global Configuration</b>.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {FLAGS.map(f => (
          <div key={f.label} style={{ background: CARD, border: `1px solid ${f.danger && !f.val ? "rgba(248,113,113,0.2)" : BORDER}`, borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 11, color: MUTED }}>{f.desc}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: f.val ? "#34d399" : "#f87171" }}>{f.val ? "ON" : "OFF"}</span>
              <div style={{ width: 44, height: 24, borderRadius: 12, background: f.val ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)", border: `2px solid ${f.val ? "#34d399" : BORDER}`, position: "relative" }}>
                <div style={{ position: "absolute", top: 3, left: f.val ? 20 : 3, width: 14, height: 14, borderRadius: "50%", background: f.val ? "#34d399" : MUTED }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PLATFORM SETTINGS ─────────────────────────────────────────────────────────
function PlatformSettingsSection({ onToast }: { onToast: (m: string) => void }) {
  const [fields, setFields] = useState({
    name: "Prime Wave Platform", email: "support@primewave.io",
    timezone: "UTC", currency: "USD", domain: "app.primewave.io",
    logo: "primewave_logo.png", theme: "Dark",
  });
  return (
    <div>
      <SectionHead title="Platform Settings" sub="General platform configuration and branding." action={
        <button onClick={() => onToast("Platform settings saved.")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700, color: GOLD_L }}><Save size={12} /> Save Settings</button>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* General */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 14 }}>GENERAL</div>
          {[
            { label: "Platform Name",  key: "name"     },
            { label: "Support Email",  key: "email"    },
            { label: "Timezone",       key: "timezone" },
            { label: "Base Currency",  key: "currency" },
            { label: "Domain",         key: "domain"   },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>{f.label.toUpperCase()}</label>
              <input value={(fields as Record<string,string>)[f.key]} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        {/* Branding */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 14 }}>BRANDING</div>
          {/* Theme select */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>THEME</label>
            <select value={fields.theme} onChange={e => setFields(p => ({ ...p, theme: e.target.value }))} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", cursor: "pointer", boxSizing: "border-box" }}>
              {["Dark","Light","System"].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          {/* Logo */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>LOGO FILE</label>
            <div style={{ background: "rgba(255,255,255,0.03)", border: `2px dashed ${BORDER}`, borderRadius: 10, padding: "24px 16px", textAlign: "center", cursor: "pointer" }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Drop logo here or click to upload</div>
              <div style={{ fontSize: 10, color: MUTED }}>Current: {fields.logo}</div>
            </div>
          </div>
          {/* Accent color */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, display: "block", marginBottom: 6 }}>ACCENT COLOR</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[GOLD,"#818cf8","#34d399","#f87171","#60a5fa"].map(c => (
                <button key={c} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: c === GOLD ? `3px solid white` : "none", cursor: "pointer" }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BACKUP & RESTORE ──────────────────────────────────────────────────────────
function BackupSection({ backups, setBackups, onToast }: { backups: Backup[]; setBackups: React.Dispatch<React.SetStateAction<Backup[]>>; onToast: (m: string) => void }) {
  const [running, setRunning] = useState(false);
  const latest = backups[0];
  const handleBackup = () => {
    setRunning(true);
    setTimeout(() => {
      const b: Backup = { id: `B-${Date.now()}`, timestamp: new Date(), size: "2.5 GB", type: "MANUAL", status: "COMPLETE" };
      setBackups(bs => [b, ...bs]);
      setRunning(false);
      onToast("Manual backup completed. 2.5 GB saved.");
    }, 2000);
  };
  const STATUS_COL = { COMPLETE: "#34d399", FAILED: "#f87171" } as const;
  const TH: React.CSSProperties = { padding: "9px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const TD: React.CSSProperties = { padding: "12px 14px", fontSize: 12, borderBottom: `1px solid ${BORDER}` };
  return (
    <div>
      <SectionHead title="Backup & Restore" sub="Manage database backups and system restore points." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Latest backup */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 14 }}>LATEST BACKUP</div>
          {[
            { label: "Timestamp", value: fmtDate(latest.timestamp) },
            { label: "Size",      value: latest.size               },
            { label: "Type",      value: latest.type               },
            { label: "Status",    value: latest.status             },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: r.label === "Status" ? STATUS_COL[latest.status] : "rgba(255,255,255,0.8)" }}>{r.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleBackup} disabled={running} style={{ flex: 1, padding: "9px 0", background: running ? "rgba(255,255,255,0.03)" : "rgba(212,175,55,0.08)", border: `1px solid ${running ? BORDER : "rgba(212,175,55,0.25)"}`, borderRadius: 9, cursor: running ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: running ? MUTED : GOLD_L }}>
              {running ? "Backing up…" : "Run Manual Backup"}
            </button>
            <button onClick={() => onToast("Restore point selected. This is a mock operation.")} style={{ flex: 1, padding: "9px 0", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 9, cursor: "pointer", fontSize: 11, fontWeight: 600, color: MUTED }}>Restore</button>
          </div>
        </div>
        {/* Status */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "18px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 14 }}>BACKUP STATUS</div>
          {[
            { label: "Auto Backup",      value: "Every 24 hours",  ok: true  },
            { label: "Retention",        value: "30 days",         ok: true  },
            { label: "Storage Used",     value: "12.1 GB / 50 GB", ok: true  },
            { label: "Last Success",     value: timeAgo(latest.timestamp), ok: true },
            { label: "Backup Enabled",   value: "Yes",             ok: true  },
            { label: "Encryption",       value: "AES-256",         ok: true  },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle size={12} style={{ color: "#34d399" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{r.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* History table */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em" }}>BACKUP HISTORY</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["TIMESTAMP","SIZE","TYPE","STATUS",""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.id}>
                <td style={{ ...TD, color: MUTED, fontSize: 11, paddingLeft: 16 }}>{fmtDate(b.timestamp)}</td>
                <td style={{ ...TD, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{b.size}</td>
                <td style={TD}><span style={{ fontSize: 9, fontWeight: 700, color: b.type === "MANUAL" ? GOLD_L : "#60a5fa", background: b.type === "MANUAL" ? "rgba(212,175,55,0.1)" : "rgba(96,165,250,0.1)", padding: "2px 7px", borderRadius: 4 }}>{b.type}</span></td>
                <td style={TD}><span style={{ fontSize: 9, fontWeight: 700, color: STATUS_COL[b.status], background: `${STATUS_COL[b.status]}18`, padding: "2px 7px", borderRadius: 4 }}>{b.status}</span></td>
                <td style={{ ...TD, paddingRight: 16 }}>
                  {b.status === "COMPLETE" && <button onClick={() => onToast("Restore initiated (mock).")} style={{ padding: "4px 9px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 10, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}><RotateCcw size={10} /> Restore</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ABOUT PLATFORM ────────────────────────────────────────────────────────────
function AboutSection() {
  const INFO = [
    { label: "Platform Name",     value: "Prime Wave Platform",      color: GOLD_L      },
    { label: "Platform Version",  value: "v2.4.1",                   color: "#34d399"   },
    { label: "API Version",       value: "v1.0.0",                   color: "#60a5fa"   },
    { label: "Frontend Version",  value: "v19.0.0",                  color: "#a78bfa"   },
    { label: "Build Number",      value: "2024.06.26.001",           color: MUTED       },
    { label: "Environment",       value: "Production",               color: "#34d399"   },
    { label: "Node.js",           value: "v24.0.0",                  color: MUTED       },
    { label: "Database",          value: "PostgreSQL 15.4",          color: "#60a5fa"   },
    { label: "ORM",               value: "Prisma 5.22.0",            color: MUTED       },
    { label: "Last Deploy",       value: "2024-06-26 08:00 UTC",     color: MUTED       },
    { label: "Uptime",            value: "99.98% (30 day)",          color: "#34d399"   },
    { label: "License",           value: "Commercial — Prime Wave",  color: MUTED       },
  ];
  return (
    <div>
      <SectionHead title="About Platform" sub="Platform version, environment, and technical details." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Globe size={20} style={{ color: GOLD }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: GOLD_L }}>Prime Wave</div>
              <div style={{ fontSize: 11, color: MUTED }}>Administration Control Center</div>
            </div>
          </div>
          {INFO.slice(0, 6).map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: r.color, fontFamily: "monospace" }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 20px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 16 }}>TECHNICAL DETAILS</div>
          {INFO.slice(6).map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: r.color, fontFamily: "monospace" }}>{r.value}</span>
            </div>
          ))}
          <div style={{ marginTop: 20, background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle size={14} style={{ color: "#34d399" }} />
            <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>All systems operational</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function OperationsPage() {
  const { toasts, toast, dismiss } = useToast();
  const [active,  setActive]  = useState<SectionId>("reports");
  const [notifs,  setNotifs]  = useState<Notification[]>(INITIAL_NOTIFS);
  const [audit,   setAudit]   = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [backups, setBackups] = useState<Backup[]>(INITIAL_BACKUPS);
  const [cycling, setCycling] = useState(false);

  const addAudit = useCallback((action: string, detail: string) => {
    const e: AuditEntry = { id: `A-${Date.now()}`, timestamp: new Date(), admin: "superadmin", module: "Operations", action, detail, status: "SUCCESS" };
    setAudit(a => [e, ...a]);
  }, []);

  const toastAndAudit = useCallback((msg: string, action: string, detail: string) => {
    toast(msg, "success"); addAudit(action, detail);
  }, [toast, addAudit]);

  const handleRefresh = () => { setCycling(true); setTimeout(() => { setCycling(false); toast("Operations data refreshed.", "success"); }, 1000); };

  return (
    <AdminLayout>
      <div style={{ padding: "24px 28px", minHeight: "100vh", background: BG, boxSizing: "border-box" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Operations & System Center</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Reports, notifications, audit, logs, roles, maintenance, settings, and system information.</p>
          </div>
          <button onClick={handleRefresh} disabled={cycling} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: cycling ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, color: MUTED }}>
            <RefreshCw size={13} style={{ animation: cycling ? "spin 1s linear infinite" : "none" }} />
            {cycling ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
          {/* Section nav */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "8px 0", alignSelf: "start" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", padding: "8px 16px 6px" }}>MODULES</div>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActive(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 16px", background: active === item.id ? "rgba(212,175,55,0.07)" : "none", border: "none", borderLeft: `2px solid ${active === item.id ? GOLD : "transparent"}`, cursor: "pointer", textAlign: "left", color: active === item.id ? GOLD_L : MUTED, fontSize: 12, fontWeight: active === item.id ? 700 : 500 }}>
                <item.icon size={13} style={{ flexShrink: 0 }} />
                {item.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ minWidth: 0 }}>
            {active === "reports"       && <ReportsSection onToast={m => toastAndAudit(m, "Export", m)} />}
            {active === "notifications" && <NotificationsSection notifs={notifs} setNotifs={setNotifs} onToast={m => toastAndAudit(m, "Notification", m)} />}
            {active === "audit"         && <AuditSection entries={audit} onExport={() => toastAndAudit("Audit log exported.", "Audit Export", "Full audit log exported to CSV.")} />}
            {active === "logs"          && <SystemLogsSection onToast={m => toastAndAudit(m, "Log Download", m)} />}
            {active === "roles"         && <RolesSection onToast={m => { toast(m, "success"); addAudit("Permission Update", m); }} />}
            {active === "maintenance"   && <MaintenanceSection />}
            {active === "settings"      && <PlatformSettingsSection onToast={m => toastAndAudit(m, "Settings Update", m)} />}
            {active === "backup"        && <BackupSection backups={backups} setBackups={setBackups} onToast={m => toastAndAudit(m, "Backup", m)} />}
            {active === "about"         && <AboutSection />}
          </div>
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>
    </AdminLayout>
  );
}
