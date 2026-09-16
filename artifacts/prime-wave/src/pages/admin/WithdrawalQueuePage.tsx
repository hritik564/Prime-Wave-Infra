import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Play, Loader2, Clock, CheckCircle, AlertTriangle,
  Zap, Filter, ChevronLeft, ChevronRight, Copy, ExternalLink,
  PenLine, Radio, GitMerge, ShieldAlert, ListOrdered, X,
  CheckSquare, ArrowRight, Wifi, WifiOff, BarChart2, AlertOctagon,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { FalsePositiveStageCorrectionModal } from "./WithdrawalModals";
import { canCorrectFalsePositiveStage } from "./withdrawal-action-policy";
import { useAuth } from "@/providers/AuthProvider";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  getWithdrawalQueue,
  triggerProcessQueue,
  getWithdrawalEvents,
  adminCorrectFalsePositiveWithdrawalStage,
  type WithdrawalQueueItem,
  type WithdrawalEvent,
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

const fmtTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

const shorten = (addr: string) =>
  addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;

const shortenHash = (hash: string) =>
  hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;

const BSC_SCAN_TX = "https://bscscan.com/tx/";

const BSC_CONFIRMATIONS_REQUIRED = parseInt(
  import.meta.env["VITE_BSC_CONFIRMATIONS_REQUIRED"] ?? "3",
  10,
) || 3;

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  VALIDATING:   { bg: "rgba(251,146,60,0.12)",   color: "#fb923c" },
  QUEUED:       { bg: "rgba(96,165,250,0.12)",   color: "#60a5fa" },
  PROCESSING:   { bg: "rgba(212,175,55,0.12)",   color: GOLD },
  SIGNED:       { bg: "rgba(167,139,250,0.12)",  color: "#a78bfa" },
  BROADCASTING: { bg: "rgba(251,113,133,0.12)",  color: "#fb7185" },
  CONFIRMING:   { bg: "rgba(52,211,153,0.12)",   color: "#34d399" },
  MANUAL_REVIEW:{ bg: "rgba(239,68,68,0.14)",    color: "#f87171" },
  BROADCAST_UNKNOWN: { bg: "rgba(249,115,22,0.16)", color: "#fb923c" },
  PROCESSOR_FAILURE: { bg: "rgba(251,113,133,0.16)", color: "#fb7185" },
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  VALIDATING:   <Filter       className="h-3 w-3" />,
  QUEUED:       <Clock        className="h-3 w-3" />,
  PROCESSING:   <Zap          className="h-3 w-3" />,
  SIGNED:       <PenLine      className="h-3 w-3" />,
  BROADCASTING: <Radio        className="h-3 w-3" />,
  CONFIRMING:   <GitMerge     className="h-3 w-3" />,
  MANUAL_REVIEW:<ShieldAlert  className="h-3 w-3" />,
  BROADCAST_UNKNOWN: <ShieldAlert className="h-3 w-3" />,
  PROCESSOR_FAILURE: <AlertOctagon className="h-3 w-3" />,
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: "rgba(255,255,255,0.06)", color: MUTED };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.color }}
    >
      {STATUS_ICONS[status]}
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Confirmation progress bar ────────────────────────────────────────────────
function ConfirmationProgress({
  item,
  required,
}: {
  item: WithdrawalQueueItem;
  required: number;
}) {
  if (item.status !== "CONFIRMING" && item.status !== "COMPLETED") return null;

  const count    = item.confirmationCount ?? 0;
  const pct      = Math.min(100, Math.round((count / required) * 100));
  const complete = item.status === "COMPLETED" || count >= required;

  return (
    <div className="mt-1.5 flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${complete ? 100 : pct}%`,
            background: complete ? "#34d399" : `linear-gradient(90deg, #34d399 0%, #6ee7b7 100%)`,
          }}
        />
      </div>
      <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: complete ? "#34d399" : MUTED }}>
        {complete ? `✓ ${required}/${required}` : `${count}/${required}`}
      </span>
    </div>
  );
}

