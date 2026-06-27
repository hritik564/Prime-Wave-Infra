import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  useReactFlow,
  useViewport,
  type Node,
  type Edge,
} from "@xyflow/react";
import { nodeTypes, type TreeNodeData } from "./TreeNodes";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, UserX, Copy, CheckCheck,
  Search, Award, Activity, Brain, GitBranch, UserPlus,
  X, ChevronLeft, ChevronRight, Link2, Target, Zap,
  ArrowRight, Star, ShieldCheck, Flame, Clock, BarChart2,
  CircleDot, Wallet, ZoomIn, ZoomOut, Maximize2, Calendar, Share2, Hash,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getProfile, getNetworkStats, getNetworkInsights,
  getBinaryTree, getBvSummary, getNetworkMembers,
  getTopPerformers, getTeamActivity, getNetworkPulse, getLegBreakdown,
} from "@/lib/api";
import type {
  ProfileData, NetworkStats, NetworkInsight, BinaryTreeNode,
  BvSummary, NetworkMember, TopPerformer, TeamActivityItem,
  NetworkPulse, LegBreakdown,
} from "@/lib/api";

// ── Constants ──────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.55)";

type MemberFilter =
  | "all" | "active" | "inactive"
  | "sponsored" | "no-plan" | "high-producers" | "recently-active";

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
function fmtUSD(n: string | number) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
function scoreColor(n: number) {
  if (n >= 81) return "#34d399";
  if (n >= 61) return GOLD;
  if (n >= 41) return "#fb923c";
  return "#ef4444";
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function computeGrowthScore(stats: NetworkStats | null, bvSummary: BvSummary | null) {
  const totalTeam    = stats?.totalTeam    ?? 0;
  const activeMembers = stats?.activeMembers ?? 0;
  const weeklyNew    = stats?.weeklyNew    ?? 0;
  const leftBV  = Number(bvSummary?.leftBV  ?? stats?.leftBV  ?? 0);
  const rightBV = Number(bvSummary?.rightBV ?? stats?.rightBV ?? 0);
  const minBV   = Math.min(leftBV, rightBV);
  const qualified = bvSummary?.binaryQualified ?? false;
  const activeRate = totalTeam > 0 ? activeMembers / totalTeam : 0;
  return Math.min(100,
    Math.round(activeRate * 35) + (qualified ? 15 : 0) +
    Math.min(30, Math.round((minBV / 150) * 30)) + Math.min(20, weeklyNew * 4),
  );
}

// ── Inline Avatar ─────────────────────────────────────────────────────────────
function Av({ first, last, size = 36 }: { first: string; last: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg,rgba(212,175,55,0.2),rgba(212,175,55,0.07))",
      border: "1px solid rgba(212,175,55,0.2)", color: GOLD,
      fontWeight: 700, fontSize: size < 36 ? 10 : 12,
    }}>
      {initials(first, last)}
    </div>
  );
}

// ── Tree → React Flow elements ────────────────────────────────────────────────
function treeToFlowElements(
  root:          BinaryTreeNode,
  currentUserId: string,
  maxDepth:      number,
  onSelect:      (data: TreeNodeData) => void,
): { nodes: Node[]; edges: Edge[]; parentMap: Map<string, string> } {
  const nodes:     Node[]              = [];
  const edges:     Edge[]              = [];
  const parentMap: Map<string, string> = new Map();

  const V_GAP  = 140;
  const H_BASE = 80 * Math.pow(2, maxDepth - 1);

  function walk(
    node:     BinaryTreeNode | null,
    depth:    number,
    x:        number,
    parentId: string | null,
    side:     "LEFT" | "RIGHT" | null,
  ) {
    if (depth > maxDepth) return;
    const hOffset = H_BASE / Math.pow(2, depth);

    if (!node) {
      if (parentId && depth <= maxDepth) {
        const emptyId = `empty-${parentId}-${side}`;
        nodes.push({
          id: emptyId, type: "emptySlot",
          position: { x, y: depth * V_GAP },
          data: { side },
          draggable: false,
        } as Node);
        edges.push({
          id: `e-${parentId}-${emptyId}`,
          source: parentId!, target: emptyId,
          type: "smoothstep",
          style: {
            stroke: side === "LEFT" ? "rgba(96,165,250,0.16)" : "rgba(167,139,250,0.16)",
            strokeDasharray: "4,4", strokeWidth: 1.5,
          },
        } as Edge);
      }
      return;
    }

    if (parentId) parentMap.set(node.id, parentId);

    const isRoot = node.id === currentUserId;

    nodes.push({
      id: node.id,
      position: { x, y: depth * V_GAP },
      type: isRoot ? "rootNode" : "memberNode",
      data: {
        id: node.id, username: node.username,
        firstName: node.firstName, lastName: node.lastName,
        status: node.status, position: node.position,
        directReferralCount: node.directReferralCount,
        depth, onSelect,
      },
      draggable: false,
    } as Node);

    if (parentId && side) {
      const isLeft = side === "LEFT";
      edges.push({
        id: `e-${parentId}-${node.id}`,
        source: parentId, target: node.id,
        type: "smoothstep",
        label: side,
        labelStyle: { fill: isLeft ? "#60a5fa" : "#a78bfa", fontSize: 9, fontWeight: 700 },
        labelBgStyle: { fill: "hsl(221 59% 10%)", fillOpacity: 0.9 },
        labelBgPadding: [2, 4] as [number, number],
        style: {
          stroke: isLeft ? "rgba(96,165,250,0.45)" : "rgba(167,139,250,0.45)",
          strokeWidth: 2,
        },
      } as Edge);
    }

    walk(node.left,  depth + 1, x - hOffset, node.id, "LEFT");
    walk(node.right, depth + 1, x + hOffset, node.id, "RIGHT");
  }

  walk(root, 0, 0, null, null);
  return { nodes, edges, parentMap };
}

// ── Inner Tree Controls (must be inside ReactFlow context) ────────────────────
const CTRL_BTN: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, cursor: "pointer", border: "none",
  background: "transparent", color: "rgba(170,179,197,0.7)",
  transition: "color 0.15s",
};

