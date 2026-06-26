import { useState } from "react";
import { X, AlertTriangle, ShieldX, Trash2, KeyRound, BadgeCheck, LogIn, RefreshCw, Eye, EyeOff, FileText } from "lucide-react";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";

interface BaseMember { id: string; username: string; firstName: string; lastName: string; }

// ─── Shared modal shell ───────────────────────────────────────────────────────
function ModalShell({ onClose, children, width = 400 }: { onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", padding: 16 }}>
      <div style={{ background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 14, width: "100%", maxWidth: width, boxShadow: "0 24px 60px rgba(0,0,0,0.75)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ icon: Icon, title, subtitle, color, bg, onClose }: { icon: React.ElementType; title: string; subtitle: string; color: string; bg: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={19} style={{ color }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{title}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }}>
        <X size={15} />
      </button>
    </div>
  );
}

function MemberChip({ m }: { m: BaseMember }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 9, margin: "14px 0" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(212,175,55,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: GOLD }}>
        {m.firstName[0]}{m.lastName[0]}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>@{m.username}</div>
        <div style={{ fontSize: 10, color: MUTED }}>{m.firstName} {m.lastName} · {m.id}</div>
      </div>
    </div>
  );
}

const TA: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
  borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.78)",
  outline: "none", resize: "vertical", boxSizing: "border-box",
};

const Btn = ({ label, onClick, color = MUTED, bg = "rgba(255,255,255,0.04)", border = BORDER, disabled = false }: {
  label: string; onClick: () => void; color?: string; bg?: string; border?: string; disabled?: boolean;
}) => (
  <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: "10px 0", background: disabled ? "rgba(255,255,255,0.04)" : bg, border: `1px solid ${disabled ? BORDER : border}`, borderRadius: 9, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: disabled ? MUTED : color, transition: "opacity 0.15s" }}
    onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}>
    {label}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. SuspendDialog
