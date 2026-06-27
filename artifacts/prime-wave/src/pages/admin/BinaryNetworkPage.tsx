import { useState, useEffect, useRef, memo, useCallback } from "react";
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
import {
  getAdminBinaryNetwork,
  getAdminBinaryStats,
  getAdminBinaryDetail,
  saveAdminBinaryNotes,
  adminTriggerMatching,
  type AdminBinaryNode,
  type AdminBinaryStats,
} from "@/lib/api";

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

const RANKS: BinaryRank[] = ["UNRANKED","STARTER","GROWTH","PRO","ELITE","PLATINUM","DIAMOND"];

// ─── Map API node → BinaryNode for the drawer ─────────────────────────────────
function mapApiNode(n: AdminBinaryNode): BinaryNode {
  return {
    id:                 n.id,
    memberId:           n.memberId,
    username:           n.username,
    firstName:          n.firstName,
    lastName:           n.lastName,
    sponsor:            n.sponsor,
    sponsorUsername:    n.sponsorUsername,
    position:           n.position as Position,
    leftBV:             n.leftBV,
    rightBV:            n.rightBV,
    carryForward:       n.carryForward,
    rank:               n.rank as BinaryRank,
    todayMatch:         n.todayMatch,
    weeklyMatch:        n.weeklyMatch,
    monthlyMatch:       n.monthlyMatch,
    lifetimeMatch:      n.lifetimeMatch,
    status:             n.status as NodeStatus,
    plan:               n.plan,
    directReferrals:    n.directReferrals,
    parentUsername:     n.parentUsername,
    leftChildUsername:  n.leftChildUsername,
    rightChildUsername: n.rightChildUsername,
    matchingHistory:    n.matchingHistory.map(m => ({
      id:          m.id,
      timestamp:   new Date(m.timestamp),
      leftBV:      m.leftBV,
      rightBV:     m.rightBV,
      matched:     m.matched,
      reward:      m.reward,
      carryForward:m.carryForward,
    })) as MatchEvent[],
    recentEvents: n.recentEvents.map(e => ({
      id:          e.id,
      type:        e.type,
      description: e.description,
      timestamp:   new Date(e.timestamp),
      value:       e.value,
    })) as BinaryEvent[],
    warnings:  n.warnings as NetworkWarning[],
    auditLog:  n.auditLog.map(a => ({
      id:        a.id,
      timestamp: new Date(a.timestamp),
      admin:     a.admin,
      action:    a.action,
      detail:    a.detail,
    })) as AuditEntry[],
    nextRank:           n.nextRank as BinaryRank | null,
    rankProgress:       n.rankProgress,
    rankRequirements:   n.rankRequirements,
    adminNotes:         n.adminNotes ?? "",
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

  // ── Server-side data ─────────────────────────────────────────────────────────
  const [nodes,      setNodes]      = useState<BinaryNode[]>([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats,      setStats]      = useState<AdminBinaryStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Filters / search / pagination ────────────────────────────────────────────
  const [search,  setSearch]  = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fRank,   setFRank]   = useState("");
  const [fPos,    setFPos]    = useState("");
  const [page,    setPage]    = useState(1);
  const PAGE_SIZE = 20;

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // ── Drawer state ─────────────────────────────────────────────────────────────
  const [drawer,       setDrawer]       = useState<BinaryNode | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hovered,      setHovered]      = useState<string | null>(null);
  const [cycling,      setCycling]      = useState(false);

  // ── Fetch list ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAdminBinaryNetwork({
      page,
      limit:     PAGE_SIZE,
      search:    debouncedSearch || undefined,
      status:    (fStatus as "ACTIVE" | "INACTIVE" | "SUSPENDED") || undefined,
      position:  (fPos    as "LEFT" | "RIGHT")                     || undefined,
      rank:      fRank || undefined,
    })
      .then(res => {
        if (!cancelled) {
          setNodes(res.data.map(mapApiNode));
          setTotal(res.meta.total);
          setTotalPages(Math.max(1, res.meta.totalPages));
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message ?? "Failed to load binary network");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [page, debouncedSearch, fStatus, fRank, fPos]);

  // ── Fetch KPI stats (once, refresh on Run Cycle) ──────────────────────────────
  const fetchStats = useCallback(() => {
    setStatsLoading(true);
    getAdminBinaryStats()
      .then(s => { setStats(s); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ── Lazy-load drawer detail ───────────────────────────────────────────────────
  useEffect(() => {
    if (!drawer) return;
    const userId = drawer.id;
    let cancelled = false;
    setDetailLoading(true);

    getAdminBinaryDetail(userId)
      .then(detail => {
        if (!cancelled) {
          const enriched = mapApiNode(detail);
          setNodes(ns => ns.map(n => n.id === enriched.id ? enriched : n));
          setDetailLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => { cancelled = true; };
  }, [drawer?.id]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleRecalculate = useCallback((_node: BinaryNode) => {
    toast("Binary values are system-generated and cannot be manually modified.", "info");
  }, [toast]);

  const handleResetCarry = useCallback((_node: BinaryNode) => {
    toast("Binary values are system-generated and cannot be manually modified.", "info");
  }, [toast]);

  const handleRunCycle = useCallback(async () => {
    setCycling(true);
    try {
      await adminTriggerMatching();
      toast("Binary cycle executed successfully. All matching rewards distributed.", "success");
      fetchStats();
    } catch (err: unknown) {
      toast((err instanceof Error ? err.message : null) ?? "Failed to trigger binary cycle", "error");
    } finally {
      setCycling(false);
    }
  }, [toast, fetchStats]);

  const handleRefresh = useCallback(() => {
    setPage(p => p); // trigger re-fetch via deps
    fetchStats();
    // Force list refetch by bumping a counter
    setNodes([]);
    setLoading(true);
    getAdminBinaryNetwork({
      page,
      limit:    PAGE_SIZE,
      search:   debouncedSearch || undefined,
      status:   (fStatus as "ACTIVE" | "INACTIVE" | "SUSPENDED") || undefined,
      position: (fPos    as "LEFT" | "RIGHT")                     || undefined,
      rank:     fRank || undefined,
    })
      .then(res => {
        setNodes(res.data.map(mapApiNode));
        setTotal(res.meta.total);
        setTotalPages(Math.max(1, res.meta.totalPages));
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message ?? "Failed to refresh");
        setLoading(false);
      });
  }, [page, debouncedSearch, fStatus, fRank, fPos, fetchStats]);

  const handleSaveNotes = useCallback(async (userId: string, notes: string) => {
    const node = nodes.find(n => n.id === userId);
    await saveAdminBinaryNotes(userId, notes);
    toast(`Notes saved for @${node?.username ?? userId}`, "success");
  }, [nodes, toast]);

  const handleOpenDrawer = useCallback((node: BinaryNode) => {
    setDrawer(node);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────────
  const liveDrawer = drawer ? (nodes.find(n => n.id === drawer.id) ?? drawer) : null;

  const kpis = stats ? {
    total:       stats.totalMembers,
    active:      stats.activeMembers,
    totalLeft:   stats.totalLeftBV,
    totalRight:  stats.totalRightBV,
    todayMatch:  stats.todayMatchedBV,
    carryFwd:    stats.carryForwardBV,
    todayRewards:stats.todayRewards,
    healthScore: stats.networkHealth,
  } : {
    total: 0, active: 0, totalLeft: 0, totalRight: 0,
    todayMatch: 0, carryFwd: 0, todayRewards: 0, healthScore: 0,
  };

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
              { icon: RefreshCw, label: "Refresh",          onClick: handleRefresh, gold: false },
              { icon: Download,  label: "Export",           onClick: undefined,     gold: false },
              { icon: Settings,  label: "Network Settings", onClick: undefined,     gold: false },
            ].map(b => (
              <button key={b.label} onClick={b.onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
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
          <KpiCard icon={Users}     label="TOTAL MEMBERS"        value={statsLoading ? "—" : String(kpis.total)}      sub="In binary network"        color="#818cf8" />
          <KpiCard icon={Activity}  label="ACTIVE NODES"         value={statsLoading ? "—" : String(kpis.active)}     sub={statsLoading || kpis.total === 0 ? "—" : `${Math.round((kpis.active/kpis.total)*100)}% active`} color="#34d399" />
          <KpiCard icon={TrendingUp}label="TOTAL BV LEFT"        value={statsLoading ? "—" : K(kpis.totalLeft)}       sub="Platform-wide left leg"   color="#34d399" />
          <KpiCard icon={GitBranch} label="TOTAL BV RIGHT"       value={statsLoading ? "—" : K(kpis.totalRight)}      sub="Platform-wide right leg"  color="#60a5fa" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 26 }}>
          <KpiCard icon={Zap}       label="TODAY'S MATCHING VOL" value={statsLoading ? "—" : K(kpis.todayMatch)}      sub="Matched BV today"         color={GOLD}    />
          <KpiCard icon={Clock}     label="CARRY FORWARD BV"     value={statsLoading ? "—" : K(kpis.carryFwd)}        sub="Unmatched carry"          color="#fbbf24" />
          <KpiCard icon={BarChart2} label="TODAY'S BINARY REWARDS"value={statsLoading ? "—" : $(kpis.todayRewards)}   sub="Distributed today"        color="#a78bfa" />
          <KpiCard icon={Shield}    label="NETWORK HEALTH SCORE" value={statsLoading ? "—" : `${kpis.healthScore}%`}  sub={statsLoading ? "—" : kpis.healthScore >= 80 ? "Healthy" : kpis.healthScore >= 60 ? "Moderate" : "Needs Attention"} color={statsLoading ? MUTED : kpis.healthScore >= 80 ? "#34d399" : kpis.healthScore >= 60 ? "#fbbf24" : "#f87171"} />
        </div>

        {/* Search + Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 400 }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
            <input value={search} onChange={e => { setSearch(e.target.value); }} placeholder="Search username, member ID, sponsor…"
              style={{ width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "9px 12px 9px 32px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
          </div>

          {[
            { value: fStatus, set: (v: string) => { setFStatus(v); setPage(1); }, label: "All Statuses", options: [["ACTIVE","Active"],["INACTIVE","Inactive"],["SUSPENDED","Suspended"]] as [string,string][] },
            { value: fRank,   set: (v: string) => { setFRank(v);   setPage(1); }, label: "All Ranks",    options: RANKS.map(r => [r, r]) as [string,string][] },
            { value: fPos,    set: (v: string) => { setFPos(v);    setPage(1); }, label: "All Positions",options: [["LEFT","Left"],["RIGHT","Right"]] as [string,string][] },
          ].map(f => (
            <div key={f.label} style={{ position: "relative" }}>
              <select value={f.value} onChange={e => f.set(e.target.value)} style={SEL}>
                <option value="">{f.label}</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <ChevronDown size={11} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
            </div>
          ))}

          <div style={{ marginLeft: "auto", fontSize: 11, color: MUTED }}>{loading ? "Loading…" : `${total} node${total !== 1 ? "s" : ""}`}</div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#f87171" }}>
            {error}
          </div>
        )}

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
                {loading ? (
                  <tr>
                    <td colSpan={COLS.length} style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 13 }}>
                      Loading network…
                    </td>
                  </tr>
                ) : nodes.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} style={{ textAlign: "center", padding: "48px 0", color: MUTED, fontSize: 13 }}>
                      {error ? "Failed to load data." : "No nodes match your filters."}
                    </td>
                  </tr>
                ) : (
                  nodes.map(n => (
                    <NetworkRow key={n.id} node={n}
                      onView={handleOpenDrawer}
                      onRecalculate={handleRecalculate}
                      onResetCarry={handleResetCarry}
                      hovered={hovered === n.id}
                      onHover={setHovered}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, color: MUTED }}>Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, total)} of {total}</span>
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
        detailLoading={detailLoading}
        onClose={() => setDrawer(null)}
        onRecalculate={handleRecalculate}
        onResetCarry={handleResetCarry}
        onSaveNotes={handleSaveNotes}
      />

      {/* Star import used for rank display — suppress unused warning */}
      {false && <Star size={0} />}
    </AdminLayout>
  );
}
