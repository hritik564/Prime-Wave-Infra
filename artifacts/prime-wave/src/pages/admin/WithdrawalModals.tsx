import { useState } from "react";
import { X, AlertTriangle, CheckCircle, ShieldX, Clock, Banknote } from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";

export interface WithdrawalStub {
  id: string; amount: number; fee: number; username: string;
  walletType: string; network: string; status: string; destinationAddress: string;
}

function Shell({ children, width = 440, onClose }: { children: React.ReactNode; width?: number; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", padding: 16 }}>
      <div style={{ background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 14, width: "100%", maxWidth: width, boxShadow: "0 24px 60px rgba(0,0,0,0.75)" }}>
        {children}
      </div>
    </div>
  );
}

function Header({ icon: Icon, title, sub, color, bg, onClose }: { icon: React.ElementType; title: string; sub: string; color: string; bg: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} style={{ color }} /></div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{title}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={15} /></button>
    </div>
  );
}

function AmountRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color ?? "rgba(255,255,255,0.82)", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

const Btn = ({ label, onClick, color = MUTED, bg = "rgba(255,255,255,0.04)", border = BORDER, disabled = false }: {
  label: string; onClick: () => void; color?: string; bg?: string; border?: string; disabled?: boolean;
}) => (
  <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: "10px 0", background: disabled ? "rgba(255,255,255,0.04)" : bg, border: `1px solid ${disabled ? BORDER : border}`, borderRadius: 9, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: disabled ? MUTED : color }}>
    {label}
  </button>
);

const TA: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.78)", outline: "none", resize: "vertical", boxSizing: "border-box" };

// ─── Approve ──────────────────────────────────────────────────────────────────
export function ApprovalModal({ w, onClose, onConfirm }: { w: WithdrawalStub; onClose: () => void; onConfirm: (comment: string) => void }) {
  const [checked, setChecked] = useState(false);
  const [comment, setComment] = useState("");
  const net = w.amount - w.fee;
  return (
    <Shell onClose={onClose}>
      <Header icon={CheckCircle} title="Approve Withdrawal" sub={w.id} color="#34d399" bg="rgba(52,211,153,0.1)" onClose={onClose} />
      <div style={{ padding: "16px 20px 20px" }}>
        <AmountRow label="Requested Amount" value={`$${w.amount.toLocaleString()}`} color="#34d399" />
        <AmountRow label="Processing Fee"   value={`$${w.fee.toLocaleString()}`} color="#f87171" />
        <AmountRow label="Net Amount"       value={`$${net.toLocaleString()}`} color={GOLD_L} />
        <AmountRow label="Wallet Type"      value={w.walletType} />
        <AmountRow label="Network"          value={w.network} />
        <AmountRow label="Current Status"   value={w.status} />
        <AmountRow label="Destination"      value={w.destinationAddress} />
        <AmountRow label="Member"           value={`@${w.username}`} />
        <div style={{ marginTop: 14, marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>Admin Comment (optional)</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment for the audit log…" style={{ ...TA, minHeight: 60 }} />
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 16, lineHeight: 1.5 }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ accentColor: "#34d399", width: 14, height: 14, marginTop: 2, flexShrink: 0 }} />
          I confirm this withdrawal has been verified and the member's identity and wallet address are valid.
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Approve Withdrawal" onClick={() => { if(checked) { onConfirm(comment); onClose(); }}} disabled={!checked} color="#34d399" bg="rgba(52,211,153,0.1)" border="rgba(52,211,153,0.3)" />
        </div>
      </div>
    </Shell>
  );
}

