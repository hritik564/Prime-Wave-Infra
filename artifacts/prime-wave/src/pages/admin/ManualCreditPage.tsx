import { useState, useCallback, useRef, useEffect } from "react";
import AdminLayout from "./AdminLayout";
import {
  adminSearchUsers,
  adminCreditUserWallet,
  type AdminUserListItem,
} from "@/lib/api";
import {
  Search, CircleDollarSign, ArrowDownToLine, Wallet,
  CheckCircle2, AlertCircle, Loader2, ChevronLeft, ChevronRight,
  BadgeDollarSign, UserCircle2,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.55)";
const BORDER = "rgba(255,255,255,0.08)";
const BG_C   = "rgba(255,255,255,0.03)";
const BG_IN  = "rgba(255,255,255,0.05)";

type WalletType = "depositWallet" | "incomeWallet" | "withdrawalWallet";

const WALLET_OPTIONS: {
  type: WalletType; label: string; icon: React.ElementType; color: string; desc: string;
}[] = [
  { type: "depositWallet",    label: "Deposit Wallet",    icon: ArrowDownToLine, color: "#3B82F6", desc: "Creates deposit record + credits wallet" },
  { type: "incomeWallet",     label: "Income Wallet",     icon: CircleDollarSign, color: "#10B981", desc: "Direct credit, no deposit record" },
  { type: "withdrawalWallet", label: "Withdrawal Wallet", icon: Wallet,           color: "#8B5CF6", desc: "Direct credit, no deposit record" },
];

function fmt(v: string | undefined) { return `$${Number(v ?? 0).toFixed(2)}`; }

function useDebounce<T extends (v: string) => void>(fn: T, delay = 350) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(v), delay);
  }, [fn]);
}

const PAGE_SIZE = 12;

