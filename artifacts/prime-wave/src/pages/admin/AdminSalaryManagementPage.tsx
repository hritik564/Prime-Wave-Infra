/**
 * Sprint 33K — Admin Salary Management Page
 *
 * Sections:
 *   1. Salary Runs          — list, create, lifecycle actions (generate/approve/pay)
 *   2. Payroll Details      — income records for selected run (search/filter/paginate)
 *   3. Member Salary History— search member + view history
 *   4. Failed Payments      — failed incomes with individual retry
 *   5. CSV Export           — payroll summary, detail, member history, rank distribution
 *
 * Permissions: SUPER_ADMIN + FINANCE_ADMIN (backend enforced).
 * Read-only admins: view only, action buttons disabled.
 * No salary business logic lives here — all actions call existing backend services.
 */

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign, RefreshCw, Loader2, Plus, Play, CheckCircle2,
  CreditCard, XCircle, Download, Search, ChevronLeft,
  ChevronRight, Eye, AlertTriangle, RotateCcw, Clock,
  FileText, Users, TrendingUp,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  adminListSalaryRuns,
  adminGetSalaryRunDetail,
  adminCreateSalaryRun,
  adminTriggerSalaryGeneration,
  adminTriggerSalaryApproval,
  adminTriggerSalaryPayout,
  adminListRunIncomes,
  adminRetryIncomePayment,
  adminSearchSalaryMembers,
  adminGetMemberSalaryHistory,
  adminSalaryExportSummaryUrl,
  adminSalaryExportDetailUrl,
  adminSalaryExportMemberHistoryUrl,
  adminSalaryExportRankDistributionUrl,
  type SalaryRunListItem,
  type SalaryRunDetail,
  type RunIncomeItem,
  type SalaryHistoryItem,
} from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

// ── Design tokens ─────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const RED    = "#EF4444";
const GREEN  = "#22C55E";
const YELLOW = "#F59E0B";
const BLUE   = "#3B82F6";
const ORANGE = "#F97316";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR  = new Date().getFullYear();

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtAmount = (v: string | number | null | undefined) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtShortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Status badges ─────────────────────────────────────────────────────────────

function runStatusColor(s: string) {
  switch (s) {
    case "GENERATING":  return YELLOW;
    case "GENERATED":   return BLUE;
    case "APPROVING":   return YELLOW;
    case "APPROVED":    return GOLD;
    case "PAYING":      return ORANGE;
    case "COMPLETED":   return GREEN;
    case "FAILED":      return RED;
    default:            return MUTED;
  }
}

function incomeStatusColor(s: string) {
  switch (s) {
    case "PENDING":  return YELLOW;
    case "APPROVED": return BLUE;
    case "PAID":     return GREEN;
    default:         return MUTED;
  }
}

