import { useState, useEffect, useCallback, useRef } from "react";
import AdminLayout from "./AdminLayout";
import {
  Bolt, Search, Plus, FileText, Users, BarChart2, Download,
  ChevronLeft, ChevronRight, RefreshCw, ArrowUpRight, ArrowDownLeft,
  X, CheckCircle, AlertCircle, Filter, TrendingUp, Zap, Eye,
} from "lucide-react";
import {
  getPowerGlobalStats,    type PowerGlobalStats,
  getPowerGlobalLedger,   type PowerLedgerEntry, type PowerGlobalLedgerResponse,
  getPowerGlobalAnalytics, type PowerGlobalAnalytics, type PowerTopMember,
  searchPowerMembers,     type PowerMemberSearchResult,
  adminGetPowerSummary,   type AdminPowerSummary,
  adminGetPowerLedger,
  adminAddPowerBV,
  adminRemovePowerBV,
} from "@/lib/api";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const CARD   = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";
const MUTED  = "rgba(170,179,197,0.6)";
const GREEN  = "#22c55e";
const RED    = "#ef4444";

type Tab = "dashboard" | "search" | "assign" | "ledger" | "summary" | "analytics";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard",  label: "Dashboard",      icon: Bolt       },
  { id: "search",     label: "Search Member",  icon: Search     },
  { id: "assign",     label: "Assign Power BV",icon: Plus       },
  { id: "ledger",     label: "Power Ledger",   icon: FileText   },
  { id: "summary",    label: "Member Summary", icon: Users      },
  { id: "analytics",  label: "Analytics",      icon: BarChart2  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: string | number | undefined, decimals = 2) {
  if (n === undefined || n === null) return "—";
  return parseFloat(String(n)).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUsd(bv: string | number | undefined) {
  if (bv === undefined || bv === null) return "—";
  const val = parseFloat(String(bv)) * 100;
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SideTag({ side }: { side: "LEFT" | "RIGHT" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: side === "LEFT" ? "rgba(99,102,241,0.18)" : "rgba(236,72,153,0.18)",
      color: side === "LEFT" ? "#818cf8" : "#f472b6",
      border: `1px solid ${side === "LEFT" ? "rgba(99,102,241,0.3)" : "rgba(236,72,153,0.3)"}`,
    }}>
      {side}
    </span>
  );
}

