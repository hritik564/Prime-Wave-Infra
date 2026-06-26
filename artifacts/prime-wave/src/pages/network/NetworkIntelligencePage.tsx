import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, UserCheck, UserX, Copy, CheckCheck,
  Search, Award, Activity, Brain, GitBranch, UserPlus,
  X, ChevronLeft, ChevronRight, Link2, Target, Zap,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import {
  getProfile, getNetworkStats, getNetworkInsights,
  getBinaryTree, getBvSummary, getNetworkMembers,
  getTopPerformers, getTeamActivity,
} from "@/lib/api";
import type {
  ProfileData, NetworkStats, NetworkInsight, BinaryTreeNode,
  BvSummary, NetworkMember, TopPerformer, TeamActivityItem,
} from "@/lib/api";

// ── Constants ──────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.55)";

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

// ── Inline Avatar ─────────────────────────────────────────────────────────────
function Av({ first, last, size = 36 }: { first: string; last: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.07))",
      border: "1px solid rgba(212,175,55,0.2)", color: GOLD,
      fontWeight: 700, fontSize: size < 36 ? 10 : 12,
    }}>
      {initials(first, last)}
    </div>
  );
}

// ── Custom RF Node Data type ───────────────────────────────────────────────────
interface TreeNodeData extends Record<string, unknown> {
  id:                  string;
  username:            string;
  firstName:           string;
  lastName:            string;
  status:              string;
  position:            "LEFT" | "RIGHT" | null;
  directReferralCount: number;
  onSelect?:           (data: TreeNodeData) => void;
}

