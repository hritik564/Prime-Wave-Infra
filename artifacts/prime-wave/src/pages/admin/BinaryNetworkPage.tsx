import { useState, useMemo, memo, useCallback } from "react";
import AdminLayout from "./AdminLayout";
import BinaryNetworkDrawer, {
  BinaryNode, NodeStatus, BinaryRank, Position,
  MatchEvent, BinaryEvent, NetworkWarning, AuditEntry,
} from "./BinaryNetworkDrawer";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  RefreshCw, Download, Settings, Zap, Search,
  ChevronLeft, ChevronRight, MoreVertical, ChevronDown,
  GitBranch, Users, TrendingUp, Activity, Shield, BarChart2,
  Clock, Star,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const K = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toFixed(0);

// ─── Config maps ───────────────────────────────────────────────────────────────
const STATUS_CFG: Record<NodeStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: "Active",    color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  INACTIVE:  { label: "Inactive",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  SUSPENDED: { label: "Suspended", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};
const RANK_CFG: Record<BinaryRank, { color: string }> = {
  UNRANKED: { color: MUTED     },
  STARTER:  { color: "#60a5fa" },
  GROWTH:   { color: "#34d399" },
  PRO:      { color: GOLD      },
  ELITE:    { color: "#a78bfa" },
  PLATINUM: { color: "#f0abfc" },
  DIAMOND:  { color: "#67e8f9" },
};

// ─── Mock data factory ─────────────────────────────────────────────────────────
let _nid = 0;
const uid  = () => `PW${String(++_nid).padStart(7, "0")}`;
const rand = (a: number, b: number) => Math.round((Math.random() * (b - a) + a));
const randf = (a: number, b: number) => Math.round((Math.random() * (b - a) + a) * 100) / 100;

const NAMES = [
  ["Alex","Chen"],["Ben","Osei"],["Carlos","Vega"],["Diana","Patel"],["Edward","Kim"],
  ["Fatima","Hassan"],["Grace","Liu"],["Hassan","Malik"],["Iris","Santos"],["James","Nwosu"],
  ["Kwame","Asante"],["Leila","Ahmad"],["Marco","Ferrari"],["Nadia","Petrov"],["Omar","Sheikh"],
  ["Priya","Sharma"],["Quinn","Moore"],["Ravi","Gupta"],["Sara","Williams"],["Tunde","Adeyemi"],
  ["Uma","Patel"],["Victor","Okonkwo"],["Wendy","Zhang"],["Xavier","Martin"],["Yemi","Balogun"],
  ["Zara","Khan"],["Aisha","Diallo"],["Bruno","Costa"],["Clara","Anderson"],["David","Chukwu"],
  ["Elena","Ivanova"],["Femi","Taiwo"],["George","Papadopoulos"],["Hannah","Müller"],["Ibrahim","Al-Rashid"],
  ["Julia","Nakamura"],["Kevin","O'Brien"],["Lina","Bergström"],["Mohammed","Al-Farsi"],["Nina","Johansson"],
  ["Oscar","Fernández"],["Paula","Rodrigues"],["Raj","Mehta"],["Sophie","Dupont"],["Tariq","Al-Amin"],
  ["Uche","Eze"],["Valentina","Romano"],["William","Thompson"],["Xin","Li"],["Yara","Khalid"],
];
const RANKS: BinaryRank[] = ["UNRANKED","STARTER","GROWTH","PRO","ELITE","PLATINUM","DIAMOND"];
const NEXT_RANKS: Record<BinaryRank, BinaryRank | null> = {
  UNRANKED: "STARTER", STARTER: "GROWTH", GROWTH: "PRO", PRO: "ELITE", ELITE: "PLATINUM", PLATINUM: "DIAMOND", DIAMOND: null,
};
const PLANS = ["Starter","Growth","Pro","Elite","Platinum",null,null];
const STATUSES: NodeStatus[] = ["ACTIVE","ACTIVE","ACTIVE","ACTIVE","ACTIVE","INACTIVE","SUSPENDED"];
const POSITIONS: Position[] = ["LEFT","RIGHT"];

function makeMatchHistory(i: number): MatchEvent[] {
  return Array.from({ length: 10 }, (_, j) => {
    const lBV = rand(200, 5000), rBV = rand(200, 5000);
    const matched = Math.min(lBV, rBV);
    return {
      id: `MH-${i}-${j}`,
      timestamp: new Date(Date.now() - (j * 24 + i) * 3600000),
      leftBV: lBV, rightBV: rBV,
      matched: matched * 2,
      reward: randf(matched * 0.005, matched * 0.01),
      carryForward: Math.abs(lBV - rBV),
    };
  });
}

function makeEvents(i: number): BinaryEvent[] {
  const types: BinaryEvent["type"][] = ["MATCH","BV_CREDIT","RANK_UP","JOIN","CARRY_RESET","PLACEMENT"];
  const descs: Record<BinaryEvent["type"], string> = {
    MATCH:       "Binary match cycle executed",
    BV_CREDIT:   "BV credited from downline investment",
    RANK_UP:     "Rank upgraded by income engine",
    JOIN:        "Member joined the binary network",
    CARRY_RESET: "Carry forward reset by admin",
    PLACEMENT:   "Placement adjusted in binary tree",
  };
  return Array.from({ length: 10 }, (_, j) => ({
    id: `EV-${i}-${j}`,
    type: types[(i + j) % types.length],
    description: descs[types[(i + j) % types.length]],
    timestamp: new Date(Date.now() - (j * 12 + i) * 3600000),
    value: j % 3 === 0 ? randf(50, 500) : undefined,
  }));
}

function makeWarnings(i: number, leftBV: number, rightBV: number, status: NodeStatus): NetworkWarning[] {
  const w: NetworkWarning[] = [];
  const ratio = leftBV > 0 && rightBV > 0 ? Math.max(leftBV, rightBV) / Math.min(leftBV, rightBV) : 1;
  if (ratio > 3)      w.push({ id: `W-${i}-0`, type: "LARGE_IMBALANCE", message: `Leg ratio is ${ratio.toFixed(1)}x. Significant imbalance between left and right legs detected.`, severity: "error" });
  if (leftBV < 500)   w.push({ id: `W-${i}-1`, type: "WEAK_LEFT", message: `Left leg BV is below 500. Consider placing new members on the left side.`, severity: "warn" });
  if (rightBV < 500)  w.push({ id: `W-${i}-2`, type: "WEAK_RIGHT", message: `Right leg BV is below 500. Consider placing new members on the right side.`, severity: "warn" });
  if (status === "INACTIVE") w.push({ id: `W-${i}-3`, type: "INACTIVE_SPONSOR", message: "Member is inactive. Downlines may be orphaned if no action is taken.", severity: "error" });
  if (i % 7 === 0)    w.push({ id: `W-${i}-4`, type: "NO_REFERRALS", message: "No new referrals in the last 30 days. Network growth may stall.", severity: "warn" });
  if (i % 5 === 0)    w.push({ id: `W-${i}-5`, type: "HIGH_CARRY", message: "Carry forward BV is unusually high. This may indicate long-term leg imbalance.", severity: "warn" });
  return w;
}

function makeAudit(i: number): AuditEntry[] {
  const admins = ["superadmin@primewave.io","rewards@primewave.io","finance@primewave.io"];
  return [
    { id: `NAUD-${i}-0`, timestamp: new Date(Date.now() - 48 * 3600000 * (i + 1)), admin: admins[i % 3], action: "Binary Recalculated",    detail: "Manual recalculation triggered by admin." },
    { id: `NAUD-${i}-1`, timestamp: new Date(Date.now() - 96 * 3600000 * (i + 1)), admin: admins[(i+1) % 3], action: "Carry Forward Reset", detail: "Carry forward reset to 0 BV." },
    { id: `NAUD-${i}-2`, timestamp: new Date(Date.now() - 144 * 3600000 * (i+1)), admin: admins[(i+2) % 3], action: "Status Changed",       detail: "Status updated from INACTIVE to ACTIVE." },
  ];
}

function makeNode(i: number): BinaryNode {
  const [firstName, lastName] = NAMES[i % NAMES.length];
  const username = `${firstName.toLowerCase()}${i + 1}`;
  const rank = RANKS[Math.min(i % RANKS.length, RANKS.length - 1)];
  const nextRank = NEXT_RANKS[rank];
  const status = STATUSES[i % STATUSES.length];
  const leftBV = rand(100, 12000);
  const rightBV = rand(100, 12000);
  const carryForward = Math.abs(leftBV - rightBV);
  const matchedBV = Math.min(leftBV, rightBV);
  const sponsorIdx = Math.max(0, i - rand(1, 5));
  const [sFirst] = NAMES[sponsorIdx % NAMES.length];
  const sponsorUsername = `${sFirst.toLowerCase()}${sponsorIdx + 1}`;
  const parentIdx = Math.max(0, i - 1);
  const [pFirst] = NAMES[parentIdx % NAMES.length];
  const parentUsername = i === 0 ? null : `${pFirst.toLowerCase()}${parentIdx + 1}`;
  const leftChildIdx  = i * 2 + 1;
  const rightChildIdx = i * 2 + 2;
  const [lcFirst] = NAMES[leftChildIdx  % NAMES.length];
  const [rcFirst] = NAMES[rightChildIdx % NAMES.length];

  const rankProgress = rand(10, 95);
  const requirements = [
    { label: "Left Leg BV",     current: leftBV,         required: (RANKS.indexOf(rank) + 2) * 5000 },
    { label: "Right Leg BV",    current: rightBV,         required: (RANKS.indexOf(rank) + 2) * 5000 },
    { label: "Direct Referrals",current: rand(1, 20),    required: (RANKS.indexOf(rank) + 1) * 3     },
    { label: "Active Downlines",current: rand(5, 80),    required: (RANKS.indexOf(rank) + 1) * 10    },
  ];

  return {
    id: `n-${i}`, memberId: uid(), username, firstName, lastName,
    sponsor: sponsorUsername, sponsorUsername,
    position: POSITIONS[i % 2],
    leftBV, rightBV, carryForward, rank, status,
    plan: PLANS[i % PLANS.length] as string | null,
    directReferrals: rand(0, 25),
    todayMatch: randf(0, matchedBV * 0.01),
    weeklyMatch: randf(matchedBV * 0.01, matchedBV * 0.05),
    monthlyMatch: randf(matchedBV * 0.05, matchedBV * 0.15),
    lifetimeMatch: randf(matchedBV * 0.15, matchedBV * 0.6),
    parentUsername,
    leftChildUsername:  leftChildIdx  < 50 ? `${lcFirst.toLowerCase()}${leftChildIdx  + 1}` : null,
    rightChildUsername: rightChildIdx < 50 ? `${rcFirst.toLowerCase()}${rightChildIdx + 1}` : null,
    nextRank, rankProgress, rankRequirements: requirements,
    matchingHistory: makeMatchHistory(i),
    recentEvents: makeEvents(i),
    warnings: makeWarnings(i, leftBV, rightBV, status),
    auditLog: makeAudit(i),
  };
}

const INITIAL_NODES: BinaryNode[] = Array.from({ length: 50 }, (_, i) => makeNode(i));

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
      <div style={{ fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.92)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── Row action dropdown ───────────────────────────────────────────────────────
const RowActions = memo(function RowActions({ node, onView, onRecalculate, onResetCarry }: {
  node: BinaryNode;
  onView:        (n: BinaryNode) => void;
  onRecalculate: (n: BinaryNode) => void;
  onResetCarry:  (n: BinaryNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "View Network",     onClick: () => onView(node),        color: "rgba(255,255,255,0.75)" },
    { label: "View Binary Tree", onClick: () => onView(node),        color: "#818cf8"                },
    { label: "Inspect Member",   onClick: () => onView(node),        color: "rgba(255,255,255,0.75)" },
    { label: "Recalculate",      onClick: () => onRecalculate(node), color: GOLD_L                   },
    { label: "Reset Carry Fwd",  onClick: () => onResetCarry(node),  color: "#60a5fa"                },
    { label: "Audit Log",        onClick: () => onView(node),        color: MUTED                    },
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
              <button key={item.label} onClick={e => { e.stopPropagation(); item.onClick(); setOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: item.color }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// ─── Table row ─────────────────────────────────────────────────────────────────
const NetworkRow = memo(function NetworkRow({ node, onView, onRecalculate, onResetCarry, hovered, onHover }: {
  node: BinaryNode;
  onView:        (n: BinaryNode) => void;
  onRecalculate: (n: BinaryNode) => void;
  onResetCarry:  (n: BinaryNode) => void;
  hovered: boolean; onHover: (id: string | null) => void;
}) {
  const sc = STATUS_CFG[node.status];
  const rc = RANK_CFG[node.rank];
  const td: React.CSSProperties = { padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" };

  return (
    <tr onClick={() => onView(node)} onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)}
      style={{ cursor: "pointer", background: hovered ? "rgba(255,255,255,0.025)" : "transparent", borderBottom: `1px solid ${BORDER}`, transition: "background 0.12s" }}>
      <td style={{ ...td, paddingLeft: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(129,140,248,0.1)", border: "1.5px solid rgba(129,140,248,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#818cf8", flexShrink: 0 }}>
            {node.firstName[0]}{node.lastName[0]}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>@{node.username}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{node.firstName} {node.lastName}</div>
          </div>
        </div>
      </td>
      <td style={td}><span style={{ fontFamily: "monospace", fontSize: 11, color: MUTED }}>{node.memberId}</span></td>
      <td style={{ ...td, color: MUTED, fontSize: 11 }}>@{node.sponsorUsername}</td>
      <td style={td}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 5, background: node.position === "LEFT" ? "rgba(52,211,153,0.12)" : "rgba(96,165,250,0.12)", color: node.position === "LEFT" ? "#34d399" : "#60a5fa" }}>
          {node.position}
        </span>
      </td>
      <td style={{ ...td, color: "#34d399", fontWeight: 600 }}>{K(node.leftBV)}</td>
      <td style={{ ...td, color: "#60a5fa", fontWeight: 600 }}>{K(node.rightBV)}</td>
      <td style={{ ...td, color: "#fbbf24" }}>{K(node.carryForward)}</td>
      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: rc.color }}>{node.rank}</span></td>
      <td style={{ ...td, color: GOLD, fontWeight: 600 }}>{$(node.todayMatch)}</td>
      <td style={td}><span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "3px 9px", borderRadius: 5 }}>{sc.label}</span></td>
      <td style={{ ...td, paddingRight: 18 }} onClick={e => e.stopPropagation()}>
        <RowActions node={node} onView={onView} onRecalculate={onRecalculate} onResetCarry={onResetCarry} />
      </td>
    </tr>
  );
});

const SEL: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8,
  padding: "8px 28px 8px 11px", fontSize: 11, color: "rgba(255,255,255,0.7)", outline: "none",
  cursor: "pointer", appearance: "none",
};

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function BinaryNetworkPage() {
  const { toasts, toast, dismiss } = useToast();
  const [nodes,    setNodes]   = useState<BinaryNode[]>(() => INITIAL_NODES);
  const [search,   setSearch]  = useState("");
  const [fStatus,  setFStatus] = useState("");
  const [fRank,    setFRank]   = useState("");
  const [fPos,     setFPos]    = useState("");
  const [page,     setPage]    = useState(1);
  const PAGE_SIZE = 20;

  const [drawer,   setDrawer]  = useState<BinaryNode | null>(null);
  const [hovered,  setHovered] = useState<string | null>(null);
  const [cycling,  setCycling] = useState(false);

  // ── State helpers ────────────────────────────────────────────────────────────
  const updateNode = useCallback((id: string, patch: Partial<BinaryNode>) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, ...patch } : n));
    setDrawer(d => d?.id === id ? { ...d, ...patch } : d);
  }, []);

  const handleRecalculate = useCallback((node: BinaryNode) => {
    const newAudit: AuditEntry = {
      id: `NAUD-RC-${Date.now()}`, timestamp: new Date(),
      admin: "superadmin@primewave.io", action: "Binary Recalculated",
      detail: "Manual recalculation triggered by admin. BV totals verified.",
    };
    const newEvent: BinaryEvent = {
      id: `EV-RC-${Date.now()}`, type: "MATCH",
      description: "Manual recalculation executed by admin",
      timestamp: new Date(), value: randf(10, 200),
    };
    updateNode(node.id, { auditLog: [newAudit, ...node.auditLog], recentEvents: [newEvent, ...node.recentEvents.slice(0, 9)] });
    toast(`Binary recalculated for @${node.username}.`, "success");
  }, [updateNode, toast]);

  const handleResetCarry = useCallback((node: BinaryNode) => {
    const newAudit: AuditEntry = {
      id: `NAUD-CF-${Date.now()}`, timestamp: new Date(),
      admin: "superadmin@primewave.io", action: "Carry Forward Reset",
      detail: `Carry forward reset from ${K(node.carryForward)} BV to 0.`,
    };
    const newEvent: BinaryEvent = {
      id: `EV-CF-${Date.now()}`, type: "CARRY_RESET",
      description: `Carry forward of ${K(node.carryForward)} BV reset to 0 by admin`,
      timestamp: new Date(),
    };
    const filteredWarnings = node.warnings.filter(w => w.type !== "HIGH_CARRY");
    updateNode(node.id, { carryForward: 0, auditLog: [newAudit, ...node.auditLog], recentEvents: [newEvent, ...node.recentEvents.slice(0, 9)], warnings: filteredWarnings });
    toast(`Carry forward reset to 0 for @${node.username}.`, "info");
  }, [updateNode, toast]);

  const handleRunCycle = useCallback(() => {
    setCycling(true);
    setTimeout(() => {
      setCycling(false);
      toast("Binary cycle executed successfully. All matching rewards distributed.", "success");
    }, 1800);
  }, [toast]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return nodes.filter(n => {
      if (q && !n.username.includes(q) && !n.memberId.toLowerCase().includes(q) && !n.sponsorUsername.includes(q) && !(n.firstName + " " + n.lastName).toLowerCase().includes(q)) return false;
      if (fStatus && n.status   !== fStatus) return false;
      if (fRank   && n.rank     !== fRank)   return false;
      if (fPos    && n.position !== fPos)    return false;
      return true;
    });
  }, [nodes, search, fStatus, fRank, fPos]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows   = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const kpis = useMemo(() => {
    const total      = nodes.length;
    const active     = nodes.filter(n => n.status === "ACTIVE").length;
    const totalLeft  = nodes.reduce((s, n) => s + n.leftBV, 0);
    const totalRight = nodes.reduce((s, n) => s + n.rightBV, 0);
    const todayMatch = nodes.reduce((s, n) => s + n.todayMatch, 0);
    const carryFwd   = nodes.reduce((s, n) => s + n.carryForward, 0);
    const todayRewards = todayMatch * 0.007;
    const healthScore  = Math.round((active / total) * 100 * 0.6 + (nodes.filter(n => n.warnings.length === 0).length / total) * 100 * 0.4);
    return { total, active, totalLeft, totalRight, todayMatch, carryFwd, todayRewards, healthScore };
  }, [nodes]);

  const liveDrawer = drawer ? nodes.find(n => n.id === drawer.id) ?? drawer : null;

  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", letterSpacing: "0.07em", position: "sticky", top: 0, background: "hsl(222 62% 8%)", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const COLS = ["USERNAME","MEMBER ID","SPONSOR","POSITION","LEFT BV","RIGHT BV","CARRY FWD","RANK","TODAY MATCH","STATUS",""];

  return (
    <AdminLayout>
      <div style={{ padding: "24px 28px", minHeight: "100vh", background: BG, boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Binary Network Control Center</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Monitor, inspect and manage the Prime Wave binary network.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[
              { icon: RefreshCw, label: "Refresh",         onClick: undefined,     gold: false },
              { icon: Download,  label: "Export",          onClick: undefined,     gold: false },
              { icon: Settings,  label: "Network Settings",onClick: undefined,     gold: false },
            ].map(b => (
              <button key={b.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                <b.icon size={13} />{b.label}
              </button>
            ))}
            <button
              onClick={handleRunCycle}
              disabled={cycling}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: cycling ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.1)", border: `1px solid rgba(212,175,55,0.25)`, borderRadius: 8, cursor: cycling ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: cycling ? MUTED : GOLD_L, transition: "opacity 0.2s" }}>
              <Zap size={13} style={{ animation: cycling ? "spin 1s linear infinite" : "none" }} />
              {cycling ? "Running…" : "Run Binary Cycle"}
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
          <KpiCard icon={Users}     label="TOTAL MEMBERS"        value={String(kpis.total)}       sub="In binary network"        color="#818cf8" />
          <KpiCard icon={Activity}  label="ACTIVE NODES"         value={String(kpis.active)}      sub={`${Math.round((kpis.active/kpis.total)*100)}% active`} color="#34d399" />
          <KpiCard icon={TrendingUp}label="TOTAL BV LEFT"        value={K(kpis.totalLeft)}        sub="Platform-wide left leg"   color="#34d399" />
          <KpiCard icon={GitBranch} label="TOTAL BV RIGHT"       value={K(kpis.totalRight)}       sub="Platform-wide right leg"  color="#60a5fa" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 26 }}>
          <KpiCard icon={Zap}       label="TODAY'S MATCHING VOL" value={K(kpis.todayMatch)}       sub="Matched BV today"         color={GOLD}    />
          <KpiCard icon={Clock}     label="CARRY FORWARD BV"     value={K(kpis.carryFwd)}         sub="Unmatched carry"          color="#fbbf24" />
          <KpiCard icon={BarChart2} label="TODAY'S BINARY REWARDS"value={$(kpis.todayRewards)}    sub="Distributed today"        color="#a78bfa" />
          <KpiCard icon={Shield}    label="NETWORK HEALTH SCORE" value={`${kpis.healthScore}%`}   sub={kpis.healthScore >= 80 ? "Healthy" : kpis.healthScore >= 60 ? "Moderate" : "Needs Attention"} color={kpis.healthScore >= 80 ? "#34d399" : kpis.healthScore >= 60 ? "#fbbf24" : "#f87171"} />
        </div>

        {/* Search + Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 400 }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search username, member ID, sponsor…"
              style={{ width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "9px 12px 9px 32px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
          </div>

          {[
            { value: fStatus, set: setFStatus, label: "All Statuses", options: [["ACTIVE","Active"],["INACTIVE","Inactive"],["SUSPENDED","Suspended"]] },
            { value: fRank,   set: setFRank,   label: "All Ranks",    options: RANKS.map(r => [r, r]) },
            { value: fPos,    set: setFPos,    label: "All Positions",options: [["LEFT","Left"],["RIGHT","Right"]] },
          ].map(f => (
            <div key={f.label} style={{ position: "relative" }}>
              <select value={f.value} onChange={e => { f.set(e.target.value); setPage(1); }} style={SEL}>
                <option value="">{f.label}</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <ChevronDown size={11} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
            </div>
          ))}

          <div style={{ marginLeft: "auto", fontSize: 11, color: MUTED }}>{filtered.length} node{filtered.length !== 1 ? "s" : ""}</div>
        </div>

        {/* Table */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
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
                {pageRows.map(n => (
                  <NetworkRow key={n.id} node={n}
                    onView={setDrawer}
                    onRecalculate={handleRecalculate}
                    onResetCarry={handleResetCarry}
                    hovered={hovered === n.id}
                    onHover={setHovered}
                  />
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={COLS.length} style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 13 }}>No nodes match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, color: MUTED }}>Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: page===1?"not-allowed":"pointer", color: page===1?MUTED:"rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
                  <ChevronLeft size={13} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = Math.max(1, Math.min(totalPages-4, page-2)) + i;
                  return (
                    <button key={pg} onClick={() => setPage(pg)} style={{ padding: "5px 10px", minWidth: 32, background: pg===page?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.04)", border: `1px solid ${pg===page?"rgba(212,175,55,0.3)":BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: pg===page?700:400, color: pg===page?GOLD_L:"rgba(255,255,255,0.65)" }}>
                      {pg}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} style={{ padding: "5px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: page===totalPages?"not-allowed":"pointer", color: page===totalPages?MUTED:"rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>

      <BinaryNetworkDrawer
        node={liveDrawer}
        onClose={() => setDrawer(null)}
        onRecalculate={handleRecalculate}
        onResetCarry={handleResetCarry}
      />
    </AdminLayout>
  );
}