function StatusBadge({ status, colorFn }: { status: string; colorFn: (s: string) => string }) {
  const c = colorFn(status);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      background: `${c}22`, color: c, textTransform: "uppercase", letterSpacing: "0.06em",
    }}>{status}</span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = "white" }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 18px", flex: 1, minWidth: 120 }}>
      <p style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(255,255,255,0.04)", width: "fit-content", marginBottom: 20 }}>
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: active === t ? "rgba(212,175,55,0.12)" : "transparent",
            color:      active === t ? GOLD : MUTED,
            border:     active === t ? `1px solid rgba(212,175,55,0.18)` : "1px solid transparent",
            transition: "all 0.15s",
          }}
        >{t}</button>
      ))}
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({
  label, icon: Icon, onClick, loading, disabled, color = GOLD, small = false,
}: {
  label: string; icon?: React.ElementType; onClick: () => void;
  loading?: boolean; disabled?: boolean; color?: string; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: small ? "5px 10px" : "7px 14px",
        borderRadius: 8,
        fontSize: small ? 11 : 12, fontWeight: 600, cursor: (disabled || loading) ? "not-allowed" : "pointer",
        background: (disabled || loading) ? "rgba(255,255,255,0.04)" : `${color}18`,
        color:      (disabled || loading) ? MUTED : color,
        border:     `1px solid ${(disabled || loading) ? BORDER : `${color}44`}`,
        transition: "all 0.15s",
      }}
    >
      {loading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

// ── Search input ──────────────────────────────────────────────────────────────

function SearchInput({ value, onChange, placeholder, style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 10px", ...style }}>
      <Search size={13} color={MUTED} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        style={{ background: "transparent", border: "none", outline: "none", color: "white", fontSize: 13, flex: 1, minWidth: 120 }}
      />
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────

function Select({ value, onChange, options, style }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  style?: React.CSSProperties;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: "6px 10px", color: "white", fontSize: 13, cursor: "pointer", outline: "none", ...style,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, total, totalPages, onPage }: {
  page: number; total: number; totalPages: number; onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: "8px 0" }}>
      <span style={{ fontSize: 12, color: MUTED }}>{total} records · Page {page} of {totalPages}</span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onPage(page - 1)} disabled={page <= 1}
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", cursor: page <= 1 ? "not-allowed" : "pointer", color: page <= 1 ? MUTED : "white" }}
        ><ChevronLeft size={13} /></button>
        <button
          onClick={() => onPage(page + 1)} disabled={page >= totalPages}
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px", cursor: page >= totalPages ? "not-allowed" : "pointer", color: page >= totalPages ? MUTED : "white" }}
        ><ChevronRight size={13} /></button>
      </div>
    </div>
  );
}

// ── Table helpers ─────────────────────────────────────────────────────────────

const TH: React.CSSProperties = { padding: "8px 12px", fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "left", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.85)", borderTop: `1px solid ${BORDER}` };
const TABLE: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

// ── Download helper (auth-aware) ───────────────────────────────────────────────