function TreeInnerControls({
  depth, setDepth, onFit,
}: {
  depth:    number;
  setDepth: (d: number) => void;
  onFit:    () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom: zoomLevel } = useViewport();
  const zoom = Math.round(zoomLevel * 100);

  const handleFit = useCallback(() => {
    fitView({ padding: 0.25, duration: 350 }).catch(() => {});
    onFit();
  }, [fitView, onFit]);

  const panelBase: React.CSSProperties = {
    background: "rgba(10,18,36,0.9)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, backdropFilter: "blur(8px)",
    overflow: "hidden",
  };
  const divider = <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />;

  return (
    <>
      {/* Zoom controls — bottom left */}
      <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={panelBase}>
          <button style={CTRL_BTN} onClick={() => zoomIn({ duration: 200 })} title="Zoom in">
            <ZoomIn style={{ width: 13, height: 13 }} />
          </button>
          {divider}
          <div style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: MUTED, padding: "3px 0" }}>
            {zoom}%
          </div>
          {divider}
          <button style={CTRL_BTN} onClick={() => zoomOut({ duration: 200 })} title="Zoom out">
            <ZoomOut style={{ width: 13, height: 13 }} />
          </button>
          {divider}
          <button style={CTRL_BTN} onClick={handleFit} title="Fit view">
            <Maximize2 style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {/* Level + action controls — top right */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 10, display: "flex", gap: 6 }}>
        {/* Level selector */}
        <div style={{ ...panelBase, display: "flex", padding: 3, gap: 2 }}>
          {([1, 2, 3, 4] as const).map((d) => (
            <button key={d} onClick={() => setDepth(d)}
              style={{
                padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                cursor: "pointer", border: "none", transition: "all 0.18s",
                background: depth === d ? "rgba(212,175,55,0.18)" : "transparent",
                color: depth === d ? GOLD : MUTED,
                outline: depth === d ? `1px solid rgba(212,175,55,0.35)` : "1px solid transparent",
              }}>
              L{d}
            </button>
          ))}
        </div>
        {/* Fit view action */}
        <button onClick={handleFit}
          title="Fit view"
          style={{
            ...panelBase, display: "flex", alignItems: "center", gap: 5,
            padding: "0 10px", cursor: "pointer", fontSize: 10, fontWeight: 600,
            color: MUTED, border: "none",
          }}>
          <Maximize2 style={{ width: 11, height: 11 }} />
          Fit
        </button>
      </div>
    </>
  );
}

// ── Insight meta ──────────────────────────────────────────────────────────────
const INSIGHT_STYLE = {
  success: { bg: "rgba(52,211,153,0.07)",  border: "rgba(52,211,153,0.22)",  color: "#34d399" },
  warning: { bg: "rgba(251,146,60,0.07)",  border: "rgba(251,146,60,0.22)",  color: "#fb923c" },
  alert:   { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.22)",   color: "#ef4444" },
  info:    { bg: "rgba(96,165,250,0.07)",  border: "rgba(96,165,250,0.22)",  color: "#60a5fa" },
  gold:    { bg: "rgba(212,175,55,0.07)",  border: "rgba(212,175,55,0.25)",  color: GOLD },
};
const INSIGHT_ICON: Record<string, React.ElementType> = {
  success: ShieldCheck, warning: Zap, alert: Target, info: Activity, gold: Award,
};