// ─── Reject ───────────────────────────────────────────────────────────────────
const REJECT_REASONS = [
  "Invalid wallet address","Insufficient verification","Suspicious activity","Daily limit exceeded",
  "Account under review","Duplicate request","KYC not verified","Manual review required","Other",
];
export function RejectModal({ w, onClose, onConfirm }: { w: WithdrawalStub; onClose: () => void; onConfirm: (reason: string, comment: string) => void }) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  return (
    <Shell onClose={onClose}>
      <Header icon={ShieldX} title="Reject Withdrawal" sub={w.id} color="#f87171" bg="rgba(248,113,113,0.1)" onClose={onClose} />
      <div style={{ padding: "16px 20px 20px" }}>
        <AmountRow label="Amount"  value={`$${w.amount.toLocaleString()}`} color="#f87171" />
        <AmountRow label="Member"  value={`@${w.username}`} />
        <AmountRow label="Network" value={w.network} />
        <AmountRow label="Current Status" value={w.status} />
        <AmountRow label="Destination" value={w.destinationAddress} />
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>Rejection Reason <span style={{ color: "#f87171" }}>*</span></label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.78)", outline: "none", appearance: "none" as never, marginBottom: 12 }}>
            <option value="">Select reason…</option>
            {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>Additional Comments</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Provide additional context for this rejection…" style={{ ...TA, minHeight: 72, marginBottom: 16 }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Reject Withdrawal" onClick={() => { if(reason) { onConfirm(reason, comment); onClose(); }}} disabled={!reason} color="#f87171" bg="rgba(248,113,113,0.1)" border="rgba(248,113,113,0.3)" />
        </div>
      </div>
    </Shell>
  );
}

// ─── Hold ─────────────────────────────────────────────────────────────────────
export function HoldModal({ w, onClose, onConfirm }: { w: WithdrawalStub; onClose: () => void; onConfirm: (reason: string, date: string) => void }) {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  return (
    <Shell onClose={onClose}>
      <Header icon={Clock} title="Place on Hold" sub={w.id} color="#fbbf24" bg="rgba(251,191,36,0.1)" onClose={onClose} />
      <div style={{ padding: "16px 20px 20px" }}>
        <AmountRow label="Amount"  value={`$${w.amount.toLocaleString()}`} color="#fbbf24" />
        <AmountRow label="Member"  value={`@${w.username}`} />
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>Hold Reason <span style={{ color: "#f87171" }}>*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for placing on hold…" style={{ ...TA, minHeight: 68, marginBottom: 12 }} />
          <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>Expected Review Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...TA, cursor: "pointer", marginBottom: 16 }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Place on Hold" onClick={() => { if(reason.trim()) { onConfirm(reason.trim(), date); onClose(); }}} disabled={!reason.trim()} color="#fbbf24" bg="rgba(251,191,36,0.1)" border="rgba(251,191,36,0.3)" />
        </div>
      </div>
    </Shell>
  );
}

// ─── Reconciliation / Manual Review ────────────────────────────────────────────
export const MANUAL_REVIEW_RECONCILIATION_REASON =
  "Withdrawal requires reconciliation before automatic processing; no financial settlement performed.";

export function ManualReviewModal({ w, onClose, onConfirm }: {
  w: WithdrawalStub;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <Shell width={500} onClose={onClose}>
      <Header
        icon={AlertTriangle}
        title="Move to Manual Review"
        sub={w.id}
        color="#c084fc"
        bg="rgba(192,132,252,0.1)"
        onClose={onClose}
      />
      <div style={{ padding: "16px 20px 20px" }}>
        <AmountRow label="Withdrawal ID" value={w.id} />
        <AmountRow label="Amount" value={`$${w.amount.toLocaleString()}`} color={GOLD_L} />
        <AmountRow label="Member" value={`@${w.username}`} />
        <AmountRow label="Current Status" value={w.status} />
        <AmountRow label="Destination" value={w.destinationAddress} />
        <AmountRow label="Network" value={w.network} />
        <div style={{ marginTop: 16, padding: "12px 13px", borderRadius: 9, background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.22)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#c084fc", marginBottom: 5 }}>Protection only</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.55 }}>
            This changes only the withdrawal state from APPROVED to MANUAL_REVIEW so the automatic worker cannot claim it.
            No refund, balance change, ledger entry, transaction signing, or broadcast will occur.
          </div>
        </div>
        <div style={{ marginTop: 12, marginBottom: 16, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
          Reason: {MANUAL_REVIEW_RECONCILIATION_REASON}
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 16, lineHeight: 1.5 }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ accentColor: "#c084fc", width: 14, height: 14, marginTop: 2, flexShrink: 0 }} />
          I confirm this is a reconciliation/protection action only and must not refund or change any balance.
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn
            label="Move to Manual Review"
            onClick={() => { if (checked) { onConfirm(MANUAL_REVIEW_RECONCILIATION_REASON); onClose(); } }}
            disabled={!checked}
            color="#c084fc"
            bg="rgba(192,132,252,0.1)"
            border="rgba(192,132,252,0.3)"
          />
        </div>
      </div>
    </Shell>
  );
}
