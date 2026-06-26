import { useState } from "react";
import { ArrowRightLeft, SlidersHorizontal, AlertTriangle } from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const TA: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box" };
const INP: React.CSSProperties = { ...TA, resize: undefined };
const SEL: React.CSSProperties = { ...INP, cursor: "pointer", appearance: "none" };

function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div style={{ background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28, width: 440, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 28px 70px rgba(0,0,0,0.7)" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6, letterSpacing: "0.06em" }}>{text}{required && <span style={{ color: "#f87171", marginLeft: 3 }}>*</span>}</label>;
}

function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}>{children}</div>;
}

const $ = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Adjustment Modal ──────────────────────────────────────────────────────────
export function AdjustmentModal({ wallet, onClose, onConfirm }: {
  wallet: { username: string; depositWallet: number; incomeWallet: number; withdrawalWallet: number };
  onClose: () => void;
  onConfirm: (walletType: "DEPOSIT" | "INCOME" | "WITHDRAWAL", adjustType: "CREDIT" | "DEBIT", amount: number, reason: string, notes: string) => void;
}) {
  const [walletType, setWalletType] = useState<"DEPOSIT" | "INCOME" | "WITHDRAWAL">("DEPOSIT");
  const [adjustType, setAdjustType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const balances: Record<string, number> = { DEPOSIT: wallet.depositWallet, INCOME: wallet.incomeWallet, WITHDRAWAL: wallet.withdrawalWallet };
  const cur = balances[walletType];
  const delta = parseFloat(amount) || 0;
  const preview = adjustType === "CREDIT" ? cur + delta : cur - delta;
  const valid = delta > 0 && reason.trim() && confirmed;

  const WALLET_LABELS: Record<string, string> = { DEPOSIT: "Deposit Wallet", INCOME: "Income Wallet", WITHDRAWAL: "Withdrawal Wallet" };

  return (
    <Shell onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(212,175,55,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SlidersHorizontal size={18} style={{ color: GOLD }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Adjust Balance</div>
          <div style={{ fontSize: 11, color: MUTED }}>@{wallet.username}</div>
        </div>
      </div>

      <Field>
        <Label text="WALLET TYPE" required />
        <select value={walletType} onChange={e => setWalletType(e.target.value as "DEPOSIT" | "INCOME" | "WITHDRAWAL")} style={SEL}>
          <option value="DEPOSIT">Deposit Wallet — {$(wallet.depositWallet)}</option>
          <option value="INCOME">Income Wallet — {$(wallet.incomeWallet)}</option>
          <option value="WITHDRAWAL">Withdrawal Wallet — {$(wallet.withdrawalWallet)}</option>
        </select>
      </Field>

      <Field>
        <Label text="ADJUSTMENT TYPE" required />
        <div style={{ display: "flex", gap: 8 }}>
          {(["CREDIT", "DEBIT"] as const).map(t => (
            <button key={t} onClick={() => setAdjustType(t)} style={{ flex: 1, padding: "9px 0", background: adjustType === t ? (t === "CREDIT" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)") : "rgba(255,255,255,0.04)", border: `1px solid ${adjustType === t ? (t === "CREDIT" ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)") : BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: adjustType === t ? (t === "CREDIT" ? "#34d399" : "#f87171") : MUTED }}>
              {t === "CREDIT" ? "+ Credit" : "– Debit"}
            </button>
          ))}
        </div>
      </Field>

      <Field>
        <Label text="AMOUNT (USD)" required />
        <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={INP} />
      </Field>

      {delta > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 8 }}>BALANCE PREVIEW — {WALLET_LABELS[walletType]}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: MUTED }}>Current</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{$(cur)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0" }}>
            <span style={{ fontSize: 12, color: adjustType === "CREDIT" ? "#34d399" : "#f87171" }}>{adjustType === "CREDIT" ? "+" : "–"}{$(delta)}</span>
            <span style={{ fontSize: 10, color: MUTED }}>{adjustType}</span>
          </div>
          <div style={{ height: 1, background: BORDER, margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>After Adjustment</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: preview < 0 ? "#f87171" : "#34d399" }}>{$(preview)}</span>
          </div>
        </div>
      )}

      <Field>
        <Label text="REASON" required />
        <select value={reason} onChange={e => setReason(e.target.value)} style={SEL}>
          <option value="">Select a reason…</option>
          <option>Manual correction</option>
          <option>ROI adjustment</option>
          <option>Bonus credit</option>
          <option>Refund processing</option>
          <option>Duplicate transaction fix</option>
          <option>Promotional credit</option>
          <option>Admin error correction</option>
          <option>Other</option>
        </select>
      </Field>

      <Field>
        <Label text="ADMIN NOTES" />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes (not visible to member)…" style={{ ...TA, minHeight: 70 }} />
      </Field>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 18 }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ accentColor: GOLD, width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>I confirm this balance adjustment is authorized and accurate. This action will be logged with my admin credentials.</span>
      </label>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: MUTED }}>Cancel</button>
        <button
          onClick={() => { if (valid) { onConfirm(walletType, adjustType, delta, reason, notes); onClose(); } }}
          disabled={!valid}
          style={{ flex: 2, padding: "10px 0", background: valid ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${valid ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 8, cursor: valid ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, color: valid ? GOLD_L : MUTED }}
        >
          Confirm Adjustment
        </button>
      </div>
    </Shell>
  );
}

