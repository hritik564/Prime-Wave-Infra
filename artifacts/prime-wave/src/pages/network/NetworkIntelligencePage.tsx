import { useState, useEffect, useCallback, useMemo } from "react";
import dagre from "@dagrejs/dagre";
import {
  ReactFlow, Background, Controls,
  Handle, Position,
  type Node, type Edge, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, UserCheck, UserX, Copy, CheckCheck,
  Search, Award, Activity, GitBranch, UserPlus, Zap,
  X, ChevronLeft, ChevronRight, Link2, Target, Star,
  Wallet, BarChart2, ArrowRight, Clock, Shield, ArrowUpRight,
  Radio,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getProfile, getNetworkStats, getNetworkInsights,
  getBinaryTree, getBvSummary, getNetworkMembers,
  getTopPerformers, getTeamActivity, getNetworkMemberJourney,
} from "@/lib/api";
import type {
  ProfileData, NetworkStats, NetworkInsight, BinaryTreeNode,
  BvSummary, NetworkMember, TopPerformer, TeamActivityItem,
  MemberJourney,
} from "@/lib/api";

// ── Constants ──────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.55)";
const C_L    = "#60a5fa"; // LEFT arm blue
const C_R    = "#a78bfa"; // RIGHT arm violet
const C_OK   = "#34d399"; // active/success green
const C_ERR  = "#f87171"; // alert red
const C_WARN = "#fb923c"; // warning orange
const CARD   = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "20px" } as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
function safeNum(n: string | number | null | undefined): number {
  const v = Number(n ?? 0);
  return isNaN(v) ? 0 : v;
}
function fmtUSD(n: string | number | null | undefined) {
  return `$${safeNum(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function weakLegLabel(leg: "LEFT" | "RIGHT" | "BALANCED" | null | undefined): string {
  if (leg === "BALANCED") return "Perfectly Balanced";
  if (leg === "LEFT")     return "Weak Leg: LEFT";
  if (leg === "RIGHT")    return "Weak Leg: RIGHT";
  return "Not Qualified Yet";
}
function weakLegColor(leg: "LEFT" | "RIGHT" | "BALANCED" | null | undefined): string {
  if (leg === "BALANCED") return C_OK;
  if (leg)                return C_ERR;
  return MUTED;
}
function growthLabel(score: number): string {
  if (score >= 75) return "Healthy Growth";
  if (score >= 50) return "Good Progress";
  if (score >= 25) return "Building Momentum";
  return "Getting Started";
}
function heroMessage(stats: NetworkStats): string {
  if (stats.totalTeam === 0) return "Start inviting members to grow your binary network.";
  if (stats.weeklyNew > 0 && stats.weakLeg === "BALANCED")
    return `Your network grew by ${stats.weeklyNew} member${stats.weeklyNew !== 1 ? "s" : ""} this week and is perfectly balanced.`;
  if (stats.weeklyNew > 0)
    return `Your network grew by ${stats.weeklyNew} member${stats.weeklyNew !== 1 ? "s" : ""} this week.`;
  if (stats.weakLeg === "LEFT")  return "Grow your left leg to unlock your next binary payout.";
  if (stats.weakLeg === "RIGHT") return "Grow your right leg to unlock your next binary payout.";
  if (stats.weakLeg === "BALANCED") return "Your network is balanced and ready for binary rewards.";
  return "Keep building your network to maximise binary rewards.";
}
function initials(first: string, last: string) {
  return `${first[0] ?? "?"}${last[0] ?? ""}`.toUpperCase();
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function planLabel(p: string | null | undefined) {
  if (!p) return null;
  return p.replace("PLAN_", "") + "d";
}
function scoreColor(s: number) {
  if (s >= 75) return C_OK;
  if (s >= 50) return GOLD;
  if (s >= 25) return C_WARN;
  return C_ERR;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type FilterType = "all" | "active" | "inactive" | "sponsored" | "spillover" | "new" | "high_producers" | "vip";
type SortType   = "recent" | "highest_investment" | "highest_bv";
type DrawerTarget = { id: string; username: string; firstName: string; lastName: string; status: string; position: "LEFT" | "RIGHT" | null; directReferralCount?: number };

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Av({ first, last, size = 36, color }: { first: string; last: string; size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: color ? `${color}18` : `${GOLD}18`,
      border: `1px solid ${color ? `${color}30` : `${GOLD}30`}`,
      color: color ?? GOLD, fontWeight: 700,
      fontSize: size < 36 ? 10 : size < 48 ? 12 : 16,
    }}>
      {initials(first, last)}
    </div>
  );
}

// ── RF Node Types ──────────────────────────────────────────────────────────────
interface TreeNodeData extends Record<string, unknown> {
  id:                    string;
  username:              string;
  firstName:             string;
  lastName:              string;
  status:                string;
  position:              "LEFT" | "RIGHT" | null;
  directReferralCount:   number;
  isPersonallySponsored?: boolean;
  isSpillover?:           boolean;
  totalInvested?:         string;
  currentPlan?:           string | null;
  generatedBV?:           string;
  onSelect?:              (data: TreeNodeData) => void;
}

// ── Root Node ──────────────────────────────────────────────────────────────────
function RootNode({ data }: { data: TreeNodeData }) {
  return (
    <div onClick={() => data.onSelect?.(data)} style={{
      width: 140, padding: "10px 12px", borderRadius: 12, cursor: "pointer",
      background: `linear-gradient(135deg, ${GOLD}22, ${GOLD}0a)`,
      border: `2px solid ${GOLD}55`,
      boxShadow: `0 0 18px ${GOLD}22`,
    }}>
      <Handle type="source" position={Position.Bottom} style={{ background: GOLD, width: 8, height: 8 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Av first={data.firstName} last={data.lastName} size={30} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: GOLD_L, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            @{data.username}
          </p>
          <p style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>Root · You</p>
        </div>
      </div>
      {data.currentPlan && (
        <span style={{ fontSize: 9, color: GOLD, background: `${GOLD}18`, borderRadius: 4, padding: "1px 5px", marginTop: 5, display: "inline-block" }}>
          {planLabel(data.currentPlan)}
        </span>
      )}
    </div>
  );
}

// ── Member Node ────────────────────────────────────────────────────────────────
function MemberNode({ data }: { data: TreeNodeData }) {
  const isActive = data.status === "ACTIVE";
  const bv       = Number(data.generatedBV ?? 0);
  const invested = Number(data.totalInvested ?? 0);
  const posColor = data.position === "LEFT" ? C_L : C_R;
  const border   = data.isPersonallySponsored ? `1.5px solid ${GOLD}50` : "1px solid rgba(255,255,255,0.08)";

  return (
    <div onClick={() => data.onSelect?.(data)} style={{
      width: 145, padding: "9px 11px", borderRadius: 12, cursor: "pointer",
      background: "rgba(255,255,255,0.03)", border, position: "relative",
      transition: "box-shadow 0.2s",
    }}>
      <Handle type="target" position={Position.Top}    style={{ background: "rgba(255,255,255,0.2)", width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: "rgba(255,255,255,0.2)", width: 6, height: 6 }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
        <div style={{ position: "relative" }}>
          <Av first={data.firstName} last={data.lastName} size={26} color={data.isPersonallySponsored ? GOLD : undefined} />
          <div style={{ position: "absolute", bottom: -1, right: -1, width: 7, height: 7, borderRadius: 4,
            background: isActive ? C_OK : "rgba(170,179,197,0.4)", border: "1px solid rgba(0,0,0,0.4)" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.88)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            @{data.username.length > 11 ? data.username.slice(0, 10) + "…" : data.username}
          </p>
          <div style={{ display: "flex", gap: 3, marginTop: 2, flexWrap: "wrap" }}>
            {data.position && (
              <span style={{ fontSize: 8, fontWeight: 700, color: posColor, background: `${posColor}18`, borderRadius: 3, padding: "0 4px" }}>
                {data.position[0]}
              </span>
            )}
            {data.isPersonallySponsored && (
              <span style={{ fontSize: 8, color: GOLD, background: `${GOLD}18`, borderRadius: 3, padding: "0 4px" }}>S</span>
            )}
            {data.currentPlan && (
              <span style={{ fontSize: 8, color: "#94a3b8", background: "rgba(255,255,255,0.06)", borderRadius: 3, padding: "0 4px" }}>
                {planLabel(data.currentPlan)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 8, color: MUTED }}>Invested</p>
          <p style={{ fontSize: 10, fontWeight: 600, color: invested > 0 ? "rgba(255,255,255,0.85)" : MUTED }}>
            {invested > 0 ? fmtUSD(invested) : "—"}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 8, color: MUTED }}>BV</p>
          <p style={{ fontSize: 10, fontWeight: 600, color: bv > 0 ? GOLD_L : MUTED }}>
            {bv > 0 ? `${bv.toFixed(0)} BV` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Empty Slot Node ────────────────────────────────────────────────────────────
function EmptySlotNode({ data }: { data: { position: "LEFT" | "RIGHT" } }) {
  const col = data.position === "LEFT" ? C_L : C_R;
  return (
    <div style={{
      width: 110, height: 60, borderRadius: 12, cursor: "default",
      border: `1.5px dashed ${col}30`, background: `${col}06`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
    }}>
      <Handle type="target" position={Position.Top} style={{ background: "transparent", border: "none" }} />
      <UserPlus size={14} color={`${col}60`} />
      <span style={{ fontSize: 9, color: `${col}60` }}>{data.position[0]} Open</span>
    </div>
  );
}

// ── nodeTypes (stable — outside component) ────────────────────────────────────
const nodeTypes: NodeTypes = {
  root:      RootNode      as never,
  member:    MemberNode    as never,
  emptySlot: EmptySlotNode as never,
};

// ── Tree → Flow elements (Dagre layout) ───────────────────────────────────────
const N_W = 150; const N_H = 92; const R_W = 148; const R_H = 70;
const S_W = 114; const S_H = 60;

function treeToFlow(
  root:      BinaryTreeNode | null,
  memberMap: Map<string, NetworkMember>,
  onSelect:  (d: TreeNodeData) => void,
): { nodes: Node[]; edges: Edge[] } {
  if (!root) return { nodes: [], edges: [] };

  type RN = { id: string; type: "root" | "member" | "emptySlot"; data: TreeNodeData | { position: "LEFT" | "RIGHT" }; w: number; h: number };
  type RE = { src: string; tgt: string; dashed?: boolean; col?: string };

  const rns: RN[] = [];
  const res: RE[] = [];
  let sc = 0;

  function walk(node: BinaryTreeNode, depth: number, parentId?: string) {
    const id     = `n-${node.id}`;
    const isRoot = depth === 0;
    const member = memberMap.get(node.id);
    const data: TreeNodeData = {
      id: node.id, username: node.username,
      firstName: node.firstName, lastName: node.lastName,
      status: node.status, position: node.position,
      directReferralCount: node.directReferralCount,
      isPersonallySponsored: member?.isPersonallySponsored ?? false,
      isSpillover:           member?.isSpillover           ?? false,
      totalInvested:         member?.investedAmount        ?? "0",
      currentPlan:           member?.currentPlan           ?? null,
      generatedBV:           member?.generatedBV           ?? "0",
      onSelect,
    };
    rns.push({ id, type: isRoot ? "root" : "member", data, w: isRoot ? R_W : N_W, h: isRoot ? R_H : N_H });
    if (parentId) res.push({ src: parentId, tgt: id });

    const addSlot = (pos: "LEFT" | "RIGHT") => {
      const sid = `slot-${sc++}`;
      rns.push({ id: sid, type: "emptySlot", data: { position: pos }, w: S_W, h: S_H });
      res.push({ src: id, tgt: sid, dashed: true, col: pos === "LEFT" ? C_L : C_R });
    };
    if (node.left)  walk(node.left,  depth + 1, id); else addSlot("LEFT");
    if (node.right) walk(node.right, depth + 1, id); else addSlot("RIGHT");
  }
  walk(root, 0);

  // Dagre auto-layout
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 48, edgesep: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  rns.forEach(n => g.setNode(n.id, { width: n.w, height: n.h }));
  res.forEach(e => g.setEdge(e.src, e.tgt));
  dagre.layout(g);

  const nodes: Node[] = rns.map(n => {
    const pos = g.node(n.id);
    return { id: n.id, type: n.type, position: { x: pos.x - n.w / 2, y: pos.y - n.h / 2 }, data: n.data };
  });
  const edges: Edge[] = res.map(e => ({
    id: `e-${e.src}-${e.tgt}`, source: e.src, target: e.tgt, type: "smoothstep",
    style: e.dashed
      ? { stroke: `${e.col}30`, strokeWidth: 1, strokeDasharray: "4 4" }
      : { stroke: "rgba(255,255,255,0.14)", strokeWidth: 1.5 },
  }));
  return { nodes, edges };
}

// ── Insight card ──────────────────────────────────────────────────────────────
const INSIGHT_STYLE: Record<string, { bg: string; border: string; icon: string }> = {
  success: { bg: `${C_OK}0d`,   border: `${C_OK}25`,   icon: C_OK   },
  warning: { bg: `${C_WARN}0d`, border: `${C_WARN}25`, icon: C_WARN },
  alert:   { bg: `${C_ERR}0d`,  border: `${C_ERR}25`,  icon: C_ERR  },
  info:    { bg: "rgba(96,165,250,0.07)",  border: "rgba(96,165,250,0.22)", icon: C_L },
  gold:    { bg: `${GOLD}0d`,   border: `${GOLD}25`,   icon: GOLD   },
};

function InsightCard({ insight }: { insight: NetworkInsight }) {
  const s = INSIGHT_STYLE[insight.type] ?? INSIGHT_STYLE.info;
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, background: s.bg, border: `1px solid ${s.border}`, minWidth: 220 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}>
          {insight.title}
        </p>
        <span style={{ fontSize: 9, fontWeight: 600, color: s.icon, background: `${s.icon}18`, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>
          {insight.metric}
        </span>
      </div>
      <p style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{insight.message}</p>
      <p style={{ fontSize: 10, color: s.icon, marginTop: 8, fontWeight: 600 }}>→ {insight.action}</p>
    </div>
  );
}

// ── Network Pulse ──────────────────────────────────────────────────────────────
function PulseRow({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={13} color={color ?? MUTED} />
        <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: color ?? "rgba(255,255,255,0.8)" }}>{value}</span>
    </div>
  );
}

// ── Binary Health Row ──────────────────────────────────────────────────────────
function HealthRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? "rgba(255,255,255,0.85)" }}>{value}</span>
    </div>
  );
}

// ── Quick stat card ────────────────────────────────────────────────────────────
function QStat({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div style={{ ...CARD, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <p style={{ fontSize: 18, fontWeight: 700, color }}>{value}</p>
        <p style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{label}</p>
      </div>
    </div>
  );
}

// ── Filter chips config ────────────────────────────────────────────────────────
const CHIPS: { label: string; filter: FilterType; sort: SortType }[] = [
  { label: "All",                  filter: "all",            sort: "recent"             },
  { label: "Active",               filter: "active",         sort: "recent"             },
  { label: "Inactive",             filter: "inactive",       sort: "recent"             },
  { label: "Personally Sponsored", filter: "sponsored",      sort: "recent"             },
  { label: "Spillover",            filter: "spillover",      sort: "recent"             },
  { label: "VIP",                  filter: "vip",            sort: "recent"             },
  { label: "High Producers",       filter: "high_producers", sort: "recent"             },
  { label: "New Members",          filter: "new",            sort: "recent"             },
  { label: "Highest Investment",   filter: "all",            sort: "highest_investment" },
  { label: "Highest BV",           filter: "all",            sort: "highest_bv"         },
];

// ── Member card ────────────────────────────────────────────────────────────────
function MemberCard({ m, onClick }: { m: NetworkMember; onClick: () => void }) {
  const isActive = m.status === "ACTIVE";
  const posColor = m.position === "LEFT" ? C_L : m.position === "RIGHT" ? C_R : MUTED;
  return (
    <motion.div whileHover={{ scale: 1.005, x: 2 }} onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      borderRadius: 12, cursor: "pointer",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
      transition: "background 0.15s",
    }}>
      <div style={{ position: "relative" }}>
        <Av first={m.firstName} last={m.lastName} size={36} color={m.isPersonallySponsored ? GOLD : undefined} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderRadius: 5,
          background: isActive ? C_OK : "rgba(170,179,197,0.3)", border: "1.5px solid rgba(0,0,0,0.4)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
            {m.firstName} {m.lastName}
          </span>
          {m.isPersonallySponsored && (
            <span style={{ fontSize: 9, color: GOLD, background: `${GOLD}18`, border: `1px solid ${GOLD}25`, borderRadius: 6, padding: "1px 6px", fontWeight: 600 }}>
              Sponsored
            </span>
          )}
          {m.currentPlan && (
            <span style={{ fontSize: 9, color: "#94a3b8", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "1px 6px" }}>
              {planLabel(m.currentPlan)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
          <span style={{ fontSize: 11, color: MUTED }}>@{m.username}</span>
          {m.position && (
            <span style={{ fontSize: 11, color: posColor }}>
              {m.position === "LEFT" ? "← L" : "R →"}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
          {Number(m.investedAmount) > 0 ? fmtUSD(m.investedAmount) : "—"}
        </p>
        <p style={{ fontSize: 10, color: MUTED }}>
          {Number(m.generatedBV) > 0 ? `${Number(m.generatedBV).toFixed(0)} BV` : "No investment"}
        </p>
      </div>
    </motion.div>
  );
}

// ── Journey Step (for income journey modal) ────────────────────────────────────
function JourneyStep({ icon: Icon, title, sub, color, date, last }: {
  icon: React.ElementType; title: string; sub: string; color: string; date?: string; last?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 14, paddingBottom: last ? 0 : 20, position: "relative" }}>
      {!last && (
        <div style={{ position: "absolute", left: 15, top: 32, bottom: 0, width: 1, background: "rgba(255,255,255,0.06)" }} />
      )}
      <div style={{ width: 30, height: 30, borderRadius: 15, background: `${color}18`, border: `1px solid ${color}35`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
        <Icon size={13} color={color} />
      </div>
      <div style={{ flex: 1, paddingTop: 5 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{title}</p>
        <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</p>
        {date && <p style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{timeAgo(date)}</p>}
      </div>
    </div>
  );
}

// ── Income Journey Modal ───────────────────────────────────────────────────────
function IncomeJourneyModal({ journey, member, onClose }: {
  journey: MemberJourney; member: DrawerTarget; onClose: () => void;
}) {
  const hasInvestments = journey.investments.length > 0;
  const hasBV          = Number(journey.totalBVContributed) > 0;
  const hasMatches     = journey.recentBinaryMatches.length > 0;
  const hasLevel       = Number(journey.totalLevelIncomeGenerated) > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)" }} onClick={onClose} />
      <motion.div
        initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        style={{ position: "relative", width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto",
          background: "hsl(222, 28%, 10%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "24px" }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginBottom: 2 }}>Income Journey</p>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>
              {member.firstName} {member.lastName}
            </h3>
            <p style={{ fontSize: 12, color: MUTED }}>How this member contributes to your income</p>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} color={MUTED} />
          </button>
        </div>

        {/* Timeline */}
        {!hasInvestments && !hasBV ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Wallet size={32} color={MUTED} style={{ margin: "0 auto 12px" }} />
            <p style={{ color: MUTED, fontSize: 13 }}>No investment activity yet.</p>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>Support this member to unlock binary income.</p>
          </div>
        ) : (
          <div>
            {journey.investments.slice(0, 3).map((inv, i) => (
              <JourneyStep key={inv.id}
                icon={TrendingUp}
                title={`Invested ${fmtUSD(inv.amount)}`}
                sub={`${planLabel(inv.planType)} · ${inv.status}`}
                color={GOLD}
                date={inv.startedAt}
              />
            ))}
            {hasBV && (
              <JourneyStep
                icon={BarChart2}
                title={`${Number(journey.totalBVContributed).toFixed(0)} BV Contributed`}
                sub="Added to your binary legs"
                color={C_L}
              />
            )}
            {hasMatches && journey.recentBinaryMatches.map((m, i) => (
              <JourneyStep key={m.id}
                icon={Zap}
                title={`Binary Reward ${fmtUSD(m.incomeAmount)}`}
                sub={`${Number(m.matchedBV).toFixed(0)} BV matched`}
                color={C_OK}
                date={m.createdAt}
              />
            ))}
            {hasLevel && (
              <JourneyStep
                icon={Award}
                title={`Level Income ${fmtUSD(journey.totalLevelIncomeGenerated)}`}
                sub="Earned from level income payouts"
                color={C_R}
                last
              />
            )}
            {!hasMatches && !hasLevel && hasBV && (
              <JourneyStep
                icon={Target}
                title="Awaiting Binary Match"
                sub="Grow both legs to trigger binary matching"
                color={MUTED}
                last
              />
            )}
          </div>
        )}

        {/* Summary row */}
        {(hasInvestments || hasBV) && (
          <div style={{ marginTop: 20, padding: "14px", background: `${GOLD}0a`, border: `1px solid ${GOLD}20`, borderRadius: 12 }}>
            <p style={{ fontSize: 10, color: MUTED, marginBottom: 8 }}>Total Contribution Summary</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <p style={{ fontSize: 11, color: MUTED }}>Total Invested</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{fmtUSD(journey.totalInvested)}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: MUTED }}>BV to You</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: GOLD_L }}>
                  {Number(journey.totalBVContributed).toFixed(0)} BV
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Member Drawer ──────────────────────────────────────────────────────────────
function MemberDrawer({ target, journey, journeyLoading, onClose, onJourneyOpen }: {
  target:         DrawerTarget;
  journey:        MemberJourney | null;
  journeyLoading: boolean;
  onClose:        () => void;
  onJourneyOpen:  () => void;
}) {
  const isActive = target.status === "ACTIVE";
  const posColor = target.position === "LEFT" ? C_L : target.position === "RIGHT" ? C_R : MUTED;
  const m = journey?.member;

  const drawerRows = [
    { label: "Placement",         value: target.position ? `${target.position} ARM` : "Root", color: posColor },
    { label: "Status",            value: isActive ? "Active" : "Inactive", color: isActive ? C_OK : C_ERR },
    { label: "Joined",            value: m ? new Date(m.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—", color: undefined },
    { label: "Direct Referrals",  value: m?.directReferralCount ?? target.directReferralCount ?? "—", color: undefined },
    { label: "Binary Children",   value: m?.childrenCount ?? "—", color: undefined },
    { label: "Total Invested",    value: journey ? fmtUSD(journey.totalInvested) : "—", color: GOLD },
    { label: "BV Contributed",    value: journey ? `${Number(journey.totalBVContributed).toFixed(0)} BV` : "—", color: GOLD_L },
    { label: "Level Income to You", value: journey ? fmtUSD(journey.totalLevelIncomeGenerated) : "—", color: C_R },
    { label: "Personally Sponsored", value: m?.isPersonallySponsored ? "Yes ✓" : "Spillover", color: m?.isPersonallySponsored ? GOLD : MUTED },
  ] as { label: string; value: string | number; color: string | undefined }[];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 26, stiffness: 300 }}
        style={{ position: "relative", width: 340, maxWidth: "92vw", height: "100%", overflowY: "auto",
          background: "hsl(222, 28%, 10%)", borderLeft: "1px solid rgba(255,255,255,0.08)", padding: "24px 20px" }}
      >
        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={14} color={MUTED} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <Av first={target.firstName} last={target.lastName} size={52} color={m?.isPersonallySponsored ? GOLD : undefined} />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 3 }}>
              {target.firstName} {target.lastName}
            </h3>
            <p style={{ fontSize: 12, color: MUTED }}>@{target.username}</p>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? C_OK : C_ERR,
                background: `${isActive ? C_OK : C_ERR}15`, borderRadius: 6, padding: "2px 7px" }}>
                {isActive ? "Active" : "Inactive"}
              </span>
              {m?.isPersonallySponsored && (
                <span style={{ fontSize: 9, color: GOLD, background: `${GOLD}18`, borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>
                  ★ Sponsored
                </span>
              )}
              {journey?.investments[0]?.planType && (
                <span style={{ fontSize: 9, color: "#94a3b8", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "2px 7px" }}>
                  {planLabel(journey.investments[0].planType)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats list */}
        {journeyLoading ? (
          <div style={{ padding: "20px 0" }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 8, marginBottom: 12,
                width: i % 2 === 0 ? "80%" : "60%", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 14, padding: "4px 16px", marginBottom: 20 }}>
            {drawerRows.map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "9px 0", borderBottom: i < drawerRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span style={{ fontSize: 12, color: MUTED }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: row.color ?? "rgba(255,255,255,0.85)" }}>
                  {String(row.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recent investments */}
        {journey && journey.investments.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginBottom: 10 }}>INVESTMENTS</p>
            {journey.investments.slice(0, 3).map(inv => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 6 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>
                    {fmtUSD(inv.amount)}
                  </p>
                  <p style={{ fontSize: 10, color: MUTED }}>{planLabel(inv.planType)} plan · {inv.status}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: GOLD_L, fontWeight: 600 }}>{Number(inv.bvGenerated).toFixed(0)} BV</p>
                  <p style={{ fontSize: 10, color: MUTED }}>{timeAgo(inv.startedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Income Journey CTA */}
        <button onClick={onJourneyOpen} style={{
          width: "100%", padding: "14px 18px",
          background: `linear-gradient(135deg, ${GOLD}18, ${GOLD}0a)`,
          border: `1px solid ${GOLD}30`, borderRadius: 14,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ textAlign: "left" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>View Income Journey</p>
            <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>How this member earns you rewards</p>
          </div>
          <ArrowRight size={16} color={GOLD} />
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SH({ title, sub, icon: Icon }: { title: string; sub?: string; icon?: React.ElementType }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      {Icon && (
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${GOLD}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={GOLD} />
        </div>
      )}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{title}</h2>
        {sub && <p style={{ fontSize: 11, color: MUTED }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Activity entry ─────────────────────────────────────────────────────────────
function ActivityEntry({ item }: { item: TeamActivityItem }) {
  const isInv = item.type === "investment";
  const color = isInv ? GOLD : C_L;
  const Icon  = isInv ? TrendingUp : UserPlus;
  const posColor = item.position === "LEFT" ? C_L : item.position === "RIGHT" ? C_R : MUTED;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "flex-start" }}>
      <div style={{ width: 28, height: 28, borderRadius: 14, background: `${color}15`, border: `1px solid ${color}25`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
        <Icon size={12} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600 }}>{item.firstName}</span>{" "}
          <span style={{ color: MUTED }}>{item.description}</span>
          {item.position && (
            <span style={{ color: posColor }}>{" "}· {item.position}</span>
          )}
        </p>
        <p style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{timeAgo(item.at)}</p>
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function NetworkIntelligencePage() {
  // ── Data state ───────────────────────────────────────────────────────────────
  const [profile,    setProfile]    = useState<ProfileData | null>(null);
  const [stats,      setStats]      = useState<NetworkStats | null>(null);
  const [insights,   setInsights]   = useState<NetworkInsight[]>([]);
  const [bvSummary,  setBvSummary]  = useState<BvSummary | null>(null);
  const [treeData,   setTreeData]   = useState<BinaryTreeNode | null>(null);
  const [performers, setPerformers] = useState<TopPerformer[]>([]);
  const [activities, setActivities] = useState<TeamActivityItem[]>([]);
  const [memberMap,  setMemberMap]  = useState<Map<string, NetworkMember>>(new Map());

  // Team explorer
  const [members,       setMembers]       = useState<NetworkMember[]>([]);
  const [membersTotal,  setMembersTotal]  = useState(0);
  const [memberPage,    setMemberPage]    = useState(1);
  const [memberLoading, setMemberLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort,   setSort]   = useState<SortType>("recent");

  // UI state
  const [loading,         setLoading]         = useState(true);
  const [drawer,          setDrawer]          = useState<DrawerTarget | null>(null);
  const [journey,         setJourney]         = useState<MemberJourney | null>(null);
  const [journeyLoading,  setJourneyLoading]  = useState(false);
  const [journeyOpen,     setJourneyOpen]     = useState(false);
  const [depth,           setDepth]           = useState(3);
  const [copied,          setCopied]          = useState<"code" | "link" | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);

  // ── Initial data load ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getProfile(),
      getNetworkStats(),
      getNetworkInsights(),
      getBvSummary(),
      getTopPerformers(),
      getTeamActivity(),
      getNetworkMembers({ page: 1, limit: 50, filter: "all" }),
    ]).then(([p, s, ins, bv, perf, act, allM]) => {
      setProfile(p);
      setStats(s);
      setInsights(ins.insights);
      setBvSummary(bv);
      setPerformers(perf.performers);
      setActivities(act.activities);
      const map = new Map<string, NetworkMember>();
      allM.members.forEach((m: NetworkMember) => map.set(m.id, m));
      setMemberMap(map);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // ── Load tree when depth changes ────────────────────────────────────────────
  useEffect(() => {
    getBinaryTree(depth).then(setTreeData).catch(console.error);
  }, [depth]);

  // ── Team explorer fetch ──────────────────────────────────────────────────────
  const fetchMembers = useCallback(() => {
    setMemberLoading(true);
    getNetworkMembers({ page: memberPage, limit: 10, search, filter, sort })
      .then(r => { setMembers(r.members); setMembersTotal(r.total); })
      .catch(console.error)
      .finally(() => setMemberLoading(false));
  }, [memberPage, search, filter, sort]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setMemberPage(1); }, [search, filter, sort]);

  // ── Journey fetch when drawer opens ─────────────────────────────────────────
  useEffect(() => {
    if (!drawer) { setJourney(null); return; }
    setJourneyLoading(true);
    setJourney(null);
    getNetworkMemberJourney(drawer.id)
      .then(setJourney)
      .catch(console.error)
      .finally(() => setJourneyLoading(false));
  }, [drawer]);

  // ── Tree elements ────────────────────────────────────────────────────────────
  const handleNodeSelect = useCallback((data: TreeNodeData) => {
    setDrawer({ id: data.id, username: data.username, firstName: data.firstName, lastName: data.lastName, status: data.status, position: data.position });
  }, []);

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => treeToFlow(treeData, memberMap, handleNodeSelect),
    [treeData, memberMap, handleNodeSelect],
  );

  // ── Copy helpers ─────────────────────────────────────────────────────────────
  const copy = (text: string, which: "code" | "link") => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Derived values ───────────────────────────────────────────────────────────
  const powerLeg = stats
    ? (safeNum(stats.leftBV) >= safeNum(stats.rightBV) ? "LEFT" : "RIGHT")
    : "—";
  const carryFwd  = bvSummary ? safeNum(bvSummary.carryForwardBV).toFixed(0) : "0";
  const refCode   = profile?.referralCode ?? "";
  const refLink   = refCode ? `${window.location.origin}/register?ref=${refCode}` : "";
  const scoreC    = stats ? scoreColor(stats.growthScore) : MUTED;
  const visibleActivities = showAllActivity ? activities : activities.slice(0, 8);

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading || !profile || !stats) {
    return (
      <AppLayout>
        <PageContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[200, 120, 100, 240].map((h, i) => (
              <div key={i} style={{ height: h, background: "rgba(255,255,255,0.04)", borderRadius: 16 }} />
            ))}
          </div>
        </PageContainer>
      </AppLayout>
    );
  }

  // ── Page ─────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <PageContainer>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 48 }}>

          {/* ── 1. HERO ──────────────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={CARD}>
            {/* Greeting row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <p style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>
                  {getGreeting()}, {profile.firstName} 👋
                </p>
                <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginTop: 4, lineHeight: 1.35, maxWidth: 220 }}>
                  {heroMessage(stats)}
                </h1>
              </div>
              {/* Growth score card */}
              <div style={{ textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px", minWidth: 96, flexShrink: 0 }}>
                <p style={{ fontSize: 9, color: MUTED, marginBottom: 2, fontWeight: 600, letterSpacing: "0.05em" }}>GROWTH SCORE</p>
                <p style={{ fontSize: 26, fontWeight: 800, color: scoreC, lineHeight: 1 }}>{stats.growthScore}</p>
                <p style={{ fontSize: 9, color: MUTED, marginBottom: 6 }}>/ 100</p>
                <p style={{ fontSize: 9, fontWeight: 700, color: scoreC, background: `${scoreC}15`, borderRadius: 6, padding: "2px 6px", display: "inline-block" }}>{growthLabel(stats.growthScore)}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${stats.growthScore}%` }} transition={{ duration: 1.4, ease: "easeOut" }}
                style={{ height: "100%", background: `linear-gradient(90deg, ${scoreC}80, ${scoreC})`, borderRadius: 2 }} />
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Total Members", value: stats.totalTeam, color: "rgba(255,255,255,0.92)" },
                { label: "Personally Sponsored", value: stats.personallySponsored, color: GOLD },
                { label: "This Week", value: `+${stats.weeklyNew}`, color: C_OK },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center", padding: "12px 6px", background: "rgba(255,255,255,0.025)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
                  <p style={{ fontSize: 10, color: MUTED, marginTop: 3, lineHeight: 1.3 }}>{s.label}</p>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 20 }} />

            {/* Weak leg + Next reward */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ padding: "14px", background: "rgba(248,113,113,0.05)", borderRadius: 12, border: "1px solid rgba(248,113,113,0.12)" }}>
                <p style={{ fontSize: 10, color: MUTED, marginBottom: 4, fontWeight: 600 }}>WEAK LEG</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: weakLegColor(stats.weakLeg), lineHeight: 1.35 }}>
                  {weakLegLabel(stats.weakLeg)}
                </p>
                {stats.weakLeg !== "BALANCED" && stats.bvNeededForOrbit !== null && stats.bvNeededForOrbit > 0 && (
                  <p style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>
                    ~<span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{Math.ceil(stats.bvNeededForOrbit)} BV</span> for orbit
                  </p>
                )}
                {stats.weakLeg !== "BALANCED" && (stats.bvNeededForOrbit ?? 1) <= 0 && (
                  <p style={{ fontSize: 11, color: C_OK, marginTop: 5 }}>Orbit ready ✓</p>
                )}
              </div>
              <div style={{ padding: "14px", background: `${GOLD}07`, borderRadius: 12, border: `1px solid ${GOLD}20` }}>
                <p style={{ fontSize: 10, color: MUTED, marginBottom: 4, fontWeight: 600 }}>NEXT BINARY</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: GOLD }}>
                  ≈ {fmtUSD(stats.estimatedNextBinaryReward)}
                </p>
                {Number(stats.estimatedNextBinaryReward) === 0
                  ? <p style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>Grow both legs to earn</p>
                  : <p style={{ fontSize: 11, color: MUTED, marginTop: 5 }}>Per matching cycle</p>
                }
              </div>
            </div>
          </motion.div>

          {/* ── 2. AI INSIGHTS ───────────────────────────────────────────────── */}
          {insights.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <SH title="AI Insights" sub="Personalised recommendations based on your network" icon={Star} />
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
                {insights.map((ins, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}>
                    <InsightCard insight={ins} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 3. NETWORK PULSE ─────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} style={CARD}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ position: "relative" }}>
                <Radio size={16} color={C_OK} />
                <motion.div animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2, repeat: Infinity }}
                  style={{ position: "absolute", inset: -3, borderRadius: "50%", background: C_OK, pointerEvents: "none" }} />
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Network Pulse</h2>
              <span style={{ fontSize: 10, color: C_OK, background: `${C_OK}15`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>LIVE</span>
            </div>
            <PulseRow icon={UserPlus}    label="New Members Today"      value={stats.networkPulse.newMembersToday}     color={C_L} />
            <PulseRow icon={TrendingUp}  label="Investments Today"      value={stats.networkPulse.newInvestmentsToday} color={GOLD} />
            <PulseRow icon={Zap}         label="Last Binary Reward"     value={stats.networkPulse.lastBinaryIncomeAmount ? fmtUSD(stats.networkPulse.lastBinaryIncomeAmount) : "None yet"} color={C_OK} />
            <PulseRow icon={Clock}       label="Last Binary Activity"   value={stats.networkPulse.lastBinaryIncomeAt ? timeAgo(stats.networkPulse.lastBinaryIncomeAt) : "—"} />
            <div style={{ height: 1 }} />
            <PulseRow icon={GitBranch}   label="Power Leg"              value={`${powerLeg} Arm`} color={powerLeg === "LEFT" ? C_L : C_R} />
            <PulseRow icon={Target}      label="Carry Forward BV"       value={`${carryFwd} BV`}  color={GOLD_L} />
          </motion.div>

          {/* ── 4. BINARY HEALTH ─────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <SH title="Binary Health" sub="Left vs Right arm comparison" icon={BarChart2} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              {/* LEFT */}
              <div style={{ borderRadius: 14, border: `1px solid ${C_L}25`, overflow: "hidden" }}>
                <div style={{ background: `${C_L}12`, padding: "10px 14px", borderBottom: `1px solid ${C_L}15` }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C_L }}>← LEFT ARM</p>
                </div>
                <div style={{ padding: "4px 14px 10px" }}>
                  <HealthRow label="Members"      value={stats.leftTeam}               />
                  <HealthRow label="Business Vol" value={`${safeNum(stats.leftBV).toFixed(0)} BV`} color={GOLD_L} />
                  <HealthRow label="New This Week" value={`+${stats.leftWeeklyNew}`}   color={C_OK} />
                  <HealthRow label="Active Inv."   value={stats.leftActiveInvestments} />
                </div>
              </div>
              {/* RIGHT */}
              <div style={{ borderRadius: 14, border: `1px solid ${C_R}25`, overflow: "hidden" }}>
                <div style={{ background: `${C_R}12`, padding: "10px 14px", borderBottom: `1px solid ${C_R}15` }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: C_R }}>RIGHT ARM →</p>
                </div>
                <div style={{ padding: "4px 14px 10px" }}>
                  <HealthRow label="Members"      value={stats.rightTeam}              />
                  <HealthRow label="Business Vol" value={`${safeNum(stats.rightBV).toFixed(0)} BV`} color={GOLD_L} />
                  <HealthRow label="New This Week" value={`+${stats.rightWeeklyNew}`}  color={C_OK} />
                  <HealthRow label="Active Inv."   value={stats.rightActiveInvestments} />
                </div>
              </div>
            </div>
            {/* Summary bar */}
            <div style={{ ...CARD, padding: "14px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "center" }}>
                <div>
                  <p style={{ fontSize: 10, color: MUTED }}>Power Leg</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: powerLeg === "LEFT" ? C_L : C_R }}>{powerLeg}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: MUTED }}>Weak Leg</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: weakLegColor(stats.weakLeg) }}>
                    {weakLegLabel(stats.weakLeg)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 10, color: MUTED }}>Carry Forward</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: GOLD_L }}>{carryFwd} BV</p>
                </div>
              </div>
              {stats.weakLeg !== "BALANCED" && (
                <p style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: C_WARN, fontWeight: 600 }}>
                  → Focus on your {stats.weakLeg} leg
                </p>
              )}
            </div>
          </motion.div>

          {/* ── 5. QUICK STATS ────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <QStat label="Active Members"    value={stats.activeMembers}   icon={UserCheck}   color={C_OK}  />
            <QStat label="Inactive"          value={stats.inactiveMembers} icon={UserX}       color={MUTED} />
            <QStat label="Growth Score"      value={`${stats.growthScore}/100`} icon={Award}  color={scoreC} />
            <QStat label="Direct Referrals"  value={stats.directReferrals} icon={Users}       color={C_L}   />
          </div>

          {/* ── 6. BINARY TREE ───────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <SH title="Binary Tree" sub="Click a node to inspect a member" icon={GitBranch} />
              <div style={{ display: "flex", gap: 6 }}>
                {[2, 3, 4].map(d => (
                  <button key={d} onClick={() => setDepth(d)} style={{
                    padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: depth === d ? `${GOLD}18` : "rgba(255,255,255,0.04)",
                    border: depth === d ? `1px solid ${GOLD}35` : "1px solid rgba(255,255,255,0.06)",
                    color: depth === d ? GOLD : MUTED,
                  }}>L{d}</button>
                ))}
              </div>
            </div>
            <div style={{ height: 460, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)" }}>
              {flowNodes.length === 0
                ? (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
                    <GitBranch size={32} color={MUTED} />
                    <p style={{ color: MUTED, fontSize: 13 }}>No tree data yet.</p>
                    <p style={{ color: MUTED, fontSize: 11 }}>Your network will appear here once members join.</p>
                  </div>
                ) : (
                  <ReactFlow
                    nodes={flowNodes} edges={flowEdges}
                    nodeTypes={nodeTypes}
                    fitView fitViewOptions={{ padding: 0.25 }}
                    nodesDraggable={false} nodesConnectable={false}
                    panOnDrag={true} zoomOnScroll={true}
                    style={{ background: "transparent" }}
                  >
                    <Background color="rgba(255,255,255,0.04)" gap={24} />
                    <Controls style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }} />
                  </ReactFlow>
                )
              }
            </div>
          </motion.div>

          {/* ── 7. TEAM EXPLORER ─────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <SH title="Team Explorer" sub={`${membersTotal} members in your network`} icon={Users} />

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search size={14} color={MUTED} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or username…"
                style={{
                  width: "100%", paddingLeft: 36, paddingRight: 16, paddingTop: 10, paddingBottom: 10,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12, fontSize: 13, color: "rgba(255,255,255,0.85)",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Filter chips */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 14, scrollbarWidth: "none" }}>
              {CHIPS.map(chip => {
                const active = filter === chip.filter && sort === chip.sort;
                return (
                  <button key={chip.label} onClick={() => { setFilter(chip.filter); setSort(chip.sort); }}
                    style={{
                      flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      cursor: "pointer", whiteSpace: "nowrap",
                      background: active ? `${GOLD}18` : "rgba(255,255,255,0.04)",
                      border: active ? `1px solid ${GOLD}35` : "1px solid rgba(255,255,255,0.06)",
                      color: active ? GOLD : MUTED,
                    }}>
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Member list */}
            {memberLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ height: 64, background: "rgba(255,255,255,0.03)", borderRadius: 12 }} />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <Users size={32} color={MUTED} style={{ margin: "0 auto 10px" }} />
                <p style={{ color: MUTED, fontSize: 13 }}>No members match this filter.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {members.map(m => (
                  <MemberCard key={m.id} m={m} onClick={() => setDrawer({
                    id: m.id, username: m.username, firstName: m.firstName,
                    lastName: m.lastName, status: m.status, position: m.position,
                  })} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {membersTotal > 10 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                <button onClick={() => setMemberPage(p => Math.max(1, p - 1))} disabled={memberPage === 1}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 14px", borderRadius: 10, fontSize: 12, cursor: memberPage === 1 ? "not-allowed" : "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: memberPage === 1 ? MUTED : "rgba(255,255,255,0.7)", opacity: memberPage === 1 ? 0.5 : 1 }}>
                  <ChevronLeft size={13} /> Prev
                </button>
                <span style={{ fontSize: 12, color: MUTED }}>
                  {memberPage} / {Math.ceil(membersTotal / 10)}
                </span>
                <button onClick={() => setMemberPage(p => p + 1)} disabled={memberPage >= Math.ceil(membersTotal / 10)}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 14px", borderRadius: 10, fontSize: 12, cursor: memberPage >= Math.ceil(membersTotal / 10) ? "not-allowed" : "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: memberPage >= Math.ceil(membersTotal / 10) ? MUTED : "rgba(255,255,255,0.7)", opacity: memberPage >= Math.ceil(membersTotal / 10) ? 0.5 : 1 }}>
                  Next <ChevronRight size={13} />
                </button>
              </div>
            )}
          </motion.div>

          {/* ── 8. TOP PERFORMERS ────────────────────────────────────────────── */}
          {performers.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
              <SH title="Top Performers" sub="Highest invested team members" icon={Award} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {performers.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 12, background: p.rank === 1 ? `${GOLD}25` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: p.rank === 1 ? GOLD : MUTED }}>#{p.rank}</span>
                    </div>
                    <Av first={p.firstName} last={p.lastName} size={32} color={p.rank === 1 ? GOLD : undefined} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.firstName} {p.lastName}
                      </p>
                      <p style={{ fontSize: 11, color: MUTED }}>@{p.username}</p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: p.rank === 1 ? GOLD : "rgba(255,255,255,0.85)" }}>
                        {fmtUSD(p.totalInvested)}
                      </p>
                      <p style={{ fontSize: 10, color: MUTED }}>invested</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 9. ACTIVITY TIMELINE ─────────────────────────────────────────── */}
          {activities.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <SH title="Activity Timeline" sub="Latest network events" icon={Activity} />
              <div style={{ ...CARD }}>
                {visibleActivities.map(item => (
                  <ActivityEntry key={item.id} item={item} />
                ))}
                {activities.length > 8 && (
                  <button onClick={() => setShowAllActivity(v => !v)}
                    style={{ width: "100%", padding: "12px", marginTop: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, fontSize: 12, color: MUTED, cursor: "pointer" }}>
                    {showAllActivity ? "Show less" : `Show ${activities.length - 8} more`}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ── 10. REFERRAL ─────────────────────────────────────────────────── */}
          {refCode && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} style={CARD}>
              <SH title="Grow Your Network" sub="Share your referral to earn level income" icon={Link2} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <p style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>Referral Code</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: GOLD, letterSpacing: "0.1em" }}>{refCode}</p>
                  </div>
                  <button onClick={() => copy(refCode, "code")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: `${GOLD}15`, border: `1px solid ${GOLD}25`, borderRadius: 8, cursor: "pointer", color: GOLD, fontSize: 11, fontWeight: 600 }}>
                    {copied === "code" ? <><CheckCheck size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <p style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>Referral Link</p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{refLink}</p>
                  </div>
                  <button onClick={() => copy(refLink, "link")} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: "pointer", color: MUTED, fontSize: 11, fontWeight: 600 }}>
                    {copied === "link" ? <><CheckCheck size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Member Drawer ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {drawer && (
            <MemberDrawer
              target={drawer}
              journey={journey}
              journeyLoading={journeyLoading}
              onClose={() => { setDrawer(null); setJourneyOpen(false); }}
              onJourneyOpen={() => setJourneyOpen(true)}
            />
          )}
        </AnimatePresence>

        {/* ── Income Journey Modal ─────────────────────────────────────────── */}
        <AnimatePresence>
          {journeyOpen && drawer && journey && (
            <IncomeJourneyModal
              journey={journey}
              member={drawer}
              onClose={() => setJourneyOpen(false)}
            />
          )}
        </AnimatePresence>
      </PageContainer>
    </AppLayout>
  );
}