function OpTag({ op }: { op: "ADD" | "REMOVE" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: op === "ADD" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
      color: op === "ADD" ? GREEN : RED,
      border: `1px solid ${op === "ADD" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
    }}>
      {op === "ADD" ? <ArrowUpRight size={10} /> : <ArrowDownLeft size={10} />}
      {op}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "18px 20px",
      ...(accent && { borderColor: "rgba(212,175,55,0.3)", background: "rgba(212,175,55,0.06)" }),
    }}>
      <div style={{ color: MUTED, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ color: accent ? GOLD : "#f1f5f9", fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <RefreshCw size={22} color={GOLD} style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 14 }}>
      {message}
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [stats, setStats] = useState<PowerGlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setStats(await getPowerGlobalStats()); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed to load stats"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Spinner />;
  if (err)     return <div style={{ color: RED, padding: 24 }}>{err}</div>;
  if (!stats)  return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>Power Business Overview</div>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>Platform-wide Power BV allocation summary</div>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: CARD, border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer", fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Main KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <StatCard label="Total Active Power BV" value={fmt(stats.totalActivePowerBV, 0) + " BV"} sub="Live balance across all members" accent />
        <StatCard label="Total Power Business" value={"$" + fmt(stats.totalPowerBusiness, 2)} sub="Active BV × $100" accent />
        <StatCard label="Members with Power BV" value={stats.totalMembersWithPowerBV.toLocaleString()} sub="Users holding active Power BV" />
        <StatCard label="Total BV Ever Assigned" value={fmt(stats.totalPowerBVAssigned, 0) + " BV"} sub={stats.totalLedgerEntries + " assignment entries"} />
      </div>

      {/* Secondary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <StatCard label="BV Consumed by Matching" value={fmt(stats.totalPowerBVConsumedByMatching, 0) + " BV"} sub="Used up in binary matches" />
        <StatCard label="Admin Removed" value={fmt(stats.totalPowerBVAdminRemoved, 0) + " BV"} sub="Manually deducted by admins" />
        <StatCard label="Assignments Today" value={stats.todayAssignments.toLocaleString()} sub="ADD operations since midnight" />
        <StatCard label="Assignments (7 days)" value={stats.last7DaysAssignments.toLocaleString()} sub="ADD operations last 7 days" />
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        {[
          { label: "Assign Power BV",   tab: "assign"    as Tab, icon: Plus,      desc: "Credit BV to a member" },
          { label: "Global Ledger",      tab: "ledger"    as Tab, icon: FileText,  desc: "View all transactions" },
          { label: "Member Summary",     tab: "summary"   as Tab, icon: Users,     desc: "Per-member BV breakdown" },
          { label: "Analytics",          tab: "analytics" as Tab, icon: BarChart2, desc: "Top holders & trends" },
        ].map(({ label, tab, icon: Icon, desc }) => (
          <button key={tab} onClick={() => onNavigate(tab)} style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 18px", borderRadius: 10,
            background: CARD, border: `1px solid ${BORDER}`,
            color: "#f1f5f9", cursor: "pointer", textAlign: "left",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(212,175,55,0.4)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={18} color={GOLD} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
              <div style={{ color: MUTED, fontSize: 12 }}>{desc}</div>
            </div>
            <ArrowUpRight size={14} color={MUTED} style={{ marginLeft: "auto" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Search Tab ─────────────────────────────────────────────────────────────────

function SearchTab({ onViewSummary }: { onViewSummary: (id: string) => void }) {
  const [q, setQ]             = useState("");
  const [results, setResults] = useState<PowerMemberSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const timerRef              = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setResults(null); return; }
    setLoading(true); setErr("");
    try { setResults(await searchPowerMembers(query)); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Search failed"); }
    finally { setLoading(false); }
  }, []);

  const handleInput = (v: string) => {
    setQ(v);
    clearTimeout(timerRef.current);
    if (v.length >= 2) {
      timerRef.current = setTimeout(() => void doSearch(v), 350);
    } else {
      setResults(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>Search Member</div>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>Find a member to view or manage their Power BV</div>
      </div>

      <div style={{ position: "relative", maxWidth: 520 }}>
        <Search size={16} color={MUTED} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={q} onChange={e => handleInput(e.target.value)}
          placeholder="Search by username, email, name or user ID…"
          style={{
            width: "100%", padding: "11px 14px 11px 40px", borderRadius: 8,
            background: CARD, border: `1px solid ${BORDER}`,
            color: "#f1f5f9", fontSize: 14, outline: "none", boxSizing: "border-box",
          }}
        />
        {q && (
          <button onClick={() => { setQ(""); setResults(null); }} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: MUTED }}>
            <X size={14} />
          </button>
        )}
      </div>

      {err && <div style={{ color: RED, fontSize: 13 }}>{err}</div>}
      {loading && <Spinner />}

      {results !== null && !loading && (
        results.length === 0
          ? <EmptyState message="No members found matching your search." />
          : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {["Member", "Left Power BV", "Right Power BV", "Total BV", "Power Business", "Actions"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map(m => (
                    <tr key={m.id} style={{ borderBottom: `1px solid ${BORDER}` }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, color: "#f1f5f9" }}>{m.username}</div>
                        <div style={{ color: MUTED, fontSize: 11 }}>{m.email}</div>
                      </td>
                      <td style={{ padding: "12px 14px", color: "#818cf8", fontWeight: 600 }}>{fmt(m.powerLeftBV, 0)}</td>
                      <td style={{ padding: "12px 14px", color: "#f472b6", fontWeight: 600 }}>{fmt(m.powerRightBV, 0)}</td>
                      <td style={{ padding: "12px 14px", color: GOLD, fontWeight: 700 }}>{fmt(m.totalPowerBV, 0)}</td>
                      <td style={{ padding: "12px 14px", color: GREEN, fontWeight: 700 }}>{fmtUsd(m.totalPowerBV)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => onViewSummary(m.id)} style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "6px 12px", borderRadius: 6, background: "rgba(212,175,55,0.12)",
                          border: `1px solid rgba(212,175,55,0.3)`, color: GOLD,
                          cursor: "pointer", fontSize: 12, fontWeight: 600,
                        }}>
                          <Eye size={12} /> View Summary
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {results === null && !loading && (
        <div style={{ color: MUTED, fontSize: 13, padding: "20px 0" }}>
          Type at least 2 characters to search.
        </div>
      )}
    </div>
  );
}

// ── Assign Tab ─────────────────────────────────────────────────────────────────

function AssignTab({ initialUserId }: { initialUserId?: string }) {
  const [q, setQ]                 = useState("");
  const [results, setResults]     = useState<PowerMemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState<PowerMemberSearchResult | null>(null);
  const [summary, setSummary]     = useState<AdminPowerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [side, setSide]         = useState<"LEFT" | "RIGHT">("LEFT");
  const [op,   setOp]           = useState<"add" | "remove">("add");
  const [bv,   setBv]           = useState("");
  const [reason, setReason]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]       = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadSummary = useCallback(async (userId: string) => {
    setSummaryLoading(true);
    try { setSummary(await adminGetPowerSummary(userId)); }
    catch { setSummary(null); }
    finally { setSummaryLoading(false); }
  }, []);

  useEffect(() => {
    if (initialUserId) void loadSummary(initialUserId);
  }, [initialUserId, loadSummary]);

  const doSearch = async (query: string) => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults(await searchPowerMembers(query)); }
    catch { setResults([]); }
    finally { setSearching(false); }
  };

  const handleQChange = (v: string) => {
    setQ(v);
    clearTimeout(timerRef.current);
    if (v.length >= 2) timerRef.current = setTimeout(() => void doSearch(v), 350);
    else setResults([]);
  };

  const selectMember = (m: PowerMemberSearchResult) => {
    setSelected(m); setResults([]); setQ(m.username);
    void loadSummary(m.id);
  };

  const handleSubmit = async () => {
    if (!selected) return;
    const bvNum = parseInt(bv, 10);
    if (!bvNum || bvNum <= 0)     { setToast({ type: "error", msg: "BV must be a positive integer." }); return; }
    if (bvNum > 10000)            { setToast({ type: "error", msg: "Max 10,000 BV per operation." }); return; }
    if (reason.length < 10)       { setToast({ type: "error", msg: "Reason must be at least 10 characters." }); return; }

    setSubmitting(true); setToast(null);
    try {
      if (op === "add") await adminAddPowerBV(selected.id, { side, bv: bvNum, reason });
      else              await adminRemovePowerBV(selected.id, { side, bv: bvNum, reason });
      setToast({ type: "success", msg: `Successfully ${op === "add" ? "added" : "removed"} ${bvNum} Power BV (${side}) for ${selected.username}.` });
      setBv(""); setReason("");
      void loadSummary(selected.id);
    } catch (e: unknown) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Operation failed" });
    } finally { setSubmitting(false); }
  };

  const bvNum    = parseInt(bv, 10) || 0;
  const dollarEq = bvNum * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>Assign Power BV</div>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>Add or remove Power Business Volume for a member</div>
      </div>

      {toast && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderRadius: 8,
          background: toast.type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? GREEN : RED,
        }}>
          {toast.type === "success" ? <CheckCircle size={16} style={{ marginTop: 1, flexShrink: 0 }} /> : <AlertCircle size={16} style={{ marginTop: 1, flexShrink: 0 }} />}
          <span style={{ fontSize: 13 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={14} /></button>
        </div>
      )}

      {/* Step 1: Select member */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
        <div style={{ fontWeight: 600, color: "#f1f5f9", marginBottom: 14 }}>1. Select Member</div>
        <div style={{ position: "relative", maxWidth: 480 }}>
          <Search size={15} color={MUTED} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={e => handleQChange(e.target.value)}
            placeholder="Search username, email or ID…"
            style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
          {results.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 7, zIndex: 50, maxHeight: 220, overflowY: "auto" }}>
              {results.map(m => (
                <button key={m.id} onClick={() => selectMember(m)} style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "10px 14px", background: "none", border: "none",
                  color: "#f1f5f9", cursor: "pointer", borderBottom: `1px solid ${BORDER}`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.username}</div>
                  <div style={{ color: MUTED, fontSize: 11 }}>{m.email} · {fmt(m.totalPowerBV, 0)} BV</div>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: GREEN, fontSize: 13 }}>
            <CheckCircle size={14} /> Selected: <strong>{selected.username}</strong> — {selected.email}
            <button onClick={() => { setSelected(null); setSummary(null); setQ(""); }} style={{ marginLeft: 4, background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={12} /></button>
          </div>
        )}
        {searching && <div style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>Searching…</div>}
      </div>

      {/* Current Summary */}
      {selected && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 600, color: "#f1f5f9", marginBottom: 14 }}>Current Power BV — {selected.username}</div>
          {summaryLoading ? <Spinner /> : summary ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              {[
                { label: "Power LEFT",     value: fmt(summary.powerLeftBV,  0) + " BV", color: "#818cf8" },
                { label: "Power RIGHT",    value: fmt(summary.powerRightBV, 0) + " BV", color: "#f472b6" },
                { label: "Organic LEFT",   value: fmt(summary.organicLeftBV,  0), color: MUTED },
                { label: "Organic RIGHT",  value: fmt(summary.organicRightBV, 0), color: MUTED },
                { label: "Effective LEFT", value: fmt(summary.effectiveLeftBV,  0), color: GOLD },
                { label: "Effective RIGHT",value: fmt(summary.effectiveRightBV, 0), color: GOLD },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ color: MUTED, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  <div style={{ color, fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Step 2: Assignment form */}
      {selected && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 600, color: "#f1f5f9", marginBottom: 18 }}>2. Assignment Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            {/* Operation */}
            <div>
              <label style={{ display: "block", color: MUTED, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>OPERATION</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["add", "remove"] as const).map(o => (
                  <button key={o} onClick={() => setOp(o)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 7, border: `1px solid ${op === o ? (o === "add" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)") : BORDER}`,
                    background: op === o ? (o === "add" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)") : CARD,
                    color: op === o ? (o === "add" ? GREEN : RED) : MUTED,
                    cursor: "pointer", fontWeight: 600, fontSize: 13, textTransform: "capitalize",
                  }}>
                    {o === "add" ? "+ Add" : "− Remove"}
                  </button>
                ))}
              </div>
            </div>

            {/* Side */}
            <div>
              <label style={{ display: "block", color: MUTED, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>LEG / SIDE</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["LEFT", "RIGHT"] as const).map(s => (
                  <button key={s} onClick={() => setSide(s)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 7,
                    border: `1px solid ${side === s ? (s === "LEFT" ? "rgba(99,102,241,0.5)" : "rgba(236,72,153,0.5)") : BORDER}`,
                    background: side === s ? (s === "LEFT" ? "rgba(99,102,241,0.12)" : "rgba(236,72,153,0.12)") : CARD,
                    color: side === s ? (s === "LEFT" ? "#818cf8" : "#f472b6") : MUTED,
                    cursor: "pointer", fontWeight: 700, fontSize: 13,
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* BV amount */}
            <div>
              <label style={{ display: "block", color: MUTED, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>BV AMOUNT <span style={{ color: MUTED, fontWeight: 400 }}>(max 10,000)</span></label>
              <input
                type="number" min={1} max={10000} value={bv} onChange={e => setBv(e.target.value)}
                placeholder="e.g. 100"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
              {bvNum > 0 && (
                <div style={{ color: GOLD, fontSize: 12, marginTop: 4 }}>
                  = ${dollarEq.toLocaleString()} business value
                </div>
              )}
            </div>
          </div>

          {/* Reason */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", color: MUTED, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>REASON <span style={{ color: MUTED, fontWeight: 400 }}>(min 10 chars)</span></label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Describe the reason for this Power BV assignment…"
              rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <div style={{ color: reason.length < 10 ? MUTED : GREEN, fontSize: 11, marginTop: 3 }}>{reason.length} / min 10 chars</div>
          </div>

          {/* Preview + Submit */}
          {bvNum > 0 && reason.length >= 10 && (
            <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 8, background: "rgba(212,175,55,0.06)", border: `1px solid rgba(212,175,55,0.2)` }}>
              <div style={{ color: GOLD, fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Preview</div>
              <div style={{ color: "#f1f5f9", fontSize: 13 }}>
                {op === "add" ? "Add" : "Remove"} <strong>{bvNum} Power BV</strong> on the <strong>{side}</strong> leg of <strong>{selected.username}</strong> (${ (bvNum * 100).toLocaleString() } business value).
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit} disabled={submitting || !bvNum || !reason.trim() || reason.length < 10}
            style={{
              marginTop: 18, padding: "12px 28px", borderRadius: 8,
              background: submitting ? "rgba(212,175,55,0.3)" : "linear-gradient(135deg,#D4AF37,#F3D37A)",
              border: "none", color: "#1a1a2e", fontWeight: 700, fontSize: 14, cursor: submitting ? "not-allowed" : "pointer",
              opacity: (!bvNum || !reason.trim() || reason.length < 10) ? 0.5 : 1,
            }}>
            {submitting ? "Processing…" : op === "add" ? "Confirm Add Power BV" : "Confirm Remove Power BV"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Ledger Tab ─────────────────────────────────────────────────────────────────

function LedgerTab() {
  const [data, setData]       = useState<PowerGlobalLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState("");
  const [side, setSide]       = useState("");
  const [operation, setOp]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      setData(await getPowerGlobalLedger({ page, search: search || undefined, side: side || undefined, operation: operation || undefined }));
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [page, search, side, operation]);

  useEffect(() => { void load(); }, [load]);

  const handleFilter = () => { setPage(1); void load(); };

  const handleCsvDownload = () => {
    const params = new URLSearchParams({ limit: "5000", ...(search && { search }), ...(side && { side }), ...(operation && { operation }) });
    window.open(`/api/admin/power-bv/ledger/csv?${params}`, "_blank");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>Global Power Ledger</div>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>All Power BV transactions across the platform</div>
        </div>
        <button onClick={handleCsvDownload} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 7, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: GREEN, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Search size={13} color={MUTED} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleFilter()}
            placeholder="Search member…"
            style={{ padding: "8px 10px 8px 30px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 13, outline: "none", width: 200 }}
          />
        </div>
        <select value={side} onChange={e => { setSide(e.target.value); setPage(1); }}
          style={{ padding: "8px 10px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 13, outline: "none" }}>
          <option value="">All Sides</option>
          <option value="LEFT">LEFT</option>
          <option value="RIGHT">RIGHT</option>
        </select>
        <select value={operation} onChange={e => { setOp(e.target.value); setPage(1); }}
          style={{ padding: "8px 10px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 13, outline: "none" }}>
          <option value="">All Operations</option>
          <option value="ADD">ADD</option>
          <option value="REMOVE">REMOVE</option>
        </select>
        <button onClick={handleFilter} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer", fontSize: 13 }}>
          <Filter size={13} /> Apply
        </button>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer", fontSize: 13 }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {err && <div style={{ color: RED, fontSize: 13 }}>{err}</div>}
      {loading ? <Spinner /> : data && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                  {["Time", "Member", "Operation", "Side", "BV", "Business $", "Admin", "Reason"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.records.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState message="No ledger entries found." /></td></tr>
                ) : data.records.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ color: "#f1f5f9", fontSize: 12 }}>{shortDate(r.createdAt)}</div>
                      <div style={{ color: MUTED, fontSize: 11 }}>{timeAgo(r.createdAt)}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, color: "#f1f5f9" }}>{r.user.username}</div>
                      <div style={{ color: MUTED, fontSize: 11 }}>{r.user.email}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}><OpTag op={r.operation} /></td>
                    <td style={{ padding: "10px 12px" }}><SideTag side={r.side} /></td>
                    <td style={{ padding: "10px 12px", color: r.operation === "ADD" ? GREEN : RED, fontWeight: 700 }}>
                      {r.operation === "ADD" ? "+" : "−"}{fmt(r.bv, 0)}
                    </td>
                    <td style={{ padding: "10px 12px", color: r.operation === "ADD" ? GREEN : RED, fontWeight: 600 }}>
                      {r.operation === "ADD" ? "+" : "−"}${(parseFloat(String(r.bv)) * 100).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ color: MUTED, fontSize: 12 }}>{r.admin.email}</div>
                    </td>
                    <td style={{ padding: "10px 12px", maxWidth: 220 }}>
                      <div style={{ color: "#f1f5f9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reason}>{r.reason}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ color: MUTED, fontSize: 13 }}>
                Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total.toLocaleString()} total entries
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: page <= 1 ? MUTED : "#f1f5f9", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 13 }}>
                  <ChevronLeft size={14} /> Prev
                </button>
                <button onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))} disabled={page >= data.pagination.totalPages}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: page >= data.pagination.totalPages ? MUTED : "#f1f5f9", cursor: page >= data.pagination.totalPages ? "not-allowed" : "pointer", fontSize: 13 }}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Member Summary Tab ─────────────────────────────────────────────────────────

function MemberSummaryTab({ initialUserId, onClearInitial }: { initialUserId?: string; onClearInitial: () => void }) {
  const [q, setQ]             = useState("");
  const [results, setResults] = useState<PowerMemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [userId, setUserId]   = useState(initialUserId ?? "");
  const [summary, setSummary] = useState<AdminPowerSummary | null>(null);
  const [ledger, setLedger]   = useState<PowerGlobalLedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef              = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadData = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        adminGetPowerSummary(id),
        adminGetPowerLedger(id, { limit: 20 }),
      ]);
      setSummary(s); setLedger(l);
    } catch { setSummary(null); setLedger(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (initialUserId) { setUserId(initialUserId); void loadData(initialUserId); }
  }, [initialUserId, loadData]);

  const doSearch = async (query: string) => {
    setSearching(true);
    try { setResults(await searchPowerMembers(query)); }
    catch { setResults([]); }
    finally { setSearching(false); }
  };

  const handleQChange = (v: string) => {
    setQ(v);
    clearTimeout(timerRef.current);
    if (v.length >= 2) timerRef.current = setTimeout(() => void doSearch(v), 350);
    else setResults([]);
  };

  const selectMember = (m: PowerMemberSearchResult) => {
    setQ(m.username); setResults([]);
    setUserId(m.id); onClearInitial();
    void loadData(m.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>Member Summary</div>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>Full Power BV breakdown for any member</div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 480 }}>
        <Search size={15} color={MUTED} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={q} onChange={e => handleQChange(e.target.value)}
          placeholder="Search username, email or ID…"
          style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: "#f1f5f9", fontSize: 13, outline: "none", boxSizing: "border-box" }}
        />
        {results.length > 0 && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 7, zIndex: 50, maxHeight: 220, overflowY: "auto" }}>
            {results.map(m => (
              <button key={m.id} onClick={() => selectMember(m)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", color: "#f1f5f9", cursor: "pointer", borderBottom: `1px solid ${BORDER}` }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.username}</div>
                <div style={{ color: MUTED, fontSize: 11 }}>{m.email}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {searching && <div style={{ color: MUTED, fontSize: 12 }}>Searching…</div>}

      {loading && <Spinner />}

      {!loading && summary && (
        <>
          {/* BV Summary cards */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15 }}>{summary.username}</div>
              <div style={{ color: MUTED, fontSize: 12 }}>ID: {summary.userId}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              {[
                { label: "Power LEFT BV",      value: fmt(summary.powerLeftBV,  0) + " BV",  color: "#818cf8" },
                { label: "Power RIGHT BV",     value: fmt(summary.powerRightBV, 0) + " BV",  color: "#f472b6" },
                { label: "Total Power BV",     value: fmt(parseFloat(summary.powerLeftBV) + parseFloat(summary.powerRightBV), 0) + " BV", color: GOLD },
                { label: "Power Business $",   value: "$" + ((parseFloat(summary.powerLeftBV) + parseFloat(summary.powerRightBV)) * 100).toLocaleString(), color: GREEN },
                { label: "Organic LEFT",       value: fmt(summary.organicLeftBV,  0),         color: MUTED },
                { label: "Organic RIGHT",      value: fmt(summary.organicRightBV, 0),         color: MUTED },
                { label: "Effective LEFT",     value: fmt(summary.effectiveLeftBV,  0),       color: "#f1f5f9" },
                { label: "Effective RIGHT",    value: fmt(summary.effectiveRightBV, 0),       color: "#f1f5f9" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ color: MUTED, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  <div style={{ color, fontSize: 17, fontWeight: 700, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Ledger */}
          {ledger && ledger.records.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontWeight: 600, color: "#f1f5f9", marginBottom: 14 }}>Recent Transactions (last 20)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {["Time", "Op", "Side", "BV", "Business $", "Admin", "Reason"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: MUTED, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.records.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontSize: 12, color: "#f1f5f9" }}>{shortDate(r.createdAt)}</div>
                        </td>
                        <td style={{ padding: "8px 10px" }}><OpTag op={r.operation} /></td>
                        <td style={{ padding: "8px 10px" }}><SideTag side={r.side} /></td>
                        <td style={{ padding: "8px 10px", color: r.operation === "ADD" ? GREEN : RED, fontWeight: 700 }}>
                          {r.operation === "ADD" ? "+" : "−"}{fmt(r.bv, 0)}
                        </td>
                        <td style={{ padding: "8px 10px", color: r.operation === "ADD" ? GREEN : RED }}>
                          {r.operation === "ADD" ? "+" : "−"}${(parseFloat(String(r.bv)) * 100).toLocaleString()}
                        </td>
                        <td style={{ padding: "8px 10px", color: MUTED, fontSize: 12 }}>{r.admin.email}</td>
                        <td style={{ padding: "8px 10px", maxWidth: 200 }}>
                          <div style={{ color: "#f1f5f9", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.reason}>{r.reason}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !summary && userId && (
        <EmptyState message="Could not load member data." />
      )}

      {!loading && !userId && (
        <div style={{ color: MUTED, fontSize: 13, padding: "20px 0" }}>
          Search for a member to view their Power BV summary.
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────

function AnalyticsTab({ onViewSummary }: { onViewSummary: (id: string) => void }) {
  const [data, setData]       = useState<PowerGlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setData(await getPowerGlobalAnalytics()); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed to load analytics"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Spinner />;
  if (err)     return <div style={{ color: RED, padding: 24 }}>{err}</div>;
  if (!data)   return null;

  const maxBV = data.topByPowerBV.reduce((m, u) => Math.max(m, parseFloat(u.totalPowerBV)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700 }}>Power Business Analytics</div>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>Top holders, largest assignments, and daily activity</div>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 7, background: CARD, border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer", fontSize: 13 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Today's stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <StatCard label="Today's Assignments" value={data.todayAssignmentCount.toLocaleString()} sub="ADD operations since midnight" accent />
        <StatCard label="BV Assigned Today" value={fmt(data.todayAssignedBV, 0) + " BV"} sub={"$" + (parseFloat(data.todayAssignedBV) * 100).toLocaleString() + " business value"} accent />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Top 10 by Power BV */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <TrendingUp size={16} color={GOLD} />
            <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15 }}>Top 10 by Power BV</div>
          </div>
          {data.topByPowerBV.length === 0 ? <EmptyState message="No members with active Power BV." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.topByPowerBV.map((m, i) => {
                const total  = parseFloat(m.totalPowerBV);
                const pct    = Math.round((total / maxBV) * 100);
                return (
                  <div key={m.id}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: i < 3 ? GOLD : MUTED, fontWeight: 700, fontSize: 12, minWidth: 18 }}>#{i + 1}</span>
                        <div>
                          <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600 }}>{m.username}</span>
                          <button onClick={() => onViewSummary(m.id)} style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: MUTED }}>
                            <Eye size={11} />
                          </button>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>{fmt(m.totalPowerBV, 0)} BV</div>
                        <div style={{ color: MUTED, fontSize: 11 }}>${(total * 100).toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                      <div style={{ height: 4, borderRadius: 2, background: `linear-gradient(90deg,${GOLD},${GOLD_L})`, width: `${pct}%`, transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                      <span style={{ color: "#818cf8", fontSize: 11 }}>L: {fmt(m.powerLeftBV, 0)}</span>
                      <span style={{ color: "#f472b6", fontSize: 11 }}>R: {fmt(m.powerRightBV, 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Largest single assignments */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Zap size={16} color={GOLD} />
            <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15 }}>Largest Assignments</div>
          </div>
          {data.largestAssignments.length === 0 ? <EmptyState message="No assignments yet." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.largestAssignments.map((r, i) => (
                <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                  <span style={{ color: i < 3 ? GOLD : MUTED, fontWeight: 700, fontSize: 12, minWidth: 20, paddingTop: 1 }}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 13 }}>{r.user.username}</span>
                      <SideTag side={r.side} />
                    </div>
                    <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{shortDate(r.createdAt)} · by {r.admin.email}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ color: GREEN, fontWeight: 700, fontSize: 14 }}>+{fmt(r.bv, 0)} BV</div>
                    <div style={{ color: MUTED, fontSize: 11 }}>${(parseFloat(String(r.bv)) * 100).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 14-day trend */}
      {data.dailyTrend.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 15, marginBottom: 16 }}>14-Day Assignment Activity</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
            {(() => {
              const maxCount = data.dailyTrend.reduce((m, d) => Math.max(m, d.count), 1);
              return data.dailyTrend.map(d => {
                const h = Math.max(4, Math.round((d.count / maxCount) * 90));
                return (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                    title={`${d.date}: ${d.count} assignment${d.count !== 1 ? "s" : ""}, ${fmt(d.bv, 0)} BV`}>
                    <div style={{ fontSize: 10, color: MUTED }}>{d.count}</div>
                    <div style={{ width: "100%", height: h, borderRadius: "3px 3px 0 0", background: `linear-gradient(180deg,${GOLD_L},${GOLD})`, minWidth: 8 }} />
                    <div style={{ fontSize: 9, color: MUTED, transform: "rotate(-45deg)", transformOrigin: "top left", whiteSpace: "nowrap", marginLeft: 6 }}>
                      {d.date.slice(5)}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminPowerBusinessPage() {
  const [tab, setTab]               = useState<Tab>("dashboard");
  const [summaryUserId, setSummaryUserId] = useState<string | undefined>();

  const navigateToSummary = useCallback((userId: string) => {
    setSummaryUserId(userId);
    setTab("summary");
  }, []);

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t !== "summary") setSummaryUserId(undefined);
  };

  return (
    <AdminLayout>
      <div style={{ minHeight: "100vh", padding: "28px 28px 60px", maxWidth: 1300, margin: "0 auto" }}>
        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bolt size={20} color={GOLD} />
            </div>
            <h1 style={{ margin: 0, color: "#f1f5f9", fontSize: 22, fontWeight: 800 }}>Power Business</h1>
          </div>
          <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Manage and monitor Power BV allocation across the platform</p>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}`, paddingBottom: 0 }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => handleTabChange(id)} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "10px 18px", borderRadius: "8px 8px 0 0",
                background: active ? "rgba(212,175,55,0.1)" : "transparent",
                border: `1px solid ${active ? "rgba(212,175,55,0.3)" : "transparent"}`,
                borderBottom: active ? "2px solid " + GOLD : "2px solid transparent",
                color: active ? GOLD : MUTED,
                cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
                transition: "all 0.15s",
                marginBottom: -1,
              }}>
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === "dashboard"  && <DashboardTab   onNavigate={setTab} />}
        {tab === "search"     && <SearchTab       onViewSummary={navigateToSummary} />}
        {tab === "assign"     && <AssignTab />}
        {tab === "ledger"     && <LedgerTab />}
        {tab === "summary"    && <MemberSummaryTab initialUserId={summaryUserId} onClearInitial={() => setSummaryUserId(undefined)} />}
        {tab === "analytics"  && <AnalyticsTab    onViewSummary={navigateToSummary} />}
      </div>
    </AdminLayout>
  );
}
