import { useState, useCallback, useEffect, useRef } from "react";
import AdminLayout from "./AdminLayout";
import {
  Search, Filter, Download, FileSpreadsheet, FileText,
  Users, UserCheck, UserPlus, Calendar, RefreshCw, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { getToken } from "@/lib/auth";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.55)";
const BORDER = "rgba(255,255,255,0.07)";
const BG     = "hsl(222 62% 6%)";
const BG2    = "hsl(222 62% 8%)";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemberRow {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  joinedAt: string;
  accountType: string;
  sponsor: string;
  binaryParent: string;
  placement: string;
  accountStatus: string;
  operationalStatus: string;
  hasInvestment: boolean;
  investmentPlan: string;
  investmentAmount: string;
  depositWallet: string;
  incomeWallet: string;
  withdrawalWallet: string;
  directReferrals: number;
  leftBV: string;
  rightBV: string;
}

interface Meta {
  total: number; page: number; limit: number;
  totalPages: number; hasNextPage: boolean; hasPrevPage: boolean;
}

interface Summary {
  total: number; joinedToday: number; joinedYesterday: number;
  joinedThisWeek: number; joinedThisMonth: number;
}

interface ReportData {
  data: MemberRow[];
  meta: Meta;
  summary: Summary;
}

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  preset: string;
  from: string; to: string;
  status: string;
  operationalStatus: string;
  hasInvestment: string;
  placement: string;
  accountType: string;
  search: string;
}

