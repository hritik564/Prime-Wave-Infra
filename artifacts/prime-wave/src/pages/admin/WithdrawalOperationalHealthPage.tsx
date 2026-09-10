import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Loader2, Activity, Power, PowerOff, Wallet,
  AlertTriangle, CheckCircle, Clock, Zap, GitMerge, ShieldAlert,
  Radio, PenLine, Filter,
  AlertOctagon, Info, Server, Cpu, Timer, Lock, Unlock,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useAuth } from "@/providers/AuthProvider";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  getOperationalHealth,
  setWithdrawalEngineStatus,
  type OperationalHealth,
  type OperationalHealthAlert,
  type QueueWorkerStatus,
} from "@/lib/api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt2 = (n: string | null | undefined) =>
  n != null ? Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "—";

const fmtUsd = (n: string | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)   return "Just now";
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

// ─── Alert level display ──────────────────────────────────────────────────────
const ALERT_STYLE: Record<string, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
  error: {
    bg:     "rgba(239,68,68,0.07)",
    border: "rgba(239,68,68,0.25)",
    color:  "#f87171",
    icon:   <AlertOctagon className="h-4 w-4 flex-shrink-0" />,
  },
  warning: {
    bg:     "rgba(251,191,36,0.07)",
    border: "rgba(251,191,36,0.25)",
    color:  "#fbbf24",
    icon:   <AlertTriangle className="h-4 w-4 flex-shrink-0" />,
  },
  info: {
    bg:     "rgba(96,165,250,0.07)",
    border: "rgba(96,165,250,0.25)",
    color:  "#60a5fa",
    icon:   <Info className="h-4 w-4 flex-shrink-0" />,
  },
};

function AlertRow({ alert }: { alert: OperationalHealthAlert }) {
  const s = ALERT_STYLE[alert.level] ?? ALERT_STYLE["info"]!;
  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <span style={{ color: s.color }}>{s.icon}</span>
      <p className="text-sm" style={{ color: s.color }}>{alert.message}</p>
    </div>
  );
}

// ─── Queue stat tile ──────────────────────────────────────────────────────────
interface StatTileProps {
  label: string;
  value: number;
  icon:  React.ReactNode;
  color?: string;
  accent?: boolean;
}
function StatTile({ label, value, icon, color = MUTED, accent }: StatTileProps) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{
        background: accent ? "rgba(212,175,55,0.06)" : CARD,
        border:     `1px solid ${accent ? "rgba(212,175,55,0.2)" : BORDER}`,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
          {label}
        </p>
        <span style={{ color }}>{icon}</span>
      </div>
      <p className="text-3xl font-bold font-heading" style={{ color: accent ? GOLD : "white" }}>
        {value}
      </p>
    </div>
  );
}

// ─── Wallet balance card ──────────────────────────────────────────────────────
function WalletCard({
  label, value, symbol, sufficient, minRequired,
}: {
  label:       string;
  value:       string | null;
  symbol:      string;
  sufficient:  boolean;
  minRequired: string;
}) {
  const hasValue = value !== null && value !== undefined;
  const numVal   = hasValue ? parseFloat(value!) : 0;
  const minNum   = parseFloat(minRequired);

  const pct = minNum > 0 ? Math.min(100, Math.round((numVal / (minNum * 2)) * 100)) : 100;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: sufficient ? "rgba(52,211,153,0.04)" : "rgba(239,68,68,0.06)",
        border:     `1px solid ${sufficient ? "rgba(52,211,153,0.2)" : "rgba(239,68,68,0.25)"}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4" style={{ color: sufficient ? "#34d399" : "#f87171" }} />
          <p className="text-sm font-semibold text-foreground">{label}</p>
        </div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={
            sufficient
              ? { background: "rgba(52,211,153,0.12)", color: "#34d399" }
              : { background: "rgba(239,68,68,0.12)", color: "#f87171" }
          }
        >
          {sufficient ? "OK" : "LOW"}
        </span>
      </div>

      <div>
        <p className="text-2xl font-bold font-heading font-mono" style={{ color: sufficient ? "#34d399" : "#f87171" }}>
          {hasValue ? `${fmt2(value)} ${symbol}` : "—"}
        </p>
        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
          Minimum: {minRequired} {symbol}
        </p>
      </div>

      {hasValue && (
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: MUTED }}>
            <span>Level vs threshold</span>
            <span>{Math.min(100, Math.round((numVal / (minNum > 0 ? minNum : numVal + 1)) * 100))}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width:      `${pct}%`,
                background: sufficient ? "#34d399" : "#f87171",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Engine toggle ────────────────────────────────────────────────────────────
function EngineToggle({
  enabled,
  loading,
  onToggle,
  readOnly,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex items-center justify-between gap-4"
      style={{
        background: enabled ? "rgba(52,211,153,0.04)" : "rgba(239,68,68,0.06)",
        border:     `1px solid ${enabled ? "rgba(52,211,153,0.2)" : "rgba(239,68,68,0.25)"}`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: enabled ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)" }}
        >
          {enabled
            ? <Power className="h-5 w-5" style={{ color: "#34d399" }} />
            : <PowerOff className="h-5 w-5" style={{ color: "#f87171" }} />}
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Withdrawal Engine</p>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            {enabled
              ? "Active — queue processing is running"
              : "Paused — new requests accepted but not processed"}
          </p>
        </div>
      </div>

      {readOnly ? (
        <span className="text-xs font-medium px-3 py-2 rounded-xl" style={{ color: MUTED, border: `1px solid ${BORDER}` }}>
          Read-only monitoring
        </span>
      ) : <button
        onClick={onToggle}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
        style={
          loading
            ? { background: "rgba(255,255,255,0.06)", color: MUTED, border: `1px solid ${BORDER}` }
            : enabled
            ? { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }
            : { background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_L} 100%)`, color: "#0E1B37", boxShadow: "0 4px 12px rgba(212,175,55,0.3)" }
        }
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        {loading ? "Updating…" : enabled ? "Pause Engine" : "Start Engine"}
      </button>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const AUTO_REFRESH_MS = 30_000;

