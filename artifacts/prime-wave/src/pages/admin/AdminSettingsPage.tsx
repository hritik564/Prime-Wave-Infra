import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { changeAdminPassword, createStaffAdmin } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

const GOLD = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED = "rgba(170,179,197,0.58)";
const BORDER = "rgba(255,255,255,0.08)";
const CARD = "hsl(222 62% 9%)";

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>
        {label}
      </span>
      <span style={{ position: "relative", display: "block" }}>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="current-password"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${BORDER}`,
            borderRadius: 9,
            padding: "11px 42px 11px 12px",
            color: "rgba(255,255,255,0.9)",
            outline: "none",
            fontSize: 13,
          }}
        />
        <button
          type="button"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          onClick={() => setVisible((current) => !current)}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            border: 0,
            background: "transparent",
            color: MUTED,
            cursor: "pointer",
            padding: 4,
          }}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </label>
  );
}

export default function AdminSettingsPage() {
  const { user, authLogout } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffConfirmPassword, setStaffConfirmPassword] = useState("");
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffCreatedEmail, setStaffCreatedEmail] = useState<string | null>(null);
  const [staffSaving, setStaffSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Complete all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Use at least 8 characters, including one uppercase letter and one number.");
      return;
    }

    setSaving(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setChanged(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to change password.");
    } finally {
      setSaving(false);
    }
  };

  const submitStaff = async () => {
    setStaffError(null);
    setStaffCreatedEmail(null);
    const normalizedEmail = staffEmail.trim().toLowerCase();

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setStaffError("Enter a valid staff email address.");
      return;
    }
    if (
      staffPassword.length < 8 ||
      !/[A-Z]/.test(staffPassword) ||
      !/[0-9]/.test(staffPassword)
    ) {
      setStaffError("Use at least 8 characters, including one uppercase letter and one number.");
      return;
    }
    if (staffPassword !== staffConfirmPassword) {
      setStaffError("Initial passwords do not match.");
      return;
    }

    setStaffSaving(true);
    try {
      const created = await createStaffAdmin(normalizedEmail, staffPassword, staffConfirmPassword);
      setStaffCreatedEmail(created.email);
      setStaffEmail("");
      setStaffPassword("");
      setStaffConfirmPassword("");
    } catch (requestError) {
      setStaffError(requestError instanceof Error ? requestError.message : "Unable to create staff account.");
    } finally {
      setStaffSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px 48px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <ShieldCheck size={19} style={{ color: GOLD }} />
            <h1 style={{ margin: 0, color: "rgba(255,255,255,0.92)", fontSize: 22, fontWeight: 700 }}>
              Admin Settings
            </h1>
          </div>
          <p style={{ margin: 0, color: MUTED, fontSize: 13 }}>
            Manage security for the currently signed-in Admin account.
          </p>
        </div>

        <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Lock size={16} style={{ color: GOLD_L }} />
            <div>
              <h2 style={{ margin: 0, color: "rgba(255,255,255,0.86)", fontSize: 15, fontWeight: 700 }}>
                Change password
              </h2>
              <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 12 }}>
                {user?.email ?? "Current Admin account"}
              </p>
            </div>
          </div>

          {changed ? (
            <div style={{ border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.08)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6ee7b7", fontSize: 13, fontWeight: 700 }}>
                <CheckCircle2 size={16} />
                Password changed successfully.
              </div>
              <p style={{ margin: "8px 0 14px", color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 1.5 }}>
                Your current Admin session is no longer valid. Sign in again with the new password.
              </p>
              <button
                type="button"
                onClick={authLogout}
                style={{
                  border: `1px solid ${GOLD}66`,
                  background: "rgba(212,175,55,0.12)",
                  color: GOLD_L,
                  borderRadius: 8,
                  padding: "9px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Continue to Admin sign-in
              </button>
            </div>
          ) : (
            <>
              <PasswordField label="Current password" value={currentPassword} onChange={setCurrentPassword} />
              <PasswordField label="New password" value={newPassword} onChange={setNewPassword} />
              <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} />

              {error && (
                <p role="alert" style={{ margin: "0 0 14px", color: "#fca5a5", fontSize: 12 }}>
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving}
                style={{
                  border: `1px solid ${GOLD}66`,
                  background: saving ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.13)",
                  color: GOLD_L,
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Changing password…" : "Change password"}
              </button>
            </>
          )}
        </section>

        {isSuperAdmin && (
          <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <ShieldCheck size={16} style={{ color: GOLD_L }} />
              <h2 style={{ margin: 0, color: "rgba(255,255,255,0.86)", fontSize: 15, fontWeight: 700 }}>
                Create Staff Operations account
              </h2>
            </div>
            <p style={{ margin: "0 0 18px", color: MUTED, fontSize: 12, lineHeight: 1.5 }}>
              Only Super Admins can create accounts here. New accounts are always active and receive the
              Staff Operations role; elevated roles cannot be selected.
            </p>

            {staffCreatedEmail ? (
              <div style={{ border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.08)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6ee7b7", fontSize: 13, fontWeight: 700 }}>
                  <CheckCircle2 size={16} />
                  Staff Operations account created.
                </div>
                <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 1.5 }}>
                  {staffCreatedEmail} is active with the Staff Operations role. The initial password is not shown here.
                </p>
              </div>
            ) : (
              <>
                <label style={{ display: "block", marginBottom: 16 }}>
                  <span style={{ display: "block", color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>
                    Staff email
                  </span>
                  <input
                    type="email"
                    value={staffEmail}
                    onChange={(event) => setStaffEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="staff@example.com"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 9,
                      padding: "11px 12px",
                      color: "rgba(255,255,255,0.9)",
                      outline: "none",
                      fontSize: 13,
                    }}
                  />
                </label>
                <PasswordField label="Initial password" value={staffPassword} onChange={setStaffPassword} />
                <PasswordField label="Confirm initial password" value={staffConfirmPassword} onChange={setStaffConfirmPassword} />

                {staffError && (
                  <p role="alert" style={{ margin: "0 0 14px", color: "#fca5a5", fontSize: 12 }}>
                    {staffError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void submitStaff()}
                  disabled={staffSaving}
                  style={{
                    border: `1px solid ${GOLD}66`,
                    background: staffSaving ? "rgba(212,175,55,0.06)" : "rgba(212,175,55,0.13)",
                    color: GOLD_L,
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: staffSaving ? "wait" : "pointer",
                    opacity: staffSaving ? 0.7 : 1,
                  }}
                >
                  {staffSaving ? "Creating account…" : "Create Staff account"}
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}