// ─────────────────────────────────────────────────────────────────────────────
export function SuspendDialog({ member, onClose, onConfirm }: { member: BaseMember; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={ShieldX} title="Suspend Member" subtitle="This action will restrict the member's access." color="#f87171" bg="rgba(248,113,113,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <div style={{ fontSize: 12, color: "rgba(248,113,113,0.85)", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
          <AlertTriangle size={12} style={{ display: "inline", marginRight: 6 }} />
          Suspended members cannot log in or perform any transactions.
        </div>
        <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>Reason <span style={{ color: "#f87171" }}>*</span></label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for suspension…" style={{ ...TA, minHeight: 80 }} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Suspend Member" onClick={() => { if(reason.trim()) { onConfirm(reason.trim()); onClose(); } }} disabled={!reason.trim()} color="#f87171" bg="rgba(248,113,113,0.12)" border="rgba(248,113,113,0.3)" />
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DeleteDialog
// ─────────────────────────────────────────────────────────────────────────────
export function DeleteDialog({ member, onClose, onConfirm }: { member: BaseMember; onClose: () => void; onConfirm: () => void }) {
  const [confirm, setConfirm] = useState("");
  const ready = confirm === "DELETE";
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={Trash2} title="Delete Member" subtitle="This action is permanent and cannot be undone." color="#f87171" bg="rgba(248,113,113,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <div style={{ fontSize: 12, color: MUTED, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", marginBottom: 14, lineHeight: 1.6 }}>
          All data including wallets, investments, network history, and audit logs will be permanently deleted. This cannot be reversed.
        </div>
        <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>
          Type <span style={{ color: "#f87171", fontFamily: "monospace", fontWeight: 700 }}>DELETE</span> to confirm
        </label>
        <input
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="DELETE"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${ready ? "rgba(248,113,113,0.4)" : BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: ready ? "#f87171" : "rgba(255,255,255,0.75)", outline: "none", boxSizing: "border-box", fontFamily: "monospace", letterSpacing: "0.08em" }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Permanently Delete" onClick={() => { if(ready) { onConfirm(); onClose(); }}} disabled={!ready} color="#f87171" bg="rgba(248,113,113,0.12)" border="rgba(248,113,113,0.3)" />
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ResetPasswordDialog
// ─────────────────────────────────────────────────────────────────────────────
function generatePass() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 14 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

export function ResetPasswordDialog({ member, onClose, onConfirm }: { member: BaseMember; onClose: () => void; onConfirm: (pass: string) => void }) {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={KeyRound} title="Reset Password" subtitle={`Reset password for @${member.username}`} color="#60a5fa" bg="rgba(96,165,250,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <button onClick={() => setPass(generatePass())} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontSize: 12, color: "#60a5fa", marginBottom: 12 }}>
          <RefreshCw size={12} /> Generate Strong Password
        </button>
        <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>New Password</label>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            type={show ? "text" : "password"}
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="Enter or generate password"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 38px 9px 12px", fontSize: 13, color: "rgba(255,255,255,0.82)", outline: "none", boxSizing: "border-box" }}
          />
          <button onClick={() => setShow(s => !s)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: MUTED }}>
            {show ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>
          <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} style={{ accentColor: GOLD, width: 14, height: 14 }} />
          Send password reset email to member
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Reset Password" onClick={() => { if(pass.trim()) { onConfirm(pass.trim()); onClose(); }}} disabled={!pass.trim()} color="#60a5fa" bg="rgba(96,165,250,0.1)" border="rgba(96,165,250,0.3)" />
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ApproveKYCDialog
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_DOCS = [
  { name: "passport.jpg",      type: "Passport",       size: "2.3 MB", status: "Submitted" },
  { name: "utility_bill.pdf",  type: "Utility Bill",   size: "1.1 MB", status: "Submitted" },
  { name: "selfie_id.jpg",     type: "Selfie with ID", size: "3.7 MB", status: "Submitted" },
];

export function ApproveKYCDialog({ member, onClose, onConfirm }: { member: BaseMember; onClose: () => void; onConfirm: (type: "approve" | "reject") => void }) {
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");

  if (action === "approve") return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={BadgeCheck} title="Confirm KYC Approval" subtitle={`Approve KYC for @${member.username}`} color="#34d399" bg="rgba(52,211,153,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, margin: "0 0 16px" }}>All 3 documents have been reviewed. Approving KYC will grant the member full platform access.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Back" onClick={() => setAction(null)} />
          <Btn label="Approve KYC" onClick={() => { onConfirm("approve"); onClose(); }} color="#34d399" bg="rgba(52,211,153,0.1)" border="rgba(52,211,153,0.3)" />
        </div>
      </div>
    </ModalShell>
  );

  if (action === "reject") return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={BadgeCheck} title="Reject KYC" subtitle={`Reject KYC for @${member.username}`} color="#f87171" bg="rgba(248,113,113,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>Rejection Reason <span style={{ color: "#f87171" }}>*</span></label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Document was blurry, expired, or did not match…" style={{ ...TA, minHeight: 80, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Back" onClick={() => setAction(null)} />
          <Btn label="Reject KYC" onClick={() => { if(reason.trim()) { onConfirm("reject"); onClose(); }}} disabled={!reason.trim()} color="#f87171" bg="rgba(248,113,113,0.1)" border="rgba(248,113,113,0.3)" />
        </div>
      </div>
    </ModalShell>
  );

  return (
    <ModalShell onClose={onClose} width={460}>
      <ModalHeader icon={BadgeCheck} title="KYC Review" subtitle={`Review submitted documents for @${member.username}`} color="#fbbf24" bg="rgba(251,191,36,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, marginBottom: 10 }}>SUBMITTED DOCUMENTS</div>
        {MOCK_DOCS.map((doc, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.025)", border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(96,165,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FileText size={13} style={{ color: "#60a5fa" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{doc.type}</div>
                <div style={{ fontSize: 10, color: MUTED }}>{doc.name} · {doc.size}</div>
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "2px 8px", borderRadius: 4 }}>{doc.status}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn label="Reject" onClick={() => setAction("reject")} color="#f87171" bg="rgba(248,113,113,0.08)" border="rgba(248,113,113,0.2)" />
          <Btn label="Approve KYC" onClick={() => setAction("approve")} color="#34d399" bg="rgba(52,211,153,0.1)" border="rgba(52,211,153,0.3)" />
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ActivateDialog
// ─────────────────────────────────────────────────────────────────────────────
export function ActivateDialog({ member, onClose, onConfirm }: { member: BaseMember; onClose: () => void; onConfirm: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={BadgeCheck} title="Activate Member" subtitle={`Restore access for @${member.username}`} color="#34d399" bg="rgba(52,211,153,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <div style={{ fontSize: 12, color: "rgba(52,211,153,0.85)", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, lineHeight: 1.6 }}>
          Activating this member will restore their ability to log in and perform transactions on the platform.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Activate Member" onClick={() => { onConfirm(); onClose(); }} color="#34d399" bg="rgba(52,211,153,0.12)" border="rgba(52,211,153,0.3)" />
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. LoginAsUserDialog
// ─────────────────────────────────────────────────────────────────────────────
export function LoginAsUserDialog({ member, onClose, onConfirm }: { member: BaseMember; onClose: () => void; onConfirm: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={LogIn} title="Login As User" subtitle={`Impersonate @${member.username}`} color={GOLD} bg="rgba(212,175,55,0.1)" onClose={onClose} />
      <div style={{ padding: "0 20px 20px" }}>
        <MemberChip m={member} />
        <div style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.18)", borderRadius: 10, padding: "14px 14px", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={15} style={{ color: "#fbbf24", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>Admin Action Warning</span>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: 0 }}>
            You are about to log in as <strong style={{ color: GOLD_L }}>@{member.username}</strong>. This action will be logged with your admin credentials, IP address, and timestamp. You will have full access to this member's account.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", background: "rgba(255,255,255,0.025)", borderRadius: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: MUTED }}>🔒 This action will be logged.</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn label="Cancel" onClick={onClose} />
          <Btn label="Login As User" onClick={() => { onConfirm(); onClose(); }} color={GOLD_L} bg="rgba(212,175,55,0.1)" border="rgba(212,175,55,0.3)" />
        </div>
      </div>
    </ModalShell>
  );
}