// ── RF Custom Nodes — MUST be outside component ────────────────────────────────
function RootNode({ data }: { data: TreeNodeData }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(212,175,55,0.14) 0%, rgba(212,175,55,0.05) 100%)",
      border: "2px solid rgba(212,175,55,0.5)", borderRadius: 14,
      padding: "10px 14px", minWidth: 155,
      boxShadow: "0 0 24px rgba(212,175,55,0.18), 0 4px 20px rgba(0,0,0,0.5)",
    }}>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(212,175,55,0.55)", width: 8, height: 8, border: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 15, flexShrink: 0,
          background: "rgba(212,175,55,0.14)", border: "1px solid rgba(212,175,55,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: GOLD_L, fontSize: 10, fontWeight: 800,
        }}>{initials(data.firstName, data.lastName)}</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD_L, lineHeight: 1.2 }}>You</div>
          <div style={{ fontSize: 9, color: "rgba(212,175,55,0.5)", lineHeight: 1.3 }}>@{data.username}</div>
        </div>
      </div>
      <div style={{ marginTop: 7, fontSize: 9, color: "rgba(212,175,55,0.5)", textAlign: "center" }}>
        {data.directReferralCount} direct ref{data.directReferralCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function MemberNode({ data }: { data: TreeNodeData }) {
  const isActive = data.status === "ACTIVE";
  const isLeft   = data.position === "LEFT";
  return (
    <div
      onClick={() => data.onSelect?.(data)}
      style={{
        background: "hsl(221 59% 10%)",
        border: `1.5px solid ${isActive ? "rgba(52,211,153,0.28)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 12, padding: "8px 12px", minWidth: 140,
        cursor: "pointer", boxShadow: "0 4px 18px rgba(0,0,0,0.4)",
        transition: "border-color 0.15s",
      }}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: "rgba(255,255,255,0.14)", width: 6, height: 6, border: "none" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.14)", width: 6, height: 6, border: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: GOLD, fontSize: 9, fontWeight: 800,
          }}>{initials(data.firstName, data.lastName)}</div>
          <div style={{
            position: "absolute", bottom: 0, right: 0, width: 7, height: 7,
            borderRadius: "50%", background: isActive ? "#34d399" : "rgba(170,179,197,0.3)",
            border: "1.5px solid hsl(221 59% 10%)",
          }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))", lineHeight: 1.2 }}>
            @{data.username}
          </div>
          <div style={{ fontSize: 9, color: MUTED, lineHeight: 1.3, marginTop: 1 }}>
            {data.directReferralCount} ref{data.directReferralCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
        color: isLeft ? "#60a5fa" : "#a78bfa",
        background: isLeft ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)",
        padding: "2px 6px", borderRadius: 4,
      }}>
        {data.position ?? "—"} ARM
      </span>
    </div>
  );
}

function EmptySlotNode({ data }: { data: { side: string } }) {
  const isLeft = data.side === "LEFT";
  return (
    <div style={{
      background: "rgba(255,255,255,0.015)",
      border: `1px dashed ${isLeft ? "rgba(96,165,250,0.2)" : "rgba(167,139,250,0.2)"}`,
      borderRadius: 12, padding: "10px 16px", minWidth: 120,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 4,
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "rgba(255,255,255,0.08)", width: 6, height: 6, border: "none" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.08)", width: 6, height: 6, border: "none" }} />
      <span style={{ fontSize: 16, color: isLeft ? "rgba(96,165,250,0.35)" : "rgba(167,139,250,0.35)", lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: isLeft ? "rgba(96,165,250,0.4)" : "rgba(167,139,250,0.4)" }}>
        Open {data.side}
      </span>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  rootNode:   RootNode   as never,
  memberNode: MemberNode as never,
  emptySlot:  EmptySlotNode as never,
};

// ── Tree → React Flow elements ────────────────────────────────────────────────
function treeToFlowElements(
  root:          BinaryTreeNode,
  currentUserId: string,
  maxDepth:      number,
  onSelect:      (data: TreeNodeData) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const V_GAP  = 130;
  const H_BASE = 75 * Math.pow(2, maxDepth - 1);

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
          id: emptyId,
          position: { x, y: depth * V_GAP },
          type: "emptySlot",
          data: { side },
          draggable: false,
        } as Node);
        edges.push({
          id: `e-${parentId}-${emptyId}`,
          source: parentId,
          target: emptyId,
          type: "smoothstep",
          style: {
            stroke: side === "LEFT" ? "rgba(96,165,250,0.16)" : "rgba(167,139,250,0.16)",
            strokeDasharray: "4,4",
            strokeWidth: 1.5,
          },
        } as Edge);
      }
      return;
    }

    const isRoot = node.id === currentUserId;
    nodes.push({
      id: node.id,
      position: { x, y: depth * V_GAP },
      type: isRoot ? "rootNode" : "memberNode",
      data: {
        id:                  node.id,
        username:            node.username,
        firstName:           node.firstName,
        lastName:            node.lastName,
        status:              node.status,
        position:            node.position,
        directReferralCount: node.directReferralCount,
        onSelect,
      },
      draggable: false,
    } as Node);

    if (parentId && side) {
      const isLeft = side === "LEFT";
      edges.push({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep",
        label: side,
        labelStyle: { fill: isLeft ? "#60a5fa" : "#a78bfa", fontSize: 9, fontWeight: 700 },
        labelBgStyle: { fill: "hsl(221 59% 10%)", fillOpacity: 0.9 },
        labelBgPadding: [2, 4] as [number, number],
        style: {
          stroke: isLeft ? "rgba(96,165,250,0.5)" : "rgba(167,139,250,0.5)",
          strokeWidth: 2,
        },
      } as Edge);
    }

    walk(node.left,  depth + 1, x - hOffset, node.id, "LEFT");
    walk(node.right, depth + 1, x + hOffset, node.id, "RIGHT");
  }

  walk(root, 0, 0, null, null);
  return { nodes, edges };
}

// ── Insight meta ──────────────────────────────────────────────────────────────
const INSIGHT_STYLE = {
  success: { bg: "rgba(52,211,153,0.07)",  border: "rgba(52,211,153,0.22)",  color: "#34d399" },
  warning: { bg: "rgba(251,146,60,0.07)",  border: "rgba(251,146,60,0.22)",  color: "#fb923c" },
  alert:   { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.22)",   color: "#ef4444" },
  info:    { bg: "rgba(96,165,250,0.07)",  border: "rgba(96,165,250,0.22)",  color: "#60a5fa" },
  gold:    { bg: "rgba(212,175,55,0.07)",  border: "rgba(212,175,55,0.25)",  color: GOLD },
};
const INSIGHT_ICON = {
  success: UserCheck,
  warning: Zap,
  alert:   Target,
  info:    Activity,
  gold:    Award,
};

// ── InsightCard ───────────────────────────────────────────────────────────────
function InsightCard({ insight }: { insight: NetworkInsight }) {
  const s    = INSIGHT_STYLE[insight.type];
  const Icon = INSIGHT_ICON[insight.type];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="shrink-0 w-64 rounded-2xl p-4"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${s.color}18`,
        }}>
          <Icon style={{ width: 14, height: 14, color: s.color }} />
        </div>
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
    </motion.div>
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
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">@{m.username}</p>
          {m.position && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              color: m.position === "LEFT" ? "#60a5fa" : "#a78bfa",
              background: m.position === "LEFT" ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)",
              padding: "1px 5px", borderRadius: 4,
            }}>{m.position[0]}</span>
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

// ── Member Drawer ─────────────────────────────────────────────────────────────
function MemberDrawer({ member, onClose }: { member: NetworkMember; onClose: () => void }) {
  const isActive = member.status === "ACTIVE";
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative w-full max-w-sm h-full overflow-y-auto"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        style={{ background: "hsl(var(--card))", borderLeft: "1px solid hsl(var(--border))" }}>
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-semibold text-foreground">Member Profile</p>
            <button onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: MUTED }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Avatar + names */}
          <div className="flex flex-col items-center mb-6">
            <div style={{ position: "relative" }}>
              <Av first={member.firstName} last={member.lastName} size={64} />
              <div style={{
                position: "absolute", bottom: 2, right: 2, width: 14, height: 14,
                borderRadius: "50%", background: isActive ? "#34d399" : "rgba(170,179,197,0.4)",
                border: "2px solid hsl(var(--card))",
              }} />
            </div>
            <p className="mt-3 text-base font-bold text-foreground">@{member.username}</p>
            <p className="text-sm" style={{ color: MUTED }}>{member.firstName} {member.lastName}</p>
            <span style={{
              marginTop: 8, padding: "3px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: isActive ? "rgba(52,211,153,0.1)" : "rgba(170,179,197,0.08)",
              color: isActive ? "#34d399" : MUTED,
              border: `1px solid ${isActive ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.07)"}`,
            }}>{isActive ? "Active" : "Inactive"}</span>
          </div>
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: "Position",    value: member.position ?? "—",   color: member.position === "LEFT" ? "#60a5fa" : member.position === "RIGHT" ? "#a78bfa" : MUTED },
              { label: "Direct Refs", value: String(member.directReferrals), color: GOLD },
              { label: "Active Plans", value: String(member.activeInvestments), color: "#34d399" },
              { label: "Invested",    value: member.activeInvestments > 0 ? fmtUSD(member.investedAmount) : "—", color: GOLD },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 5 }}>
                  {s.label}
                </p>
                <p style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-center" style={{ color: MUTED }}>
            Joined {new Date(member.joinedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  title, icon, children, extra,
}: {
  title:    string;
  icon:     React.ReactNode;
  children: React.ReactNode;
  extra?:   React.ReactNode;
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

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function Skeleton({ n = 4, py = "py-3" }: { n?: number; py?: string }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={`flex items-center gap-3 px-4 ${py} animate-pulse`}
          style={{ borderBottom: i < n - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <div className="h-9 w-9 rounded-full shrink-0" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 rounded" style={{ background: "rgba(255,255,255,0.05)", width: "40%" }} />
            <div className="h-2 rounded" style={{ background: "rgba(255,255,255,0.04)", width: "60%" }} />
          </div>
        </div>
      ))}
    </>
  );
}

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
  const [search, setSearch]             = useState("");
  const [filter, setFilter]             = useState<"all" | "active" | "inactive">("all");
  const [treeDepth, setTreeDepth]       = useState(3);
  const [selectedMember, setSelectedMember] = useState<NetworkMember | null>(null);
  const [copied, setCopied]             = useState<"code" | "link" | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);

  // ── Initial parallel load ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [r0, r1, r2, r3, r4, r5, r6] = await Promise.allSettled([
        getProfile(),
        getNetworkStats(),
        getNetworkInsights(),
        getBvSummary(),
        getBinaryTree(3),
        getTopPerformers(),
        getTeamActivity(),
      ]);
      if (r0.status === "fulfilled") setProfile(r0.value);
      if (r1.status === "fulfilled") setStats(r1.value);
      if (r2.status === "fulfilled") setInsights(r2.value.insights);
      if (r3.status === "fulfilled") setBv(r3.value);
      if (r4.status === "fulfilled") setTree(r4.value);
      if (r5.status === "fulfilled") setPerformers(r5.value.performers);
      if (r6.status === "fulfilled") setActivity(r6.value.activities);
      setLoading(false);
    }
    void load();
  }, []);

  // ── Members: re-load on search / filter / page change ─────────────────────
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    async function loadMembers() {
      setMemberLoading(true);
      try {
        const res = await getNetworkMembers({ page: memberPage, limit: 10, search, filter });
        if (!cancelled) { setMembers(res.members); setMemberTotal(res.total); }
      } catch { /* ignore */ } finally {
        if (!cancelled) setMemberLoading(false);
      }
    }
    void loadMembers();
    return () => { cancelled = true; };
  }, [loading, search, filter, memberPage]);

  // ── Tree depth change → re-fetch ───────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    getBinaryTree(treeDepth).then(setTree).catch(() => {});
  }, [treeDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Node select callback (stable) ──────────────────────────────────────────
  const handleNodeSelect = useCallback((data: TreeNodeData) => {
    setSelectedMember({
      id:               data.id,
      username:         data.username,
      firstName:        data.firstName,
      lastName:         data.lastName,
      status:           data.status,
      position:         data.position,
      joinedAt:         new Date().toISOString(),
      directReferrals:  data.directReferralCount,
      activeInvestments: 0,
      investedAmount:   "0",
      plans:            [],
    });
  }, []);

  // ── React Flow elements (memo) ─────────────────────────────────────────────
  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!tree || !profile) return { nodes: [], edges: [] };
    return treeToFlowElements(tree, profile.id, treeDepth, handleNodeSelect);
  }, [tree, profile?.id, treeDepth, handleNodeSelect]);

  // ── Copy helpers ───────────────────────────────────────────────────────────
  const copyCode = useCallback(() => {
    if (!profile) return;
    void navigator.clipboard.writeText(profile.referralCode);
    setCopied("code"); setTimeout(() => setCopied(null), 2000);
  }, [profile]);

  const copyLink = useCallback(() => {
    if (!profile) return;
    void navigator.clipboard.writeText(`${window.location.origin}/register?ref=${profile.referralCode}`);
    setCopied("link"); setTimeout(() => setCopied(null), 2000);
  }, [profile]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(memberTotal / 10));
  const leftBV  = Number(bvSummary?.leftBV  ?? stats?.leftBV  ?? 0);
  const rightBV = Number(bvSummary?.rightBV ?? stats?.rightBV ?? 0);
  const totalBV = leftBV + rightBV;
  const leftPct  = totalBV > 0 ? (leftBV  / totalBV) * 100 : 50;
  const rightPct = totalBV > 0 ? (rightBV / totalBV) * 100 : 50;
  const qualified = bvSummary?.binaryQualified ?? false;

  const RANK_COLOR = [GOLD, "#a8a8a8", "#cd7f32", MUTED, MUTED];
  const RANK_BG    = ["rgba(212,175,55,0.12)", "rgba(168,168,168,0.07)", "rgba(205,127,50,0.07)", "transparent", "transparent"];

  return (
    <AppLayout pageTitle="Network Intelligence" notificationCount={0}>
      <PageContainer>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="relative mb-5 lg:mb-6 rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(10,22,40,1) 0%, rgba(14,27,55,1) 55%, rgba(10,22,40,1) 100%)",
            border: "1px solid rgba(212,175,55,0.22)", padding: "22px 20px",
          }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 55% 45% at 8% 50%, rgba(212,175,55,0.07) 0%, transparent 70%)",
          }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Users style={{ width: 12, height: 12, color: "rgba(212,175,55,0.6)" }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(212,175,55,0.6)" }}>
                Network Intelligence Center
              </span>
            </div>
            <p style={{ fontSize: 36, fontWeight: 800, color: GOLD_L, lineHeight: 1.05, marginBottom: 4 }}>
              {loading ? "—" : fmtK(stats?.totalTeam ?? 0)}
              <span style={{ fontSize: 18, fontWeight: 500, color: "rgba(243,211,122,0.5)", marginLeft: 8 }}>members</span>
            </p>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 18 }}>Your binary network across all levels</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { label: "Direct Refs", value: loading ? "—" : String(stats?.directReferrals ?? 0), color: "#60a5fa" },
                { label: "Left Arm",    value: loading ? "—" : String(stats?.leftTeam ?? 0),        color: "#60a5fa" },
                { label: "Right Arm",   value: loading ? "—" : String(stats?.rightTeam ?? 0),       color: "#a78bfa" },
                { label: "This Week",   value: loading ? "—" : `+${stats?.weeklyNew ?? 0}`,          color: GOLD },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-3 text-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 5 }}>{s.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <span style={{ fontSize: 11, color: "#34d399" }}>
                <span style={{ fontWeight: 700 }}>{loading ? "—" : (stats?.activeMembers ?? 0)}</span> active
              </span>
              <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: MUTED }}>
                <span style={{ fontWeight: 700 }}>{loading ? "—" : (stats?.inactiveMembers ?? 0)}</span> inactive
              </span>
            </div>
          </div>
        </motion.div>

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

        {/* ── BINARY HEALTH ─────────────────────────────────────────────────── */}
        <Section title="Binary Health" icon={<TrendingUp style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="rounded-2xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="grid grid-cols-2 gap-4 mb-5">
              {[
                { label: "Left Arm BV",  value: loading ? "—" : `${leftBV.toFixed(2)}`,  color: "#60a5fa", icon: "←" },
                { label: "Right Arm BV", value: loading ? "—" : `${rightBV.toFixed(2)}`, color: "#a78bfa", icon: "→" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-4 text-center"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</p>
                  <p style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, marginBottom: 6 }}>{s.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
                  <p style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>BV</p>
                </div>
              ))}
            </div>

            {/* BV balance bar */}
            <div className="mb-3">
              <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex", background: "rgba(255,255,255,0.06)" }}>
                <div style={{ width: `${leftPct}%`, background: "linear-gradient(90deg,#3b82f6,#60a5fa)", transition: "width 0.7s ease", borderRadius: "5px 0 0 5px" }} />
                <div style={{ width: `${rightPct}%`, background: "linear-gradient(90deg,#a78bfa,#7c3aed)", transition: "width 0.7s ease", borderRadius: "0 5px 5px 0" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600 }}>{leftPct.toFixed(0)}% Left</span>
                <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600 }}>Right {rightPct.toFixed(0)}%</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: qualified ? "#34d399" : "rgba(170,179,197,0.35)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: qualified ? "#34d399" : MUTED }}>
                {qualified ? "Binary income qualified — earning matching payouts" : "Not yet qualified — need 2+ direct referrals"}
              </span>
            </div>
          </div>
        </Section>

        {/* ── BINARY TREE ───────────────────────────────────────────────────── */}
        <Section
          title="Binary Tree"
          icon={<GitBranch style={{ width: 15, height: 15, color: GOLD }} />}
          extra={
            <div className="flex items-center gap-1.5">
              {([2, 3, 4] as const).map((d) => (
                <button key={d} onClick={() => setTreeDepth(d)}
                  className="px-3 py-1.5 text-xs rounded-lg font-medium transition-all"
                  style={treeDepth === d
                    ? { background: "rgba(212,175,55,0.15)", color: GOLD, border: "1px solid rgba(212,175,55,0.3)" }
                    : { background: "rgba(255,255,255,0.04)", color: MUTED, border: "1px solid rgba(255,255,255,0.07)" }}>
                  L{d}
                </button>
              ))}
            </div>
          }
        >
          <div className="rounded-2xl overflow-hidden"
            style={{ height: 430, background: "hsl(221 59% 9%)", border: "1px solid hsl(var(--border))" }}>
            {loading
              ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                  <div className="animate-spin h-8 w-8 rounded-full"
                    style={{ border: "2px solid rgba(212,175,55,0.15)", borderTopColor: GOLD }} />
                  <p style={{ fontSize: 12, color: MUTED }}>Loading tree…</p>
                </div>
              : tree
              ? <ReactFlow
                  nodes={flowNodes} edges={flowEdges}
                  nodeTypes={nodeTypes}
                  fitView fitViewOptions={{ padding: 0.25 }}
                  minZoom={0.25} maxZoom={2.5}
                  nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="rgba(212,175,55,0.03)" gap={24} size={1} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
                  <GitBranch style={{ width: 32, height: 32, color: "rgba(212,175,55,0.25)" }} />
                  <p style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>
                    No binary tree yet.<br />Place your first team member to begin.
                  </p>
                </div>
            }
          </div>
        </Section>

        {/* ── TEAM EXPLORER ─────────────────────────────────────────────────── */}
        <Section title="Team Explorer" icon={<Search style={{ width: 15, height: 15, color: GOLD }} />}>
          {/* search + filter */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: MUTED }} />
              <input value={search}
                onChange={(e) => { setSearch(e.target.value); setMemberPage(1); }}
                placeholder="Search username or name…"
                className="w-full rounded-xl py-2.5 pl-9 pr-4 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "hsl(var(--foreground))" }} />
            </div>
            <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {(["all", "active", "inactive"] as const).map((f) => (
                <button key={f} onClick={() => { setFilter(f); setMemberPage(1); }}
                  className="px-3 py-1 text-xs font-medium rounded-lg transition-all capitalize"
                  style={filter === f ? { background: "rgba(212,175,55,0.15)", color: GOLD } : { color: MUTED }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* list */}
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
                      : "No members match your search."}
                  </p>
                </div>
              : members.map((m, i) => (
                  <div key={m.id} style={{ borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <MemberCard m={m} onClick={() => setSelectedMember(m)} />
                  </div>
                ))
            }
          </div>

          {/* pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p style={{ fontSize: 11, color: MUTED }}>{memberTotal} total members</p>
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
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            {loading
              ? <Skeleton n={3} />
              : performers.length === 0
              ? <div className="py-12 text-center">
                  <Award style={{ width: 28, height: 28, color: "rgba(212,175,55,0.2)", margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 13, color: MUTED }}>Top performers appear here when team members invest.</p>
                </div>
              : performers.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 p-4"
                    style={{ borderBottom: i < performers.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: RANK_BG[i],
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: RANK_COLOR[i] }}>#{p.rank}</span>
                    </div>
                    <Av first={p.firstName} last={p.lastName} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">@{p.username}</p>
                      <p style={{ fontSize: 10, color: MUTED }}>
                        {p.directReferrals} ref{p.directReferrals !== 1 ? "s" : ""} · {p.status === "ACTIVE" ? "Active" : "Inactive"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{fmtUSD(p.totalInvested)}</p>
                      <p style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>invested</p>
                    </div>
                  </div>
                ))
            }
          </div>
        </Section>

        {/* ── TEAM ACTIVITY ─────────────────────────────────────────────────── */}
        <Section title="Team Activity" icon={<Activity style={{ width: 15, height: 15, color: GOLD }} />}>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            {loading
              ? <Skeleton n={5} />
              : activity.length === 0
              ? <div className="py-12 text-center">
                  <Activity style={{ width: 28, height: 28, color: "rgba(212,175,55,0.2)", margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 13, color: MUTED }}>
                    Activity appears when team members invest or join.
                  </p>
                </div>
              : activity.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < activity.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: a.type === "investment" ? "rgba(212,175,55,0.1)" : "rgba(52,211,153,0.1)",
                    }}>
                      {a.type === "investment"
                        ? <TrendingUp style={{ width: 13, height: 13, color: GOLD }} />
                        : <UserPlus  style={{ width: 13, height: 13, color: "#34d399" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold text-foreground">@{a.username}</span>
                        {" "}<span style={{ color: MUTED }}>{a.description}</span>
                      </p>
                    </div>
                    <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>{timeAgo(a.at)}</span>
                  </div>
                ))
            }
          </div>
        </Section>

        {/* ── REFERRAL ──────────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 mb-2"
          style={{
            background: "linear-gradient(135deg, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.02) 100%)",
            border: "1px solid rgba(212,175,55,0.2)",
          }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.15)" }}>
              <Link2 style={{ width: 15, height: 15, color: GOLD }} />
            </div>
            <h3 className="text-base font-semibold font-heading text-foreground">Referral Link</h3>
          </div>
          <p style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            Share your unique link to grow your network and unlock more income.
          </p>
          <div className="space-y-2.5">
            {/* Code row */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl px-4 py-2.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>Code</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: GOLD_L, letterSpacing: "0.14em" }}>
                  {loading ? "—" : (profile?.referralCode ?? "—")}
                </span>
              </div>
              <button onClick={copyCode}
                className="h-10 w-10 flex items-center justify-center rounded-xl shrink-0 transition-all"
                style={{
                  background: copied === "code" ? "rgba(52,211,153,0.12)" : "rgba(212,175,55,0.09)",
                  border: `1px solid ${copied === "code" ? "rgba(52,211,153,0.3)" : "rgba(212,175,55,0.2)"}`,
                }}>
                {copied === "code"
                  ? <CheckCheck style={{ width: 14, height: 14, color: "#34d399" }} />
                  : <Copy       style={{ width: 14, height: 14, color: GOLD }} />}
              </button>
            </div>
            {/* Link row */}
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl px-4 py-2.5 overflow-hidden"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {!loading && profile
                    ? `${window.location.origin}/register?ref=${profile.referralCode}`
                    : "—"}
                </p>
              </div>
              <button onClick={copyLink}
                className="h-10 w-10 flex items-center justify-center rounded-xl shrink-0 transition-all"
                style={{
                  background: copied === "link" ? "rgba(52,211,153,0.12)" : "rgba(212,175,55,0.09)",
                  border: `1px solid ${copied === "link" ? "rgba(52,211,153,0.3)" : "rgba(212,175,55,0.2)"}`,
                }}>
                {copied === "link"
                  ? <CheckCheck style={{ width: 14, height: 14, color: "#34d399" }} />
                  : <Copy       style={{ width: 14, height: 14, color: GOLD }} />}
              </button>
            </div>
          </div>
        </div>

      </PageContainer>

      {/* ── Member Drawer ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedMember && (
          <MemberDrawer
            key={selectedMember.id}
            member={selectedMember}
            onClose={() => setSelectedMember(null)}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