export default function ManualCreditPage() {
  /* ── user list state ── */
  const [query,     setQuery]     = useState("");
  const [users,     setUsers]     = useState<AdminUserListItem[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(false);

  /* ── selected user + form ── */
  const [selected,   setSelected]   = useState<AdminUserListItem | null>(null);
  const [walletType, setWalletType] = useState<WalletType>("depositWallet");
  const [amount,     setAmount]     = useState("");
  const [reason,     setReason]     = useState("");
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* ── fetch users ── */
  const fetchUsers = useCallback(async (q: string, pg: number) => {
    setLoading(true);
    try {
      const params: Parameters<typeof adminSearchUsers>[0] = { page: pg, limit: PAGE_SIZE };
      if (q.trim()) params.username = q.trim();
      const res = await adminSearchUsers(params);
      setUsers(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(query, page); }, []);

  const doSearch = useCallback((q: string) => {
    setPage(1);
    fetchUsers(q, 1);
  }, [fetchUsers]);

  const debounced = useDebounce(doSearch);

  function handleQuery(v: string) {
    setQuery(v);
    debounced(v);
  }

  function handlePage(p: number) {
    setPage(p);
    fetchUsers(query, p);
  }

  function selectUser(u: AdminUserListItem) {
    setSelected(u);
    setSuccess(null);
    setError(null);
    setAmount("");
    setReason("");
    setNotes("");
  }

  /* ── submit ── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid positive amount."); return; }
    if (!reason.trim())   { setError("Reason is required."); return; }

    setSubmitting(true); setError(null); setSuccess(null);
    try {
      await adminCreditUserWallet(selected.id, walletType, amt, reason.trim(), notes.trim() || undefined);
      const wLabel = WALLET_OPTIONS.find(w => w.type === walletType)?.label ?? walletType;
      setSuccess(`$${amt.toFixed(2)} credited to ${selected.username}'s ${wLabel}.`);
      setAmount(""); setReason(""); setNotes("");
      /* refresh the selected user's balance in the list */
      const refreshed = await adminSearchUsers({ username: selected.username, limit: 1 });
      if (refreshed.data?.[0]) {
        setSelected(refreshed.data[0]);
        setUsers(prev => prev.map(u => u.id === refreshed.data[0].id ? refreshed.data[0] : u));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const amtNum      = parseFloat(amount || "0");
  const canSubmit   = !!selected && amtNum > 0 && !!reason.trim() && !submitting;
  const pickedWallet = WALLET_OPTIONS.find(w => w.type === walletType)!;

  return (
    <AdminLayout>
      <div style={{ padding: "24px 28px", height: "100%", boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>
            Manual Wallet Credit
          </h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: MUTED }}>
            Browse or search members, then credit any wallet directly.
          </p>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 16, alignItems: "start" }}>

          {/* LEFT — users list */}
          <div style={{ background: BG_C, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>

            {/* Search */}
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
                <input
                  value={query}
                  onChange={e => handleQuery(e.target.value)}
                  placeholder="Search by username…"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 7,
                    color: "#fff", fontSize: 13, padding: "8px 10px 8px 28px", outline: "none",
                  }}
                />
                {loading && (
                  <Loader2 size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, animation: "spin 1s linear infinite" }} />
                )}
              </div>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 70px",
              padding: "8px 16px", borderBottom: `1px solid ${BORDER}`,
              fontSize: 10.5, fontWeight: 700, color: MUTED, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              <span>Member</span>
              <span style={{ textAlign: "right" }}>Deposit</span>
              <span style={{ textAlign: "right" }}>Income</span>
              <span style={{ textAlign: "right" }}>Withdrawal</span>
              <span style={{ textAlign: "right" }}>Status</span>
            </div>

            {/* Rows */}
            <div style={{ minHeight: 320 }}>
              {loading && users.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: MUTED, fontSize: 13 }}>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading members…
                </div>
              ) : users.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: MUTED, fontSize: 13 }}>
                  <UserCircle2 size={28} style={{ opacity: 0.35 }} />
                  No members found
                </div>
              ) : users.map((u) => {
                const isSelected = selected?.id === u.id;
                const statusColor = u.status === "ACTIVE" ? "#10B981" : u.status === "SUSPENDED" ? "#F59E0B" : "#EF4444";
                return (
                  <div
                    key={u.id}
                    onClick={() => selectUser(u)}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 70px",
                      padding: "11px 16px", cursor: "pointer", alignItems: "center",
                      borderBottom: `1px solid ${BORDER}`,
                      background: isSelected ? "rgba(212,175,55,0.07)" : "transparent",
                      borderLeft: isSelected ? `2.5px solid ${GOLD}` : "2.5px solid transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* Member info */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? GOLD_L : "#fff" }}>
                        {u.username}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{u.email}</div>
                    </div>
                    {/* Deposit wallet */}
                    <div style={{ textAlign: "right", fontSize: 12.5, color: "#3B82F6", fontFamily: "monospace" }}>
                      {fmt(u.wallet?.depositWallet)}
                    </div>
                    {/* Income wallet */}
                    <div style={{ textAlign: "right", fontSize: 12.5, color: "#10B981", fontFamily: "monospace" }}>
                      {fmt(u.wallet?.incomeWallet)}
                    </div>
                    {/* Withdrawal wallet */}
                    <div style={{ textAlign: "right", fontSize: 12.5, color: "#8B5CF6", fontFamily: "monospace" }}>
                      {fmt(u.wallet?.withdrawalWallet)}
                    </div>
                    {/* Status */}
                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        fontSize: 9.5, padding: "2px 7px", borderRadius: 20, fontWeight: 600,
                        background: `${statusColor}18`, color: statusColor,
                      }}>
                        {u.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11.5, color: MUTED }}>
                {total} member{total !== 1 ? "s" : ""}
                {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => handlePage(page - 1)}
                  disabled={page === 1 || loading}
                  style={{
                    background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 6,
                    color: page === 1 ? MUTED : "#fff", padding: "4px 8px", cursor: page === 1 ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 3, fontSize: 12,
                  }}
                >
                  <ChevronLeft size={12} /> Prev
                </button>
                <button
                  onClick={() => handlePage(page + 1)}
                  disabled={page >= totalPages || loading}
                  style={{
                    background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 6,
                    color: page >= totalPages ? MUTED : "#fff", padding: "4px 8px", cursor: page >= totalPages ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 3, fontSize: 12,
                  }}
                >
                  Next <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT — credit form */}
          <div>
            {!selected ? (
              /* Empty state */
              <div style={{
                background: BG_C, border: `1px solid ${BORDER}`, borderRadius: 12,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "48px 24px", textAlign: "center", gap: 12,
              }}>
                <BadgeDollarSign size={36} style={{ color: GOLD, opacity: 0.4 }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: MUTED }}>Select a member</div>
                <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, maxWidth: 200 }}>
                  Click any row on the left to load their wallet and start a credit.
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>

                {/* Selected user card */}
                <div style={{ background: "rgba(212,175,55,0.05)", border: `1px solid rgba(212,175,55,0.2)`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: GOLD_L }}>{selected.username}</div>
                      <div style={{ fontSize: 11.5, color: MUTED }}>{selected.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 11.5, padding: "2px 6px" }}
                    >
                      Change
                    </button>
                  </div>
                  {/* Balances */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {WALLET_OPTIONS.map(w => (
                      <div key={w.type} style={{
                        background: walletType === w.type ? `${w.color}14` : BG_IN,
                        border: `1px solid ${walletType === w.type ? w.color + "40" : BORDER}`,
                        borderRadius: 7, padding: "8px 10px",
                      }}>
                        <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 3 }}>{w.label.replace(" Wallet", "")}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: w.color, fontFamily: "monospace" }}>
                          {fmt(selected.wallet?.[w.type as keyof typeof selected.wallet])}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Config card */}
                <div style={{ background: BG_C, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", marginBottom: 10 }}>
                  {/* Wallet selector */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11.5, color: MUTED, display: "block", marginBottom: 7 }}>Wallet</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
                      {WALLET_OPTIONS.map(w => {
                        const Icon   = w.icon;
                        const active = walletType === w.type;
                        return (
                          <button
                            key={w.type} type="button" onClick={() => setWalletType(w.type)}
                            style={{
                              background:   active ? `${w.color}18` : BG_IN,
                              border:       `1.5px solid ${active ? w.color : BORDER}`,
                              borderRadius: 8, padding: "9px 8px", cursor: "pointer", textAlign: "center",
                            }}
                          >
                            <Icon size={14} style={{ color: active ? w.color : MUTED, marginBottom: 3 }} />
                            <div style={{ fontSize: 10.5, fontWeight: active ? 600 : 400, color: active ? "#fff" : MUTED, lineHeight: 1.3 }}>
                              {w.label.replace(" Wallet", "")}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount */}
                  <div style={{ marginBottom: 11 }}>
                    <label style={{ fontSize: 11.5, color: MUTED, display: "block", marginBottom: 6 }}>
                      Amount <span style={{ color: "#EF4444" }}>*</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, fontSize: 13, userSelect: "none" }}>$</span>
                      <input
                        type="number" min="0.01" step="0.01"
                        value={amount} onChange={e => setAmount(e.target.value)}
                        placeholder="0.00" required
                        style={{
                          width: "100%", boxSizing: "border-box",
                          background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 7,
                          color: "#fff", fontSize: 13.5, padding: "9px 10px 9px 22px", outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  {/* Reason */}
                  <div style={{ marginBottom: 11 }}>
                    <label style={{ fontSize: 11.5, color: MUTED, display: "block", marginBottom: 6 }}>
                      Reason <span style={{ color: "#EF4444" }}>*</span>
                    </label>
                    <input
                      type="text" value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Compensation, Bonus, Correction…"
                      maxLength={500} required
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 7,
                        color: "#fff", fontSize: 13, padding: "9px 10px", outline: "none",
                      }}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: 11.5, color: MUTED, display: "block", marginBottom: 6 }}>
                      Internal Notes <span style={{ fontSize: 10 }}>(optional)</span>
                    </label>
                    <textarea
                      value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Audit log context…" rows={2} maxLength={1000}
                      style={{
                        width: "100%", boxSizing: "border-box", resize: "vertical",
                        background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 7,
                        color: "#fff", fontSize: 13, padding: "9px 10px", outline: "none", fontFamily: "inherit",
                      }}
                    />
                  </div>
                </div>

                {/* Feedback */}
                {error && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 7, marginBottom: 10 }}>
                    <AlertCircle size={13} style={{ color: "#EF4444", flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: "#FCA5A5" }}>{error}</span>
                  </div>
                )}
                {success && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 7, marginBottom: 10 }}>
                    <CheckCircle2 size={13} style={{ color: "#10B981", flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: "#6EE7B7" }}>{success}</span>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit" disabled={!canSubmit}
                  style={{
                    width: "100%", padding: "11px",  borderRadius: 8,
                    cursor: !canSubmit ? "not-allowed" : submitting ? "wait" : "pointer",
                    background: GOLD, color: "#000", fontWeight: 700, fontSize: 13.5, border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    opacity: !canSubmit ? 0.45 : 1, transition: "opacity 0.15s",
                  }}
                >
                  {submitting && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
                  {submitting
                    ? "Crediting…"
                    : `Credit ${amtNum > 0 ? `$${amtNum.toFixed(2)}` : ""} → ${pickedWallet.label}`}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </AdminLayout>
  );
}