function InsightCard({ insight }: { insight: NetworkInsight }) {
  const s    = INSIGHT_STYLE[insight.type];
  const Icon = INSIGHT_ICON[insight.type] ?? Activity;
  return (
    <div
      className="shrink-0 w-64 rounded-2xl p-4"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${s.color}18`,
        }}><Icon style={{ width: 14, height: 14, color: s.color }} /></div>
        <p style={{ fontSize: 12, fontWeight: 700, color: "hsl(var(--foreground))", lineHeight: 1.3 }}>
          {insight.title}
        </p>
      </div>
      <p style={{ fontSize: 11, color: "rgba(170,179,197,0.7)", lineHeight: 1.65, marginBottom: 10 }}>
        {insight.message}
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: `${s.color}14`, padding: "2px 8px", borderRadius: 6 }}>
          {insight.metric}
        </span>
        <span style={{ fontSize: 10, color: s.color, fontWeight: 600 }}>{insight.action} →</span>
      </div>
    </div>
  );
}

// ── MemberCard ────────────────────────────────────────────────────────────────
function MemberCard({ m, onClick }: { m: NetworkMember; onClick: () => void }) {
  const isActive = m.status === "ACTIVE";
  return (
    <div onClick={onClick}
      className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-white/[0.025]">
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Av first={m.firstName} last={m.lastName} size={36} />
        <div style={{
          position: "absolute", bottom: 1, right: 1, width: 8, height: 8,
          borderRadius: "50%", background: isActive ? "#34d399" : "rgba(170,179,197,0.35)",
          border: "1.5px solid hsl(var(--card))",
        }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-foreground truncate">@{m.username}</p>
          {m.position && (
            <span style={{
              fontSize: 9, fontWeight: 700,
              color: m.position === "LEFT" ? "#60a5fa" : "#a78bfa",
              background: m.position === "LEFT" ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)",
              padding: "1px 5px", borderRadius: 4,
            }}>{m.position[0]}</span>
          )}
          {m.isSponsored && (
            <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: "rgba(212,175,55,0.1)", padding: "1px 5px", borderRadius: 4 }}>S</span>
          )}
        </div>
        <p className="text-xs truncate" style={{ color: MUTED }}>
          {m.firstName} {m.lastName} · {m.directReferrals} ref{m.directReferrals !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold" style={{ color: m.activeInvestments > 0 ? GOLD : MUTED }}>
          {m.activeInvestments > 0 ? fmtUSD(m.investedAmount) : "No plan"}
        </p>
        <p className="text-[10px]" style={{ color: isActive ? "#34d399" : MUTED }}>
          {isActive ? "Active" : "Inactive"}
        </p>
      </div>
    </div>
  );
}

// ── Income Journey Modal ───────────────────────────────────────────────────────
function IncomeJourneyModal({ member, onClose }: { member: NetworkMember; onClose: () => void }) {
  const bvGenerated = Math.floor(Number(member.investedAmount) / 100);
  const matchReward = Math.min(bvGenerated, 50) * 5;
  const steps = [
    { icon: UserPlus,    color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  title: `${member.firstName} Joined`,   desc: `Placed in your ${member.position ?? "binary"} arm` },
    { icon: TrendingUp,  color: GOLD,      bg: "rgba(212,175,55,0.1)",  title: "Invested",                     desc: member.activeInvestments > 0 ? `${fmtUSD(member.investedAmount)} across ${member.activeInvestments} active plan${member.activeInvestments > 1 ? "s" : ""}` : "No active investment yet" },
    { icon: BarChart2,   color: "#34d399", bg: "rgba(52,211,153,0.1)",  title: "BV Generated",                 desc: bvGenerated > 0 ? `${bvGenerated} BV credited to your ${member.position ?? ""} leg (1 BV per $100 invested)` : "Investment needed to generate BV" },
    { icon: Zap,         color: "#a78bfa", bg: "rgba(167,139,250,0.1)", title: "Binary Match Contribution",    desc: bvGenerated > 0 ? `Up to ${fmtUSD(matchReward)} per cycle when legs match (min BV side × $5, capped at $250)` : "Contribute to binary income once invested" },
    { icon: Wallet,      color: "#fb923c", bg: "rgba(251,146,60,0.1)",  title: "Credited to Wallet",           desc: "Binary income is paid into your Withdrawal Wallet each cycle" },
  ];
  return (
    <motion.div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative w-full max-w-md rounded-2xl overflow-hidden"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <div className="p-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">Income Journey</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>How @{member.username} contributes to your binary</p>
            </div>
            <button onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: MUTED }}><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="p-5">
          <div className="relative">
            <div className="absolute left-4 top-4 bottom-4 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="space-y-5">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i}
                    className="flex items-start gap-3 relative">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center relative z-10"
                      style={{ background: step.bg, border: `1px solid ${step.color}30` }}>
                      <Icon style={{ width: 14, height: 14, color: step.color }} />
                    </div>
                    <div className="pt-0.5 flex-1">
                      <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: MUTED }}>{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {bvGenerated > 0 && (
            <div className="mt-5 rounded-xl p-3 text-center"
              style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.18)" }}>
              <p className="text-xs" style={{ color: MUTED }}>Potential per cycle from this member</p>
              <p className="text-xl font-bold mt-1" style={{ color: GOLD_L }}>up to {fmtUSD(matchReward)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>when both legs have enough BV</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Member Drawer — CRM Style ─────────────────────────────────────────────────
function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: MUTED, marginBottom: 10 }}>
        {title}
      </p>
      {children}
    </div>
  );
}
function DrawerRow({ label, value, valueColor, icon }: { label: string; value: string | number; valueColor?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center gap-2" style={{ color: MUTED }}>
        {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
        <span style={{ fontSize: 12 }}>{label}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: valueColor ?? "hsl(var(--foreground))" }}>{value}</span>
    </div>
  );
}

function MemberDrawer({
  member, onClose, onJourney,
}: { member: NetworkMember; onClose: () => void; onJourney: () => void }) {
  const isActive    = member.status === "ACTIVE";
  const bvGenerated = Math.floor(Number(member.investedAmount) / 100);
  const armColor    = member.position === "LEFT" ? "#60a5fa" : "#a78bfa";
  const estROI      = bvGenerated > 0 ? `~${fmtUSD(Math.min(bvGenerated, 50) * 5)}/cycle` : "—";

  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative w-full max-w-sm h-full flex flex-col"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        style={{ background: "hsl(var(--card))", borderLeft: "1px solid hsl(var(--border))" }}>

        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-sm font-semibold text-foreground">Member Profile</p>
          <button onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: MUTED }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Profile hero */}
          <div className="px-5 py-6 text-center"
            style={{
              background: "linear-gradient(180deg,rgba(212,175,55,0.05) 0%,transparent 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              <Av first={member.firstName} last={member.lastName} size={68} />
              <div style={{
                position: "absolute", bottom: 3, right: 3, width: 15, height: 15,
                borderRadius: "50%", background: isActive ? "#34d399" : "rgba(170,179,197,0.4)",
                border: "2.5px solid hsl(var(--card))",
              }} />
            </div>
            <p className="mt-3 text-base font-extrabold text-foreground leading-tight">
              {member.firstName} {member.lastName}
            </p>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>@{member.username}</p>
            <div className="flex items-center gap-2 justify-center mt-3 flex-wrap">
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: isActive ? "rgba(52,211,153,0.1)" : "rgba(170,179,197,0.07)",
                color: isActive ? "#34d399" : MUTED,
                border: `1px solid ${isActive ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.07)"}`,
              }}>{isActive ? "Active" : "Inactive"}</span>
              {member.position && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                  background: `${armColor}12`, color: armColor,
                  border: `1px solid ${armColor}30`,
                }}>{member.position} ARM</span>
              )}
              {member.isSponsored && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                  background: "rgba(212,175,55,0.1)", color: GOLD, border: "1px solid rgba(212,175,55,0.25)",
                }}>Sponsored</span>
              )}
            </div>
          </div>

          {/* Stats quick strip */}
          <div className="grid grid-cols-3 divide-x px-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.05)" }}>
            {[
              { label: "Invested",    value: member.activeInvestments > 0 ? fmtUSD(member.investedAmount) : "—", color: GOLD },
              { label: "BV Gen.",     value: bvGenerated > 0 ? `${bvGenerated}` : "—",                           color: "#a78bfa" },
              { label: "Est/Cycle",   value: estROI,                                                              color: "#34d399" },
            ].map((s) => (
              <div key={s.label} className="py-3 text-center" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 9, color: MUTED, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Detail sections */}
          <div className="px-5 pt-5">

            <DrawerSection title="Financial">
              <DrawerRow label="Active Plans"    value={member.activeInvestments > 0 ? member.activeInvestments : "None"} valueColor={member.activeInvestments > 0 ? "#34d399" : MUTED} icon={<TrendingUp style={{ width: 12, height: 12 }} />} />
              <DrawerRow label="Total Invested"  value={member.activeInvestments > 0 ? fmtUSD(member.investedAmount) : "—"} valueColor={GOLD} icon={<Wallet style={{ width: 12, height: 12 }} />} />
              <DrawerRow label="BV Generated"    value={bvGenerated > 0 ? `${bvGenerated} BV` : "—"} valueColor="#a78bfa" icon={<BarChart2 style={{ width: 12, height: 12 }} />} />
              <DrawerRow label="Binary Contribution" value={estROI} valueColor="#34d399" icon={<Zap style={{ width: 12, height: 12 }} />} />
            </DrawerSection>

            <DrawerSection title="Network">
              <DrawerRow label="Position"         value={member.position ?? "—"} valueColor={member.position ? armColor : MUTED} icon={<GitBranch style={{ width: 12, height: 12 }} />} />
              <DrawerRow label="Placement"         value={member.isSponsored ? "Personally Sponsored" : "Spillover"} valueColor={member.isSponsored ? GOLD : MUTED} icon={<Star style={{ width: 12, height: 12 }} />} />
              <DrawerRow label="Direct Referrals"  value={member.directReferrals} valueColor={GOLD} icon={<Users style={{ width: 12, height: 12 }} />} />
              <DrawerRow label="Joined"            value={new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} icon={<Calendar style={{ width: 12, height: 12 }} />} />
            </DrawerSection>

            {member.plans.length > 0 && (
              <DrawerSection title="Active Plans">
                <div className="flex flex-wrap gap-1.5">
                  {member.plans.map((p) => (
                    <span key={p} style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 7,
                      background: "rgba(212,175,55,0.1)", color: GOLD_L, border: "1px solid rgba(212,175,55,0.2)",
                    }}>{p.replace("PLAN_", "")}-day</span>
                  ))}
                </div>
              </DrawerSection>
            )}
          </div>
        </div>

        {/* Actions footer */}
        <div className="shrink-0 p-4 space-y-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={onJourney}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: "linear-gradient(135deg,rgba(212,175,55,0.16),rgba(212,175,55,0.07))",
              border: "1px solid rgba(212,175,55,0.32)", color: GOLD_L,
            }}>
            View Income Journey
            <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, icon, children, extra }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <div className="mb-5 lg:mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.15)" }}>
            {icon}
          </div>
          <h3 className="text-base font-semibold font-heading text-foreground">{title}</h3>
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

