import { useState, useCallback, useEffect } from "react";
import {
  Search, RefreshCw, Loader2, Copy, CheckCheck,
  Clock, Wifi, RotateCcw,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import {
  adminListDepositVerifications,
  adminRetryDepositVerification,
  type AdminDepositVerificationItem,
  type DepositVerificationStatus,
  type ListMeta,
} from "@/lib/api";

// ── Status display config ─────────────────────────────────────────────────────

type StatusVariant = "active" | "success" | "warning" | "error" | "muted";

const STATUS_CONFIG: Record<string, { label: string; variant: StatusVariant }> = {
  CREATED:               { label: "Created",     variant: "muted"   },
  TX_SUBMITTED:          { label: "Submitted",   variant: "active"  },
  VERIFYING:             { label: "Verifying",   variant: "active"  },
  VERIFICATION_DELAYED:  { label: "Delayed",     variant: "warning" },
  WAITING_CONFIRMATIONS: { label: "Confirming",  variant: "warning" },
  CONFIRMED:             { label: "Confirmed",   variant: "success" },
  CREDITED:              { label: "Credited",    variant: "success" },
  COMPLETED:             { label: "Completed",   variant: "success" },
  FAILED:                { label: "Failed",      variant: "error"   },
  REJECTED:              { label: "Rejected",    variant: "error"   },
  EXPIRED:               { label: "Expired",     variant: "error"   },
};

const VARIANT_STYLE: Record<StatusVariant, { bg: string; color: string }> = {
  active:  { bg: "rgba(212,175,55,0.12)",  color: "#D4AF37"  },
  success: { bg: "rgba(52,211,153,0.12)",  color: "#34d399"  },
  warning: { bg: "rgba(251,191,36,0.12)",  color: "#fbbf24"  },
  error:   { bg: "rgba(248,113,113,0.12)", color: "#f87171"  },
  muted:   { bg: "rgba(255,255,255,0.05)", color: "rgba(170,179,197,0.6)" },
};

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All",        value: ""                      },
  { label: "Active",     value: "VERIFYING"             },
  { label: "Delayed",    value: "VERIFICATION_DELAYED"  },
  { label: "Confirming", value: "WAITING_CONFIRMATIONS" },
  { label: "Completed",  value: "COMPLETED"             },
  { label: "Failed",     value: "FAILED"                },
  { label: "Expired",    value: "EXPIRED"               },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount: string | null) {
  if (!amount) return "—";
  const n = parseFloat(amount);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shorten(hash: string) {
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex h-6 w-6 items-center justify-center rounded transition-all opacity-50 hover:opacity-100"
      style={{ color: "#D4AF37" }}
    >
      {copied ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "muted" as StatusVariant };
  const style = VARIANT_STYLE[cfg.variant];
  const isPulsing = cfg.variant === "active" || status === "VERIFICATION_DELAYED";
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {isPulsing && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: style.color }} />}
      {cfg.label}
    </span>
  );
}

function NetworkBadge({ network }: { network: string }) {
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded"
      style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.15)" }}
    >
      {network}
    </span>
  );
}

function ConfirmationBar({ current, required }: { current: number; required: number }) {
  const pct = Math.min(100, (current / required) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1" style={{ color: "rgba(170,179,197,0.6)" }}>
        <span>{current}/{required}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", minWidth: 80 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #D4AF37, #F3D37A)" }} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"];

