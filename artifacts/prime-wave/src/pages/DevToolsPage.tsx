import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle, RefreshCw, Zap, TrendingUp, Wallet, ArrowUpFromLine,
  ArrowRightLeft, Network, Bell, Activity, FileText, CheckCircle2,
  XCircle, Clock, ChevronDown, Play, RotateCcw, Loader2, Cpu,
  Users, Trash2, GitBranch,
} from "lucide-react";
import {
  devApi,
  type DevStatus, type DevInvestment, type DevDeposit, type DevWithdrawal,
  type NetStatus,
} from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  ts: string;
  action: string;
  status: "ok" | "error" | "running";
  execMs?: number;
  detail?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function fmtMs(ms?: number) {
  if (!ms) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function fmt$(v: string | number) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: React.ElementType, title: string, children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0E1B37", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}>
        <Icon className="h-4 w-4" style={{ color: "#D4AF37" }} />
        <span className="text-sm font-semibold font-heading text-white uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function DevBtn({
  label, onClick, loading, variant = "primary", icon: Icon, size = "md",
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  variant?: "primary" | "danger" | "warning" | "ghost";
  icon?: React.ElementType;
  size?: "sm" | "md";
}) {
  const pad   = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "linear-gradient(135deg,#D4AF37,#F3D37A)", color: "#0E1B37" },
    danger:  { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171" },
    warning: { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" },
    ghost:   { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" },
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-lg font-semibold transition-all duration-150 ${pad}`}
      style={{ ...styles[variant], opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer" }}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : Icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </button>
  );
}

function StatusPill({ v }: { v: string }) {
  const col: Record<string, string> = {
    ACTIVE:    "#34d399", PENDING: "#fbbf24", APPROVED: "#60a5fa",
    COMPLETED: "#34d399", REJECTED: "#f87171", CANCELLED: "#94a3b8",
    MATURED:   "#a78bfa",
  };
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${col[v] ?? "#94a3b8"}22`, color: col[v] ?? "#94a3b8" }}>
      {v}
    </span>
  );
}

