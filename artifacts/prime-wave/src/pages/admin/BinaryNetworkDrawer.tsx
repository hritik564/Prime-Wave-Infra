import { useState, memo } from "react";
import {
  X, GitBranch, TrendingUp, ShieldAlert, FileText, Clock,
  Activity, BarChart2, Star, AlertTriangle, ChevronRight,
  Download, Search, Copy, Zap, RotateCcw, ExternalLink, Lock,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

export type NodeStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type BinaryRank = "UNRANKED" | "STARTER" | "GROWTH" | "PRO" | "ELITE" | "PLATINUM" | "DIAMOND";
export type Position   = "LEFT" | "RIGHT";

export interface MatchEvent {
  id: string; timestamp: Date;
  leftBV: number; rightBV: number; matched: number; reward: number; carryForward: number;
}

export interface BinaryEvent {
  id: string;
  type: "JOIN" | "MATCH" | "RANK_UP" | "CARRY_RESET" | "BV_CREDIT" | "PLACEMENT";
  description: string; timestamp: Date; value?: number;
}

export interface NetworkWarning {
  id: string;
  type: "WEAK_LEFT" | "WEAK_RIGHT" | "INACTIVE_SPONSOR" | "NO_REFERRALS" | "HIGH_CARRY" | "LARGE_IMBALANCE";
  message: string; severity: "warn" | "error";
}

export interface AuditEntry {
  id: string; timestamp: Date; admin: string; action: string; detail: string;
}

export interface BinaryNode {
  id: string; memberId: string; username: string; firstName: string; lastName: string;
  sponsor: string; sponsorUsername: string; position: Position;
  leftBV: number; rightBV: number; carryForward: number;
  rank: BinaryRank; todayMatch: number; weeklyMatch: number;
  monthlyMatch: number; lifetimeMatch: number;
  status: NodeStatus; plan: string | null; directReferrals: number;
  leftChildUsername: string | null; rightChildUsername: string | null;
  parentUsername: string | null;
  matchingHistory: MatchEvent[];
  recentEvents: BinaryEvent[];
  warnings: NetworkWarning[];
  auditLog: AuditEntry[];
  nextRank: BinaryRank | null;
  rankProgress: number;
  rankRequirements: { label: string; current: number; required: number }[];
}

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const K = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toString();
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_CFG: Record<NodeStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: "Active",    color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  INACTIVE:  { label: "Inactive",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  SUSPENDED: { label: "Suspended", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

const RANK_CFG: Record<BinaryRank, { color: string; label: string }> = {
  UNRANKED: { color: MUTED,     label: "Unranked" },
  STARTER:  { color: "#60a5fa", label: "Starter"  },
  GROWTH:   { color: "#34d399", label: "Growth"   },
  PRO:      { color: GOLD,      label: "Pro"       },
  ELITE:    { color: "#a78bfa", label: "Elite"     },
  PLATINUM: { color: "#f0abfc", label: "Platinum"  },
  DIAMOND:  { color: "#67e8f9", label: "Diamond"   },
};

const WARN_CFG: Record<NetworkWarning["type"], { color: string; bg: string; icon: React.ElementType }> = {
  WEAK_LEFT:       { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",   icon: AlertTriangle },
  WEAK_RIGHT:      { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",   icon: AlertTriangle },
  INACTIVE_SPONSOR:{ color: "#f87171", bg: "rgba(248,113,113,0.08)",  icon: ShieldAlert   },
  NO_REFERRALS:    { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",   icon: AlertTriangle },
  HIGH_CARRY:      { color: "#60a5fa", bg: "rgba(96,165,250,0.08)",   icon: Activity      },
  LARGE_IMBALANCE: { color: "#f87171", bg: "rgba(248,113,113,0.08)",  icon: ShieldAlert   },
};

const EVENT_CFG: Record<BinaryEvent["type"], { color: string; icon: React.ElementType; label: string }> = {
  JOIN:       { color: "#34d399", icon: GitBranch, label: "Joined Network"      },
  MATCH:      { color: GOLD,      icon: Zap,       label: "Binary Match"         },
  RANK_UP:    { color: "#a78bfa", icon: Star,      label: "Rank Upgrade"         },
  CARRY_RESET:{ color: "#60a5fa", icon: RotateCcw, label: "Carry Forward Reset"  },
  BV_CREDIT:  { color: "#34d399", icon: TrendingUp,label: "BV Credited"          },
  PLACEMENT:  { color: MUTED,     icon: GitBranch, label: "Placement Changed"    },
};

const TABS = [
  { id: "summary",  icon: BarChart2,  label: "Summary"   },
  { id: "binary",   icon: GitBranch,  label: "Binary"    },
  { id: "tree",     icon: Activity,   label: "Mini Tree" },
  { id: "rank",     icon: Star,       label: "Rank"      },
  { id: "history",  icon: Clock,      label: "History"   },
  { id: "events",   icon: Zap,        label: "Events"    },
  { id: "warnings", icon: ShieldAlert,label: "Warnings"  },
  { id: "audit",    icon: FileText,   label: "Audit"     },
];

// ─── Mini Binary Tree (compact SVG-based) ─────────────────────────────────────
function MiniTree({ node }: { node: BinaryNode }) {
  const BOX_W = 130, BOX_H = 42, GAP_Y = 64, CX = 200;
  const rows = [
    { label: node.parentUsername ?? "Network Root", sub: "Parent", y: 0, x: CX, isParent: true },
    { label: `@${node.username}`,  sub: `You · ${node.position}`, y: BOX_H + GAP_Y, x: CX, isSelf: true },
    { label: node.leftChildUsername  ? `@${node.leftChildUsername}`  : "Empty Slot", sub: "Left Child",  y: (BOX_H + GAP_Y) * 2, x: CX - 110, isLeft: true, empty: !node.leftChildUsername  },
    { label: node.rightChildUsername ? `@${node.rightChildUsername}` : "Empty Slot", sub: "Right Child", y: (BOX_H + GAP_Y) * 2, x: CX + 110, isRight: true, empty: !node.rightChildUsername },
  ];
  const totalH = (BOX_H + GAP_Y) * 2 + BOX_H + 16;
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 12px", marginBottom: 14, overflow: "hidden" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 12, letterSpacing: "0.08em" }}>MINI BINARY TREE</div>
      <svg width="100%" viewBox={`0 0 ${CX * 2} ${totalH}`} style={{ overflow: "visible" }}>
        {/* Lines */}
        {/* Parent → Self */}
        <line x1={CX} y1={BOX_H / 2} x2={CX} y2={BOX_H + GAP_Y - BOX_H / 2 + 8} stroke={BORDER} strokeWidth="1.5" strokeDasharray="4,3" />
        {/* Self → Left child */}
        <line x1={CX} y1={(BOX_H + GAP_Y) + BOX_H / 2} x2={CX - 110} y2={(BOX_H + GAP_Y) * 2 - BOX_H / 2 + 8} stroke={BORDER} strokeWidth="1.5" strokeDasharray="4,3" />
        {/* Self → Right child */}
        <line x1={CX} y1={(BOX_H + GAP_Y) + BOX_H / 2} x2={CX + 110} y2={(BOX_H + GAP_Y) * 2 - BOX_H / 2 + 8} stroke={BORDER} strokeWidth="1.5" strokeDasharray="4,3" />
        {/* Boxes */}
        {rows.map((r, i) => {
          const borderColor = r.isSelf ? GOLD : r.empty ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)";
          const bgColor     = r.isSelf ? "rgba(212,175,55,0.08)" : r.empty ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)";
          const textColor   = r.isSelf ? GOLD_L : r.empty ? MUTED : "rgba(255,255,255,0.75)";
          return (
            <g key={i} transform={`translate(${r.x - BOX_W / 2}, ${r.y})`}>
              <rect width={BOX_W} height={BOX_H} rx="8" fill={bgColor} stroke={borderColor} strokeWidth={r.isSelf ? 1.5 : 1} />
              <text x={BOX_W / 2} y={15} textAnchor="middle" fill={textColor} fontSize="10" fontWeight={r.isSelf ? "700" : "500"} fontFamily="monospace">
                {r.label.length > 14 ? r.label.slice(0, 13) + "…" : r.label}
              </text>
              <text x={BOX_W / 2} y={29} textAnchor="middle" fill={MUTED} fontSize="9">
                {r.sub}
              </text>
            </g>
          );
        })}
      </svg>
      <button style={{ width: "100%", marginTop: 8, padding: "8px 0", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <ExternalLink size={11} /> Open Full Tree (Coming Soon)
      </button>
    </div>
  );
}

// ─── Summary tab ───────────────────────────────────────────────────────────────
function SummaryTab({ node }: { node: BinaryNode }) {
  const sc = STATUS_CFG[node.status];
  const rc = RANK_CFG[node.rank];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(212,175,55,0.1)", border: "2px solid rgba(212,175,55,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: GOLD, flexShrink: 0 }}>
          {node.firstName[0]}{node.lastName[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>@{node.username}</div>
          <div style={{ fontSize: 11, color: MUTED }}>{node.firstName} {node.lastName} · <span style={{ fontFamily: "monospace" }}>{node.memberId}</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "3px 9px", borderRadius: 5 }}>{sc.label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: rc.color }}>{rc.label}</span>
        </div>
      </div>
      {[
        { label: "Sponsor",          value: `@${node.sponsorUsername}` },
        { label: "Binary Position",  value: node.position },
        { label: "Plan",             value: node.plan ?? "No Plan" },
        { label: "Direct Referrals", value: String(node.directReferrals) },
        { label: "Parent Node",      value: node.parentUsername ? `@${node.parentUsername}` : "Network Root" },
      ].map(r => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.82)" }}>{r.value}</span>
        </div>
      ))}

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 12, letterSpacing: "0.08em" }}>NETWORK STATISTICS</div>
        {[
          { label: "Left BV",   value: K(node.leftBV),   color: "#34d399" },
          { label: "Right BV",  value: K(node.rightBV),  color: "#60a5fa" },
          { label: "Carry Fwd", value: K(node.carryForward), color: "#fbbf24" },
          { label: "Today Match",value: $(node.todayMatch), color: GOLD },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 12, color: MUTED }}>{r.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Binary Stats tab ──────────────────────────────────────────────────────────
function BinaryTab({ node }: { node: BinaryNode }) {
  const total = node.leftBV + node.rightBV;
  const leftPct  = total > 0 ? Math.round((node.leftBV  / total) * 100) : 50;
  const rightPct = 100 - leftPct;
  const strong = node.leftBV >= node.rightBV ? "LEFT" : "RIGHT";
  return (
    <div>
      {/* Imbalance bar */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 10 }}>LEG BALANCE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "#34d399", width: 40 }}>LEFT</span>
          <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#34d399,#34d39980)", width: `${leftPct}%`, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399", width: 36, textAlign: "right" }}>{leftPct}%</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#60a5fa", width: 40 }}>RIGHT</span>
          <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#60a5fa,#60a5fa80)", width: `${rightPct}%`, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", width: 36, textAlign: "right" }}>{rightPct}%</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: MUTED }}>Strong Leg: <span style={{ fontWeight: 700, color: strong === "LEFT" ? "#34d399" : "#60a5fa" }}>{strong}</span></div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          { label: "Left BV",       value: K(node.leftBV),       color: "#34d399" },
          { label: "Right BV",      value: K(node.rightBV),      color: "#60a5fa" },
          { label: "Matched BV",    value: K(Math.min(node.leftBV, node.rightBV) * 2), color: GOLD },
          { label: "Carry Forward", value: K(node.carryForward), color: "#fbbf24" },
          { label: "Today Match",   value: $(node.todayMatch),   color: GOLD_L    },
          { label: "Weekly Match",  value: $(node.weeklyMatch),  color: "#34d399" },
          { label: "Monthly Match", value: $(node.monthlyMatch), color: "#a78bfa" },
          { label: "Lifetime",      value: $(node.lifetimeMatch),color: "#60a5fa" },
        ].map(s => (
          <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 600 }}>{s.label.toUpperCase()}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Rank Progress tab ─────────────────────────────────────────────────────────