export default function AutoDepositsPage() {
  const [records,     setRecords]     = useState<AdminDepositVerificationItem[]>([]);
  const [meta,        setMeta]        = useState<ListMeta | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [status,      setStatus]      = useState("");
  const [search,      setSearch]      = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [retryingId,  setRetryingId]  = useState<string | null>(null);

  const load = useCallback(async (overrides?: { page?: number; status?: string; search?: string }) => {
    setLoading(true);
    try {
      const result = await adminListDepositVerifications({
        page:   overrides?.page    ?? page,
        limit:  25,
        status: (overrides?.status  ?? status)  || undefined,
        search: (overrides?.search  ?? search)  || undefined,
      });
      setRecords(result.data as AdminDepositVerificationItem[]);
      setMeta(result.meta);
    } catch { /* keep previous */ } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { void load(); }, [load]);

  const handleTabChange = (val: string) => {
    setStatus(val);
    setPage(1);
    void load({ page: 1, status: val, search });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    void load({ page: 1, status, search: searchInput });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void load({ page: newPage });
  };

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      await adminRetryDepositVerification(id);
      await load();
    } catch { /* keep previous */ } finally {
      setRetryingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground">Auto Deposits</h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(170,179,197,0.6)" }}>
              Blockchain-verified USDT deposits
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 text-xs rounded-xl px-3 py-2 transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(170,179,197,0.7)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: status === tab.value ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${status === tab.value ? "rgba(212,175,55,0.35)" : "rgba(255,255,255,0.07)"}`,
                color: status === tab.value ? "#D4AF37" : "rgba(170,179,197,0.6)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "rgba(170,179,197,0.4)" }} />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by TX hash, username, or email…"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "hsl(var(--foreground))",
              }}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold rounded-xl transition-all"
            style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.25)", color: "#D4AF37" }}
          >
            Search
          </button>
        </form>

        {/* Table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Wifi className="h-8 w-8 opacity-20" style={{ color: "#D4AF37" }} />
              <p className="text-sm" style={{ color: "rgba(170,179,197,0.5)" }}>No verifications found</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["User", "TX Hash", "Network", "Amount", "Confirmations", "Status", "Attempts", "Next Check", "Created", "Credited", ""].map((h) => (
                        <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(170,179,197,0.5)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => {
                      const isDelayed  = r.verificationStatus === "VERIFICATION_DELAYED";
                      const isTerminal = TERMINAL_STATUSES.includes(r.verificationStatus);
                      return (
                        <tr
                          key={r.id}
                          className="transition-colors hover:bg-white/[0.02]"
                          style={{
                            borderBottom: i < records.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                            background: isDelayed ? "rgba(251,191,36,0.025)" : undefined,
                          }}
                        >
                          <td className="px-4 py-3.5">
                            <div>
                              <p className="font-medium text-sm text-foreground">{r.user.username}</p>
                              <p className="text-xs mt-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>{r.user.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs" style={{ color: "rgba(170,179,197,0.6)" }}>{shorten(r.txHash)}</span>
                              <CopyButton text={r.txHash} />
                            </div>
                            {r.failureReason && (
                              <p className="text-xs mt-1 max-w-[180px] truncate" style={{ color: "#f87171" }} title={r.failureReason}>
                                {r.failureReason}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5"><NetworkBadge network={r.network} /></td>
                          <td className="px-4 py-3.5">
                            <span className="font-semibold font-mono" style={{ color: "#34d399" }}>{fmt(r.blockchainAmount)}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <ConfirmationBar current={r.confirmations} required={r.requiredConfirmations} />
                          </td>
                          <td className="px-4 py-3.5"><StatusBadge status={r.verificationStatus} /></td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-sm font-mono" style={{ color: "rgba(170,179,197,0.6)" }}>{r.verificationAttempts}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            {r.nextCheckAt ? (
                              <div>
                                <p className="text-xs whitespace-nowrap" style={{ color: isDelayed ? "#fbbf24" : "rgba(170,179,197,0.5)" }}>
                                  {fmtDate(r.nextCheckAt)}
                                </p>
                                {r.lastCheckedAt && (
                                  <p className="text-xs whitespace-nowrap mt-0.5" style={{ color: "rgba(170,179,197,0.35)" }}>
                                    Last: {fmtDate(r.lastCheckedAt)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "rgba(170,179,197,0.3)" }}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: "rgba(170,179,197,0.5)" }}>{fmtDate(r.createdAt)}</td>
                          <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: r.creditedAt ? "#34d399" : "rgba(170,179,197,0.3)" }}>
                            {r.creditedAt ? fmtDate(r.creditedAt) : "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            {!isTerminal && (
                              <button
                                onClick={() => { void handleRetry(r.id); }}
                                disabled={retryingId === r.id}
                                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                                style={{
                                  background: isDelayed ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                                  border: `1px solid ${isDelayed ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.08)"}`,
                                  color: isDelayed ? "#fbbf24" : "rgba(170,179,197,0.6)",
                                }}
                                title="Schedule immediate re-check"
                              >
                                {retryingId === r.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <RotateCcw className="h-3 w-3" />}
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                {records.map((r) => {
                  const isDelayed  = r.verificationStatus === "VERIFICATION_DELAYED";
                  const isTerminal = TERMINAL_STATUSES.includes(r.verificationStatus);
                  return (
                    <div
                      key={r.id}
                      className="p-4"
                      style={{ background: isDelayed ? "rgba(251,191,36,0.025)" : undefined }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm text-foreground">{r.user.username}</p>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>{r.user.email}</p>
                        </div>
                        <StatusBadge status={r.verificationStatus} />
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>{shorten(r.txHash)}</span>
                        <CopyButton text={r.txHash} />
                        <NetworkBadge network={r.network} />
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>
                        <span style={{ color: "#34d399", fontWeight: 600 }}>{fmt(r.blockchainAmount)}</span>
                        <span>{fmtDate(r.createdAt)}</span>
                      </div>
                      {isDelayed && r.nextCheckAt && (
                        <div className="mt-2 flex items-center gap-1.5" style={{ color: "#fbbf24" }}>
                          <Clock className="h-3 w-3" />
                          <span className="text-xs">Next check: {fmtDate(r.nextCheckAt)}</span>
                        </div>
                      )}
                      {r.failureReason && (
                        <p className="text-xs mt-2" style={{ color: "#f87171" }}>{r.failureReason}</p>
                      )}
                      {!isTerminal && (
                        <button
                          onClick={() => { void handleRetry(r.id); }}
                          disabled={retryingId === r.id}
                          className="mt-3 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                          style={{
                            background: isDelayed ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isDelayed ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.08)"}`,
                            color: isDelayed ? "#fbbf24" : "rgba(170,179,197,0.6)",
                          }}
                        >
                          {retryingId === r.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <RotateCcw className="h-3 w-3" />}
                          Retry Now
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>
              {meta.total} total · page {meta.page} of {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={!meta.hasPrevPage}
                className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(170,179,197,0.7)" }}
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={!meta.hasNextPage}
                className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(170,179,197,0.7)" }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