// ─── Transfer Modal ────────────────────────────────────────────────────────────
export function TransferModal({ wallet, onClose, onConfirm }: {
  wallet: { username: string; depositWallet: number; incomeWallet: number; withdrawalWallet: number };
  onClose: () => void;
  onConfirm: (from: "DEPOSIT" | "INCOME" | "WITHDRAWAL", to: "DEPOSIT" | "INCOME" | "WITHDRAWAL", amount: number, reason: string) => void;
}) {
  const [from, setFrom] = useState<"DEPOSIT" | "INCOME" | "WITHDRAWAL">("INCOME");
  const [to, setTo]     = useState<"DEPOSIT" | "INCOME" | "WITHDRAWAL">("WITHDRAWAL");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const TYPES = ["DEPOSIT", "INCOME", "WITHDRAWAL"] as const;
  const LABELS: Record<string, string> = { DEPOSIT: "Deposit Wallet", INCOME: "Income Wallet", WITHDRAWAL: "Withdrawal Wallet" };
  const balances: Record<string, number> = { DEPOSIT: wallet.depositWallet, INCOME: wallet.incomeWallet, WITHDRAWAL: wallet.withdrawalWallet };
  const delta = parseFloat(amount) || 0;
  const fromBal = balances[from];
  const toBal   = balances[to];
  const valid = delta > 0 && from !== to && delta <= fromBal && reason.trim();

  return (
    <Shell onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(96,165,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ArrowRightLeft size={18} style={{ color: "#60a5fa" }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Transfer Funds</div>
          <div style={{ fontSize: 11, color: MUTED }}>@{wallet.username}</div>
        </div>
      </div>

      <Field>
        <Label text="FROM WALLET" required />
        <select value={from} onChange={e => setFrom(e.target.value as typeof from)} style={SEL}>
          {TYPES.map(t => <option key={t} value={t}>{LABELS[t]} — {$(balances[t])}</option>)}
        </select>
      </Field>

      <Field>
        <Label text="TO WALLET" required />
        <select value={to} onChange={e => setTo(e.target.value as typeof to)} style={SEL}>
          {TYPES.filter(t => t !== from).map(t => <option key={t} value={t}>{LABELS[t]} — {$(balances[t])}</option>)}
        </select>
      </Field>

      <Field>
        <Label text="AMOUNT (USD)" required />
        <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ ...INP, borderColor: delta > fromBal && delta > 0 ? "rgba(248,113,113,0.4)" : BORDER }} />
        {delta > fromBal && delta > 0 && <div style={{ fontSize: 11, color: "#f87171", marginTop: 5 }}>Insufficient balance in {LABELS[from]}.</div>}
      </Field>

      {delta > 0 && delta <= fromBal && from !== to && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 10 }}>AFTER TRANSFER PREVIEW</div>
          {[{ label: LABELS[from], before: fromBal, after: fromBal - delta, dir: "out" }, { label: LABELS[to], before: toBal, after: toBal + delta, dir: "in" }].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 11, color: MUTED }}>{r.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: MUTED, textDecoration: "line-through" }}>{$(r.before)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: r.dir === "out" ? "#f87171" : "#34d399" }}>→ {$(r.after)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Field>
        <Label text="REASON" required />
        <select value={reason} onChange={e => setReason(e.target.value)} style={SEL}>
          <option value="">Select a reason…</option>
          <option>ROI allocation</option>
          <option>Withdrawal preparation</option>
          <option>Income consolidation</option>
          <option>Admin rebalance</option>
          <option>Member request</option>
          <option>System correction</option>
          <option>Other</option>
        </select>
      </Field>

      {from === to && <div style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <AlertTriangle size={13} style={{ color: "#f87171", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#f87171" }}>Source and destination wallets must be different.</span>
      </div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: MUTED }}>Cancel</button>
        <button
          onClick={() => { if (valid) { onConfirm(from, to, delta, reason); onClose(); } }}
          disabled={!valid}
          style={{ flex: 2, padding: "10px 0", background: valid ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${valid ? "rgba(96,165,250,0.35)" : BORDER}`, borderRadius: 8, cursor: valid ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, color: valid ? "#60a5fa" : MUTED }}
        >
          Confirm Transfer
        </button>
      </div>
    </Shell>
  );
}