// ─── Timeline event row ────────────────────────────────────────────────────────
const EVENT_COLORS: Record<string, string> = {
  CREATED:          "#60a5fa",
  VALIDATED:        "#fb923c",
  QUEUED:           "#60a5fa",
  PROCESSING:       GOLD,
  SIGNED:           "#a78bfa",
  BROADCAST:        "#fb7185",
  CONFIRMING:       "#34d399",
  CONFIRMATION_POLL:"#6ee7b7",
  CONFIRMED:        "#34d399",
  COMPLETED:        "#34d399",
  FAILED:           "#f87171",
  REFUNDED:         "#fb923c",
  MANUAL_REVIEW:    "#f87171",
  RECOVERY_SCAN:    "#facc15",
  CANCELLED:        MUTED,
  APPROVED:         "#34d399",
  REJECTED:         "#f87171",
  BROADCAST_UNKNOWN:"#fb923c",
  PROCESSOR_FAILURE:"#fb7185",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  CREATED:          <Clock        className="h-3.5 w-3.5" />,
  VALIDATED:        <Filter       className="h-3.5 w-3.5" />,
  QUEUED:           <Clock        className="h-3.5 w-3.5" />,
  PROCESSING:       <Zap          className="h-3.5 w-3.5" />,
  SIGNED:           <PenLine      className="h-3.5 w-3.5" />,
  BROADCAST:        <Radio        className="h-3.5 w-3.5" />,
  CONFIRMING:       <GitMerge     className="h-3.5 w-3.5" />,
  CONFIRMATION_POLL:<BarChart2    className="h-3.5 w-3.5" />,
  CONFIRMED:        <CheckSquare  className="h-3.5 w-3.5" />,
  COMPLETED:        <CheckCircle  className="h-3.5 w-3.5" />,
  FAILED:           <AlertOctagon className="h-3.5 w-3.5" />,
  REFUNDED:         <ArrowRight   className="h-3.5 w-3.5" />,
  MANUAL_REVIEW:    <ShieldAlert  className="h-3.5 w-3.5" />,
  RECOVERY_SCAN:    <Wifi         className="h-3.5 w-3.5" />,
  CANCELLED:        <X            className="h-3.5 w-3.5" />,
  BROADCAST_UNKNOWN:<ShieldAlert  className="h-3.5 w-3.5" />,
  PROCESSOR_FAILURE:<AlertOctagon className="h-3.5 w-3.5" />,
};

