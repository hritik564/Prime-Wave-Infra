import { useState, useEffect, useCallback } from "react";
import {
  Wifi, WifiOff, RefreshCw, Loader2, Server, Zap, Wallet,
  CheckCircle, AlertTriangle, Activity, Eye, EyeOff,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import { getBlockchainHealth, type BlockchainHealth } from "@/lib/api";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

const fmt2 = (n: string | null | undefined) =>
  n ? Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "—";

function shorten(s: string | null | undefined) {
  if (!s) return "Not configured";
  return s.length > 20 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s;
}

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)  return "Just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color = "white",
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold font-heading" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: MUTED }}>{sub}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BlockchainHealthPage() {
  const { toasts, toast, dismiss } = useToast();
  const [health, setHealth]   = useState<BlockchainHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddr, setShowAddr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlockchainHealth();
      setHealth(data);
    } catch {
      toast("Failed to load blockchain health", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const net = health?.networks?.[0] ?? null;

  return (
    <AdminLayout>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="space-y-6 p-4 lg:p-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground">Blockchain Health</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>
              Real-time BSC gateway status and hot wallet monitoring
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

        {/* ── Not configured ── */}
        {!loading && (!health?.configured || !net) && (
          <div className="rounded-2xl p-8 text-center" style={{ background: CARD, border: `1px solid rgba(212,175,55,0.2)` }}>
            <WifiOff className="h-10 w-10 mx-auto mb-3" style={{ color: "rgba(170,179,197,0.4)" }} />
            <p className="font-semibold text-foreground text-lg">Gateway Not Configured</p>
            <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: MUTED }}>
              Set <code className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", fontSize: "0.75rem" }}>BSC_RPC_PRIMARY</code> and <code className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", fontSize: "0.75rem" }}>HOT_WALLET_ADDRESS</code> environment variables to enable the blockchain gateway.
            </p>
          </div>
        )}

        {/* ── Connection status banner ── */}
        {net && (
          <div
            className="rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{
              background: net.connected
                ? "rgba(52,211,153,0.06)"
                : "rgba(239,68,68,0.06)",
              border: net.connected
                ? "1px solid rgba(52,211,153,0.2)"
                : "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {net.connected
              ? <CheckCircle className="h-6 w-6 shrink-0" style={{ color: "#34d399" }} />
              : <AlertTriangle className="h-6 w-6 shrink-0" style={{ color: "#ef4444" }} />}
            <div className="flex-1">
              <p className="font-semibold text-foreground">
                {net.connected ? "Connected to BSC Mainnet" : "Disconnected"}
              </p>
              {net.error && (
                <p className="text-xs mt-0.5" style={{ color: "#ef4444" }}>{net.error}</p>
              )}
              {net.connected && (
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  {net.network} · Chain ID {net.chainId} · {ago(net.checkedAt)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {net.dryRunMode && (
                <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(212,175,55,0.12)", color: GOLD }}>
                  DRY RUN
                </span>
              )}
              {net.connected && (
                <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>
                  LIVE
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Stat grid ── */}
        {net && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Latest Block"
              value={net.latestBlock ? net.latestBlock.toLocaleString() : "—"}
              sub={net.rpcLatencyMs ? `${net.rpcLatencyMs}ms latency` : undefined}
              icon={Activity}
              color={net.connected ? "#34d399" : MUTED}
            />
            <StatCard
              label="Gas Price"
              value={net.gasPriceGwei ? `${net.gasPriceGwei} Gwei` : "—"}
              sub="Current network gas"
              icon={Zap}
              color={GOLD}
            />
            <StatCard
              label="BNB Balance"
              value={net.bnbBalance ? `${fmt2(net.bnbBalance)} BNB` : "—"}
              sub="Hot wallet native balance"
              icon={Server}
              color="#60a5fa"
            />
            <StatCard
              label="USDT Balance"
              value={net.usdtBalance ? `${fmt2(net.usdtBalance)} USDT` : "—"}
              sub="Hot wallet USDT balance"
              icon={Wallet}
              color={net.usdtBalance && Number(net.usdtBalance) > 100 ? "#34d399" : "#f87171"}
            />
          </div>
        )}

        {/* ── Hot wallet address ── */}
        {net && (
          <div className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">Hot Wallet Address</p>
              <button
                onClick={() => setShowAddr((v) => !v)}
                className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5"
                style={{ background: "rgba(255,255,255,0.05)", color: MUTED }}
              >
                {showAddr ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showAddr ? "Hide" : "Show"}
              </button>
            </div>
            {net.hotWalletAddress ? (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background: "rgba(212,175,55,0.1)" }}>
                  <Wallet className="h-4 w-4" style={{ color: GOLD }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm text-foreground truncate">
                    {showAddr ? net.hotWalletAddress : shorten(net.hotWalletAddress)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>BEP20 / BSC Mainnet</p>
                </div>
                <div className="flex h-2.5 w-2.5 rounded-full shrink-0" style={{ background: "#34d399" }} />
              </div>
            ) : (
              <p className="text-sm" style={{ color: "#fb923c" }}>
                HOT_WALLET_ADDRESS not set — configure this environment variable to enable withdrawals
              </p>
            )}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
            <p className="ml-3 text-sm" style={{ color: MUTED }}>Querying blockchain…</p>
          </div>
        )}

        {/* ── RPC info ── */}
        {net && (
          <div className="rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Network Details</p>
            <div className="space-y-2">
              {[
                ["Network",   net.network],
                ["Chain ID",  String(net.chainId)],
                ["Mode",      net.dryRunMode ? "Dry Run (no real transactions)" : "Live"],
                ["Checked",   ago(net.checkedAt)],
                ["Latency",   net.rpcLatencyMs ? `${net.rpcLatencyMs}ms` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: MUTED }}>{k}</p>
                  <p className="text-xs font-medium text-foreground">{v}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
