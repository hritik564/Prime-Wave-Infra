import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Play, Loader2, Clock, CheckCircle, AlertTriangle,
  Zap, Filter, ChevronLeft, ChevronRight, Copy, ExternalLink,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  getWithdrawalQueue,
  triggerProcessQueue,
  type WithdrawalQueueItem,
} from "@/lib/api";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: string | number) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ago = (d: string) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const shorten = (addr: string) =>
  addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  VALIDATING: { bg: "rgba(251,146,60,0.12)",  color: "#fb923c" },
  QUEUED:     { bg: "rgba(96,165,250,0.12)",  color: "#60a5fa" },
  PROCESSING: { bg: "rgba(212,175,55,0.12)",  color: GOLD },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: "rgba(255,255,255,0.06)", color: MUTED };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.color }}
    >
      {status === "VALIDATING" && <Filter className="h-3 w-3" />}
      {status === "QUEUED"     && <Clock className="h-3 w-3" />}
      {status === "PROCESSING" && <Zap className="h-3 w-3" />}
      {status}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

export default function WithdrawalQueuePage() {
  const { toasts, toast: showToast, dismiss: dismissToast } = useToast();
  const [items, setItems]         = useState<WithdrawalQueueItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [processing, setProcessing] = useState(false);
  const [page, setPage]           = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWithdrawalQueue();
      setItems(data);
    } catch {
      showToast("Failed to load queue", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const result = await triggerProcessQueue();
      showToast(
        `Processed ${result.processed} withdrawal(s)${result.failed ? `, ${result.failed} failed` : ""}`,
        result.failed ? "error" : "success",
      );
      await load();
    } catch {
      showToast("Failed to trigger processing", "error");
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    showToast("Copied to clipboard", "success");
  };

  // ── Filter + paginate ────────────────────────────────────────────────────────
  const filtered = filterStatus === "ALL"
    ? items
    : items.filter((i) => i.status === filterStatus);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    ALL:        items.length,
    VALIDATING: items.filter((i) => i.status === "VALIDATING").length,
    QUEUED:     items.filter((i) => i.status === "QUEUED").length,
    PROCESSING: items.filter((i) => i.status === "PROCESSING").length,
  };

  return (
    <AdminLayout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="space-y-6 p-4 lg:p-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground">Withdrawal Queue</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>
              Active requests in the processing pipeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", border: `1px solid ${BORDER}` }}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={() => void handleProcess()}
              disabled={processing || loading}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
              style={
                processing || loading
                  ? { background: "rgba(255,255,255,0.06)", color: "rgba(170,179,197,0.4)", border: `1px solid ${BORDER}` }
                  : { background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_L} 100%)`, color: "#0E1B37", boxShadow: "0 4px 12px rgba(212,175,55,0.3)" }
              }
            >
              {processing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Play className="h-4 w-4" />}
              {processing ? "Processing…" : "Process Queue"}
            </button>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(["ALL", "VALIDATING", "QUEUED", "PROCESSING"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(1); }}
              className="rounded-2xl p-4 text-left transition-all"
              style={{
                background: filterStatus === s ? "rgba(212,175,55,0.08)" : CARD,
                border: filterStatus === s ? `1px solid rgba(212,175,55,0.35)` : `1px solid ${BORDER}`,
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: MUTED }}>{s}</p>
              <p className="text-2xl font-bold font-heading" style={{ color: filterStatus === s ? GOLD : "white" }}>
                {counts[s]}
              </p>
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {["Withdrawal ID", "Username", "Amount", "Fee", "Net Amount", "Network", "Wallet Address", "Status", "Requested"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest whitespace-nowrap"
                      style={{ color: MUTED }}
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-left" style={{ color: MUTED }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" style={{ color: GOLD }} />
                      <p className="text-sm" style={{ color: MUTED }}>Loading queue…</p>
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16">
                      <CheckCircle className="h-8 w-8 mx-auto mb-3" style={{ color: "#34d399" }} />
                      <p className="font-semibold text-foreground">Queue is empty</p>
                      <p className="text-xs mt-1" style={{ color: MUTED }}>
                        {filterStatus === "ALL"
                          ? "No active withdrawal requests in the pipeline"
                          : `No ${filterStatus} requests`}
                      </p>
                    </td>
                  </tr>
                ) : paged.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: idx < paged.length - 1 ? `1px solid ${BORDER}` : undefined,
                      background: idx % 2 === 1 ? "rgba(255,255,255,0.01)" : undefined,
                    }}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: GOLD }}>
                      {item.withdrawalId ?? item.id.slice(0, 12)}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{item.user.username}</p>
                        <p className="text-xs" style={{ color: MUTED }}>{item.user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                      {fmt(item.amount)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: MUTED }}>
                      {fmt(item.fee)}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap" style={{ color: "#34d399" }}>
                      {fmt(item.netAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>
                        {item.network}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-foreground">{shorten(item.walletAddressSnapshot)}</span>
                        <button
                          onClick={() => copyToClipboard(item.walletAddressSnapshot)}
                          className="p-1 rounded transition-colors hover:text-white"
                          style={{ color: MUTED }}
                          title="Copy address"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-foreground">{ago(item.requestedAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <a
                          href={`/admin/withdrawals`}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", border: `1px solid ${BORDER}` }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-xs" style={{ color: MUTED }}>
                {filtered.length} total · page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)" }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)" }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Error list ── */}
        {items.length === 0 && !loading && (
          <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(212,175,55,0.04)", border: `1px solid rgba(212,175,55,0.12)` }}>
            <AlertTriangle className="h-6 w-6 mx-auto mb-2" style={{ color: GOLD }} />
            <p className="text-sm font-medium text-foreground">No active withdrawals</p>
            <p className="text-xs mt-1" style={{ color: MUTED }}>
              When members submit withdrawal requests, they will appear here for processing.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
