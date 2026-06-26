import { useState, useCallback } from "react";
import { X, Eye, EyeOff, RefreshCw } from "lucide-react";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MemberFormData {
  firstName: string; lastName: string; username: string;
  email: string; phone: string; country: string;
  sponsor: string; placement: "LEFT" | "RIGHT" | "";
  password: string; confirmPassword: string;
  status: string; emailVerified: boolean;
  plan: string; investment: string;
}

interface MemberModalProps {
  mode: "create" | "edit";
  initial?: Partial<MemberFormData>;
  onClose: () => void;
}

// ─── Countries ────────────────────────────────────────────────────────────────
const COUNTRIES = ["United States","United Kingdom","Canada","Australia","Germany","France","Singapore","UAE","Nigeria","India","Philippines","Malaysia","South Africa","Brazil","Mexico"];

// ─── Input ────────────────────────────────────────────────────────────────────
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 5, letterSpacing: "0.04em" }}>
        {label}{required && <span style={{ color: "#f87171", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
  borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "rgba(255,255,255,0.82)",
  outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: "none" as never, cursor: "pointer",
};

const SectionHead = ({ title }: { title: string }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: MUTED, padding: "14px 0 8px", borderBottom: `1px solid ${BORDER}`, marginBottom: 14 }}>{title}</div>
);

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MemberModal({ mode, initial = {}, onClose }: MemberModalProps) {
  const isEdit = mode === "edit";

  const [form, setForm] = useState<MemberFormData>({
    firstName:     initial.firstName     ?? "",
    lastName:      initial.lastName      ?? "",
    username:      initial.username      ?? "",
    email:         initial.email         ?? "",
    phone:         initial.phone         ?? "",
    country:       initial.country       ?? "United States",
    sponsor:       initial.sponsor       ?? "",
    placement:     initial.placement     ?? "",
    password:      "",
    confirmPassword: "",
    status:        initial.status        ?? "ACTIVE",
    emailVerified: initial.emailVerified ?? false,
    plan:          initial.plan          ?? "",
    investment:    initial.investment    ?? "",
  });

  const [showPass, setShowPass] = useState(false);
  const [errors,   setErrors]   = useState<Partial<Record<keyof MemberFormData, string>>>({});

  const set = useCallback(<K extends keyof MemberFormData>(k: K, v: MemberFormData[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
    setErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  }, []);

  const validate = () => {
    const e: typeof errors = {};
    if (!form.firstName.trim())  e.firstName  = "Required";
    if (!form.lastName.trim())   e.lastName   = "Required";
    if (!form.username.trim())   e.username   = "Required";
    if (!form.email.trim())      e.email      = "Required";
    if (!isEdit && !form.password)         e.password   = "Required";
    if (!isEdit && form.password !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    // UI only — no backend
    onClose();
  };

  const inp = (k: keyof MemberFormData, placeholder: string, type = "text") => (
    <input
      type={type}
      value={String(form[k])}
      onChange={e => set(k, e.target.value as MemberFormData[typeof k])}
      placeholder={placeholder}
      style={{ ...inputStyle, borderColor: errors[k] ? "rgba(248,113,113,0.5)" : BORDER }}
    />
  );

  const err = (k: keyof MemberFormData) => errors[k]
    ? <span style={{ fontSize: 10, color: "#f87171", marginTop: 3, display: "block" }}>{errors[k]}</span>
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", padding: 16 }}>
      <div style={{ background: "hsl(222 62% 8%)", border: `1px solid ${BORDER}`, borderRadius: 14, width: "100%", maxWidth: 620, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
              {isEdit ? "Edit Member" : "Create New Member"}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              {isEdit ? `Editing @${form.username}` : "Fill in all required fields to create a new member account."}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "18px 22px", flex: 1 }}>

          {/* Personal */}
          <SectionHead title="PERSONAL INFORMATION" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="First Name" required>
              {inp("firstName", "James")}
              {err("firstName")}
            </Field>
            <Field label="Last Name" required>
              {inp("lastName", "Smith")}
              {err("lastName")}
            </Field>
            <Field label="Username" required>
              {inp("username", "james_smith42")}
              {err("username")}
            </Field>
            <Field label="Email" required>
              {inp("email", "james@example.com", "email")}
              {err("email")}
            </Field>
            <Field label="Phone">
              {inp("phone", "+1 555-000-0000", "tel")}
            </Field>
            <Field label="Country">
              <select value={form.country} onChange={e => set("country", e.target.value)} style={selectStyle}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          {/* Sponsor */}
          <SectionHead title="SPONSOR INFORMATION" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="Sponsor Username">
              {inp("sponsor", "sponsor_username")}
            </Field>
            <Field label="Binary Placement">
              <div style={{ display: "flex", gap: 8 }}>
                {(["LEFT","RIGHT"] as const).map(p => (
                  <label key={p} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${form.placement === p ? GOLD : BORDER}`, background: form.placement === p ? "rgba(212,175,55,0.08)" : "transparent", transition: "all 0.15s" }}>
                    <input type="radio" name="placement" value={p} checked={form.placement === p} onChange={() => set("placement", p)} style={{ accentColor: GOLD }} />
                    <span style={{ fontSize: 12, color: form.placement === p ? GOLD_L : MUTED }}>{p}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>

          {/* Account */}
          <SectionHead title="ACCOUNT" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Field label="Account Status">
              <select value={form.status} onChange={e => set("status", e.target.value)} style={selectStyle}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </Field>
            <Field label="Email Verified">
              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.02)" }}>
                <input type="checkbox" checked={form.emailVerified} onChange={e => set("emailVerified", e.target.checked)} style={{ accentColor: GOLD, width: 14, height: 14 }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>Email verified</span>
              </label>
            </Field>
            {!isEdit && (
              <>
                <Field label="Password" required>
                  <div style={{ position: "relative" }}>
                    <input type={showPass ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••••••••" style={{ ...inputStyle, paddingRight: 38, borderColor: errors.password ? "rgba(248,113,113,0.5)" : BORDER }} />
                    <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2 }}>
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {err("password")}
                </Field>
                <Field label="Confirm Password" required>
                  <input type={showPass ? "text" : "password"} value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} placeholder="••••••••••••" style={{ ...inputStyle, borderColor: errors.confirmPassword ? "rgba(248,113,113,0.5)" : BORDER }} />
                  {err("confirmPassword")}
                </Field>
              </>
            )}
          </div>

          {/* Plan */}
          <SectionHead title="INVESTMENT PLAN" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Select Plan">
              <select value={form.plan} onChange={e => set("plan", e.target.value)} style={selectStyle}>
                <option value="">No Plan</option>
                <option value="STARTER">Starter — 8% ROI</option>
                <option value="ALPHA">Alpha — 12% ROI</option>
                <option value="PREMIUM">Premium — 18% ROI</option>
                <option value="VIP">VIP — 24% ROI</option>
              </select>
            </Field>
            <Field label="Initial Investment">
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: MUTED }}>$</span>
                <input type="number" value={form.investment} onChange={e => set("investment", e.target.value)} placeholder="0.00" style={{ ...inputStyle, paddingLeft: 26 }} />
              </div>
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "16px 22px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, cursor: "pointer", fontSize: 13, color: MUTED }}>
            Cancel
          </button>
          <button onClick={handleSubmit} style={{ flex: 2, padding: "10px 0", background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, color: GOLD_L }}>
            {isEdit ? "Save Changes" : "Create Member"}
          </button>
        </div>
      </div>
    </div>
  );
}
