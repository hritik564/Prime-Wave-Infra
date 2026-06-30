import { useState, useCallback, useRef } from "react";
import AdminLayout from "./AdminLayout";
import { adminSearchUsers, adminCreditUserWallet, type AdminUserListItem } from "@/lib/api";
import { Search, Wallet, CircleDollarSign, ArrowDownToLine, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";

const GOLD    = "#D4AF37";
const GOLD_L  = "#F3D37A";
const MUTED   = "rgba(170,179,197,0.55)";
const BORDER  = "rgba(255,255,255,0.08)";
const BG_CARD = "rgba(255,255,255,0.03)";
const BG_IN   = "rgba(255,255,255,0.05)";

type WalletType = "depositWallet" | "incomeWallet" | "withdrawalWallet";

const WALLET_OPTIONS: {
  type: WalletType; label: string; icon: React.ElementType; color: string; desc: string;
}[] = [
  { type: "depositWallet",    label: "Deposit Wallet",    icon: ArrowDownToLine, color: "#3B82F6", desc: "Creates a deposit record + credits wallet" },
  { type: "incomeWallet",     label: "Income Wallet",     icon: CircleDollarSign, color: "#10B981", desc: "Direct credit, no deposit record" },
  { type: "withdrawalWallet", label: "Withdrawal Wallet", icon: Wallet,           color: "#8B5CF6", desc: "Direct credit, no deposit record" },
];

function fmt(v: string | undefined) {
  return `$${Number(v ?? 0).toFixed(2)}`;
}

function useDebounce<T extends (v: string) => void>(fn: T, delay = 350) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(v), delay);
  }, [fn]);
}