function ResultBox({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-3 rounded-xl p-3 font-mono text-xs space-y-1" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(212,175,55,0.15)" }}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="w-44 shrink-0" style={{ color: "#D4AF37" }}>{k}:</span>
          <span style={{ color: "#e2e8f0" }}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DevToolsPage() {
  const [, navigate] = useLocation();
  const { user }     = useAuth();
  const logIdRef     = useRef(0);

  // Gate: dev only
  useEffect(() => {
    if (!import.meta.env.DEV) navigate("/dashboard");
  }, [navigate]);

  // ── Shared log ──────────────────────────────────────────────────────────────
  const [log, setLog]   = useState<LogEntry[]>([]);
  const addLog = useCallback((entry: Omit<LogEntry, "id" | "ts">): number => {
    const id = ++logIdRef.current;
    setLog(prev => [{ id, ts: ts(), ...entry }, ...prev].slice(0, 100));
    return id;
  }, []);
  const updateLog = useCallback((id: number, patch: Partial<LogEntry>) => {
    setLog(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  // ── System Status ───────────────────────────────────────────────────────────
  const [status, setStatus] = useState<DevStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      const s = await devApi.getStatus();
      setStatus(s);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  // ── ROI Engine ──────────────────────────────────────────────────────────────
  const [roiLoading, setRoiLoading] = useState(false);
  const [roiResult, setRoiResult]   = useState<Record<string, unknown> | null>(null);

  const runRoi = useCallback(async (cycles: number, label: string) => {
    if (roiLoading) return;
    setRoiLoading(true);
    setRoiResult(null);
    const lid = addLog({ action: label, status: "running" });
    try {
      const r = await devApi.runRoi(cycles);
      setRoiResult({
        cycles:               r.cycles,
        "investments updated": r.investmentsUpdated,
        matured:              r.matured,
        "roi generated":      `${r.roiGenerated} USDT`,
        "auto compounded":    `${r.autoCompounded} USDT`,
        "claimable generated": `${r.claimableGenerated} USDT`,
        "execution time":     fmtMs(r.executionMs),
      });
      updateLog(lid, { status: "ok", execMs: r.executionMs, detail: `${r.investmentsUpdated} investments updated` });
      await refreshStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally {
      setRoiLoading(false);
    }
  }, [roiLoading, addLog, updateLog, refreshStatus]);

  // ── Investment Controls ─────────────────────────────────────────────────────
  const [investments, setInvestments]     = useState<DevInvestment[]>([]);
  const [selectedInv, setSelectedInv]     = useState<string>("");
  const [invLoading, setInvLoading]       = useState(false);
  const [invListLoading, setInvListLoading] = useState(false);

  const loadInvestments = useCallback(async () => {
    setInvListLoading(true);
    try {
      const r = await devApi.getInvestments();
      setInvestments(r.investments);
      if (r.investments.length && !selectedInv) setSelectedInv(r.investments[0].id);
    } catch { /* ignore */ }
    finally { setInvListLoading(false); }
  }, [selectedInv]);

  useEffect(() => { void loadInvestments(); }, [loadInvestments]);

  const invAction = useCallback(async (action: "mature" | "reset") => {
    if (!selectedInv || invLoading) return;
    setInvLoading(true);
    const label = action === "mature" ? "Force Mature Investment" : "Reset Investment to ACTIVE";
    const lid = addLog({ action: label, status: "running" });
    try {
      if (action === "mature") await devApi.matureInvestment(selectedInv);
      else                     await devApi.resetInvestment(selectedInv);
      updateLog(lid, { status: "ok", detail: `Investment ${selectedInv.slice(0, 8)}… ${action === "mature" ? "matured" : "reset"}` });
      await loadInvestments();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setInvLoading(false); }
  }, [selectedInv, invLoading, addLog, updateLog, loadInvestments]);

  // ── Deposits ────────────────────────────────────────────────────────────────
  const [deposits, setDeposits]   = useState<DevDeposit[]>([]);
  const [depLoading, setDepLoading] = useState<Record<string, boolean>>({});

  const loadDeposits = useCallback(async () => {
    try {
      const r = await devApi.getPendingDeposits();
      setDeposits(r.deposits);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadDeposits(); }, [loadDeposits]);

  const depAction = useCallback(async (id: string, action: "approve" | "reject") => {
    setDepLoading(p => ({ ...p, [id]: true }));
    const label = `${action === "approve" ? "Approve" : "Reject"} Deposit`;
    const lid = addLog({ action: label, status: "running" });
    try {
      if (action === "approve") await devApi.approveDeposit(id);
      else                      await devApi.rejectDeposit(id);
      updateLog(lid, { status: "ok", detail: `Deposit ${id.slice(0, 8)}… ${action}d` });
      await loadDeposits();
      await refreshStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setDepLoading(p => ({ ...p, [id]: false })); }
  }, [addLog, updateLog, loadDeposits, refreshStatus]);

  // ── Withdrawals ─────────────────────────────────────────────────────────────
  const [withdrawals, setWithdrawals]   = useState<DevWithdrawal[]>([]);
  const [wrLoading, setWrLoading]       = useState<Record<string, boolean>>({});

  const loadWithdrawals = useCallback(async () => {
    try {
      const r = await devApi.getPendingWithdrawals();
      setWithdrawals(r.withdrawals);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadWithdrawals(); }, [loadWithdrawals]);

  const wrAction = useCallback(async (id: string, action: "approve" | "reject" | "cancel") => {
    setWrLoading(p => ({ ...p, [id]: true }));
    const label = `${action.charAt(0).toUpperCase() + action.slice(1)} Withdrawal`;
    const lid = addLog({ action: label, status: "running" });
    try {
      if (action === "approve")     await devApi.approveWithdrawal(id);
      else if (action === "reject") await devApi.rejectWithdrawal(id);
      else                          await devApi.cancelWithdrawal(id);
      updateLog(lid, { status: "ok", detail: `Withdrawal ${id.slice(0, 8)}… ${action}d` });
      await loadWithdrawals();
      await refreshStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setWrLoading(p => ({ ...p, [id]: false })); }
  }, [addLog, updateLog, loadWithdrawals, refreshStatus]);

  // ── Simple action helper (transfer, binary, notifications) ──────────────────
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const simpleAction = useCallback(async (key: string, label: string, fn: () => Promise<Record<string, unknown>>) => {
    if (busy[key]) return;
    setBusy(p => ({ ...p, [key]: true }));
    const lid = addLog({ action: label, status: "running" });
    try {
      const result = await fn();
      const detail = Object.entries(result).map(([k, v]) => `${k}: ${v}`).join(" | ");
      updateLog(lid, { status: "ok", detail, execMs: result.executionMs as number | undefined });
      await refreshStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setBusy(p => ({ ...p, [key]: false })); }
  }, [busy, addLog, updateLog, refreshStatus]);

  // ── Network & BV Generator ───────────────────────────────────────────────────
  const [netOwnerId,       setNetOwnerId]       = useState("");
  const [netStatus,        setNetStatus]        = useState<NetStatus | null>(null);
  const [netStatusLoading, setNetStatusLoading] = useState(false);
  const [netGenPlan,       setNetGenPlan]       = useState("PLAN_90");
  const [netGenAmount,     setNetGenAmount]     = useState("5000");
  const [netGenWithInv,    setNetGenWithInv]    = useState(false);
  const [netGenLoading,    setNetGenLoading]    = useState(false);
  const [netGenResult,     setNetGenResult]     = useState<Record<string, unknown> | null>(null);
  const [netBvLoading,     setNetBvLoading]     = useState<Record<string, boolean>>({});
  const [netRunResult,     setNetRunResult]     = useState<Record<string, unknown> | null>(null);
  const [netDelLoading,    setNetDelLoading]    = useState(false);

  // Pre-fill ownerId once the auth user loads
  useEffect(() => {
    if (user?.id) setNetOwnerId(prev => prev || user.id);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshNetStatus = useCallback(async () => {
    if (!netOwnerId) return;
    setNetStatusLoading(true);
    try {
      const s = await devApi.getNetworkStatus(netOwnerId);
      setNetStatus(s);
    } catch { /* ignore */ }
    finally { setNetStatusLoading(false); }
  }, [netOwnerId]);

  useEffect(() => { if (netOwnerId) void refreshNetStatus(); }, [netOwnerId, refreshNetStatus]);

  const generateNetwork = useCallback(async () => {
    if (!netOwnerId || netGenLoading) return;
    setNetGenLoading(true); setNetGenResult(null);
    const lid = addLog({ action: "Generate Test Network", status: "running" });
    try {
      const r = await devApi.generateNetwork(
        netOwnerId,
        netGenWithInv ? netGenPlan : undefined,
        netGenWithInv ? parseInt(netGenAmount, 10) : undefined,
      );
      setNetGenResult({ "users created": r.usersCreated, investments: r.investments });
      updateLog(lid, { status: "ok", detail: `${r.usersCreated} test users created` });
      await refreshNetStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setNetGenLoading(false); }
  }, [netOwnerId, netGenLoading, netGenWithInv, netGenPlan, netGenAmount, addLog, updateLog, refreshNetStatus]);

  const generateBV = useCallback(async (preset: string, label: string) => {
    if (!netOwnerId || netBvLoading[preset]) return;
    setNetBvLoading(p => ({ ...p, [preset]: true }));
    const lid = addLog({ action: label, status: "running" });
    try {
      const r = await devApi.generateBV(netOwnerId, preset);
      const detail = r.investments
        ? r.investments.map(i => `${i.side} +${i.bvAdded} BV (${i.username})`).join(", ")
        : r.rankName ? `${r.rankName} — $${r.monthlyAmount}/mo`
        : r.from ? `Level income from ${r.from}` : "done";
      updateLog(lid, { status: "ok", detail });
      await refreshNetStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setNetBvLoading(p => ({ ...p, [preset]: false })); }
  }, [netOwnerId, netBvLoading, addLog, updateLog, refreshNetStatus]);

  const runNetEngine = useCallback(async (engine: string, label: string) => {
    if (busy[`net_${engine}`]) return;
    setBusy(p => ({ ...p, [`net_${engine}`]: true })); setNetRunResult(null);
    const lid = addLog({ action: label, status: "running" });
    try {
      const r = await devApi.runNetworkEngine(engine);
      const result: Record<string, unknown> = { "exec time": fmtMs(r.executionMs) };
      if (r.usersProcessed !== undefined) result["processed"]   = r.usersProcessed;
      if (r.usersSkipped   !== undefined) result["skipped"]     = r.usersSkipped;
      if (r.incomeGenerated)              result["income"]       = r.incomeGenerated;
      if (r.matchedBV)                    result["matched BV"]   = r.matchedBV;
      if (r.rewardedBV)                   result["rewarded BV"]  = r.rewardedBV;
      if (r.flushedBV)                    result["flushed BV"]   = r.flushedBV;
      if (r.carryFwdLeft)                 result["carry→L"]      = r.carryFwdLeft;
      if (r.carryFwdRight)                result["carry→R"]      = r.carryFwdRight;
      if (r.rewards          !== undefined) result["rewards"]    = r.rewards;
      if (r.newPayouts       !== undefined) result["payouts"]    = r.newPayouts;
      setNetRunResult(result);
      updateLog(lid, { status: "ok", execMs: r.executionMs, detail: r.incomeGenerated ?? `${r.usersProcessed ?? r.newPayouts ?? 0} processed` });
      await refreshNetStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setBusy(p => ({ ...p, [`net_${engine}`]: false })); }
  }, [busy, addLog, updateLog, refreshNetStatus]);

  const deleteNetwork = useCallback(async () => {
    if (!netOwnerId || netDelLoading) return;
    setNetDelLoading(true);
    const lid = addLog({ action: "Delete Test Network", status: "running" });
    try {
      const r = await devApi.deleteTestNetwork(netOwnerId);
      setNetStatus(null); setNetGenResult(null); setNetRunResult(null);
      updateLog(lid, { status: "ok", detail: `${r.deleted} users deleted` });
      await refreshNetStatus();
    } catch (e: unknown) {
      updateLog(lid, { status: "error", detail: e instanceof Error ? e.message : "Failed" });
    } finally { setNetDelLoading(false); }
  }, [netOwnerId, netDelLoading, addLog, updateLog, refreshNetStatus]);

  const userId = user?.id ?? "";

  if (!import.meta.env.DEV) return null;

  const selInv = investments.find(i => i.id === selectedInv);

  return (
    <div className="min-h-screen" style={{ background: "#050B1A", fontFamily: "Inter, sans-serif" }}>

      {/* ── Warning banner ── */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 px-5 py-3" style={{ background: "#7c2d12", borderBottom: "2px solid #ea580c" }}>
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-orange-300" />
          <span className="text-sm font-bold text-orange-100">Developer Testing Toolkit — Disabled in Production</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-orange-300">
          <span className="font-mono">{import.meta.env.MODE.toUpperCase()}</span>
          <button onClick={() => window.history.back()} className="rounded px-2 py-1 font-semibold" style={{ background: "rgba(255,255,255,0.12)" }}>← Back</button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading text-white">Dev Toolkit</h1>
            <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>Trigger production services instantly for QA testing</p>
          </div>
          <button onClick={refreshStatus} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)", color: "#D4AF37" }}>
            <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />
            Refresh Status
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-5">

            {/* §1 ROI Engine */}
            <Section icon={Zap} title="§1 — ROI Engine">
              <div className="flex flex-wrap gap-2 mb-3">
                <DevBtn label="Run Next ROI Cycle" onClick={() => void runRoi(1, "Run Next ROI Cycle")} loading={roiLoading} icon={Play} />
                <DevBtn label="Run 1 Day (2×)" onClick={() => void runRoi(2, "Run 1 Day ROI")} loading={roiLoading} variant="warning" icon={Play} />
                <DevBtn label="Run 7 Days (14×)" onClick={() => void runRoi(14, "Run 7 Day ROI")} loading={roiLoading} variant="ghost" icon={Play} />
                <DevBtn label="Run 30 Days (60×)" onClick={() => void runRoi(60, "Run 30 Day ROI")} loading={roiLoading} variant="ghost" icon={Play} />
              </div>
              {roiResult && <ResultBox data={roiResult} />}
            </Section>

            {/* §2 Investment Controls */}
            <Section icon={TrendingUp} title="§2 — Investment Controls">
              {invListLoading ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: "#64748b" }}><Loader2 className="h-4 w-4 animate-spin" />Loading investments…</div>
              ) : investments.length === 0 ? (
                <p className="text-sm" style={{ color: "#64748b" }}>No investments found.</p>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="relative">
                      <select
                        value={selectedInv}
                        onChange={e => setSelectedInv(e.target.value)}
                        className="w-full appearance-none rounded-xl px-4 py-2.5 pr-10 text-sm text-white outline-none"
                        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        {investments.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.user.username} — {inv.planType} — ${parseFloat(inv.currentPrincipal).toFixed(2)} — {inv.status}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "#64748b" }} />
                    </div>
                    {selInv && (
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        {[
                          ["Status", selInv.status],
                          ["Principal", fmt$(selInv.currentPrincipal)],
                          ["Daily ROI", `${parseFloat(selInv.dailyROI).toFixed(2)}%`],
                          ["Matures", fmtDate(selInv.maturesAt)],
                          ["Claimable ROI", fmt$(selInv.claimableROI)],
                          ["Auto Compound", selInv.autoCompound ? "Yes" : "No"],
                        ].map(([k, v]) => (
                          <div key={k} className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                            <div style={{ color: "#64748b" }}>{k}</div>
                            <div className="font-semibold text-white truncate">{v}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <DevBtn label="Mark Matured" onClick={() => void invAction("mature")} loading={invLoading} variant="warning" icon={Clock} />
                    <DevBtn label="Reset to Active" onClick={() => void invAction("reset")} loading={invLoading} variant="ghost" icon={RotateCcw} />
                  </div>
                </>
              )}
            </Section>

            {/* §3 Deposit Testing */}
            <Section icon={Wallet} title="§3 — Deposit Testing">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs" style={{ color: "#64748b" }}>{deposits.length} pending deposits</span>
                <DevBtn label="Refresh" onClick={loadDeposits} variant="ghost" icon={RefreshCw} size="sm" />
              </div>
              {deposits.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: "#64748b" }}>No pending deposits.</p>
              ) : (
                <div className="space-y-2">
                  {deposits.map(d => (
                    <div key={d.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{fmt$(d.amount)} <span className="text-xs font-normal" style={{ color: "#64748b" }}>({d.network})</span></p>
                        <p className="text-xs truncate" style={{ color: "#64748b" }}>{d.user.email} · {fmtDate(d.createdAt)}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <DevBtn label="Approve" onClick={() => void depAction(d.id, "approve")} loading={depLoading[d.id]} variant="primary" size="sm" icon={CheckCircle2} />
                        <DevBtn label="Reject" onClick={() => void depAction(d.id, "reject")} loading={depLoading[d.id]} variant="danger" size="sm" icon={XCircle} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* §4 Withdrawal Testing */}
            <Section icon={ArrowUpFromLine} title="§4 — Withdrawal Testing">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs" style={{ color: "#64748b" }}>{withdrawals.length} pending withdrawals</span>
                <DevBtn label="Refresh" onClick={loadWithdrawals} variant="ghost" icon={RefreshCw} size="sm" />
              </div>
              {withdrawals.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: "#64748b" }}>No pending withdrawals.</p>
              ) : (
                <div className="space-y-2">
                  {withdrawals.map(w => (
                    <div key={w.id} className="rounded-xl px-4 py-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{fmt$(w.amount)} <span className="text-xs font-normal" style={{ color: "#64748b" }}>({w.network})</span></p>
                          <p className="text-xs truncate" style={{ color: "#64748b" }}>{w.user.email} · <StatusPill v={w.status} /> · {fmtDate(w.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {w.status === "PENDING" && (
                          <DevBtn label="Approve" onClick={() => void wrAction(w.id, "approve")} loading={wrLoading[w.id]} variant="primary" size="sm" icon={CheckCircle2} />
                        )}
                        <DevBtn label="Reject" onClick={() => void wrAction(w.id, "reject")} loading={wrLoading[w.id]} variant="danger" size="sm" icon={XCircle} />
                        <DevBtn label="Cancel" onClick={() => void wrAction(w.id, "cancel")} loading={wrLoading[w.id]} variant="ghost" size="sm" icon={XCircle} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* §5 Transfer Testing */}
            <Section icon={ArrowRightLeft} title="§5 — Transfer Testing">
              <p className="text-xs mb-3" style={{ color: "#64748b" }}>
                Moves all income-wallet balances to withdrawal wallets immediately (15% fee applies — production logic).
              </p>
              <DevBtn
                label="Release Pending Transfers"
                onClick={() => void simpleAction("transfer", "Release Pending Transfers", async () => {
                  const r = await devApi.releaseTransfers();
                  return { users: r.transferred, "net released": `$${r.totalNetAmount}` };
                })}
                loading={busy["transfer"]}
                icon={ArrowRightLeft}
              />
            </Section>

            {/* §6 Binary Engine */}
            <Section icon={Network} title="§6 — Binary Engine">
              <div className="flex flex-wrap gap-2">
                <DevBtn label="Run Binary Matching" icon={Play}
                  onClick={() => void simpleAction("matching", "Run Binary Matching",
                    async () => {
                      const r = await devApi.runBinaryMatching();
                      return {
                        "exec time":   fmtMs(r.executionMs),
                        "processed":   r.processed,
                        "matched BV":  r.matchedBV,
                        "rewarded BV": r.rewardedBV,
                        "flushed BV":  r.flushedBV,
                        "carry→L":     r.carryFwdLeft,
                        "carry→R":     r.carryFwdRight,
                        "income":      r.incomeGenerated,
                      };
                    })}
                  loading={busy["matching"]} />
                <DevBtn label="Run Binary Orbit" icon={Play} variant="warning"
                  onClick={() => void simpleAction("orbit", "Run Binary Orbit",
                    async () => {
                      const r = await devApi.runBinaryOrbit();
                      return {
                        "exec time":  fmtMs(r.executionMs),
                        "processed":  r.processed,
                        "matched BV": r.matchedBV,
                        "flushed BV": r.flushedBV,
                        "carry→L":    r.carryFwdLeft,
                        "carry→R":    r.carryFwdRight,
                        "rewards":    r.rewards,
                        "income":     r.incomeGenerated,
                      };
                    })}
                  loading={busy["orbit"]} />
              </div>
              <p className="mt-3 text-xs" style={{ color: "#475569" }}>
                Level Income is event-driven — triggered automatically during investment creation. No standalone cycle exists.
              </p>
            </Section>

            {/* §10 Network & BV Generator */}
            <Section icon={GitBranch} title="§10 — Network & BV Generator">

              {/* Owner selector */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  value={netOwnerId}
                  onChange={e => setNetOwnerId(e.target.value)}
                  placeholder="Owner user ID…"
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                  style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
                {netOwnerId !== userId && (
                  <DevBtn label="Use Mine" onClick={() => setNetOwnerId(userId)} variant="ghost" size="sm" />
                )}
                <DevBtn label="Refresh" onClick={refreshNetStatus} loading={netStatusLoading} variant="ghost" size="sm" icon={RefreshCw} />
              </div>

              {/* BV Status Panel */}
              {netStatus && (
                <div className="rounded-xl p-3 mb-4 space-y-3" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(212,175,55,0.15)" }}>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {([
                      ["Left BV",   netStatus.owner.leftBV,       netStatus.owner.powerLeg === "LEFT"  ? "#D4AF37" : "#60a5fa"],
                      ["Right BV",  netStatus.owner.rightBV,      netStatus.owner.powerLeg === "RIGHT" ? "#D4AF37" : "#60a5fa"],
                      ["Matched BV", netStatus.owner.matchedBV,   "#34d399"],
                      ["Carry Fwd", netStatus.owner.carryForwardBV, "#94a3b8"],
                    ] as [string, string, string][]).map(([k, v, c]) => (
                      <div key={k} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="text-xs mb-0.5" style={{ color: "#475569" }}>{k}</div>
                        <div className="text-sm font-bold font-mono" style={{ color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs" style={{ color: "#475569" }}>
                      Power: <span style={{ color: "#D4AF37" }}>{netStatus.owner.powerLeg}</span>
                    </span>
                    <span className="text-xs" style={{ color: "#475569" }}>Directs: {netStatus.owner.directReferralCount}</span>
                    {([
                      ["Binary",   netStatus.qualification.binaryQualified],
                      ["Matching", netStatus.qualification.matchingQualified],
                      ["Orbit",    netStatus.qualification.orbitQualified],
                      ["Salary",   netStatus.qualification.salaryQualified],
                    ] as [string, boolean][]).map(([k, v]) => (
                      <span key={k} className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: v ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.1)", color: v ? "#34d399" : "#f87171" }}>
                        {k} {v ? "✓" : "✗"}
                      </span>
                    ))}
                    {netStatus.qualification.salaryRank && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                        {netStatus.qualification.salaryRank} ${netStatus.qualification.salarySalary}/mo
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "#475569" }}>
                    Test network: {netStatus.testNetwork.exists
                      ? `${netStatus.testNetwork.userCount} users — ${netStatus.testNetwork.users.map(u => u.username).join(", ")}`
                      : "not generated"}
                  </div>
                  {(netStatus.lastResults.matching || netStatus.lastResults.orbit) && (
                    <div className="text-xs space-y-0.5" style={{ color: "#475569" }}>
                      {netStatus.lastResults.matching && (
                        <div>Last match: <span style={{ color: "#34d399" }}>${netStatus.lastResults.matching.incomeAmount}</span> income · {netStatus.lastResults.matching.matchedBV} matched BV</div>
                      )}
                      {netStatus.lastResults.orbit && (
                        <div>Last orbit: <span style={{ color: "#34d399" }}>${netStatus.lastResults.orbit.incomeAmount}</span> income · {netStatus.lastResults.orbit.rewardCount} reward(s)</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Generate Network */}
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Generate Test Network</p>
                <p className="text-xs" style={{ color: "#475569" }}>
                  Creates 6 real platform users (Left Direct, Right Direct + 2 team members each) using the production registration &amp; placement services. Every user is tagged <code style={{ color: "#D4AF37" }}>isTestUser=true</code>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: "#94a3b8" }}>
                    <input type="checkbox" checked={netGenWithInv} onChange={e => setNetGenWithInv(e.target.checked)}
                      className="rounded accent-yellow-500" />
                    Invest immediately
                  </label>
                  {netGenWithInv && (
                    <>
                      <select value={netGenPlan} onChange={e => setNetGenPlan(e.target.value)}
                        className="rounded-lg px-2 py-1 text-xs text-white outline-none"
                        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <option value="PLAN_90">90 Day</option>
                        <option value="PLAN_180">180 Day</option>
                        <option value="PLAN_270">270 Day</option>
                        <option value="PLAN_360">360 Day</option>
                      </select>
                      <input type="number" value={netGenAmount} onChange={e => setNetGenAmount(e.target.value)}
                        placeholder="Amount ($)" min={100} step={100}
                        className="w-28 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none"
                        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)" }} />
                    </>
                  )}
                  <DevBtn label="Generate Test Network" onClick={generateNetwork} loading={netGenLoading} icon={Users} />
                </div>
                {netGenResult && <ResultBox data={netGenResult} />}
              </div>

              {/* Quick BV Actions */}
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Quick BV Actions</p>
                <p className="text-xs" style={{ color: "#475569" }}>All actions create real investments via the production investment service. No direct DB writes.</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { preset: "50L",    label: "50 BV Left",    variant: "ghost"   as const },
                    { preset: "50R",    label: "50 BV Right",   variant: "ghost"   as const },
                    { preset: "150L",   label: "150 BV Left",   variant: "warning" as const },
                    { preset: "150R",   label: "150 BV Right",  variant: "warning" as const },
                    { preset: "500B",   label: "500 BV Both",   variant: "primary" as const },
                    { preset: "matchQ", label: "Match Qualify", variant: "ghost"   as const },
                    { preset: "orbitQ", label: "Orbit Qualify", variant: "warning" as const },
                    { preset: "levelQ", label: "Level Qualify", variant: "ghost"   as const },
                    { preset: "salaryQ",label: "Salary Qualify",variant: "primary" as const },
                  ]).map(({ preset, label, variant }) => (
                    <DevBtn key={preset} label={label} size="sm" variant={variant}
                      onClick={() => void generateBV(preset, label)}
                      loading={netBvLoading[preset]} />
                  ))}
                </div>
              </div>

              {/* Run Engines */}
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>Run Compensation Engines</p>
                <div className="flex flex-wrap gap-1.5">
                  <DevBtn label="Run Binary Matching" onClick={() => void runNetEngine("matching", "Run Binary Matching")}
                    loading={busy["net_matching"]} icon={Play} />
                  <DevBtn label="Run Binary Orbit"    onClick={() => void runNetEngine("orbit",    "Run Binary Orbit")}
                    loading={busy["net_orbit"]}    icon={Play} variant="warning" />
                </div>
                {netRunResult && <ResultBox data={netRunResult} />}
              </div>

              {/* Delete Network */}
              <div className="pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#f87171" }}>Delete Test Network</p>
                    <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                      Reverses BV, removes all test-tagged data. Real users are never touched.
                    </p>
                  </div>
                  <DevBtn
                    label={netStatus?.testNetwork.userCount ? `Delete (${netStatus.testNetwork.userCount} users)` : "Delete Network"}
                    onClick={deleteNetwork} loading={netDelLoading} variant="danger" icon={Trash2} />
                </div>
              </div>

            </Section>

            {/* §7 Notifications */}
            <Section icon={Bell} title="§7 — Notifications">
              {!userId ? (
                <p className="text-sm" style={{ color: "#64748b" }}>Log in to use notification controls.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <DevBtn label="Generate Test Notification" icon={Bell}
                    onClick={() => void simpleAction("notif-gen", "Generate Test Notification",
                      async () => { const r = await devApi.generateNotification(userId); return { type: r.type }; })}
                    loading={busy["notif-gen"]} />
                  <DevBtn label="Mark All Read" icon={CheckCircle2} variant="warning"
                    onClick={() => void simpleAction("notif-read", "Mark All Notifications Read",
                      async () => { const r = await devApi.markAllNotificationsRead(userId); return { updated: r.updated }; })}
                    loading={busy["notif-read"]} />
                  <DevBtn label="Clear All" icon={XCircle} variant="danger"
                    onClick={() => void simpleAction("notif-clear", "Clear All Notifications",
                      async () => { const r = await devApi.clearNotifications(userId); return { deleted: r.deleted }; })}
                    loading={busy["notif-clear"]} />
                </div>
              )}
            </Section>

          </div>{/* end left column */}

          {/* RIGHT COLUMN */}
          <div className="space-y-5">

            {/* §8 System Status */}
            <Section icon={Activity} title="§8 — System Status">
              {statusLoading ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: "#64748b" }}><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
              ) : status ? (
                <div className="space-y-2.5">
                  {[
                    ["Environment",         status.environment.toUpperCase()],
                    ["Server Time",         new Date(status.serverTime).toLocaleTimeString()],
                    ["Timezone",            status.timezone],
                    ["Active Investments",  status.activeInvestments],
                    ["Pending Deposits",    status.pendingDeposits],
                    ["Pending Withdrawals", status.pendingWithdrawals],
                    ["Total Users",         status.totalUsers],
                    ["Last ROI Cycle",      status.lastRoiCycle ? fmtDate(status.lastRoiCycle) : "Never"],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "#64748b" }}>{k}</span>
                      <span className="text-xs font-semibold font-mono" style={{ color: k === "Environment" ? "#D4AF37" : "#e2e8f0" }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs" style={{ color: "#64748b" }}>Could not load status.</p>
              )}
            </Section>

            {/* §9 Execution Log */}
            <Section icon={FileText} title="§9 — Execution Log">
              {log.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: "#475569" }}>
                  Logs appear here after each action.
                </p>
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {log.map(entry => (
                    <div key={entry.id} className="rounded-lg p-2.5 text-xs" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${entry.status === "error" ? "rgba(239,68,68,0.2)" : entry.status === "running" ? "rgba(212,175,55,0.2)" : "rgba(52,211,153,0.15)"}` }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        {entry.status === "running" && <Loader2 className="h-3 w-3 animate-spin shrink-0" style={{ color: "#D4AF37" }} />}
                        {entry.status === "ok"      && <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: "#34d399" }} />}
                        {entry.status === "error"   && <XCircle className="h-3 w-3 shrink-0" style={{ color: "#f87171" }} />}
                        <span className="font-semibold truncate text-white">{entry.action}</span>
                        <span className="ml-auto shrink-0 font-mono" style={{ color: "#475569" }}>{entry.ts}</span>
                      </div>
                      {entry.detail && <p className="truncate mt-0.5 pl-5" style={{ color: entry.status === "error" ? "#f87171" : "#94a3b8" }}>{entry.detail}</p>}
                      {entry.execMs && <p className="pl-5" style={{ color: "#475569" }}>{fmtMs(entry.execMs)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Quick Info */}
            <div className="rounded-xl p-4 text-xs space-y-2" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <div className="flex items-center gap-2 font-semibold" style={{ color: "#f87171" }}>
                <Cpu className="h-3.5 w-3.5" /> Rules
              </div>
              <ul className="space-y-1 list-disc list-inside" style={{ color: "#94a3b8" }}>
                <li>Only calls production services</li>
                <li>No data is faked or mocked</li>
                <li>All balance changes are real DB writes</li>
                <li>Gates close automatically in production</li>
              </ul>
            </div>

          </div>{/* end right column */}
        </div>
      </div>
    </div>
  );
}