function Skeleton({ n = 4, py = "py-3" }: { n?: number; py?: string }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={`flex items-center gap-3 px-4 ${py} animate-pulse`}
          style={{ borderBottom: i < n - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <div className="h-9 w-9 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "40%" }} />
            <div className="h-2 rounded"   style={{ background: "rgba(255,255,255,0.04)", width: "60%" }} />
          </div>
        </div>
      ))}
    </>
  );
}

function ViewMore({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 py-3 transition-colors hover:bg-white/[0.02]"
      style={{ borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 12, fontWeight: 600, color: MUTED }}>
      {label} <ChevronRight style={{ width: 13, height: 13 }} />
    </button>
  );
}

const FILTER_CHIPS: { key: MemberFilter; label: string; icon: React.ElementType }[] = [
  { key: "all",             label: "All",       icon: Users      },
  { key: "active",          label: "Active",    icon: ShieldCheck },
  { key: "inactive",        label: "Inactive",  icon: UserX      },
  { key: "sponsored",       label: "Sponsored", icon: Star       },
  { key: "no-plan",         label: "No Plan",   icon: Target     },
  { key: "high-producers",  label: "High Value",icon: Flame      },
  { key: "recently-active", label: "New",       icon: Clock      },
];

function LegRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: color ?? "hsl(var(--foreground))" }}>{value}</span>
    </div>
  );
}