function EventRow({ event, isLast }: { event: WithdrawalEvent; isLast: boolean }) {
  const color = EVENT_COLORS[event.eventType] ?? MUTED;
  const icon  = EVENT_ICONS[event.eventType] ?? <WifiOff className="h-3.5 w-3.5" />;

  const details = event.details;
  const detailStr = details
    ? Object.entries(details)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" · ")
    : null;

  return (
    <div className="flex gap-3">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0"
          style={{ background: `${color}20`, color }}
        >
          {icon}
        </div>
        {!isLast && <div className="w-px flex-1 mt-1" style={{ background: BORDER, minHeight: "16px" }} />}
      </div>
      {/* Content */}
      <div className="pb-4 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
            {event.eventType.replace(/_/g, " ")}
          </span>
          <span className="text-[10px]" style={{ color: MUTED }}>
            {fmtTime(event.createdAt)}
          </span>
        </div>
        {detailStr && (
          <p className="text-[11px] mt-0.5 font-mono break-all" style={{ color: MUTED }}>
            {detailStr}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Timeline Drawer ──────────────────────────────────────────────────────────
function TimelineDrawer({
  item,
  onClose,
}: {
  item: WithdrawalQueueItem;
  onClose: () => void;
}) {
  const [events, setEvents]     = useState<WithdrawalEvent[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getWithdrawalEvents(item.id)
      .then((data) => { if (!cancelled) { setEvents(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.id]);

  const required = BSC_CONFIRMATIONS_REQUIRED;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          width: "min(480px, 95vw)",
          background: "hsl(222 62% 8%)",
          borderLeft: `1px solid ${BORDER}`,
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <h2 className="text-base font-bold font-heading text-foreground">Withdrawal Timeline</h2>
            <p className="text-xs mt-0.5 font-mono" style={{ color: MUTED }}>
              {item.withdrawalId ?? item.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:text-white"
            style={{ color: MUTED, background: "rgba(255,255,255,0.04)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="px-5 py-4 space-y-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: MUTED }}>Member</p>
              <p className="text-sm font-semibold text-foreground">{item.user.username}</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: MUTED }}>Amount</p>
              <p className="text-sm font-semibold font-mono" style={{ color: GOLD }}>{fmt(item.netAmount)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <StatusBadge status={item.status} />
            {item.status === "MANUAL_REVIEW" && item.failureReason && (
              <p className="text-xs max-w-[200px] text-right" style={{ color: "#f87171" }}>
                {item.failureReason}
              </p>
            )}
          </div>

          {/* Confirmation progress */}
          {(item.status === "CONFIRMING" || item.confirmationCount !== null) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs" style={{ color: MUTED }}>Confirmations</p>
                <p className="text-xs font-mono" style={{ color: MUTED }}>
                  Required: {required}
                </p>
              </div>
              <ConfirmationProgress item={item} required={required} />
              {item.confirmationBlock && (
                <p className="text-[10px] mt-1 font-mono" style={{ color: MUTED }}>
                  block #{item.confirmationBlock}
                </p>
              )}
            </div>
          )}

          {/* TxHash */}
          {item.txHash && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs" style={{ color: "#34d399" }}>{shortenHash(item.txHash)}</span>
              <a
                href={`${BSC_SCAN_TX}${item.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded transition-colors hover:text-white"
                style={{ color: MUTED }}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: MUTED }}>
            Event Timeline
          </p>
          {loading ? (
            <div className="flex items-center gap-2" style={{ color: MUTED }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading events…</span>
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm" style={{ color: MUTED }}>No events recorded yet.</p>
          ) : (
            <div>
              {events.map((e, idx) => (
                <EventRow key={e.id} event={e} isLast={idx === events.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── All filter tabs ──────────────────────────────────────────────────────────
type FilterKey = "ALL" | "VALIDATING" | "QUEUED" | "PROCESSING" | "SIGNED" | "BROADCASTING" | "BROADCAST_UNKNOWN" | "CONFIRMING" | "MANUAL_REVIEW";
const FILTER_TABS: FilterKey[] = ["ALL", "VALIDATING", "QUEUED", "PROCESSING", "SIGNED", "BROADCASTING", "BROADCAST_UNKNOWN", "CONFIRMING", "MANUAL_REVIEW"];

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

export default function WithdrawalQueuePage() {
  const { toasts, toast: showToast, dismiss: dismissToast } = useToast();
  const { role } = useAuth();
  const isStaffOperations = role === "STAFF_OPERATIONS";
  const [items, setItems]               = useState<WithdrawalQueueItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [processing, setProcessing]     = useState(false);
  const [page, setPage]                 = useState(1);
  const [filterStatus, setFilterStatus] = useState<FilterKey>("ALL");
  const [timelineItem, setTimelineItem] = useState<WithdrawalQueueItem | null>(null);
  const [correctionItem, setCorrectionItem] = useState<WithdrawalQueueItem | null>(null);
  const [correctionLoading, setCorrectionLoading] = useState(false);

  const required = BSC_CONFIRMATIONS_REQUIRED;

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
    if (isStaffOperations) return;
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

  const handleFalsePositiveCorrection = async (reason: string) => {
    if (isStaffOperations || !correctionItem || !canCorrectFalsePositiveStage(correctionItem)) return;
    setCorrectionLoading(true);
    try {
      const result = await adminCorrectFalsePositiveWithdrawalStage(correctionItem.id, reason);
      showToast(
        result.alreadyReconciled
          ? "False-positive stage correction was already applied"
          : "False-positive stage corrected; withdrawal moved to manual review",
        "success",
      );
      setCorrectionItem(null);
      await load();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "False-positive stage correction failed", "error");
    } finally {
      setCorrectionLoading(false);
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

  const countOf = (s: FilterKey) =>
    s === "ALL" ? items.length : items.filter((i) => i.status === s).length;

  const activeTabs = FILTER_TABS.filter((s) => s === "ALL" || countOf(s) > 0);
  const manualReviewCount = items.filter((i) => i.status === "MANUAL_REVIEW").length;
  const broadcastUnknownCount = items.filter(
    (i) => i.status === "BROADCAST_UNKNOWN" && !i.txHash && !i.broadcastAt,
  ).length;

  return (
    <AdminLayout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Timeline drawer */}
      {timelineItem && (
        <TimelineDrawer item={timelineItem} onClose={() => setTimelineItem(null)} />
      )}
      {!isStaffOperations && correctionItem && (
        <FalsePositiveStageCorrectionModal
          w={{
            id: correctionItem.id,
            amount: Number(correctionItem.amount),
            fee: Number(correctionItem.fee),
            username: correctionItem.user.username,
            walletType: "WITHDRAWAL",
            network: correctionItem.network,
            status: correctionItem.status,
            destinationAddress: correctionItem.walletAddressSnapshot,
          }}
          onClose={() => { if (!correctionLoading) setCorrectionItem(null); }}
          onConfirm={(reason) => void handleFalsePositiveCorrection(reason)}
          submitting={correctionLoading}
        />
      )}

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
            {!isStaffOperations && <button
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
            </button>}
          </div>
        </div>

        {/* ── Reconciliation alert ── */}
        {broadcastUnknownCount > 0 && (
          <div
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.28)" }}
          >
            <ShieldAlert className="h-5 w-5 flex-shrink-0" style={{ color: "#fb923c" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "#fb923c" }}>
                {broadcastUnknownCount} withdrawal{broadcastUnknownCount > 1 ? "s" : ""} require reconciliation
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(251,146,60,0.78)" }}>
                No transaction hash — reconciliation required. Do not label these payments as pending confirmation.
              </p>
            </div>
            <button
              onClick={() => { setFilterStatus("BROADCAST_UNKNOWN"); setPage(1); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "rgba(249,115,22,0.15)", color: "#fb923c" }}
            >
              View
            </button>
          </div>
        )}

        {/* ── Manual Review alert ── */}
        {manualReviewCount > 0 && (
          <div
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <ShieldAlert className="h-5 w-5 flex-shrink-0" style={{ color: "#f87171" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "#f87171" }}>
                {manualReviewCount} withdrawal{manualReviewCount > 1 ? "s" : ""} require manual review
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(248,113,113,0.7)" }}>
                Blockchain state is ambiguous. Inspect the timeline and verify on BscScan before taking action.
              </p>
            </div>
            <button
              onClick={() => { setFilterStatus("MANUAL_REVIEW"); setPage(1); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
            >
              View
            </button>
          </div>
        )}

        {/* ── Summary Cards ── */}
        <div className="flex flex-wrap gap-2">
          {activeTabs.map((s) => (
            <button
              key={s}
              onClick={() => { setFilterStatus(s); setPage(1); }}
              className="rounded-2xl px-4 py-3 text-left transition-all"
              style={{
                background: filterStatus === s ? "rgba(212,175,55,0.08)" : CARD,
                border:     filterStatus === s ? `1px solid rgba(212,175,55,0.35)` : `1px solid ${s === "MANUAL_REVIEW" && countOf(s) > 0 ? "rgba(239,68,68,0.25)" : BORDER}`,
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: s === "MANUAL_REVIEW" && countOf(s) > 0 ? "#f87171" : MUTED }}>
                {s.replace("_", " ")}
              </p>
              <p className="text-xl font-bold font-heading" style={{ color: filterStatus === s ? GOLD : s === "MANUAL_REVIEW" && countOf(s) > 0 ? "#f87171" : "white" }}>
                {countOf(s)}
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
                  {["Withdrawal ID", "Username", "Amount", "Net", "Network", "Wallet Address", "Status", "Confirmations", "Tx Hash", "Requested"].map((h) => (
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
                    <td colSpan={11} className="text-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" style={{ color: GOLD }} />
                      <p className="text-sm" style={{ color: MUTED }}>Loading queue…</p>
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-16">
                      <CheckCircle className="h-8 w-8 mx-auto mb-3" style={{ color: "#34d399" }} />
                      <p className="font-semibold text-foreground">Queue is empty</p>
                      <p className="text-xs mt-1" style={{ color: MUTED }}>
                        {filterStatus === "ALL"
                          ? "No active withdrawal requests in the pipeline"
                          : `No ${filterStatus.replace("_", " ")} requests`}
                      </p>
                    </td>
                  </tr>
                ) : paged.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: idx < paged.length - 1 ? `1px solid ${BORDER}` : undefined,
                      background:   item.status === "MANUAL_REVIEW"
                        ? "rgba(239,68,68,0.04)"
                        : idx % 2 === 1 ? "rgba(255,255,255,0.01)" : undefined,
                    }}
                  >
                    {/* Withdrawal ID */}
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: GOLD }}>
                      {item.withdrawalId ?? item.id.slice(0, 12)}
                    </td>

                    {/* Username */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{item.user.username}</p>
                        <p className="text-xs" style={{ color: MUTED }}>{item.user.email}</p>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                      {fmt(item.amount)}
                    </td>

                    {/* Net Amount */}
                    <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap" style={{ color: "#34d399" }}>
                      {fmt(item.netAmount)}
                    </td>

                    {/* Network */}
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: MUTED }}>
                        {item.network}
                      </span>
                    </td>

                    {/* Wallet Address */}
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

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                      {item.status === "MANUAL_REVIEW" && item.failureReason && (
                        <p className="text-[10px] mt-1 max-w-[160px] leading-tight" style={{ color: "#f87171" }}>
                          {item.failureReason.length > 60 ? `${item.failureReason.slice(0, 60)}…` : item.failureReason}
                        </p>
                      )}
                    </td>

                    {/* Confirmations */}
                    <td className="px-4 py-3 min-w-[130px]">
                      {(item.status === "CONFIRMING" || item.confirmationCount !== null) ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <BarChart2 className="h-3 w-3 flex-shrink-0" style={{ color: "#34d399" }} />
                            <span className="text-xs font-mono" style={{ color: item.confirmationCount !== null && item.confirmationCount >= required ? "#34d399" : MUTED }}>
                              {item.confirmationCount ?? 0}/{required}
                            </span>
                          </div>
                          <ConfirmationProgress item={item} required={required} />
                          {item.confirmationBlock && (
                            <p className="text-[10px] mt-0.5 font-mono" style={{ color: MUTED }}>
                              block #{item.confirmationBlock}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: MUTED }}>—</span>
                      )}
                    </td>

                    {/* Tx Hash */}
                    <td className="px-4 py-3">
                      {item.txHash ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs" style={{ color: "#34d399" }}>
                            {shortenHash(item.txHash)}
                          </span>
                          <button
                            onClick={() => copyToClipboard(item.txHash!)}
                            className="p-1 rounded transition-colors hover:text-white"
                            style={{ color: MUTED }}
                            title="Copy tx hash"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <a
                            href={`${BSC_SCAN_TX}${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded transition-colors hover:text-white"
                            style={{ color: MUTED }}
                            title="View on BscScan"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: MUTED }}>—</span>
                      )}
                    </td>

                    {/* Requested */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-foreground">{ago(item.requestedAt)}</p>
                      {item.broadcastAt && (
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                          sent {ago(item.broadcastAt)}
                        </p>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setTimelineItem(item)}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", border: `1px solid ${BORDER}` }}
                          title="View timeline"
                        >
                          <ListOrdered className="h-3 w-3" />
                          Timeline
                        </button>
                        <a
                          href={`/admin/withdrawals`}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", border: `1px solid ${BORDER}` }}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </a>
                        {!isStaffOperations && canCorrectFalsePositiveStage(item) && (
                          <button
                            onClick={() => setCorrectionItem(item)}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors"
                            style={{ background: "rgba(250,204,21,0.1)", color: "#facc15", border: "1px solid rgba(250,204,21,0.3)" }}
                            title="Correct the PW-WD-000130 false-positive stage"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Correct Stage
                          </button>
                        )}
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

        {/* ── Empty state ── */}
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