function RankTab({ node }: { node: BinaryNode }) {
  const rc  = RANK_CFG[node.rank];
  const nrc = node.nextRank ? RANK_CFG[node.nextRank] : null;
  return (
    <div>
      <div style={{ background: `linear-gradient(135deg,${rc.color}12,${rc.color}06)`, border: `1px solid ${rc.color}30`, borderRadius: 12, padding: "16px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 6 }}>CURRENT RANK</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: rc.color }}>{rc.label}</div>
        {node.nextRank && nrc && (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Next: <span style={{ color: nrc.color, fontWeight: 600 }}>{nrc.label}</span></div>
        )}
      </div>

      {node.nextRank && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>Progress to {RANK_CFG[node.nextRank].label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{node.rankProgress}%</span>
          </div>
          <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5 }}>
            <div style={{ height: "100%", borderRadius: 5, background: `linear-gradient(90deg,${GOLD},${GOLD_L})`, width: `${node.rankProgress}%`, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 12 }}>REQUIREMENTS REMAINING</div>
        {node.rankRequirements.map(r => {
          const pct = Math.min(100, Math.round((r.current / r.required) * 100));
          return (
            <div key={r.label} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{r.label}</span>
                <span style={{ fontSize: 11, color: pct >= 100 ? "#34d399" : MUTED }}>{K(r.current)} / {K(r.required)}</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{ height: "100%", borderRadius: 3, background: pct >= 100 ? "#34d399" : "#60a5fa", width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Matching History tab ──────────────────────────────────────────────────────
function HistoryTab({ node }: { node: BinaryNode }) {
  if (node.matchingHistory.length === 0)
    return <div style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 12 }}>No matching history found.</div>;
  return (
    <div>
      {node.matchingHistory.map((m, i) => {
        const isLast = i === node.matchingHistory.length - 1;
        return (
          <div key={m.id} style={{ display: "flex", gap: 12, paddingBottom: isLast ? 0 : 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(212,175,55,0.1)", border: "1.5px solid rgba(212,175,55,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={13} style={{ color: GOLD }} />
              </div>
              {!isLast && <div style={{ width: 1, flex: 1, background: BORDER, margin: "4px 0" }} />}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: GOLD_L }}>Binary Match</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>+{$(m.reward)}</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                Matched: {K(m.matched)} BV · Carry: {K(m.carryForward)} BV
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>L: {K(m.leftBV)} · R: {K(m.rightBV)} · {fmtDate(m.timestamp)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Recent Events tab ─────────────────────────────────────────────────────────
function EventsTab({ node }: { node: BinaryNode }) {
  if (node.recentEvents.length === 0)
    return <div style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 12 }}>No recent events.</div>;
  return (
    <div>
      {node.recentEvents.map((ev, i) => {
        const cfg = EVENT_CFG[ev.type];
        const isLast = i === node.recentEvents.length - 1;
        return (
          <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: isLast ? 0 : 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${cfg.color}18`, border: `1.5px solid ${cfg.color}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <cfg.icon size={12} style={{ color: cfg.color }} />
              </div>
              {!isLast && <div style={{ width: 1, flex: 1, background: BORDER, margin: "4px 0" }} />}
            </div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{cfg.label}</span>
                {ev.value !== undefined && <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{$(ev.value)}</span>}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{ev.description}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{fmtDate(ev.timestamp)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Warnings tab ─────────────────────────────────────────────────────────────
function WarningsTab({ node }: { node: BinaryNode }) {
  if (node.warnings.length === 0)
    return <div style={{ textAlign: "center", padding: "48px 0", color: "#34d399", fontSize: 12 }}>✓ No active warnings for this node.</div>;
  return (
    <div>
      {node.warnings.map(w => {
        const cfg = WARN_CFG[w.type];
        return (
          <div key={w.id} style={{ background: cfg.bg, border: `1px solid ${cfg.color}25`, borderLeft: `3px solid ${cfg.color}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <cfg.icon size={13} style={{ color: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{w.type.replace(/_/g, " ")}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{w.message}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Audit Log tab ─────────────────────────────────────────────────────────────
function AuditTab({ node }: { node: BinaryNode }) {
  const [q, setQ] = useState("");
  const entries = node.auditLog.filter(e =>
    !q || e.action.toLowerCase().includes(q.toLowerCase()) || e.admin.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px 7px 28px", fontSize: 12, color: "rgba(255,255,255,0.75)", outline: "none", boxSizing: "border-box" }} />
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
          <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 4 }}>Admin: {e.admin}</div>
          <div style={{ fontSize: 11, color: MUTED }}>{e.detail}</div>
        </div>
      ))}
      {entries.length === 0 && <div style={{ textAlign: "center", padding: "32px 0", color: MUTED, fontSize: 12 }}>No entries found.</div>}
    </div>
  );
}

// ─── Main Drawer ───────────────────────────────────────────────────────────────
const BinaryNetworkDrawer = memo(function BinaryNetworkDrawer({ node, onClose, onRecalculate, onResetCarry }: {
  node: BinaryNode | null;
  onClose:       () => void;
  onRecalculate: (n: BinaryNode) => void;
  onResetCarry:  (n: BinaryNode) => void;
}) {
  const [tab, setTab] = useState("summary");

  if (!node) return null;
  const sc = STATUS_CFG[node.status];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 500, zIndex: 201, background: "hsl(222 62% 7%)", borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", boxShadow: "-12px 0 50px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(100,116,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <GitBranch size={17} style={{ color: "#818cf8" }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>@{node.username}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: MUTED }}>{node.memberId}</span>
                  <button onClick={() => navigator.clipboard.writeText(node.memberId)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0, display: "flex" }}><Copy size={9} /></button>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "4px 10px", borderRadius: 6 }}>{sc.label}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, display: "flex" }}><X size={16} /></button>
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "Recalculate", onClick: () => onRecalculate(node), color: GOLD,     border: "rgba(212,175,55,0.3)",  bg: "rgba(212,175,55,0.08)",  icon: RotateCcw, disabled: false },
              { label: "Reset Carry", onClick: () => onResetCarry(node),  color: "#60a5fa",border: "rgba(96,165,250,0.3)", bg: "rgba(96,165,250,0.08)",  icon: Zap,        disabled: false },
              { label: "Adjust Place",onClick: () => {},                   color: MUTED,    border: BORDER,                  bg: "rgba(255,255,255,0.03)", icon: Lock,       disabled: true  },
            ].map(btn => (
              <button key={btn.label} onClick={btn.disabled ? undefined : btn.onClick}
                title={btn.disabled ? "Coming Soon" : btn.label}
                style={{ flex: 1, padding: "7px 0", background: btn.bg, border: `1px solid ${btn.border}`, borderRadius: 8, cursor: btn.disabled ? "not-allowed" : "pointer", fontSize: 10, fontWeight: 600, color: btn.disabled ? MUTED : btn.color, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, opacity: btn.disabled ? 0.5 : 1 }}>
                <btn.icon size={10} />{btn.disabled ? "Adjust (Soon)" : btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 12px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent", cursor: "pointer", fontSize: 10, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? GOLD_L : MUTED, whiteSpace: "nowrap" }}>
              <t.icon size={10} />{t.label}
              {t.id === "warnings" && node.warnings.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, background: "#f87171", color: "#fff", borderRadius: 10, padding: "0px 5px", marginLeft: 1 }}>{node.warnings.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {tab === "summary"  && <SummaryTab  node={node} />}
          {tab === "binary"   && <BinaryTab   node={node} />}
          {tab === "tree"     && <MiniTree    node={node} />}
          {tab === "rank"     && <RankTab     node={node} />}
          {tab === "history"  && <HistoryTab  node={node} />}
          {tab === "events"   && <EventsTab   node={node} />}
          {tab === "warnings" && <WarningsTab node={node} />}
          {tab === "audit"    && <AuditTab    node={node} />}
        </div>
      </div>
    </>
  );
});

export default BinaryNetworkDrawer;