export default function ManualCreditPage() {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<AdminUserListItem[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [selected,   setSelected]   = useState<AdminUserListItem | null>(null);
  const [walletType, setWalletType] = useState<WalletType>("depositWallet");
  const [amount,     setAmount]     = useState("");
  const [reason,     setReason]     = useState("");
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await adminSearchUsers({ username: q.trim(), limit: 8 });
      setResults(res.data ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const debounced = useDebounce(doSearch);

  function handleQueryChange(v: string) {
    setQuery(v);
    setSelected(null);
    setSuccess(null);
    setError(null);
    debounced(v);
  }

  function selectUser(u: AdminUserListItem) {
    setSelected(u);
    setQuery(u.username);
    setResults([]);
    setSuccess(null);
    setError(null);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setSuccess(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid positive amount."); return; }
    if (!reason.trim())   { setError("Reason is required."); return; }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await adminCreditUserWallet(selected.id, walletType, amt, reason.trim(), notes.trim() || undefined);
      const wLabel = WALLET_OPTIONS.find(w => w.type === walletType)?.label ?? walletType;
      setSuccess(`$${amt.toFixed(2)} credited to ${selected.username}'s ${wLabel} successfully.`);
      setAmount("");
      setReason("");
      setNotes("");
      const refreshed = await adminSearchUsers({ username: selected.username, limit: 1 });
      if (refreshed.data?.[0]) setSelected(refreshed.data[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const pickedWallet = WALLET_OPTIONS.find(w => w.type === walletType)!;
  const amtNum       = parseFloat(amount || "0");
  const canSubmit    = !!selected && amtNum > 0 && !!reason.trim() && !submitting;

  return (
    <AdminLayout>
      <div style={{ padding: "28px 32px", maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
            Manual Wallet Credit
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>
            Credit any member's Deposit, Income, or Withdrawal wallet directly.
            Every action is audit-logged and the member receives an in-app notification.
          </p>
        </div>

        {/* Step 1 — User Search */}
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, letterSpacing: "0.1em", marginBottom: 14, textTransform: "uppercase" }}>
            Step 1 — Find Member
          </div>

          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }} />
            <input
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Search by username…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 8,
                color: "#fff", fontSize: 13.5, padding: "10px 36px 10px 32px", outline: "none",
              }}
            />
            {searching && (
              <Loader2 size={13} style={{ position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)", color: MUTED, animation: "spin 1s linear infinite" }} />
            )}
            {query && (
              <button onClick={clearSelection} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2 }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Results */}
          {results.length > 0 && !selected && (
            <div style={{ marginTop: 5, background: "hsl(222 62% 7%)", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
              {results.map((u, i) => (
                <div
                  key={u.id}
                  onClick={() => selectUser(u)}
                  style={{
                    padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                    borderBottom: i < results.length - 1 ? `1px solid ${BORDER}` : "none",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div>
                    <span style={{ color: "#fff", fontSize: 13.5, fontWeight: 500 }}>{u.username}</span>
                    <span style={{ color: MUTED, fontSize: 12, marginLeft: 8 }}>{u.email}</span>
                  </div>
                  <span style={{
                    fontSize: 10.5, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                    background: u.status === "ACTIVE" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                    color:      u.status === "ACTIVE" ? "#10B981" : "#EF4444",
                  }}>
                    {u.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!searching && query.trim().length > 0 && results.length === 0 && !selected && (
            <p style={{ margin: "10px 0 0", fontSize: 12.5, color: MUTED }}>No members found for "{query}".</p>
          )}
        </div>

        {/* Selected user balances */}
        {selected && (
          <div style={{ background: "rgba(212,175,55,0.05)", border: `1px solid rgba(212,175,55,0.18)`, borderRadius: 12, padding: "16px 24px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700, color: GOLD_L }}>{selected.username}</span>
                <span style={{ fontSize: 12.5, color: MUTED, marginLeft: 10 }}>{selected.email}</span>
              </div>
              <span style={{
                fontSize: 10.5, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
                background: selected.status === "ACTIVE" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                color:      selected.status === "ACTIVE" ? "#10B981" : "#EF4444",
              }}>
                {selected.status}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {WALLET_OPTIONS.map(w => (
                <div
                  key={w.type}
                  style={{
                    background: walletType === w.type ? `${w.color}12` : BG_IN,
                    border:     `1px solid ${walletType === w.type ? w.color + "40" : BORDER}`,
                    borderRadius: 8, padding: "10px 14px",
                  }}
                >
                  <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 4 }}>{w.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: w.color }}>
                    {fmt(selected.wallet?.[w.type as keyof typeof selected.wallet])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Credit Form */}
        {selected && (
          <form onSubmit={handleSubmit}>
            <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 24px", marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, letterSpacing: "0.1em", marginBottom: 16, textTransform: "uppercase" }}>
                Step 2 — Configure Credit
              </div>

              {/* Wallet type */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12.5, color: MUTED, display: "block", marginBottom: 8 }}>Wallet</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9 }}>
                  {WALLET_OPTIONS.map(w => {
                    const Icon   = w.icon;
                    const active = walletType === w.type;
                    return (
                      <button
                        key={w.type}
                        type="button"
                        onClick={() => setWalletType(w.type)}
                        style={{
                          background:   active ? `${w.color}18` : BG_IN,
                          border:       `1.5px solid ${active ? w.color : BORDER}`,
                          borderRadius: 9, padding: "11px 13px",
                          cursor: "pointer", textAlign: "left", transition: "all 0.14s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                          <Icon size={13} style={{ color: active ? w.color : MUTED }} />
                          <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, color: active ? "#fff" : MUTED }}>
                            {w.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.4 }}>{w.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, color: MUTED, display: "block", marginBottom: 6 }}>
                  Amount <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED, fontSize: 13.5, userSelect: "none" }}>$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 8,
                      color: "#fff", fontSize: 14, padding: "10px 12px 10px 22px", outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Reason */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, color: MUTED, display: "block", marginBottom: 6 }}>
                  Reason <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Compensation, Bonus, Correction…"
                  maxLength={500}
                  required
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 8,
                    color: "#fff", fontSize: 13.5, padding: "10px 12px", outline: "none",
                  }}
                />
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: 12.5, color: MUTED, display: "block", marginBottom: 6 }}>
                  Internal Notes <span style={{ fontSize: 10.5 }}>(optional, audit log only)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Additional context visible only in audit logs…"
                  rows={2}
                  maxLength={1000}
                  style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical",
                    background: BG_IN, border: `1px solid ${BORDER}`, borderRadius: 8,
                    color: "#fff", fontSize: 13.5, padding: "10px 12px", outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* Feedback */}
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, marginBottom: 12 }}>
                <AlertCircle size={14} style={{ color: "#EF4444", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#FCA5A5" }}>{error}</span>
              </div>
            )}
            {success && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8, marginBottom: 12 }}>
                <CheckCircle2 size={14} style={{ color: "#10B981", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "#6EE7B7" }}>{success}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: "100%", padding: "12px", borderRadius: 9,
                cursor: !canSubmit ? "not-allowed" : submitting ? "wait" : "pointer",
                background: GOLD, color: "#000", fontWeight: 700, fontSize: 14, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: !canSubmit ? 0.45 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {submitting && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
              {submitting
                ? "Crediting…"
                : `Credit ${amtNum > 0 ? `$${amtNum.toFixed(2)}` : ""} → ${pickedWallet.label}`
              }
            </button>
          </form>
        )}

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          input[type=number]::-webkit-inner-spin-button,
          input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
          input[type=number] { -moz-appearance: textfield; }
        `}</style>
      </div>
    </AdminLayout>
  );
}
