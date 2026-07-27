import { useState, useEffect, useCallback } from "react";
import {
  Shield, RefreshCw, Loader2, AlertTriangle, CheckCircle2,
  Download, Play, TrendingUp, TrendingDown, ChevronDown,
  XCircle, Clock, Search,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  getTreasuryDashboard,
  getLedgerEntries,
  getReconciliationReports,
  triggerReconciliation,
  triggerIntegrityScan,
  getDiscrepancies,
  updateDiscrepancy,
  type TreasuryDashboard,
  type LedgerPage,
  type ReconciliationReportRow,
  type DiscrepancyRow,
} from "@/lib/api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const RED    = "#EF4444";
const GREEN  = "#22C55E";
const YELLOW = "#F59E0B";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtUsd = (v: string | number | null | undefined) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (v: string | number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("en-US");

function ago(iso: string | Date | null) {
  if (!iso) return "Never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5)  return "Just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function severityColor(s: string) {
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return YELLOW;
  if (s === "MEDIUM")   return "#F97316";
  return MUTED;
}

function statusBadge(status: string, health: string) {
  if (status === "NEVER_RUN") return { color: MUTED, label: "Never Run" };
  if (health === "CRITICAL")  return { color: RED,  label: "Critical" };
  if (health === "WARNING")   return { color: YELLOW, label: "Warning" };
  return { color: GREEN, label: "Healthy" };
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "white" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <p style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.01em" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }: {
  tabs: string[]; active: string; onChange: (t: string) => void;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", width: "fit-content" }}>
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding: "5px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            background: active === t ? "rgba(212,175,55,0.12)" : "transparent",
            color:      active === t ? GOLD : MUTED,
            border:     active === t ? `1px solid rgba(212,175,55,0.18)` : "1px solid transparent",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >{t}</button>
      ))}
    </div>
  );
}