export default function WithdrawalOperationalHealthPage() {
  const { toasts, toast: showToast, dismiss: dismissToast } = useToast();
  const { role } = useAuth();
  const isStaffOperations = role === "STAFF_OPERATIONS";
  const [health, setHealth]       = useState<OperationalHealth | null>(null);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOperationalHealth();
      setHealth(data);
    } catch {
      showToast("Failed to load operational health", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => clearInterval(iv);
  }, [load]);

  const handleToggleEngine = async () => {
    if (isStaffOperations) return;
    if (!health) return;
    setToggling(true);
    try {
      const next = !health.engine.enabled;
      await setWithdrawalEngineStatus(next);
      showToast(`Withdrawal engine ${next ? "started" : "paused"}`, "success");
      await load();
    } catch {
      showToast("Failed to update engine status", "error");
    } finally {
      setToggling(false);
    }
  };

  const q = health?.queue;

  return (
    <AdminLayout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="space-y-6 p-4 lg:p-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground">Operational Health</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>
              Withdrawal engine status, hot wallet, queue pipeline, and alerts
              {health && (
                <span className="ml-2 font-mono text-xs">
                  · snapshot {ago(health.snapshotAt)}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: `1px solid ${BORDER}` }}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loading && !health ? (
          <div className="flex items-center gap-3 py-20 justify-center" style={{ color: MUTED }}>
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
            <span>Loading health snapshot…</span>
          </div>
        ) : health ? (
          <>
            {/* ── Alerts ── */}
            {health.alerts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                  Active Alerts
                </p>
                {health.alerts.map((a, i) => (
                  <AlertRow key={i} alert={a} />
                ))}
              </div>
            )}

            {/* ── Engine Control ── */}
            <EngineToggle
              enabled={health.engine.enabled}
              loading={toggling}
              onToggle={() => void handleToggleEngine()}
              readOnly={isStaffOperations}
            />

            {/* ── Hot Wallet ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="h-4 w-4" style={{ color: GOLD }} />
                <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                  Hot Wallet
                </p>
                {health.hotWallet.address && (
                  <span className="font-mono text-xs ml-1" style={{ color: MUTED }}>
                    {health.hotWallet.address.slice(0, 8)}…{health.hotWallet.address.slice(-6)}
                  </span>
                )}
                {health.hotWallet.gasPriceGwei && (
                  <span
                    className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(212,175,55,0.08)", color: GOLD }}
                  >
                    {parseFloat(health.hotWallet.gasPriceGwei).toFixed(1)} Gwei
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <WalletCard
                  label="BNB Balance (Gas)"
                  value={health.hotWallet.bnbBalance}
                  symbol="BNB"
                  sufficient={health.hotWallet.bnbSufficient}
                  minRequired={health.hotWallet.minBnbRequired}
                />
                <WalletCard
                  label="USDT Balance (Liquidity)"
                  value={health.hotWallet.usdtBalance}
                  symbol="USDT"
                  sufficient={health.hotWallet.usdtSufficient}
                  minRequired={health.hotWallet.minUsdtRequired}
                />
              </div>
            </div>

            {/* ── Queue Pipeline ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4" style={{ color: GOLD }} />
                <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                  Queue Pipeline
                </p>
                <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>
                  {q?.total ?? 0} total active
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatTile
                  label="Waiting (hold)"
                  value={q?.waiting ?? 0}
                  icon={<Clock className="h-4 w-4" />}
                  color="#60a5fa"
                />
                <StatTile
                  label="Eligible"
                  value={q?.eligible ?? 0}
                  icon={<CheckCircle className="h-4 w-4" />}
                  color={GOLD}
                  accent={(q?.eligible ?? 0) > 0}
                />
                <StatTile
                  label="Processing"
                  value={q?.processing ?? 0}
                  icon={<Zap className="h-4 w-4" />}
                  color="#fb923c"
                />
                <StatTile
                  label="Confirming"
                  value={q?.confirming ?? 0}
                  icon={<GitMerge className="h-4 w-4" />}
                  color="#34d399"
                />
                <StatTile
                  label="Manual Review"
                  value={q?.manualReview ?? 0}
                  icon={<ShieldAlert className="h-4 w-4" />}
                  color="#f87171"
                />
              </div>

              {/* Sub-states row */}
              {((q?.validating ?? 0) + (q?.queued ?? 0) + (q?.signed ?? 0) + (q?.broadcasting ?? 0)) > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatTile label="Validating"   value={q?.validating   ?? 0} icon={<Filter   className="h-3.5 w-3.5" />} color={MUTED} />
                  <StatTile label="Queued"        value={q?.queued       ?? 0} icon={<Clock    className="h-3.5 w-3.5" />} color={MUTED} />
                  <StatTile label="Signed"        value={q?.signed       ?? 0} icon={<PenLine  className="h-3.5 w-3.5" />} color="#a78bfa" />
                  <StatTile label="Broadcasting"  value={q?.broadcasting ?? 0} icon={<Radio    className="h-3.5 w-3.5" />} color="#fb7185" />
                </div>
              )}
            </div>

            {/* ── Pipeline bar visual ── */}
            {q && q.total > 0 && (
              <div
                className="rounded-2xl p-4"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
                  Pipeline Distribution
                </p>
                <div className="h-3 rounded-full overflow-hidden flex gap-0.5">
                  {[
                    { val: q.waiting,      color: "#60a5fa" },
                    { val: q.eligible,     color: GOLD },
                    { val: q.validating,   color: "#fb923c" },
                    { val: q.queued,       color: "#a78bfa" },
                    { val: q.processing,   color: "#fb923c" },
                    { val: q.signed,       color: "#a78bfa" },
                    { val: q.broadcasting, color: "#fb7185" },
                    { val: q.confirming,   color: "#34d399" },
                    { val: q.manualReview, color: "#f87171" },
                  ]
                    .filter((s) => s.val > 0)
                    .map((s, i) => (
                      <div
                        key={i}
                        className="h-full rounded-sm transition-all duration-500"
                        style={{
                          width:      `${(s.val / q.total) * 100}%`,
                          background: s.color,
                        }}
                      />
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  {[
                    { label: "Waiting",     val: q.waiting,      color: "#60a5fa" },
                    { label: "Eligible",    val: q.eligible,     color: GOLD },
                    { label: "Processing",  val: q.processing + q.validating + q.queued, color: "#fb923c" },
                    { label: "Signing",     val: q.signed + q.broadcasting, color: "#a78bfa" },
                    { label: "Confirming",  val: q.confirming,   color: "#34d399" },
                    { label: "Manual Rev.", val: q.manualReview, color: "#f87171" },
                  ]
                    .filter((s) => s.val > 0)
                    .map((s) => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        <span className="text-xs" style={{ color: MUTED }}>{s.label}: {s.val}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── Configuration Summary ── */}
            <div
              className="rounded-2xl p-5"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Server className="h-4 w-4" style={{ color: GOLD }} />
                <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                  Configuration
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <ConfigRow
                  label="Min BNB (gas)"
                  value={`${health.hotWallet.minBnbRequired} BNB`}
                  ok={health.hotWallet.bnbSufficient}
                />
                <ConfigRow
                  label="Min USDT (liquidity)"
                  value={`${health.hotWallet.minUsdtRequired} USDT`}
                  ok={health.hotWallet.usdtSufficient}
                />
                <ConfigRow
                  label="Gateway configured"
                  value={health.hotWallet.configured ? "Yes" : "No"}
                  ok={health.hotWallet.configured}
                />
              </div>
            </div>

            {/* ── Last Processed ── */}
            {health.lastProcessed && (
              <div
                className="rounded-2xl p-5 flex items-center justify-between gap-4"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: "rgba(52,211,153,0.1)" }}
                  >
                    <CheckCircle className="h-5 w-5" style={{ color: "#34d399" }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Last Completed Withdrawal</p>
                    <p className="text-xs mt-0.5 font-mono" style={{ color: MUTED }}>
                      {health.lastProcessed.withdrawalId ?? health.lastProcessed.id}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold font-mono" style={{ color: "#34d399" }}>
                    {fmtUsd(health.lastProcessed.amount)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    {ago(health.lastProcessed.completedAt)}
                  </p>
                </div>
              </div>
            )}

            {/* ── Queue Worker ── */}
            {health.worker && (
              <QueueWorkerCard worker={health.worker} />
            )}

            {/* ── All clear ── */}
            {health.alerts.length === 0 && (
              <div
                className="rounded-2xl p-5 flex items-center gap-3"
                style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.18)" }}
              >
                <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: "#34d399" }} />
                <div>
                  <p className="text-sm font-semibold text-foreground">All systems normal</p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    No active alerts. Hot wallet balances are sufficient and the engine is running.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : null}

      </div>
    </AdminLayout>
  );
}

// ─── Queue Worker Card ────────────────────────────────────────────────────────
function QueueWorkerCard({ worker }: { worker: QueueWorkerStatus }) {
  const isRunning = worker.started;
  const lockHeld  = worker.lockHeld;

  const statusColor  = isRunning ? "#34d399" : "#f87171";
  const statusBg     = isRunning ? "rgba(52,211,153,0.1)"  : "rgba(248,113,113,0.1)";
  const statusBorder = isRunning ? "rgba(52,211,153,0.2)"  : "rgba(248,113,113,0.2)";
  const statusLabel  = isRunning ? "Running" : "Stopped";

  const lockColor  = lockHeld ? "#fbbf24" : "#34d399";
  const lockBg     = lockHeld ? "rgba(251,191,36,0.1)" : "rgba(52,211,153,0.1)";
  const lockLabel  = lockHeld ? "Running" : "Idle";

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Timer className="h-4 w-4" style={{ color: GOLD }} />
        <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
          Queue Worker
        </p>
        <div
          className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
          style={{ background: statusBg, border: `1px solid ${statusBorder}` }}
        >
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
          <span className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Poll Interval */}
        <div className="flex flex-col gap-0.5">
          <p className="text-xs" style={{ color: MUTED }}>Poll Interval</p>
          <p className="text-sm font-mono font-semibold text-foreground">
            {worker.pollIntervalSeconds}s
          </p>
        </div>

        {/* Last Poll */}
        <div className="flex flex-col gap-0.5">
          <p className="text-xs" style={{ color: MUTED }}>Last Poll</p>
          <p className="text-sm font-mono font-semibold text-foreground">
            {worker.lastPollAt ? ago(worker.lastPollAt) : "—"}
          </p>
        </div>

        {/* Last Success */}
        <div className="flex flex-col gap-0.5">
          <p className="text-xs" style={{ color: MUTED }}>Last Successful Run</p>
          <p className="text-sm font-mono font-semibold text-foreground">
            {worker.lastSuccessAt ? ago(worker.lastSuccessAt) : "—"}
          </p>
        </div>

        {/* Lock status */}
        <div className="flex flex-col gap-0.5">
          <p className="text-xs" style={{ color: MUTED }}>Worker Lock</p>
          <div
            className="flex items-center gap-1.5 w-fit rounded-full px-2 py-0.5"
            style={{ background: lockBg }}
          >
            {lockHeld
              ? <Lock   className="h-3 w-3" style={{ color: lockColor }} />
              : <Unlock className="h-3 w-3" style={{ color: lockColor }} />
            }
            <span className="text-xs font-semibold" style={{ color: lockColor }}>{lockLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs" style={{ color: MUTED }}>{label}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-mono font-semibold text-foreground">{value}</p>
        <div
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: ok ? "#34d399" : "#f87171" }}
        />
      </div>
    </div>
  );
}