function downloadCsv(url: string) {
  const token = getAdminToken();
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const name = url.split("/").pop()?.split("?")[0] ?? "export";
      a.download = name.endsWith(".csv") ? name : `${name}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => alert("Export failed"));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Salary Runs
// ─────────────────────────────────────────────────────────────────────────────

function SalaryRunsSection({
  canWrite,
  onSelectRun,
}: {
  canWrite: boolean;
  onSelectRun: (run: SalaryRunListItem) => void;
}) {
  const { toast } = useToast();
  const [runs, setRuns]           = useState<SalaryRunListItem[]>([]);
  const [meta, setMeta]           = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMonth,  setFilterMonth]  = useState("");
  const [filterYear,   setFilterYear]   = useState("");
  const [creating,     setCreating]     = useState(false);
  const [newMonth,     setNewMonth]     = useState(CURRENT_MONTH);
  const [newYear,      setNewYear]      = useState(CURRENT_YEAR);
  const [actionMap,    setActionMap]    = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListSalaryRuns({
        page,
        status: filterStatus || undefined,
        month:  filterMonth  ? Number(filterMonth)  : undefined,
        year:   filterYear   ? Number(filterYear)   : undefined,
      });
      setRuns(r.data);
      setMeta({ page: r.meta.page, total: r.meta.total, totalPages: r.meta.totalPages });
    } catch { toast("Failed to load salary runs", "error"); }
    finally   { setLoading(false); }
  }, [page, filterStatus, filterMonth, filterYear, toast]);

  useEffect(() => { void load(); }, [load]);

  const setAction = (id: string, v: boolean) => setActionMap(m => ({ ...m, [id]: v }));

  async function handleCreate() {
    setCreating(true);
    try {
      const r = await adminCreateSalaryRun(newMonth, newYear);
      if (r.status === "duplicate") {
        toast(`Run for ${MONTHS[newMonth-1]} ${newYear} already exists`, "info");
      } else {
        toast(`Salary run created for ${MONTHS[newMonth-1]} ${newYear}`, "success");
        void load();
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Create failed", "error");
    } finally { setCreating(false); }
  }

  async function handleGenerate(run: SalaryRunListItem) {
    setAction(run.id, true);
    try {
      await adminTriggerSalaryGeneration(run.id);
      toast("Generation started", "success");
      void load();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Generation failed", "error");
    } finally { setAction(run.id, false); }
  }

  async function handleApprove(run: SalaryRunListItem) {
    setAction(run.id, true);
    try {
      await adminTriggerSalaryApproval(run.id);
      toast("Approval triggered", "success");
      void load();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Approval failed", "error");
    } finally { setAction(run.id, false); }
  }

  async function handlePay(run: SalaryRunListItem) {
    setAction(run.id, true);
    try {
      await adminTriggerSalaryPayout(run.id);
      toast("Payout triggered", "success");
      void load();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Payout failed", "error");
    } finally { setAction(run.id, false); }
  }

  const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

  return (
    <div>
      {/* Create run */}
      {canWrite && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: MUTED }}>New run:</span>
          <Select
            value={String(newMonth)}
            onChange={v => setNewMonth(Number(v))}
            options={MONTHS.map((m, i) => ({ value: String(i+1), label: m }))}
          />
          <Select
            value={String(newYear)}
            onChange={v => setNewYear(Number(v))}
            options={YEAR_OPTIONS.map(y => ({ value: String(y), label: String(y) }))}
          />
          <ActionBtn label="Create" icon={Plus} onClick={handleCreate} loading={creating} color={GOLD} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Select
          value={filterStatus}
          onChange={v => { setFilterStatus(v); setPage(1); }}
          options={[
            { value: "", label: "All Statuses" },
            { value: "GENERATING",  label: "Generating" },
            { value: "GENERATED",   label: "Generated" },
            { value: "APPROVING",   label: "Approving" },
            { value: "APPROVED",    label: "Approved" },
            { value: "PAYING",      label: "Paying" },
            { value: "COMPLETED",   label: "Completed" },
            { value: "FAILED",      label: "Failed" },
          ]}
        />
        <Select
          value={filterMonth}
          onChange={v => { setFilterMonth(v); setPage(1); }}
          options={[{ value: "", label: "All Months" }, ...MONTHS.map((m, i) => ({ value: String(i+1), label: m }))]}
        />
        <Select
          value={filterYear}
          onChange={v => { setFilterYear(v); setPage(1); }}
          options={[{ value: "", label: "All Years" }, ...YEAR_OPTIONS.map(y => ({ value: String(y), label: String(y) }))]}
        />
        <ActionBtn label="Refresh" icon={RefreshCw} onClick={load} loading={loading} color={MUTED} small />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${BORDER}` }}>
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH}>Period</th>
              <th style={TH}>Status</th>
              <th style={TH}>Generated</th>
              <th style={TH}>Approved</th>
              <th style={TH}>Paid</th>
              <th style={TH}>Failed</th>
              <th style={TH}>Total Amount</th>
              <th style={TH}>Started</th>
              <th style={TH}>Completed</th>
              <th style={TH}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} style={{ ...TD, textAlign: "center", color: MUTED }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite", display: "inline" }} /> Loading…
              </td></tr>
            )}
            {!loading && runs.length === 0 && (
              <tr><td colSpan={10} style={{ ...TD, textAlign: "center", color: MUTED }}>No salary runs found</td></tr>
            )}
            {!loading && runs.map(run => {
              const busy = actionMap[run.id] ?? false;
              return (
                <tr key={run.id}>
                  <td style={TD}><strong>{MONTHS[run.month-1]} {run.year}</strong></td>
                  <td style={TD}><StatusBadge status={run.status} colorFn={runStatusColor} /></td>
                  <td style={TD}>{run.generatedCount}</td>
                  <td style={TD}>{run.approvedCount}</td>
                  <td style={TD}><span style={{ color: GREEN }}>{run.paidCount}</span></td>
                  <td style={TD}><span style={{ color: run.failedCount > 0 ? RED : MUTED }}>{run.failedCount}</span></td>
                  <td style={TD}>{fmtAmount(run.totalAmount)}</td>
                  <td style={TD} title={fmtDate(run.startedAt)}>{fmtShortDate(run.startedAt)}</td>
                  <td style={TD} title={run.completedAt ? fmtDate(run.completedAt) : ""}>{fmtShortDate(run.completedAt)}</td>
                  <td style={{ ...TD, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <ActionBtn label="View" icon={Eye} onClick={() => onSelectRun(run)} color={BLUE} small />
                      {canWrite && run.status === "GENERATING" && (
                        <ActionBtn label="Generate" icon={Play} onClick={() => handleGenerate(run)} loading={busy} color={YELLOW} small />
                      )}
                      {canWrite && run.status === "GENERATED" && (
                        <ActionBtn label="Approve" icon={CheckCircle2} onClick={() => handleApprove(run)} loading={busy} color={GOLD} small />
                      )}
                      {canWrite && run.status === "APPROVED" && (
                        <ActionBtn label="Pay" icon={CreditCard} onClick={() => handlePay(run)} loading={busy} color={GREEN} small />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={meta.page} total={meta.total} totalPages={meta.totalPages} onPage={setPage} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Payroll Details (incomes for a selected run)
// ─────────────────────────────────────────────────────────────────────────────

function PayrollDetailsSection({
  run,
  canWrite,
  onBack,
}: {
  run: SalaryRunListItem;
  canWrite: boolean;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [detail,  setDetail]  = useState<SalaryRunDetail | null>(null);
  const [incomes, setIncomes] = useState<RunIncomeItem[]>([]);
  const [meta,    setMeta]    = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState("");
  const [rank,    setRank]    = useState("");
  const [page,    setPage]    = useState(1);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});

  const loadDetail = useCallback(async () => {
    try {
      const d = await adminGetSalaryRunDetail(run.id);
      setDetail(d);
    } catch { /* non-fatal */ }
  }, [run.id]);

  const loadIncomes = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListRunIncomes(run.id, {
        search: search || undefined,
        status: status || undefined,
        rank:   rank   || undefined,
        page,
      });
      setIncomes(r.data);
      setMeta({ page: r.meta.page, total: r.meta.total, totalPages: r.meta.totalPages });
    } catch { toast("Failed to load incomes", "error"); }
    finally { setLoading(false); }
  }, [run.id, search, status, rank, page, toast]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);
  useEffect(() => { void loadIncomes(); }, [loadIncomes]);

  async function handleRetry(incomeId: string) {
    setRetrying(r => ({ ...r, [incomeId]: true }));
    try {
      await adminRetryIncomePayment(incomeId);
      toast("Retry successful", "success");
      void loadIncomes();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Retry failed", "error");
    } finally { setRetrying(r => ({ ...r, [incomeId]: false })); }
  }

  const summary = detail?.summary as Record<string, unknown> | null | undefined;

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "white", cursor: "pointer" }}>
          ← Runs
        </button>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{MONTHS[run.month-1]} {run.year} Payroll</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <StatusBadge status={run.status} colorFn={runStatusColor} />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <StatCard label="Total Members"  value={String(summary["totalMembers"] ?? run.generatedCount)} />
          <StatCard label="Total Payroll"  value={fmtAmount(String(summary["totalPayroll"] ?? run.totalAmount))} color={GOLD} />
          <StatCard label="Avg Salary"     value={fmtAmount(String(summary["averageSalary"] ?? "0"))} />
          <StatCard label="Generated"      value={run.generatedCount} />
          <StatCard label="Approved"       value={run.approvedCount} color={GOLD} />
          <StatCard label="Paid"           value={run.paidCount}     color={GREEN} />
          <StatCard label="Failed"         value={run.failedCount}   color={run.failedCount > 0 ? RED : MUTED} />
        </div>
      )}

      {/* Audit log */}
      {detail?.audits && detail.audits.length > 0 && (
        <div style={{ marginBottom: 18, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
          <p style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Audit Trail</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {detail.audits.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                <Clock size={11} color={MUTED} />
                <span style={{ color: GOLD, fontWeight: 600, minWidth: 180 }}>{a.action}</span>
                <span style={{ color: MUTED }}>{fmtDate(a.createdAt)}</span>
                {a.performedBy && <span style={{ color: MUTED }}>by {a.performedBy}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search username or ID…" style={{ minWidth: 220 }} />
        <Select
          value={status} onChange={v => { setStatus(v); setPage(1); }}
          options={[{ value: "", label: "All Statuses" }, { value: "PENDING", label: "Pending" }, { value: "APPROVED", label: "Approved" }, { value: "PAID", label: "Paid" }]}
        />
        <ActionBtn label="Refresh" icon={RefreshCw} onClick={loadIncomes} loading={loading} color={MUTED} small />
      </div>

      {/* Incomes table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${BORDER}` }}>
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH}>Member</th>
              <th style={TH}>Username</th>
              <th style={TH}>Rank</th>
              <th style={TH}>Amount</th>
              <th style={TH}>Status</th>
              <th style={TH}>Generated</th>
              <th style={TH}>Approved</th>
              <th style={TH}>Paid</th>
              <th style={TH}>Transaction</th>
              {canWrite && <th style={TH}>Retry</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={canWrite ? 10 : 9} style={{ ...TD, textAlign: "center", color: MUTED }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite", display: "inline" }} /> Loading…
              </td></tr>
            )}
            {!loading && incomes.length === 0 && (
              <tr><td colSpan={canWrite ? 10 : 9} style={{ ...TD, textAlign: "center", color: MUTED }}>No income records found</td></tr>
            )}
            {!loading && incomes.map(i => (
              <tr key={i.id}>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: 11 }}>{i.userId.slice(0,8)}…</td>
                <td style={TD}>{i.username ?? "—"}</td>
                <td style={TD}><span style={{ color: GOLD }}>{i.rankName}</span></td>
                <td style={TD}>{fmtAmount(i.amount)}</td>
                <td style={TD}><StatusBadge status={i.status} colorFn={incomeStatusColor} /></td>
                <td style={{ ...TD, fontSize: 11 }}>{fmtShortDate(i.createdAt)}</td>
                <td style={{ ...TD, fontSize: 11 }}>{fmtShortDate(i.approvedAt)}</td>
                <td style={{ ...TD, fontSize: 11 }}>{fmtShortDate(i.paidAt)}</td>
                <td style={{ ...TD, fontFamily: "monospace", fontSize: 11 }}>{i.transactionId ? `${i.transactionId.slice(0,12)}…` : "—"}</td>
                {canWrite && (
                  <td style={TD}>
                    {i.status !== "PAID" && (
                      <ActionBtn
                        label="Retry" icon={RotateCcw} small
                        onClick={() => handleRetry(i.id)}
                        loading={retrying[i.id] ?? false}
                        color={ORANGE}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={meta.page} total={meta.total} totalPages={meta.totalPages} onPage={setPage} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Member Salary History
// ─────────────────────────────────────────────────────────────────────────────

function MemberHistorySection() {
  const { toast } = useToast();
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<{ id: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ id: string; username: string } | null>(null);
  const [history,  setHistory]  = useState<SalaryHistoryItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await adminSearchSalaryMembers(query.trim());
      setResults(r.data);
    } catch { toast("Search failed", "error"); }
    finally { setSearching(false); }
  }, [query, toast]);

  const handleSelect = useCallback(async (member: { id: string; username: string }) => {
    setSelected(member);
    setResults([]);
    setLoading(true);
    try {
      const r = await adminGetMemberSalaryHistory(member.id);
      setHistory(r.data);
      setSelectedUserId(member.id);
    } catch { toast("Failed to load history", "error"); }
    finally { setLoading(false); }
  }, [toast]);

  return (
    <div>
      {/* Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search by username or member ID…" style={{ minWidth: 260 }} />
        <ActionBtn label="Search" icon={Search} onClick={handleSearch} loading={searching} color={GOLD} />
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
          {results.map(m => (
            <div
              key={m.id}
              onClick={() => handleSelect(m)}
              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${BORDER}`, fontSize: 13, display: "flex", gap: 12 }}
            >
              <span style={{ color: GOLD, fontWeight: 600 }}>{m.username}</span>
              <span style={{ color: MUTED, fontFamily: "monospace", fontSize: 11 }}>{m.id.slice(0,12)}…</span>
            </div>
          ))}
        </div>
      )}

      {/* Selected member */}
      {selected && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: GOLD }}>{selected.username}</span>
          <span style={{ fontSize: 11, color: MUTED, fontFamily: "monospace" }}>{selected.id}</span>
          {selectedUserId && (
            <ActionBtn
              label="Download CSV" icon={Download}
              onClick={() => downloadCsv(adminSalaryExportMemberHistoryUrl(selectedUserId))}
              color={GREEN} small
            />
          )}
          <button onClick={() => { setSelected(null); setHistory([]); setSelectedUserId(""); }} style={{ fontSize: 11, color: MUTED, background: "none", border: "none", cursor: "pointer" }}>Clear</button>
        </div>
      )}

      {/* History table */}
      {selected && (
        <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${BORDER}` }}>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={TH}>Period</th>
                <th style={TH}>Rank</th>
                <th style={TH}>Amount</th>
                <th style={TH}>Status</th>
                <th style={TH}>Approved</th>
                <th style={TH}>Paid</th>
                <th style={TH}>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: MUTED }}>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite", display: "inline" }} />
                </td></tr>
              )}
              {!loading && history.length === 0 && (
                <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: MUTED }}>No salary history found</td></tr>
              )}
              {!loading && history.map(h => (
                <tr key={h.id}>
                  <td style={TD}><strong>{MONTHS[h.month-1]} {h.year}</strong></td>
                  <td style={TD}><span style={{ color: GOLD }}>{h.rankName}</span></td>
                  <td style={TD}>{fmtAmount(String(h.amount))}</td>
                  <td style={TD}><StatusBadge status={h.status} colorFn={incomeStatusColor} /></td>
                  <td style={{ ...TD, fontSize: 11 }}>{fmtShortDate(h.approvedAt)}</td>
                  <td style={{ ...TD, fontSize: 11 }}>{fmtShortDate(h.paidAt)}</td>
                  <td style={{ ...TD, fontFamily: "monospace", fontSize: 11 }}>{h.transactionId ? `${h.transactionId.slice(0,14)}…` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!selected && !searching && (
        <div style={{ textAlign: "center", padding: "40px 0", color: MUTED }}>
          <Users size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
          <p style={{ fontSize: 13 }}>Search for a member to view their salary history</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Failed Payments (cross-run view)
// ─────────────────────────────────────────────────────────────────────────────

function FailedPaymentsSection({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast();
  const [incomes,  setIncomes]  = useState<RunIncomeItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [meta,     setMeta]     = useState({ total: 0, totalPages: 1 });
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [runs,     setRuns]     = useState<SalaryRunListItem[]>([]);
  const [selRun,   setSelRun]   = useState("");

  const loadRuns = useCallback(async () => {
    try {
      const r = await adminListSalaryRuns({ limit: 50 });
      setRuns(r.data.filter(r => r.failedCount > 0));
    } catch { /* non-fatal */ }
  }, []);

  const loadFailed = useCallback(async () => {
    if (!selRun) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await adminListRunIncomes(selRun, { status: "PENDING", page });
      setIncomes(r.data);
      setMeta({ total: r.meta.total, totalPages: r.meta.totalPages });
    } catch { toast("Failed to load failed payments", "error"); }
    finally { setLoading(false); }
  }, [selRun, page, toast]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);
  useEffect(() => { void loadFailed(); }, [loadFailed]);

  async function handleRetry(incomeId: string) {
    setRetrying(r => ({ ...r, [incomeId]: true }));
    try {
      await adminRetryIncomePayment(incomeId);
      toast("Retry queued", "success");
      void loadFailed();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Retry failed", "error");
    } finally { setRetrying(r => ({ ...r, [incomeId]: false })); }
  }

  return (
    <div>
      {/* Run selector */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <Select
          value={selRun}
          onChange={v => { setSelRun(v); setPage(1); }}
          options={[
            { value: "", label: "Select a salary run…" },
            ...runs.map(r => ({ value: r.id, label: `${MONTHS[r.month-1]} ${r.year} (${r.failedCount} failed)` })),
          ]}
          style={{ minWidth: 280 }}
        />
        <ActionBtn label="Refresh" icon={RefreshCw} onClick={loadFailed} loading={loading} color={MUTED} small />
      </div>

      {!selRun && (
        <div style={{ textAlign: "center", padding: "40px 0", color: MUTED }}>
          <AlertTriangle size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
          <p style={{ fontSize: 13 }}>Select a salary run to view failed payments</p>
        </div>
      )}

      {selRun && (
        <>
          <div style={{ overflowX: "auto", borderRadius: 12, border: `1px solid ${BORDER}` }}>
            <table style={TABLE}>
              <thead>
                <tr>
                  <th style={TH}>Member</th>
                  <th style={TH}>Username</th>
                  <th style={TH}>Rank</th>
                  <th style={TH}>Amount</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Generated</th>
                  {canWrite && <th style={TH}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={canWrite ? 7 : 6} style={{ ...TD, textAlign: "center", color: MUTED }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite", display: "inline" }} />
                  </td></tr>
                )}
                {!loading && incomes.length === 0 && (
                  <tr><td colSpan={canWrite ? 7 : 6} style={{ ...TD, textAlign: "center", color: GREEN }}>
                    <CheckCircle2 size={14} style={{ display: "inline", marginRight: 6 }} />No pending payments in this run
                  </td></tr>
                )}
                {!loading && incomes.map(i => (
                  <tr key={i.id}>
                    <td style={{ ...TD, fontFamily: "monospace", fontSize: 11 }}>{i.userId.slice(0,8)}…</td>
                    <td style={TD}>{i.username ?? "—"}</td>
                    <td style={TD}><span style={{ color: GOLD }}>{i.rankName}</span></td>
                    <td style={TD}>{fmtAmount(i.amount)}</td>
                    <td style={TD}><StatusBadge status={i.status} colorFn={incomeStatusColor} /></td>
                    <td style={{ ...TD, fontSize: 11 }}>{fmtShortDate(i.createdAt)}</td>
                    {canWrite && (
                      <td style={TD}>
                        <ActionBtn
                          label="Retry" icon={RotateCcw} small
                          onClick={() => handleRetry(i.id)}
                          loading={retrying[i.id] ?? false}
                          color={ORANGE}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={meta.total} totalPages={meta.totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — CSV Export
// ─────────────────────────────────────────────────────────────────────────────

function CsvExportSection() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year,  setYear]  = useState(CURRENT_YEAR);
  const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

  return (
    <div>
      {/* Period picker */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: MUTED }}>Export period:</span>
        <Select
          value={String(month)}
          onChange={v => setMonth(Number(v))}
          options={MONTHS.map((m, i) => ({ value: String(i+1), label: m }))}
        />
        <Select
          value={String(year)}
          onChange={v => setYear(Number(v))}
          options={YEAR_OPTIONS.map(y => ({ value: String(y), label: String(y) }))}
        />
      </div>

      {/* Export cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {[
          {
            title: "Payroll Summary",
            desc: "High-level monthly payroll totals — member count, avg salary, status breakdown.",
            icon: TrendingUp,
            url: () => adminSalaryExportSummaryUrl(month, year),
          },
          {
            title: "Payroll Detail",
            desc: "Full row-per-member breakdown: rank, salary, status, timestamps.",
            icon: FileText,
            url: () => adminSalaryExportDetailUrl(month, year),
          },
          {
            title: "Rank Distribution",
            desc: "Per-rank income count and total payroll amount for the selected month.",
            icon: BarChart2,
            url: () => adminSalaryExportRankDistributionUrl(month, year),
          },
        ].map(({ title, desc, icon: Icon, url }) => (
          <div key={title} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${GOLD}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={16} color={GOLD} />
              </div>
              <strong style={{ fontSize: 13 }}>{title}</strong>
            </div>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>{desc}</p>
            <ActionBtn
              label={`Download ${MONTHS[month-1]} ${year}`}
              icon={Download}
              onClick={() => downloadCsv(url())}
              color={GREEN}
            />
          </div>
        ))}
      </div>

      {/* Member history export */}
      <div style={{ marginTop: 20, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${BLUE}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={16} color={BLUE} />
          </div>
          <strong style={{ fontSize: 13 }}>Member Salary History</strong>
        </div>
        <p style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
          Export all salary history for a specific member. Enter a User ID.
        </p>
        <MemberHistoryExportRow />
      </div>
    </div>
  );
}

function MemberHistoryExportRow() {
  const [userId, setUserId] = useState("");
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={userId}
        onChange={e => setUserId(e.target.value)}
        placeholder="Member User ID…"
        style={{
          background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: "6px 12px", color: "white", fontSize: 13, outline: "none", minWidth: 240,
        }}
      />
      <ActionBtn
        label="Download CSV" icon={Download}
        onClick={() => userId.trim() && downloadCsv(adminSalaryExportMemberHistoryUrl(userId.trim()))}
        disabled={!userId.trim()}
        color={BLUE}
      />
    </div>
  );
}

// Suppress TS error for inline require — auth module is always present
function BarChart2({ size, color }: { size?: number; color?: string }) {
  return (
    <svg width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
      <line x1="2"  y1="20" x2="22" y2="20"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminSalaryManagementPage() {
  const { user }     = useAuth();
  const { toasts, toast, dismiss } = useToast();
  const [tab,        setTab]        = useState("Salary Runs");
  const [selectedRun, setSelectedRun] = useState<SalaryRunListItem | null>(null);

  const canWrite = user?.role === "SUPER_ADMIN" || user?.role === "FINANCE_ADMIN";

  function handleSelectRun(run: SalaryRunListItem) {
    setSelectedRun(run);
    setTab("Payroll Details");
  }

  function handleBack() {
    setSelectedRun(null);
    setTab("Salary Runs");
  }

  return (
    <AdminLayout>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${GOLD}18`, border: `1px solid ${GOLD}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DollarSign size={22} color={GOLD} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Salary Management</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: MUTED }}>Operate the monthly payroll process · Finance Admin + Super Admin only</p>
          </div>
          {!canWrite && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: YELLOW, background: `${YELLOW}18`, border: `1px solid ${YELLOW}33`, borderRadius: 6, padding: "4px 10px" }}>
              Read-only
            </span>
          )}
        </div>

        {/* Tab bar */}
        <TabBar
          tabs={["Salary Runs", "Payroll Details", "Member History", "Failed Payments", "CSV Export"]}
          active={tab}
          onChange={t => {
            setTab(t);
            if (t !== "Payroll Details") setSelectedRun(null);
          }}
        />

        {/* Section content */}
        {tab === "Salary Runs" && (
          <SalaryRunsSection canWrite={canWrite} onSelectRun={handleSelectRun} />
        )}

        {tab === "Payroll Details" && selectedRun && (
          <PayrollDetailsSection run={selectedRun} canWrite={canWrite} onBack={handleBack} />
        )}

        {tab === "Payroll Details" && !selectedRun && (
          <div style={{ textAlign: "center", padding: "60px 0", color: MUTED }}>
            <Eye size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>Select a salary run from the Salary Runs tab to view payroll details</p>
            <button
              onClick={() => setTab("Salary Runs")}
              style={{ marginTop: 12, fontSize: 12, color: GOLD, background: "none", border: `1px solid ${GOLD}33`, borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}
            >Go to Salary Runs</button>
          </div>
        )}

        {tab === "Member History" && <MemberHistorySection />}

        {tab === "Failed Payments" && <FailedPaymentsSection canWrite={canWrite} />}

        {tab === "CSV Export" && <CsvExportSection />}
      </div>
    </AdminLayout>
  );
}