const ACT_STYLE: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  investment: { icon: TrendingUp, color: GOLD,      bg: "rgba(212,175,55,0.1)" },
  join:       { icon: UserPlus,   color: "#34d399", bg: "rgba(52,211,153,0.1)" },
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NetworkIntelligencePage() {
  const [loading, setLoading]           = useState(true);
  const [profile, setProfile]           = useState<ProfileData | null>(null);
  const [stats, setStats]               = useState<NetworkStats | null>(null);
  const [insights, setInsights]         = useState<NetworkInsight[]>([]);
  const [bvSummary, setBv]              = useState<BvSummary | null>(null);
  const [tree, setTree]                 = useState<BinaryTreeNode | null>(null);
  const [members, setMembers]           = useState<NetworkMember[]>([]);
  const [memberTotal, setMemberTotal]   = useState(0);
  const [memberPage, setMemberPage]     = useState(1);
  const [performers, setPerformers]     = useState<TopPerformer[]>([]);
  const [activity, setActivity]         = useState<TeamActivityItem[]>([]);
  const [pulse, setPulse]               = useState<NetworkPulse | null>(null);
  const [legBreakdown, setLegBreakdown] = useState<LegBreakdown | null>(null);
  const [search, setSearch]             = useState("");
  const [filter, setFilter]             = useState<MemberFilter>("all");
  const [treeDepth, setTreeDepth]       = useState(3);
  const [selectedMember, setSelectedMember] = useState<NetworkMember | null>(null);
  const [journeyOpen, setJourneyOpen]   = useState(false);
  const [copied, setCopied]             = useState<string | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);

  // ── Initial parallel load ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.allSettled([
        getProfile(), getNetworkStats(), getNetworkInsights(),
        getBvSummary(), getBinaryTree(3), getTopPerformers(),
        getTeamActivity(), getNetworkPulse(), getLegBreakdown(),
      ]);
      if (r0.status === "fulfilled") setProfile(r0.value);
      if (r1.status === "fulfilled") setStats(r1.value);
      if (r2.status === "fulfilled") setInsights(r2.value.insights);
      if (r3.status === "fulfilled") setBv(r3.value);
      if (r4.status === "fulfilled") setTree(r4.value);
      if (r5.status === "fulfilled") setPerformers(r5.value.performers);
      if (r6.status === "fulfilled") setActivity(r6.value.activities);
      if (r7.status === "fulfilled") setPulse(r7.value);
      if (r8.status === "fulfilled") setLegBreakdown(r8.value);
      setLoading(false);
    }
    void load();
  }, []);

  // ── Members reload ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    async function loadMembers() {
      setMemberLoading(true);
      try {
        const res = await getNetworkMembers({ page: memberPage, limit: 5, search, filter });
        if (!cancelled) { setMembers(res.members); setMemberTotal(res.total); }
      } catch { /* ignore */ } finally {
        if (!cancelled) setMemberLoading(false);
      }
    }
    void loadMembers();
    return () => { cancelled = true; };
  }, [loading, search, filter, memberPage]);

  // ── Tree depth reload ──────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    getBinaryTree(treeDepth).then(setTree).catch(() => {});
  }, [treeDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Node select callback ───────────────────────────────────────────────────
  const handleNodeSelect = useCallback((data: TreeNodeData) => {
    setSelectedMember({
      id: data.id, username: data.username,
      firstName: data.firstName, lastName: data.lastName,
      status: data.status, position: data.position,
      joinedAt: new Date().toISOString(),
      directReferrals: data.directReferralCount,
      activeInvestments: 0, investedAmount: "0",
      plans: [], isSponsored: false,
    });
  }, []);

  // ── Flow elements ──────────────────────────────────────────────────────────
  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!tree || !profile) return { nodes: [], edges: [] };
    return treeToFlowElements(tree, profile.id, treeDepth, handleNodeSelect);
  }, [tree, profile?.id, treeDepth, handleNodeSelect]);

  // ── Copy helpers ───────────────────────────────────────────────────────────
  const copyCode = useCallback((leg: "L" | "R") => {
    if (!profile) return;
    navigator.clipboard.writeText(`${profile.referralCode}-${leg}`).catch(() => {});
    setCopied(`code-${leg}`); setTimeout(() => setCopied(null), 2000);
  }, [profile]);
  const copyLink = useCallback((leg: "L" | "R") => {
    if (!profile) return;
    navigator.clipboard.writeText(`${window.location.origin}/register?ref=${profile.referralCode}&leg=${leg}`).catch(() => {});
    setCopied(`link-${leg}`); setTimeout(() => setCopied(null), 2000);
  }, [profile]);
  const shareLink = useCallback(async (leg: "L" | "R") => {
    if (!profile) return;
    const url = `${window.location.origin}/register?ref=${profile.referralCode}&leg=${leg}`;
    if (navigator.share) {
      try { await navigator.share({ url, title: "Join Prime Wave" }); } catch { /* dismissed */ }
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopied(`link-${leg}`); setTimeout(() => setCopied(null), 2000);
    }
  }, [profile]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(memberTotal / 5));
  const leftBV      = Number(bvSummary?.leftBV  ?? stats?.leftBV  ?? 0);
  const rightBV     = Number(bvSummary?.rightBV ?? stats?.rightBV ?? 0);
  const totalBV     = leftBV + rightBV;
  const leftPct     = totalBV > 0 ? (leftBV  / totalBV) * 100 : 50;
  const rightPct    = totalBV > 0 ? (rightBV / totalBV) * 100 : 50;
  const qualified   = bvSummary?.binaryQualified ?? false;
  const weakLeg     = leftBV <= rightBV ? "LEFT" : "RIGHT";
  const weakLegBV   = Math.min(leftBV, rightBV);
  const bvNeeded    = Math.max(0, Math.ceil(50 - weakLegBV));
  const nextReward  = Math.min(weakLegBV, 50) * 5;
  const growthScore = computeGrowthScore(stats, bvSummary);

  const RANK_COLOR = [GOLD, "#a8a8a8", "#cd7f32", MUTED, MUTED];
  const RANK_BG    = ["rgba(212,175,55,0.12)", "rgba(168,168,168,0.07)", "rgba(205,127,50,0.07)", "transparent", "transparent"];

  return (
    <AppLayout pageTitle="Network Intelligence" notificationCount={0}>
      <PageContainer>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div
          className="relative mb-5 rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg,rgba(10,22,40,1) 0%,rgba(14,27,55,1) 55%,rgba(10,22,40,1) 100%)",
            border: "1px solid rgba(212,175,55,0.22)",
          }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 60% 80% at 100% 0%,rgba(212,175,55,0.08) 0%,transparent 60%)" }} />
          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm" style={{ color: "rgba(212,175,55,0.6)" }}>
                  {greeting()}, {profile?.firstName ?? "…"} 👋
                </p>
                <p className="text-2xl font-extrabold mt-1 text-foreground leading-tight">
                  Your Network is{" "}
                  <span style={{ color: GOLD_L }}>
                    {loading ? "Loading" : (stats?.weeklyNew ?? 0) > 0 ? "Growing" : "Stable"}
                  </span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED }}>Members</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: GOLD_L, lineHeight: 1 }}>
                  {loading ? "—" : fmtK(stats?.totalTeam ?? 0)}
                </p>
                <p style={{ fontSize: 10, color: "#34d399", fontWeight: 600 }}>
                  +{loading ? "—" : (stats?.weeklyNew ?? 0)} this week
                </p>
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginInline: 20 }} />
          <div className="relative grid grid-cols-3 divide-x" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="px-4 py-4 text-center">
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#fb923c", marginBottom: 6 }}>Weak Leg</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: "hsl(var(--foreground))", lineHeight: 1 }}>{loading ? "—" : weakLeg}</p>
              <p style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>{loading ? "—" : bvNeeded > 0 ? `Needs ${bvNeeded} BV` : "At cap ✓"}</p>
            </div>
            <div className="px-4 py-4 text-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: GOLD, marginBottom: 6 }}>Next Reward</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: GOLD_L, lineHeight: 1 }}>{loading ? "—" : nextReward > 0 ? `~${fmtUSD(nextReward)}` : "$0"}</p>
              <p style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>per cycle</p>
            </div>
            <div className="px-4 py-4 text-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#60a5fa", marginBottom: 6 }}>Growth Score</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: loading ? MUTED : scoreColor(growthScore), lineHeight: 1 }}>{loading ? "—" : growthScore}</p>
              <p style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>/100</p>
            </div>
          </div>
          <div className="relative px-5 py-3 flex items-center gap-4 flex-wrap"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.12)" }}>
            <div className="flex items-center gap-1.5">
              <Star style={{ width: 11, height: 11, color: GOLD }} />
              <span style={{ fontSize: 11, color: MUTED }}><span className="font-bold text-foreground">{loading ? "—" : (stats?.directReferrals ?? 0)}</span> personally sponsored</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <CircleDot style={{ width: 11, height: 11, color: "#34d399" }} />
              <span style={{ fontSize: 11, color: MUTED }}><span className="font-bold" style={{ color: "#34d399" }}>{loading ? "—" : (stats?.activeMembers ?? 0)}</span> active</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <UserX style={{ width: 11, height: 11, color: MUTED }} />
              <span style={{ fontSize: 11, color: MUTED }}><span className="font-bold text-foreground">{loading ? "—" : (stats?.inactiveMembers ?? 0)}</span> inactive</span>
            </div>
          </div>
        </div>

        {/* ── INTELLIGENCE INSIGHTS ─────────────────────────────────────────── */}
        <Section title="Intelligence Insights" icon={<Brain style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="shrink-0 w-64 h-36 rounded-2xl animate-pulse"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
                ))
              : insights.length > 0
              ? insights.map((ins, i) => <InsightCard key={i} insight={ins} />)
              : <p style={{ fontSize: 13, color: MUTED }}>No insights available.</p>
            }
          </div>
        </Section>

        {/* ── NETWORK PULSE ─────────────────────────────────────────────────── */}
        <div className="mb-5 rounded-2xl overflow-hidden"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <p className="text-sm font-semibold text-foreground">Network Pulse</p>
            {pulse?.lastActivityAt && (
              <span className="ml-auto text-xs" style={{ color: MUTED }}>Last activity {timeAgo(pulse.lastActivityAt)}</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            {[
              { label: "New Today",    value: loading ? "—" : String(pulse?.newMembersToday ?? 0),     icon: UserPlus,   color: "#34d399" },
              { label: "Investments",  value: loading ? "—" : String(pulse?.newInvestmentsToday ?? 0), icon: TrendingUp, color: GOLD },
              { label: "Matches",      value: loading ? "—" : String(pulse?.recentMatchCount ?? 0),    icon: Zap,        color: "#60a5fa" },
              { label: "Income Today", value: loading ? "—" : Number(pulse?.recentMatchIncome ?? 0) > 0 ? fmtUSD(pulse!.recentMatchIncome) : "$0", icon: Award, color: "#a78bfa" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex flex-col items-center justify-center p-4 gap-1">
                  <Icon style={{ width: 16, height: 16, color: s.color }} />
                  <p style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
                  <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED }}>{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── BINARY HEALTH ─────────────────────────────────────────────────── */}
        <Section title="Binary Health" icon={<TrendingUp style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {(["LEFT", "RIGHT"] as const).map((side) => {
              const isLeft  = side === "LEFT";
              const color   = isLeft ? "#60a5fa" : "#a78bfa";
              const bv      = isLeft ? leftBV : rightBV;
              const members = isLeft ? (legBreakdown?.leftMembers ?? stats?.leftTeam ?? 0) : (legBreakdown?.rightMembers ?? stats?.rightTeam ?? 0);
              const investments = isLeft ? (legBreakdown?.leftInvestments ?? "—") : (legBreakdown?.rightInvestments ?? "—");
              const weeklyNew   = isLeft ? (legBreakdown?.leftWeeklyNew ?? 0) : (legBreakdown?.rightWeeklyNew ?? 0);
              const activeCount = isLeft ? (legBreakdown?.leftActiveCount ?? "—") : (legBreakdown?.rightActiveCount ?? "—");
              const isPower = legBreakdown?.powerLeg === side;
              const isWeak  = legBreakdown?.weakLeg  === side;
              return (
                <div key={side} className="rounded-2xl p-4"
                  style={{ background: `${color}08`, border: `1px solid ${color}28` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: "0.06em" }}>
                      {isLeft ? "← " : ""}LEFT{!isLeft ? " →" : ""}
                      {!isLeft ? " →" : ""}
                    </span>
                    {!loading && (isPower
                      ? <span style={{ fontSize: 9, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,0.1)", padding: "2px 6px", borderRadius: 4 }}>POWER</span>
                      : isWeak
                      ? <span style={{ fontSize: 9, fontWeight: 700, color: "#fb923c", background: "rgba(251,146,60,0.1)", padding: "2px 6px", borderRadius: 4 }}>WEAK</span>
                      : null
                    )}
                  </div>
                  {loading
                    ? <div className="space-y-2 animate-pulse">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />)}</div>
                    : <>
                        <LegRow label="Members"   value={members}          color={color} />
                        <LegRow label="BV"        value={`${bv.toFixed(0)} BV`} color={color} />
                        <LegRow label="Invested"  value={investments} />
                        <LegRow label="New Wk"    value={`+${weeklyNew}`} />
                        <LegRow label="Active"    value={activeCount}      color="#34d399" />
                      </>
                  }
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="mb-3">
              <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: "rgba(255,255,255,0.05)" }}>
                <div style={{ width: `${leftPct}%`,  background: "linear-gradient(90deg,#3b82f6,#60a5fa)", transition: "width 0.8s ease" }} />
                <div style={{ width: `${rightPct}%`, background: "linear-gradient(90deg,#a78bfa,#7c3aed)", transition: "width 0.8s ease" }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600 }}>{leftPct.toFixed(0)}% L</span>
                <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600 }}>R {rightPct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Power Leg",  value: loading ? "—" : (legBreakdown?.powerLeg ?? (leftBV >= rightBV ? "LEFT" : "RIGHT")), color: "#34d399" },
                { label: "Carry Fwd",  value: loading ? "—" : (() => { const t = Number(legBreakdown?.carryForwardLeft ?? 0) + Number(legBreakdown?.carryForwardRight ?? 0); return t > 0 ? `${t.toFixed(0)} BV` : "—"; })(), color: GOLD },
                { label: "Focus",      value: loading ? "—" : (legBreakdown?.weakLeg ?? (leftBV <= rightBV ? "LEFT" : "RIGHT")), color: "#fb923c" },
              ].map((s) => (
                <div key={s.label}>
                  <p style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: s.color, marginTop: 3 }}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: qualified ? "#34d399" : "rgba(170,179,197,0.35)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: qualified ? "#34d399" : MUTED }}>
                {qualified ? "Binary income qualified — earning matching payouts" : "Not yet qualified — need 2+ direct referrals"}
              </span>
            </div>
          </div>
        </Section>

        {/* ── QUICK STATS ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          {[
            { label: "Total Team", value: loading ? "—" : fmtK(stats?.totalTeam ?? 0), color: GOLD_L,    icon: Users       },
            { label: "Active",     value: loading ? "—" : String(stats?.activeMembers ?? 0),  color: "#34d399", icon: ShieldCheck },
            { label: "Inactive",   value: loading ? "—" : String(stats?.inactiveMembers ?? 0), color: MUTED,    icon: UserX       },
            { label: "Sponsored",  value: loading ? "—" : String(stats?.directReferrals ?? 0), color: GOLD,     icon: Star        },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-2xl p-4"
                style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                <div className="flex items-center justify-between mb-2">
                  <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED }}>{s.label}</p>
                  <Icon style={{ width: 12, height: 12, color: s.color }} />
                </div>
                <p style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
              </div>
            );
          })}
        </div>

        {/* ── BINARY TREE ───────────────────────────────────────────────────── */}
        <Section title="Binary Tree" icon={<GitBranch style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="rounded-2xl overflow-hidden"
            style={{ height: 480, background: "hsl(221 59% 9%)", border: "1px solid hsl(var(--border))", position: "relative" }}>
            {loading
              ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                  <div className="animate-spin h-8 w-8 rounded-full"
                    style={{ border: "2px solid rgba(212,175,55,0.15)", borderTopColor: GOLD }} />
                  <p style={{ fontSize: 12, color: MUTED }}>Building your network tree…</p>
                </div>
              : tree
              ? <ReactFlow
                  nodes={flowNodes as never}
                  edges={flowEdges as never}
                  nodeTypes={nodeTypes}
                  colorMode="dark"
                  fitView
                  fitViewOptions={{ padding: 0.28 }}
                  minZoom={0.2}
                  maxZoom={3}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  onNodeClick={(_, node) => {
                    if (node.type !== "emptySlot") handleNodeSelect(node.data as TreeNodeData);
                  }}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="rgba(212,175,55,0.025)" gap={28} size={1} />
                  <TreeInnerControls
                    depth={treeDepth}
                    setDepth={(d) => { setTreeDepth(d); }}
                    onFit={() => {}}
                  />
                </ReactFlow>
              : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                  <GitBranch style={{ width: 32, height: 32, color: "rgba(212,175,55,0.25)" }} />
                  <p style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>
                    No binary tree yet.<br />Place your first team member to begin.
                  </p>
                </div>
            }
          </div>
          <p className="mt-2 text-xs text-center" style={{ color: "rgba(170,179,197,0.35)" }}>
            Click a card to open member profile
          </p>
        </Section>

        {/* ── TEAM EXPLORER ─────────────────────────────────────────────────── */}
        <Section title="Team Explorer" icon={<Search style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="relative mb-2.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: MUTED }} />
            <input value={search}
              onChange={(e) => { setSearch(e.target.value); setMemberPage(1); }}
              placeholder="Search username or name…"
              className="w-full rounded-xl py-2.5 pl-9 pr-4 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "hsl(var(--foreground))" }} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: "none" }}>
            {FILTER_CHIPS.map(({ key, label, icon: Icon }) => {
              const active = filter === key;
              return (
                <button key={key} onClick={() => { setFilter(key); setMemberPage(1); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                  style={active
                    ? { background: "rgba(212,175,55,0.15)", color: GOLD, border: "1px solid rgba(212,175,55,0.3)" }
                    : { background: "rgba(255,255,255,0.04)", color: MUTED, border: "1px solid rgba(255,255,255,0.07)" }}>
                  <Icon style={{ width: 10, height: 10 }} />{label}
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl overflow-hidden mb-2"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            {memberLoading
              ? <Skeleton n={5} py="py-3" />
              : members.length === 0
              ? <div className="py-12 text-center">
                  <Users style={{ width: 28, height: 28, color: "rgba(212,175,55,0.2)", margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 13, color: MUTED }}>
                    {(stats?.totalTeam ?? 0) === 0
                      ? "No team members yet — share your referral link to start building."
                      : "No members match your search or filter."}
                  </p>
                </div>
              : <>
                  {members.map((m, i) => (
                    <div key={m.id} style={{ borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      <MemberCard m={m} onClick={() => setSelectedMember(m)} />
                    </div>
                  ))}
                  {memberTotal > 5 && <ViewMore label="View All Members" />}
                </>
            }
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p style={{ fontSize: 11, color: MUTED }}>{memberTotal} total</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setMemberPage((p) => Math.max(1, p - 1))} disabled={memberPage <= 1}
                  className="h-7 w-7 flex items-center justify-center rounded-lg disabled:opacity-30 transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", color: MUTED }}>
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span style={{ fontSize: 11, color: MUTED }}>{memberPage}/{totalPages}</span>
                <button onClick={() => setMemberPage((p) => Math.min(totalPages, p + 1))} disabled={memberPage >= totalPages}
                  className="h-7 w-7 flex items-center justify-center rounded-lg disabled:opacity-30 transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", color: MUTED }}>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* ── TOP PERFORMERS ────────────────────────────────────────────────── */}
        <Section title="Top Performers" icon={<Award style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            {loading
              ? <Skeleton n={3} />
              : performers.length === 0
              ? <div className="py-12 text-center">
                  <Award style={{ width: 28, height: 28, color: "rgba(212,175,55,0.2)", margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 13, color: MUTED }}>Top performers appear here when team members invest.</p>
                </div>
              : <>
                  {performers.slice(0, 5).map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 p-4"
                      style={{ borderBottom: i < Math.min(performers.length, 5) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: RANK_BG[i] }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: RANK_COLOR[i] }}>#{p.rank}</span>
                      </div>
                      <Av first={p.firstName} last={p.lastName} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground truncate">@{p.username}</p>
                          {p.isSponsored && <span style={{ fontSize: 8, fontWeight: 700, color: GOLD, background: "rgba(212,175,55,0.1)", padding: "1px 4px", borderRadius: 3 }}>S</span>}
                        </div>
                        <p style={{ fontSize: 10, color: MUTED }}>{p.directReferrals} ref{p.directReferrals !== 1 ? "s" : ""} · {p.status === "ACTIVE" ? "Active" : "Inactive"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{fmtUSD(p.totalInvested)}</p>
                        <p style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>invested</p>
                      </div>
                    </div>
                  ))}
                  {performers.length > 5 && <ViewMore label="View Complete Ranking" />}
                </>
            }
          </div>
        </Section>

        {/* ── TEAM ACTIVITY ─────────────────────────────────────────────────── */}
        <Section title="Team Activity" icon={<Activity style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            {loading
              ? <Skeleton n={5} />
              : activity.length === 0
              ? <div className="py-12 text-center">
                  <Activity style={{ width: 28, height: 28, color: "rgba(212,175,55,0.2)", margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 13, color: MUTED }}>Activity appears when team members invest or join.</p>
                </div>
              : <>
                  {activity.slice(0, 5).map((a, i) => {
                    const style = ACT_STYLE[a.type] ?? ACT_STYLE.join;
                    const Icon  = style.icon;
                    return (
                      <div key={a.id}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{ borderBottom: i < Math.min(activity.length, 5) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: style.bg }}>
                          <Icon style={{ width: 14, height: 14, color: style.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug">
                            <span className="font-semibold text-foreground">@{a.username}</span>
                            {" "}<span style={{ color: MUTED }}>{a.description}</span>
                          </p>
                        </div>
                        <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>{timeAgo(a.at)}</span>
                      </div>
                    );
                  })}
                  {activity.length > 5 && <ViewMore label="View Full Activity" />}
                </>
            }
          </div>
        </Section>

        {/* ── REFERRAL ──────────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 mb-2"
          style={{ background: "linear-gradient(135deg,rgba(212,175,55,0.06) 0%,rgba(212,175,55,0.02) 100%)", border: "1px solid rgba(212,175,55,0.2)" }}>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.15)" }}>
              <Link2 style={{ width: 15, height: 15, color: GOLD }} />
            </div>
            <h3 className="text-base font-semibold font-heading text-foreground">Grow Your Network</h3>
          </div>
          <p style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Share the correct link to place new members on the Left or Right side of your tree.
          </p>

          {/* Left + Right cards */}
          <div className="grid grid-cols-1 gap-3">
            {(["L", "R"] as const).map((leg) => {
              const isLeft = leg === "L";
              const legColor   = isLeft ? "#60a5fa" : GOLD;
              const legBg      = isLeft ? "rgba(96,165,250,0.08)"  : "rgba(212,175,55,0.08)";
              const legBorder  = isLeft ? "rgba(96,165,250,0.18)"  : "rgba(212,175,55,0.18)";
              const LegIcon    = isLeft ? ChevronLeft : ChevronRight;
              const label      = isLeft ? "Left Team" : "Right Team";
              const code       = loading || !profile ? "—" : `${profile.referralCode}-${leg}`;
              const link       = loading || !profile ? "—" : `${window.location.origin}/register?ref=${profile.referralCode}&leg=${leg}`;

              return (
                <div key={leg} className="rounded-xl p-3.5 space-y-2.5"
                  style={{ background: legBg, border: `1px solid ${legBorder}` }}>
                  {/* Label */}
                  <div className="flex items-center gap-1.5">
                    <LegIcon style={{ width: 14, height: 14, color: legColor }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: legColor, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                  </div>

                  {/* Code row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2 min-w-0"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Hash style={{ width: 11, height: 11, color: MUTED, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: GOLD_L, letterSpacing: "0.12em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {code}
                      </span>
                    </div>
                    <button onClick={() => copyCode(leg)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg shrink-0 transition-all"
                      style={{ background: copied === `code-${leg}` ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${copied === `code-${leg}` ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}` }}>
                      {copied === `code-${leg}`
                        ? <CheckCheck style={{ width: 13, height: 13, color: "#34d399" }} />
                        : <Copy style={{ width: 13, height: 13, color: MUTED }} />}
                    </button>
                  </div>

                  {/* Link row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg px-3 py-2 min-w-0"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{link}</p>
                    </div>
                    <button onClick={() => copyLink(leg)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg shrink-0 transition-all"
                      style={{ background: copied === `link-${leg}` ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${copied === `link-${leg}` ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}` }}>
                      {copied === `link-${leg}`
                        ? <CheckCheck style={{ width: 13, height: 13, color: "#34d399" }} />
                        : <Copy style={{ width: 13, height: 13, color: MUTED }} />}
                    </button>
                    <button onClick={() => void shareLink(leg)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg shrink-0 transition-all"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <Share2 style={{ width: 13, height: 13, color: MUTED }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </PageContainer>

      {/* ── Member Drawer ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedMember && !journeyOpen && (
          <MemberDrawer
            key={selectedMember.id}
            member={selectedMember}
            onClose={() => setSelectedMember(null)}
            onJourney={() => setJourneyOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* ── Income Journey Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedMember && journeyOpen && (
          <IncomeJourneyModal
            key={`journey-${selectedMember.id}`}
            member={selectedMember}
            onClose={() => setJourneyOpen(false)}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