const DEFAULT_FILTERS: Filters = {
  preset: "", from: "", to: "",
  status: "", operationalStatus: "", hasInvestment: "",
  placement: "", accountType: "", search: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildQS(f: Filters, page: number, limit: number): string {
  const p = new URLSearchParams();
  if (f.preset)            p.set("preset", f.preset);
  if (f.from)              p.set("from",   f.from);
  if (f.to)                p.set("to",     f.to);
  if (f.status)            p.set("status", f.status);
  if (f.operationalStatus) p.set("operationalStatus", f.operationalStatus);
  if (f.hasInvestment)     p.set("hasInvestment", f.hasInvestment);
  if (f.placement)         p.set("placement", f.placement);
  if (f.accountType)       p.set("accountType", f.accountType);
  if (f.search)            p.set("search", f.search);
  p.set("page",  String(page));
  p.set("limit", String(limit));
  return p.toString();
}

function buildExportQS(f: Filters): string {
  const p = new URLSearchParams();
  if (f.preset)            p.set("preset", f.preset);
  if (f.from)              p.set("from",   f.from);
  if (f.to)                p.set("to",     f.to);
  if (f.status)            p.set("status", f.status);
  if (f.operationalStatus) p.set("operationalStatus", f.operationalStatus);
  if (f.hasInvestment)     p.set("hasInvestment", f.hasInvestment);
  if (f.placement)         p.set("placement", f.placement);
  if (f.accountType)       p.set("accountType", f.accountType);
  if (f.search)            p.set("search", f.search);
  return p.toString();
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtNum(s: string | number) {
  const n = typeof s === "number" ? s : parseFloat(s);
  if (isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusColor(s: string) {
  if (s === "ACTIVE")    return { color: "#34d399", bg: "rgba(52,211,153,0.1)"  };
  if (s === "SUSPENDED") return { color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  };
  if (s === "BLOCKED")   return { color: "#f87171", bg: "rgba(248,113,113,0.1)" };
  return { color: MUTED, bg: "rgba(170,179,197,0.08)" };
}

function opStatusColor(s: string) {
  return s === "ACTIVE"
    ? { color: "#34d399", bg: "rgba(52,211,153,0.1)" }
    : { color: MUTED,    bg: "rgba(170,179,197,0.08)" };
}

function typeColor(t: string) {
  if (t === "MI")     return { color: "#a78bfa", bg: "rgba(167,139,250,0.1)" };
  if (t === "RD")     return { color: "#60a5fa", bg: "rgba(96,165,250,0.1)"  };
  if (t === "SP")     return { color: "#fb923c", bg: "rgba(251,146,60,0.1)"  };
  if (t === "Master") return { color: GOLD_L,    bg: "rgba(212,175,55,0.1)"  };
  return { color: MUTED, bg: "rgba(170,179,197,0.06)" };
}

// ── Select / Input components ─────────────────────────────────────────────────

function Sel({ label, value, onChange, options }: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>
        {label.toUpperCase()}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7,
          color: value ? "rgba(255,255,255,0.85)" : MUTED,
          fontSize: 12, padding: "7px 10px", outline: "none", cursor: "pointer",
          appearance: "none", minWidth: 130,
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: "#0E1B37" }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  return (
    <div style={{
      background: BG2, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 140,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: `${color}18`, border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.9)", lineHeight: 1.1 }}>
          {value.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MemberReportsPage() {
  const [filters,    setFilters]    = useState<Filters>(DEFAULT_FILTERS);
  const [applied,    setApplied]    = useState<Filters>(DEFAULT_FILTERS);
  const [page,       setPage]       = useState(1);
  const [limit]                     = useState(50);
  const [data,       setData]       = useState<ReportData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [exporting,  setExporting]  = useState<"excel" | "csv" | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchReport = useCallback(async (f: Filters, pg: number) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const qs    = buildQS(f, pg, limit);
      const res   = await fetch(`/api/admin/reports/members?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data);
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchReport(applied, page);
  }, [fetchReport, applied, page]);

  const handleApply = useCallback(() => {
    setApplied(filters);
    setPage(1);
  }, [filters]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const handleExport = useCallback(async (type: "excel" | "csv") => {
    setExporting(type);
    try {
      const token    = getToken();
      const qs       = buildExportQS(applied);
      const endpoint = type === "excel"
        ? `/api/admin/reports/members/export?${qs}`
        : `/api/admin/reports/members/export-csv?${qs}`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = type === "excel"
        ? `members-report-${new Date().toISOString().slice(0, 10)}.xlsx`
        : `members-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setExporting(null);
    }
  }, [applied]);

  const setF = (key: keyof Filters) => (v: string) =>
    setFilters(f => ({ ...f, [key]: v }));

  const activeFilterCount = Object.values(applied).filter(Boolean).length;

  return (
    <AdminLayout>
      <div style={{ minHeight: "100vh", background: BG, color: "rgba(255,255,255,0.85)", padding: "24px 28px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FileSpreadsheet size={15} style={{ color: GOLD }} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.92)", margin: 0 }}>
                Member Reports
              </h1>
              <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>
                Filter, preview, and export member data
              </p>
            </div>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <SummaryCard icon={Users}     label="Total Members"       value={data?.summary.total          ?? 0} color={GOLD}      />
          <SummaryCard icon={UserPlus}  label="Joined Today"        value={data?.summary.joinedToday    ?? 0} color="#34d399"   />
          <SummaryCard icon={UserPlus}  label="Joined Yesterday"    value={data?.summary.joinedYesterday ?? 0} color="#60a5fa"  />
          <SummaryCard icon={Calendar}  label="Joined This Week"    value={data?.summary.joinedThisWeek ?? 0} color="#a78bfa"   />
          <SummaryCard icon={UserCheck} label="Joined This Month"   value={data?.summary.joinedThisMonth ?? 0} color="#fb923c" />
        </div>

        {/* ── Filters panel ── */}
        <div style={{
          background: BG2, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: "18px 20px", marginBottom: 18,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Filter size={13} style={{ color: GOLD }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD_L, letterSpacing: "0.04em" }}>FILTERS</span>
            {activeFilterCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, background: "rgba(212,175,55,0.15)",
                color: GOLD, borderRadius: 4, padding: "1px 6px",
              }}>{activeFilterCount} active</span>
            )}
          </div>

          {/* Row 1: date presets + custom range */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Sel label="Date Preset" value={filters.preset} onChange={setF("preset")} options={[
              { value: "",           label: "All time"    },
              { value: "today",      label: "Today"       },
              { value: "yesterday",  label: "Yesterday"   },
              { value: "last7",      label: "Last 7 Days" },
              { value: "last30",     label: "Last 30 Days"},
              { value: "thisMonth",  label: "This Month"  },
              { value: "lastMonth",  label: "Last Month"  },
            ]} />

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>FROM</label>
              <input
                type="date" value={filters.from}
                onChange={e => setF("from")(e.target.value)}
                style={{
                  background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7,
                  color: "rgba(255,255,255,0.8)", fontSize: 12, padding: "7px 10px", outline: "none",
                  colorScheme: "dark",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>TO</label>
              <input
                type="date" value={filters.to}
                onChange={e => setF("to")(e.target.value)}
                style={{
                  background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7,
                  color: "rgba(255,255,255,0.8)", fontSize: 12, padding: "7px 10px", outline: "none",
                  colorScheme: "dark",
                }}
              />
            </div>
          </div>

          {/* Row 2: status filters */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Sel label="Account Status" value={filters.status} onChange={setF("status")} options={[
              { value: "",          label: "All Statuses" },
              { value: "ACTIVE",    label: "Active"       },
              { value: "INACTIVE",  label: "Inactive"     },
              { value: "SUSPENDED", label: "Suspended"    },
              { value: "BLOCKED",   label: "Blocked"      },
            ]} />

            <Sel label="Operational Status" value={filters.operationalStatus} onChange={setF("operationalStatus")} options={[
              { value: "",       label: "All"      },
              { value: "ACTIVE", label: "Active"   },
              { value: "INACTIVE",label:"Inactive" },
            ]} />

            <Sel label="Investment" value={filters.hasInvestment} onChange={setF("hasInvestment")} options={[
              { value: "",    label: "All"            },
              { value: "yes", label: "Has Investment" },
              { value: "no",  label: "No Plan"        },
            ]} />

            <Sel label="Placement" value={filters.placement} onChange={setF("placement")} options={[
              { value: "",      label: "All"   },
              { value: "LEFT",  label: "Left"  },
              { value: "RIGHT", label: "Right" },
            ]} />

            <Sel label="Account Type" value={filters.accountType} onChange={setF("accountType")} options={[
              { value: "",       label: "All Types"     },
              { value: "master", label: "Master"        },
              { value: "mi",     label: "MI"            },
              { value: "rd",     label: "RD"            },
              { value: "sp",     label: "SP"            },
              { value: "normal", label: "Normal Users"  },
            ]} />
          </div>

          {/* Row 3: search + action buttons */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: "0.06em" }}>SEARCH</label>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
                <input
                  type="text" placeholder="Name, username, or email…"
                  value={filters.search}
                  onChange={e => setF("search")(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleApply(); }}
                  style={{
                    width: "100%", background: BG2, border: `1px solid ${BORDER}`, borderRadius: 7,
                    color: "rgba(255,255,255,0.85)", fontSize: 12, padding: "7px 10px 7px 30px",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleApply}
              style={{
                background: `rgba(212,175,55,0.15)`, border: `1px solid rgba(212,175,55,0.3)`,
                color: GOLD_L, borderRadius: 7, padding: "8px 18px", cursor: "pointer",
                fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Filter size={12} /> Apply Filters
            </button>

            {activeFilterCount > 0 && (
              <button
                onClick={handleReset}
                style={{
                  background: "transparent", border: `1px solid ${BORDER}`,
                  color: MUTED, borderRadius: 7, padding: "8px 14px", cursor: "pointer",
                  fontSize: 12, display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <X size={12} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Export bar ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 14, gap: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
            {loading ? "Loading…" : data ? (
              <>{data.meta.total.toLocaleString()} member{data.meta.total !== 1 ? "s" : ""} matched</>
            ) : ""}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleExport("excel")}
              disabled={!!exporting || loading}
              style={{
                background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)",
                color: "#34d399", borderRadius: 7, padding: "7px 14px", cursor: "pointer",
                fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting === "excel"
                ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Exporting…</>
                : <><FileSpreadsheet size={12} /> Export Excel</>
              }
            </button>
            <button
              onClick={() => handleExport("csv")}
              disabled={!!exporting || loading}
              style={{
                background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)",
                color: "#60a5fa", borderRadius: 7, padding: "7px 14px", cursor: "pointer",
                fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting === "csv"
                ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Exporting…</>
                : <><FileText size={12} /> Export CSV</>
              }
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 8, padding: "12px 16px", marginBottom: 14,
            fontSize: 13, color: "#f87171",
          }}>{error}</div>
        )}

        {/* ── Table ── */}
        <div style={{
          background: BG2, border: `1px solid ${BORDER}`, borderRadius: 12,
          overflow: "hidden",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {[
                    "Name","Username","Email","Phone","Joined","Type",
                    "Sponsor","Binary Parent","Placement",
                    "Acct Status","Op Status","Investment",
                    "Deposit $","Income $","Withdrawal $",
                    "Directs","Left BV","Right BV",
                  ].map(h => (
                    <th key={h} style={{
                      padding: "11px 12px", textAlign: "left",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                      color: MUTED, background: "hsl(222 62% 5%)",
                      borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && !data && (
                  <tr>
                    <td colSpan={18} style={{ padding: "40px 0", textAlign: "center", color: MUTED }}>
                      <RefreshCw size={16} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                      <div style={{ fontSize: 13 }}>Loading…</div>
                    </td>
                  </tr>
                )}
                {!loading && data?.data.length === 0 && (
                  <tr>
                    <td colSpan={18} style={{ padding: "48px 0", textAlign: "center", color: MUTED, fontSize: 13 }}>
                      No members matched the current filters.
                    </td>
                  </tr>
                )}
                {data?.data.map((r, i) => {
                  const sc  = statusColor(r.accountStatus);
                  const osc = opStatusColor(r.operationalStatus);
                  const tc  = typeColor(r.accountType);
                  return (
                    <tr key={r.id} style={{
                      borderBottom: `1px solid ${BORDER}`,
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)",
                      transition: "background 0.1s",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)")}
                    >
                      <td style={{ padding: "9px 12px", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", fontWeight: 500 }}>
                        {r.name || "—"}
                      </td>
                      <td style={{ padding: "9px 12px", color: GOLD_L, fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>
                        @{r.username}
                      </td>
                      <td style={{ padding: "9px 12px", color: MUTED, fontSize: 11, whiteSpace: "nowrap" }}>{r.email}</td>
                      <td style={{ padding: "9px 12px", color: MUTED, fontSize: 11, whiteSpace: "nowrap" }}>{r.phone || "—"}</td>
                      <td style={{ padding: "9px 12px", color: MUTED, whiteSpace: "nowrap" }}>{fmtDate(r.joinedAt)}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 4,
                          padding: "2px 7px", color: tc.color, background: tc.bg,
                        }}>{r.accountType}</span>
                      </td>
                      <td style={{ padding: "9px 12px", color: MUTED, fontSize: 11, fontFamily: "monospace" }}>
                        {r.sponsor ? `@${r.sponsor}` : "—"}
                      </td>
                      <td style={{ padding: "9px 12px", color: MUTED, fontSize: 11, fontFamily: "monospace" }}>
                        {r.binaryParent ? `@${r.binaryParent}` : "—"}
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        {r.placement ? (
                          <span style={{
                            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
                            color: r.placement === "LEFT" ? "#60a5fa" : "#f472b6",
                            background: r.placement === "LEFT" ? "rgba(96,165,250,0.1)" : "rgba(244,114,182,0.1)",
                          }}>{r.placement === "LEFT" ? "L" : "R"}</span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 4,
                          padding: "2px 7px", color: sc.color, background: sc.bg,
                        }}>{r.accountStatus}</span>
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 4,
                          padding: "2px 7px", color: osc.color, background: osc.bg,
                        }}>{r.operationalStatus}</span>
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        {r.hasInvestment ? (
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#34d399" }}>
                            {r.investmentPlan || "Active"}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: MUTED }}>No Plan</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: 11, textAlign: "right" }}>
                        {fmtNum(r.depositWallet)}
                      </td>
                      <td style={{ padding: "9px 12px", color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: 11, textAlign: "right" }}>
                        {fmtNum(r.incomeWallet)}
                      </td>
                      <td style={{ padding: "9px 12px", color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: 11, textAlign: "right" }}>
                        {fmtNum(r.withdrawalWallet)}
                      </td>
                      <td style={{ padding: "9px 12px", color: MUTED, textAlign: "center" }}>{r.directReferrals}</td>
                      <td style={{ padding: "9px 12px", color: MUTED, fontFamily: "monospace", fontSize: 11, textAlign: "right" }}>
                        {fmtNum(r.leftBV)}
                      </td>
                      <td style={{ padding: "9px 12px", color: MUTED, fontFamily: "monospace", fontSize: 11, textAlign: "right" }}>
                        {fmtNum(r.rightBV)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {data && data.meta.totalPages > 1 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderTop: `1px solid ${BORDER}`,
            }}>
              <span style={{ fontSize: 12, color: MUTED }}>
                Page {data.meta.page} of {data.meta.totalPages} &nbsp;·&nbsp; {data.meta.total.toLocaleString()} total
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  disabled={!data.meta.hasPrevPage}
                  onClick={() => setPage(p => p - 1)}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                    color: data.meta.hasPrevPage ? "rgba(255,255,255,0.7)" : MUTED,
                    display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                    opacity: data.meta.hasPrevPage ? 1 : 0.4,
                  }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  disabled={!data.meta.hasNextPage}
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                    borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                    color: data.meta.hasNextPage ? "rgba(255,255,255,0.7)" : MUTED,
                    display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                    opacity: data.meta.hasNextPage ? 1 : 0.4,
                  }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </AdminLayout>
  );
}