// ─── Discrepancy badge ────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      background: `${severityColor(severity)}22`, color: severityColor(severity),
      textTransform: "uppercase", letterSpacing: "0.06em",
    }}>{severity}</span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TreasuryIntegrityPage() {
  const [dashboard, setDashboard]   = useState<TreasuryDashboard | null>(null);
  const [activeTab, setActiveTab]   = useState("Ledger");
  const [loading, setLoading]       = useState(true);
  const [scanning, setScanning]     = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const { toasts, toast: showToast, dismiss } = useToast();

  // Ledger tab state
  const [ledger, setLedger]           = useState<LedgerPage | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPage, setLedgerPage]   = useState(1);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerType, setLedgerType]   = useState("");

  // Reconciliation tab
  const [reports, setReports]         = useState<ReconciliationReportRow[]>([]);

  // Discrepancies tab
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyRow[]>([]);
  const [discStatus, setDiscStatus]   = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getTreasuryDashboard();
      setDashboard(d);
    } catch { showToast("Failed to load dashboard", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const data = await getLedgerEntries({ page: ledgerPage, limit: 50, search: ledgerSearch || undefined, transactionType: ledgerType || undefined });
      setLedger(data);
    } catch { showToast("Failed to load ledger", "error"); }
    finally { setLedgerLoading(false); }
  }, [ledgerPage, ledgerSearch, ledgerType, showToast]);

  const loadReports = useCallback(async () => {
    try {
      const r = await getReconciliationReports();
      setReports(r);
    } catch { showToast("Failed to load reports", "error"); }
  }, [showToast]);

  const loadDiscrepancies = useCallback(async () => {
    try {
      const d = await getDiscrepancies({ status: discStatus || undefined });
      setDiscrepancies(d);
    } catch { showToast("Failed to load discrepancies", "error"); }
  }, [discStatus, showToast]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (activeTab === "Ledger") void loadLedger(); }, [activeTab, loadLedger]);
  useEffect(() => { if (activeTab === "Reconciliation") void loadReports(); }, [activeTab, loadReports]);
  useEffect(() => { if (activeTab === "Discrepancies") void loadDiscrepancies(); }, [activeTab, loadDiscrepancies]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const r = await triggerIntegrityScan();
      showToast(`Integrity scan complete — ${r.discrepancyCount} discrepancy(ies) found`, "success");
      void loadDashboard();
    } catch { showToast("Scan failed", "error"); }
    finally { setScanning(false); }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const r = await triggerReconciliation();
      showToast(`Reconciliation complete — ${r.discrepancyCount} discrepancy(ies)`, "success");
      void loadDashboard();
      if (activeTab === "Reconciliation") void loadReports();
    } catch { showToast("Reconciliation failed", "error"); }
    finally { setReconciling(false); }
  };

  const handleExport = () => {
    window.open("/api/admin/treasury/export/ledger", "_blank");
  };

  const handleResolve = async (id: string, status: "UNDER_REVIEW" | "RESOLVED", notes?: string) => {
    try {
      await updateDiscrepancy(id, status, notes);
      showToast("Discrepancy updated", "success");
      void loadDiscrepancies();
    } catch { showToast("Update failed", "error"); }
  };

  const badge = dashboard ? statusBadge(dashboard.reconciliation.status, dashboard.health.ledgerHealth) : null;

  return (
    <AdminLayout>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "rgba(212,175,55,0.1)", border: `1px solid rgba(212,175,55,0.2)` }}>
              <Shield size={18} style={{ color: GOLD }} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "white" }}>Treasury & Integrity</h1>
              <p style={{ fontSize: 12, color: MUTED }}>Immutable ledger · Reconciliation · Discrepancy management</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleScan} disabled={scanning}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, color: "white", cursor: "pointer" }}>
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
              {scanning ? "Scanning…" : "Run Integrity Scan"}
            </button>
            <button onClick={handleReconcile} disabled={reconciling}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, color: "white", cursor: "pointer" }}>
              {reconciling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {reconciling ? "Running…" : "Reconcile Now"}
            </button>
            <button onClick={handleExport}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: `rgba(212,175,55,0.08)`, border: `1px solid rgba(212,175,55,0.2)`, color: GOLD, cursor: "pointer" }}>
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {/* Health strip */}
        {badge && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl"
            style={{ background: `${badge.color}11`, border: `1px solid ${badge.color}33` }}>
            {badge.color === GREEN ? <CheckCircle2 size={14} style={{ color: badge.color }} /> : <AlertTriangle size={14} style={{ color: badge.color }} />}
            <span style={{ fontSize: 12, fontWeight: 600, color: badge.color }}>{badge.label}</span>
            {dashboard?.health.lastScanAt && (
              <span style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>
                Last scan {ago(dashboard.health.lastScanAt)}
              </span>
            )}
            {dashboard && dashboard.health.openDiscrepancies > 0 && (
              <span style={{ fontSize: 11, color: YELLOW, marginLeft: "auto" }}>
                {dashboard.health.openDiscrepancies} open discrepancy(ies)
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: GOLD }} />
        </div>
      ) : (
        <>
          {/* ── Wallet totals ────────────────────────────────────────────────── */}
          {dashboard && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="Deposit Wallet Total"    value={fmtUsd(dashboard.walletTotals.depositWallet)}    color={GOLD_L} />
              <StatCard label="Income Wallet Total"     value={fmtUsd(dashboard.walletTotals.incomeWallet)}     color="white" />
              <StatCard label="Withdrawal Wallet Total" value={fmtUsd(dashboard.walletTotals.withdrawalWallet)} color="white" />
              <StatCard label="Locked Balance Total"    value={fmtUsd(dashboard.walletTotals.lockedBalance)}    color={YELLOW} />
            </div>
          )}

          {/* ── Ledger stats ─────────────────────────────────────────────────── */}
          {dashboard && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="Total Ledger Entries" value={fmtNum(dashboard.ledger.totalEntries)} />
              <StatCard label="Total Deposits"       value={fmtUsd(dashboard.ledger.totalDeposits)}   color={GREEN} sub="Credits to deposit wallet" />
              <StatCard label="Total Investments"    value={fmtUsd(dashboard.ledger.totalInvestments)} color={RED}   sub="Debits from deposit wallet" />
              <StatCard label="Total Withdrawals"    value={fmtUsd(dashboard.ledger.totalWithdrawalsCompleted)} color={YELLOW} sub="Completed" />
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div className="mb-4">
            <TabBar tabs={["Ledger", "Reconciliation", "Discrepancies"]} active={activeTab} onChange={setActiveTab} />
          </div>

          {/* ── Ledger tab ───────────────────────────────────────────────────── */}
          {activeTab === "Ledger" && (
            <div>
              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative">
                  <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
                  <input
                    value={ledgerSearch}
                    onChange={e => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                    placeholder="Search by user/ref/txhash…"
                    style={{ paddingLeft: 28, padding: "6px 10px 6px 28px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "white", fontSize: 12, width: 220, outline: "none" }}
                  />
                </div>
                <select
                  value={ledgerType}
                  onChange={e => { setLedgerType(e.target.value); setLedgerPage(1); }}
                  style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "white", fontSize: 12, outline: "none" }}
                >
                  <option value="">All Types</option>
                  {["DEPOSIT","INVESTMENT","ROI","LEVEL_INCOME","MATCHING_BONUS","ORBIT_INCOME","SALARY_INCOME","TRANSFER_OUT","TRANSFER_IN","WITHDRAWAL_REQUEST","WITHDRAWAL_BROADCAST","WITHDRAWAL_COMPLETED","WITHDRAWAL_REFUND","WITHDRAWAL_CANCELLATION","MANUAL_ADJUSTMENT"].map(t =>
                    <option key={t} value={t}>{t.replace(/_/g," ")}</option>
                  )}
                </select>
                <button onClick={() => void loadLedger()} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "white", fontSize: 12, cursor: "pointer" }}>
                  <RefreshCw size={12} />
                </button>
              </div>

              {/* Table */}
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        {["Date","Member","Type","D/C","Wallet","Amount","Opening","Closing","Reference"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: MUTED, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerLoading ? (
                        <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: MUTED }}>
                          <Loader2 size={20} className="animate-spin" style={{ display: "inline", color: GOLD }} />
                        </td></tr>
                      ) : ledger?.entries.length === 0 ? (
                        <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: MUTED }}>No entries yet</td></tr>
                      ) : ledger?.entries.map((e, i) => (
                        <tr key={e.id} style={{ borderTop: `1px solid ${BORDER}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                          <td style={{ padding: "8px 12px", color: MUTED, whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}</td>
                          <td style={{ padding: "8px 12px", color: "white", fontFamily: "monospace", fontSize: 11 }}>{e.username.slice(0,12)}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(212,175,55,0.1)", color: GOLD_L }}>{e.transactionType.replace(/_/g," ")}</span>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            {e.debitCredit === "CREDIT"
                              ? <TrendingUp size={13} style={{ color: GREEN }} />
                              : <TrendingDown size={13} style={{ color: RED }} />}
                          </td>
                          <td style={{ padding: "8px 12px", color: MUTED, fontSize: 10 }}>{e.walletType.replace(/_/g," ")}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 700, color: e.debitCredit === "CREDIT" ? GREEN : RED, whiteSpace: "nowrap" }}>
                            {e.debitCredit === "DEBIT" ? "-" : "+"}{fmtUsd(e.amount)}
                          </td>
                          <td style={{ padding: "8px 12px", color: MUTED, whiteSpace: "nowrap" }}>{fmtUsd(e.openingBalance)}</td>
                          <td style={{ padding: "8px 12px", color: "white", whiteSpace: "nowrap" }}>{fmtUsd(e.closingBalance)}</td>
                          <td style={{ padding: "8px 12px", color: MUTED, fontFamily: "monospace", fontSize: 10 }}>{e.referenceId ? `${e.referenceId.slice(0,14)}…` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {ledger && ledger.pages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <span style={{ fontSize: 12, color: MUTED }}>Page {ledger.page} of {ledger.pages} · {fmtNum(ledger.total)} entries</span>
                  <div className="flex gap-2">
                    <button disabled={ledgerPage === 1} onClick={() => setLedgerPage(p => p - 1)}
                      style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "white", cursor: ledgerPage === 1 ? "not-allowed" : "pointer", opacity: ledgerPage === 1 ? 0.4 : 1 }}>
                      Prev
                    </button>
                    <button disabled={ledgerPage === ledger.pages} onClick={() => setLedgerPage(p => p + 1)}
                      style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "white", cursor: ledgerPage === ledger.pages ? "not-allowed" : "pointer", opacity: ledgerPage === ledger.pages ? 0.4 : 1 }}>
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Reconciliation tab ───────────────────────────────────────────── */}
          {activeTab === "Reconciliation" && (
            <div>
              <div className="rounded-2xl overflow-hidden mb-4" style={{ border: `1px solid ${BORDER}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                      {["Run At","Status","Discrepancies","Manual","Triggered By"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: MUTED, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: MUTED }}>No reconciliation reports yet. Click "Reconcile Now" to run the first one.</td></tr>
                    ) : reports.map((r, i) => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${BORDER}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                        <td style={{ padding: "8px 14px", color: "white", whiteSpace: "nowrap" }}>{new Date(r.runAt).toLocaleString()}</td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                            background: r.status === "OK" ? "#22C55E22" : "#EF444422",
                            color: r.status === "OK" ? GREEN : RED }}>
                            {r.status === "OK" ? "✓ OK" : "⚠ Issues"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", color: r.discrepancyCount > 0 ? YELLOW : MUTED, fontWeight: 600 }}>{r.discrepancyCount}</td>
                        <td style={{ padding: "8px 14px", color: MUTED }}>{r.isManual ? "Yes" : "Auto"}</td>
                        <td style={{ padding: "8px 14px", color: MUTED, fontFamily: "monospace", fontSize: 11 }}>{r.triggeredBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Discrepancies tab ────────────────────────────────────────────── */}
          {activeTab === "Discrepancies" && (
            <div>
              <div className="flex gap-2 mb-4">
                <select value={discStatus} onChange={e => { setDiscStatus(e.target.value); void loadDiscrepancies(); }}
                  style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "white", fontSize: 12, outline: "none" }}>
                  <option value="">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
                <button onClick={() => void loadDiscrepancies()} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "white", fontSize: 12, cursor: "pointer" }}>
                  <RefreshCw size={12} />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {discrepancies.length === 0 ? (
                  <div className="text-center py-12" style={{ color: MUTED, fontSize: 13 }}>
                    <CheckCircle2 size={32} style={{ margin: "0 auto 8px", color: GREEN }} />
                    No discrepancies found
                  </div>
                ) : discrepancies.map(d => (
                  <div key={d.id} className="rounded-2xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SeverityBadge severity={d.severity} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>{d.type}</span>
                          <span style={{ fontSize: 10, color: MUTED }}>{ago(d.detectedAt)}</span>
                        </div>
                        <p style={{ fontSize: 12, color: MUTED, maxWidth: 500 }}>{d.description}</p>
                        {d.resolutionNotes && <p style={{ fontSize: 11, color: YELLOW }}>Notes: {d.resolutionNotes}</p>}
                        {d.resolvedAt && <p style={{ fontSize: 10, color: GREEN }}>Resolved {ago(d.resolvedAt)} by {d.resolvedBy}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {d.status !== "RESOLVED" && (
                          <>
                            {d.status === "OPEN" && (
                              <button onClick={() => handleResolve(d.id, "UNDER_REVIEW")}
                                style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: YELLOW, cursor: "pointer" }}>
                                <Clock size={10} style={{ display: "inline", marginRight: 4 }} />Review
                              </button>
                            )}
                            <button onClick={() => handleResolve(d.id, "RESOLVED", d.type)}
                              style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: GREEN, cursor: "pointer" }}>
                              <CheckCircle2 size={10} style={{ display: "inline", marginRight: 4 }} />Resolve
                            </button>
                          </>
                        )}
                        {d.status === "RESOLVED" && <span style={{ fontSize: 11, color: GREEN }}>✓ Resolved</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
