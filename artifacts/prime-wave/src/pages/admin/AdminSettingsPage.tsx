import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, EyeOff, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import AdminLayout from "./AdminLayout";
import DepositWalletManagement from "./DepositWalletManagement";
import {
  changeAdminPassword,
  createStaffAdmin,
  downloadBulkPasswordResetArtifact,
  emergencyStopCommonPasswordReset,
  executeBulkPasswordReset,
  executeCommonPasswordReset,
  getCommonPasswordResetStatus,
  markDeadBulkPasswordResetRunFailed,
  previewBulkPasswordReset,
  previewCommonPasswordReset,
  recoverStrandedCommonPasswordReset,
  ApiRequestError,
  COMMON_PASSWORD_RESET_CONFIRMATION,
  COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID,
  type BulkPasswordResetPreview,
  type BulkPasswordResetRunResult,
  type CommonPasswordResetPreview,
  type CommonPasswordResetRunStatus,
} from "@/lib/api";
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
  const [bulkPreview, setBulkPreview] = useState<BulkPasswordResetPreview | null>(null);
  const [bulkRun, setBulkRun] = useState<BulkPasswordResetRunResult | null>(null);
  const [bulkConfirmation, setBulkConfirmation] = useState("");
  const [bulkAcknowledged, setBulkAcknowledged] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [commonPreview, setCommonPreview] = useState<CommonPasswordResetPreview | null>(null);
  const [commonRun, setCommonRun] = useState<CommonPasswordResetRunStatus | null>(null);
  const [commonPassword, setCommonPassword] = useState("");
  const [commonPasswordConfirm, setCommonPasswordConfirm] = useState("");
  const [commonConfirmation, setCommonConfirmation] = useState("");
  const [commonAcknowledged, setCommonAcknowledged] = useState(false);
  const [commonLoading, setCommonLoading] = useState(false);
  const [commonRecoveryLoading, setCommonRecoveryLoading] = useState(false);
  const [commonEmergencyStopping, setCommonEmergencyStopping] = useState(false);
  const [commonError, setCommonError] = useState<string | null>(null);

  const resumingCommonRun =
    commonPreview?.resumableRun?.runId === commonRun?.runId &&
    commonRun?.status === "FAILED";

  useEffect(() => {
    if (!commonRun || !["PREPARING", "RUNNING"].includes(commonRun.status)) return;
    let active = true;
    const poll = async () => {
      try {
        const status = await getCommonPasswordResetStatus(commonRun.runId);
        if (active) setCommonRun(status);
      } catch (requestError) {
        if (active) {
          setCommonError(requestError instanceof Error ? requestError.message : "Unable to refresh reset status.");
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [commonRun?.runId, commonRun?.status]);

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

  const loadBulkPreview = async () => {
    setBulkError(null);
    setBulkLoading(true);
    try {
      setBulkPreview(await previewBulkPasswordReset());
      setBulkRun(null);
    } catch (requestError) {
      setBulkError(requestError instanceof Error ? requestError.message : "Unable to load the reset preview.");
    } finally {
      setBulkLoading(false);
    }
  };

  const runBulkReset = async () => {
    if (!bulkPreview || !bulkAcknowledged || bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS") return;
    setBulkError(null);
    setBulkLoading(true);
    try {
      const result = await executeBulkPasswordReset(bulkConfirmation, bulkPreview.expectedResetCount);
      setBulkRun(result);
      setBulkConfirmation("");
      setBulkAcknowledged(false);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "BULK_RESET_STOPPED") {
        const data = requestError.data as { runId?: string; processedCount?: number } | undefined;
        if (data?.runId) {
          setBulkRun({
            runId: data.runId,
            status: "FAILED",
            totalEligible: bulkPreview.expectedResetCount,
            processedCount: data.processedCount ?? 0,
            failedCount: 1,
            artifactAvailable: false,
          });
        }
      }
      setBulkError(requestError instanceof Error ? requestError.message : "Bulk reset stopped safely.");
    } finally {
      setBulkLoading(false);
    }
  };

  const resumeBulkReset = async () => {
    if (!bulkRun || !bulkAcknowledged || bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS") return;
    setBulkError(null);
    setBulkLoading(true);
    try {
      const result = await executeBulkPasswordReset(
        bulkConfirmation,
        bulkRun.totalEligible,
        bulkRun.runId,
      );
      setBulkRun(result);
      setBulkConfirmation("");
      setBulkAcknowledged(false);
    } catch (requestError) {
      setBulkError(requestError instanceof Error ? requestError.message : "Unable to resume the failed run.");
    } finally {
      setBulkLoading(false);
    }
  };

  const downloadBulkArtifact = async () => {
    if (!bulkRun?.artifactAvailable) return;
    setBulkError(null);
    try {
      const blob = await downloadBulkPasswordResetArtifact(bulkRun.runId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bulk-password-reset-${bulkRun.runId}.jsonl`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setBulkError(requestError instanceof Error ? requestError.message : "Unable to download the credential artifact.");
    }
  };

  const loadCommonPreview = async () => {
    setCommonError(null);
    setCommonLoading(true);
    try {
      const preview = await previewCommonPasswordReset();
      setCommonPreview(preview);
      setCommonRun(preview.activeRun ?? preview.resumableRun);
    } catch (requestError) {
      setCommonError(requestError instanceof Error ? requestError.message : "Unable to load the common-password preview.");
    } finally {
      setCommonLoading(false);
    }
  };

  const recoverStaleBulkReset = async () => {
    const legacyRun = bulkPreview?.legacyRun;
    if (!isSuperAdmin || legacyRun?.status !== "RUNNING" || commonRecoveryLoading) return;

    const confirmed = window.confirm(
      `Recover stale reset run ${legacyRun.runId}?\n\n`
      + "This only changes the stale RUNNING run to FAILED with reason "
      + "WORKER_PROCESS_TERMINATED_EXTERNALLY. It does not modify any user credentials.",
    );
    if (!confirmed) return;

    setBulkError(null);
    setCommonRecoveryLoading(true);
    try {
      const result = await markDeadBulkPasswordResetRunFailed(legacyRun.runId);
      if (
        result.status !== "FAILED"
        || result.failureReason !== "WORKER_PROCESS_TERMINATED_EXTERNALLY"
      ) {
        throw new Error("The stale reset run was not confirmed as safely recovered.");
      }
      await loadBulkPreview();
    } catch (requestError) {
      setBulkError(requestError instanceof Error ? requestError.message : "Unable to recover the stale reset run.");
    } finally {
      setCommonRecoveryLoading(false);
    }
  };

  const runCommonReset = async () => {
    if (
      !commonPreview ||
      !commonAcknowledged ||
      commonPreview.activeCredentialReset ||
      (!resumingCommonRun && !commonPreview.eligibleToExecute) ||
      commonPassword !== commonPasswordConfirm ||
      commonConfirmation !== COMMON_PASSWORD_RESET_CONFIRMATION ||
      commonPassword.length < 12 ||
      !/[A-Z]/.test(commonPassword) ||
      !/[a-z]/.test(commonPassword) ||
      !/[0-9]/.test(commonPassword) ||
      !/[^A-Za-z0-9]/.test(commonPassword)
    ) return;

    setCommonError(null);
    setCommonLoading(true);
    try {
      const result = await executeCommonPasswordReset(
        commonPassword,
        commonPasswordConfirm,
        commonConfirmation,
        commonPreview.totalNormalUsers,
        resumingCommonRun ? commonRun.runId : undefined,
      );
      setCommonRun(result);
      setCommonPassword("");
      setCommonPasswordConfirm("");
      setCommonConfirmation("");
      setCommonAcknowledged(false);
    } catch (requestError) {
      setCommonError(requestError instanceof Error ? requestError.message : "Unable to start the common-password reset.");
    } finally {
      setCommonLoading(false);
    }
  };

  const emergencyStopCommonReset = async () => {
    if (
      !isSuperAdmin ||
      !commonRun ||
      commonRun.runId !== COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID ||
      commonRun.status !== "RUNNING" ||
      commonEmergencyStopping
    ) return;

    const confirmed = window.confirm(
      `Stop common-password reset ${commonRun.runId} for performance recovery?\n\n`
      + "The worker will finish active user operations, skip the incomplete batch checkpoint, "
      + "and transition only the existing run to FAILED. No user credentials will be rolled back.",
    );
    if (!confirmed) return;

    setCommonError(null);
    setCommonEmergencyStopping(true);
    try {
      const result = await emergencyStopCommonPasswordReset(commonRun.runId);
      setCommonRun(result);
      await loadCommonPreview();
    } catch (requestError) {
      setCommonError(requestError instanceof Error ? requestError.message : "Unable to stop the common-password worker safely.");
    } finally {
      setCommonEmergencyStopping(false);
    }
  };

  const recoverStrandedCommonReset = async () => {
    if (
      !isSuperAdmin ||
      !commonRun ||
      commonRun.runId !== COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID ||
      commonRun.status !== "RUNNING" ||
      commonRecoveryLoading
    ) return;

    const confirmed = window.confirm(
      `Recover stranded common-password reset ${commonRun.runId}?\n\n`
      + "This is only for a worker process that is no longer running and whose lease has expired. "
      + "It will preserve the last durable checkpoint, release the reset lock, and require the temporary password to be entered again before resuming. "
      + "No user credentials will be changed by recovery.",
    );
    if (!confirmed) return;

    setCommonError(null);
    setCommonRecoveryLoading(true);
    try {
      const result = await recoverStrandedCommonPasswordReset(commonRun.runId);
      setCommonRun(result);
      await loadCommonPreview();
    } catch (requestError) {
      setCommonError(requestError instanceof Error ? requestError.message : "Unable to recover the stranded common-password worker.");
    } finally {
      setCommonRecoveryLoading(false);
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

        {isSuperAdmin && (
          <section style={{ background: CARD, border: `1px solid rgba(248,113,113,0.24)`, borderRadius: 14, padding: 20, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <AlertTriangle size={17} style={{ color: "#fca5a5" }} />
              <h2 style={{ margin: 0, color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 700 }}>
                Bulk user password reset
              </h2>
            </div>
            <p style={{ margin: "0 0 16px", color: MUTED, fontSize: 12, lineHeight: 1.55 }}>
              Super Admin only. This operation replaces every normal-user password, invalidates their existing JWTs,
              sets forced-reset enforcement, and creates a one-time private credential artifact. Admin accounts and
              financial/business data are excluded.
            </p>

            {!bulkPreview && !bulkRun && (
              <button
                type="button"
                onClick={() => void loadBulkPreview()}
                disabled={bulkLoading}
                style={{
                  border: `1px solid ${GOLD}66`,
                  background: "rgba(212,175,55,0.13)",
                  color: GOLD_L,
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: bulkLoading ? "wait" : "pointer",
                }}
              >
                <RefreshCw size={13} style={{ verticalAlign: "middle", marginRight: 7 }} />
                {bulkLoading ? "Loading preview…" : "Load read-only preview"}
              </button>
            )}

            {bulkPreview && !bulkRun && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                  {[
                    ["Normal users", bulkPreview.totalNormalUsers],
                    ["ACTIVE", bulkPreview.activeUsers],
                    ["INACTIVE", bulkPreview.inactiveUsers],
                    ["BLOCKED", bulkPreview.blockedUsers],
                    ["SUSPENDED", bulkPreview.suspendedUsers],
                    ["Admins excluded", bulkPreview.adminCount],
                    ["Unexpected authVersion", bulkPreview.unexpectedAuthVersionCount],
                    ["Already requiring password reset", bulkPreview.passwordResetRequiredCount],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 11px" }}>
                      <div style={{ color: MUTED, fontSize: 10 }}>{label}</div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 17, fontWeight: 700, marginTop: 3 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {bulkPreview.legacyRun && (
                  <div role="status" style={{ border: `1px solid ${bulkPreview.legacyRun.status === "FAILED" ? "rgba(248,113,113,0.35)" : `${GOLD}55`}`, background: bulkPreview.legacyRun.status === "FAILED" ? "rgba(248,113,113,0.06)" : "rgba(212,175,55,0.06)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ color: bulkPreview.legacyRun.status === "FAILED" ? "#fca5a5" : GOLD_L, fontSize: 12, fontWeight: 700 }}>
                      Tracked random reset: {bulkPreview.legacyRun.status}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, margin: "12px 0" }}>
                      {[
                        ["Run ID", bulkPreview.legacyRun.runId],
                        ["Processed", `${bulkPreview.legacyRun.processedCount} / ${bulkPreview.legacyRun.totalEligible}`],
                        ["Failed", bulkPreview.legacyRun.failedCount],
                        ["Failure reason", bulkPreview.legacyRun.failureReason ?? "—"],
                      ].map(([label, value]) => (
                        <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 10px" }}>
                          <div style={{ color: MUTED, fontSize: 10 }}>{label}</div>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 700, marginTop: 3, overflowWrap: "anywhere" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {bulkPreview.legacyRun.status === "RUNNING" && (
                      <button
                        type="button"
                        onClick={() => void recoverStaleBulkReset()}
                        disabled={bulkLoading || commonRecoveryLoading}
                        style={{ border: `1px solid ${GOLD}88`, background: "rgba(212,175,55,0.13)", color: GOLD_L, borderRadius: 8, padding: "9px 13px", fontSize: 12, fontWeight: 700, cursor: commonRecoveryLoading ? "wait" : "pointer", opacity: bulkLoading || commonRecoveryLoading ? 0.6 : 1 }}
                      >
                        {commonRecoveryLoading ? "Recovering stale run…" : "Recover stale run"}
                      </button>
                    )}
                  </div>
                )}
                <div
                  role="status"
                  style={{
                    border: `1px solid ${
                      bulkLoading ||
                      bulkPreview.unexpectedAuthVersionCount > 0 ||
                      bulkPreview.passwordResetRequiredCount > 0 ||
                      !bulkAcknowledged ||
                      bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS"
                        ? "rgba(248,113,113,0.3)"
                        : "rgba(52,211,153,0.3)"
                    }`,
                    background:
                      bulkLoading ||
                      bulkPreview.unexpectedAuthVersionCount > 0 ||
                      bulkPreview.passwordResetRequiredCount > 0 ||
                      !bulkAcknowledged ||
                      bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS"
                        ? "rgba(248,113,113,0.06)"
                        : "rgba(52,211,153,0.06)",
                    borderRadius: 9,
                    padding: "10px 12px",
                    marginBottom: 14,
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <strong>
                    Reset execution eligibility:{" "}
                    {bulkLoading ||
                    bulkPreview.unexpectedAuthVersionCount > 0 ||
                    bulkPreview.passwordResetRequiredCount > 0 ||
                    !bulkAcknowledged ||
                    bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS"
                      ? "BLOCKED"
                      : "READY"}
                  </strong>
                  {(bulkLoading ||
                    bulkPreview.unexpectedAuthVersionCount > 0 ||
                    bulkPreview.passwordResetRequiredCount > 0 ||
                    !bulkAcknowledged ||
                    bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS") && (
                    <ul style={{ margin: "5px 0 0 18px", padding: 0 }}>
                      {bulkLoading && <li>Preview or reset request is still loading.</li>}
                      {bulkPreview.unexpectedAuthVersionCount > 0 && <li>Unexpected authVersion count is non-zero.</li>}
                      {bulkPreview.passwordResetRequiredCount > 0 && <li>Users already require a password reset.</li>}
                      {!bulkAcknowledged && <li>The acknowledgement checkbox is not checked.</li>}
                      {bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS" && <li>The confirmation phrase does not match exactly.</li>}
                    </ul>
                  )}
                </div>
                {(bulkPreview.unexpectedAuthVersionCount > 0 || bulkPreview.passwordResetRequiredCount > 0) && (
                  <p role="alert" style={{ color: "#fca5a5", fontSize: 12, lineHeight: 1.5 }}>
                    Preflight is blocked: existing users already have credential-reset state. No execution is allowed.
                  </p>
                )}
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ display: "block", color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>
                    Type the exact confirmation phrase
                  </span>
                  <input
                    value={bulkConfirmation}
                    onChange={(event) => setBulkConfirmation(event.target.value)}
                    placeholder="RESET ALL NORMAL USER PASSWORDS"
                    autoComplete="off"
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
                <label style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.45, marginBottom: 14 }}>
                  <input type="checkbox" checked={bulkAcknowledged} onChange={(event) => setBulkAcknowledged(event.target.checked)} />
                  <span>I understand this is an irreversible credential transition for all normal users and must be followed by secure manual distribution.</span>
                </label>
                {bulkError && <p role="alert" style={{ color: "#fca5a5", fontSize: 12 }}>{bulkError}</p>}
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void runBulkReset()}
                    disabled={
                      bulkLoading ||
                      bulkPreview.unexpectedAuthVersionCount > 0 ||
                      bulkPreview.passwordResetRequiredCount > 0 ||
                      !bulkAcknowledged ||
                      bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS"
                    }
                    style={{
                      border: "1px solid rgba(248,113,113,0.5)",
                      background: "rgba(248,113,113,0.12)",
                      color: "#fca5a5",
                      borderRadius: 8,
                      padding: "10px 16px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: bulkLoading ? "wait" : "pointer",
                      opacity: bulkLoading ? 0.6 : 1,
                    }}
                  >
                    {bulkLoading ? "Processing…" : "Start bulk reset"}
                  </button>
                  <button type="button" onClick={() => void loadBulkPreview()} disabled={bulkLoading} style={{ border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, borderRadius: 8, padding: "10px 16px", fontSize: 12, cursor: "pointer" }}>
                    Refresh preview
                  </button>
                </div>
              </>
            )}

            {bulkRun && (
              <div style={{ border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.08)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6ee7b7", fontSize: 13, fontWeight: 700 }}>
                  <CheckCircle2 size={16} />
                  Bulk reset status: {bulkRun.status}
                </div>
                <p style={{ margin: "8px 0 12px", color: "rgba(255,255,255,0.68)", fontSize: 12 }}>
                  Processed {bulkRun.processedCount} of {bulkRun.totalEligible} normal users. Run ID: {bulkRun.runId}
                </p>
                {bulkRun.status === "FAILED" && (
                  <>
                    <p style={{ margin: "0 0 12px", color: "#fca5a5", fontSize: 12, lineHeight: 1.5 }}>
                      The run stopped safely. Re-enter the exact phrase and acknowledge the warning to resume this same run without generating replacement passwords for completed users.
                    </p>
                    <label style={{ display: "block", marginBottom: 12 }}>
                      <span style={{ display: "block", color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>
                        Re-enter the exact confirmation phrase
                      </span>
                      <input
                        value={bulkConfirmation}
                        onChange={(event) => setBulkConfirmation(event.target.value)}
                        placeholder="RESET ALL NORMAL USER PASSWORDS"
                        autoComplete="off"
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "11px 12px", color: "rgba(255,255,255,0.9)", outline: "none", fontSize: 13 }}
                      />
                    </label>
                    <label style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.45, marginBottom: 14 }}>
                      <input type="checkbox" checked={bulkAcknowledged} onChange={(event) => setBulkAcknowledged(event.target.checked)} />
                      <span>I understand this resumes the existing run and does not restart completed users.</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void resumeBulkReset()}
                      disabled={bulkLoading || !bulkAcknowledged || bulkConfirmation !== "RESET ALL NORMAL USER PASSWORDS"}
                      style={{ border: `1px solid ${GOLD}66`, background: "rgba(212,175,55,0.13)", color: GOLD_L, borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 700, cursor: bulkLoading ? "wait" : "pointer", opacity: bulkLoading ? 0.6 : 1 }}
                    >
                      {bulkLoading ? "Resuming…" : "Resume this run safely"}
                    </button>
                  </>
                )}
                {bulkRun.artifactAvailable && (
                  <button type="button" onClick={() => void downloadBulkArtifact()} style={{ border: `1px solid ${GOLD}66`, background: "rgba(212,175,55,0.13)", color: GOLD_L, borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    <Download size={13} style={{ verticalAlign: "middle", marginRight: 7 }} />
                    Download one-time credential artifact
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {isSuperAdmin && (
          <section style={{ background: CARD, border: `1px solid rgba(212,175,55,0.28)`, borderRadius: 14, padding: 20, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <ShieldCheck size={17} style={{ color: GOLD_L }} />
              <h2 style={{ margin: 0, color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 700 }}>
                COMMON TEMPORARY PASSWORD
              </h2>
            </div>
            <p style={{ margin: "0 0 16px", color: MUTED, fontSize: 12, lineHeight: 1.55 }}>
              Super Admin only. Enter one temporary password for every normal User account. Admins are excluded,
              user statuses and financial records are preserved, and existing JWTs are invalidated.
            </p>

            {!commonPreview && !commonRun && (
              <button
                type="button"
                onClick={() => void loadCommonPreview()}
                disabled={commonLoading}
                style={{
                  border: `1px solid ${GOLD}66`,
                  background: "rgba(212,175,55,0.13)",
                  color: GOLD_L,
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: commonLoading ? "wait" : "pointer",
                }}
              >
                <RefreshCw size={13} style={{ verticalAlign: "middle", marginRight: 7 }} />
                {commonLoading ? "Loading preview…" : "Load common-password preview"}
              </button>
            )}

            {commonPreview && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                  {[
                    ["Normal users", commonPreview.totalNormalUsers],
                    ["ACTIVE", commonPreview.activeUsers],
                    ["INACTIVE", commonPreview.inactiveUsers],
                    ["BLOCKED", commonPreview.blockedUsers],
                    ["SUSPENDED", commonPreview.suspendedUsers],
                    ["Admins excluded", commonPreview.adminsExcluded],
                    ["Already requiring reset", commonPreview.passwordResetRequiredCount],
                    ["Nonzero authVersion", commonPreview.unexpectedAuthVersionCount],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 11px" }}>
                      <div style={{ color: MUTED, fontSize: 10 }}>{label}</div>
                      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 17, fontWeight: 700, marginTop: 3 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {commonPreview.resumableRun && commonRun?.runId === commonPreview.resumableRun.runId && (
                  <div role="alert" style={{ border: `1px solid ${GOLD}55`, background: "rgba(212,175,55,0.06)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ color: GOLD_L, fontSize: 12, fontWeight: 700 }}>
                      Common-password reset ready to resume
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, margin: "12px 0" }}>
                      {[
                        ["Run ID", commonPreview.resumableRun.runId],
                        ["Status", commonPreview.resumableRun.status],
                        ["Processed", `${commonPreview.resumableRun.processedCount} / ${commonPreview.resumableRun.totalEligible}`],
                        ["Failure reason", commonPreview.resumableRun.failureReason ?? "—"],
                      ].map(([label, value]) => (
                        <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 10px" }}>
                          <div style={{ color: MUTED, fontSize: 10 }}>{label}</div>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 700, marginTop: 3, overflowWrap: "anywhere" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <p style={{ margin: 0, color: "rgba(255,255,255,0.68)", fontSize: 11, lineHeight: 1.5 }}>
                      Enter the same temporary password and confirmation phrase below. Resume continues from the durable checkpoint and does not create a new reset run.
                    </p>
                  </div>
                )}

                {commonPreview.activeCredentialReset && (
                  <div role="alert" style={{ border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", borderRadius: 9, padding: "10px 12px", marginBottom: 14, color: "#fca5a5", fontSize: 12, lineHeight: 1.5 }}>
                    <strong>COMMON PASSWORD RESET BLOCKED</strong>
                    <div style={{ marginTop: 4 }}>
                      ANOTHER BULK CREDENTIAL RESET IS CURRENTLY RUNNING.
                    </div>
                  </div>
                )}

                {commonRun?.runId === COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID && commonRun.status === "RUNNING" && (
                  <div style={{ border: `1px solid ${GOLD}55`, background: "rgba(212,175,55,0.06)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ color: GOLD_L, fontSize: 12, fontWeight: 700 }}>Common reset performance recovery controls</div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => void emergencyStopCommonReset()}
                        disabled={commonLoading || commonRecoveryLoading || commonEmergencyStopping}
                        style={{ border: "1px solid rgba(248,113,113,0.55)", background: "rgba(248,113,113,0.1)", color: "#fca5a5", borderRadius: 8, padding: "9px 13px", fontSize: 12, fontWeight: 700, cursor: commonEmergencyStopping ? "wait" : "pointer", opacity: commonLoading || commonRecoveryLoading || commonEmergencyStopping ? 0.6 : 1 }}
                      >
                        {commonEmergencyStopping ? "Stopping safely…" : "Emergency stop for performance recovery"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void recoverStrandedCommonReset()}
                        disabled={commonLoading || commonRecoveryLoading || commonEmergencyStopping}
                        style={{ marginLeft: 8, border: `1px solid ${GOLD}88`, background: "rgba(212,175,55,0.13)", color: GOLD_L, borderRadius: 8, padding: "9px 13px", fontSize: 12, fontWeight: 700, cursor: commonRecoveryLoading ? "wait" : "pointer", opacity: commonLoading || commonRecoveryLoading || commonEmergencyStopping ? 0.6 : 1 }}
                      >
                        {commonRecoveryLoading ? "Recovering stranded worker…" : "Recover stranded worker"}
                      </button>
                    </div>
                  </div>
                )}

                <PasswordField label="Common temporary password" value={commonPassword} onChange={setCommonPassword} />
                <PasswordField label="Confirm common temporary password" value={commonPasswordConfirm} onChange={setCommonPasswordConfirm} />
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ display: "block", color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>
                    Type the exact confirmation phrase
                  </span>
                  <input
                    value={commonConfirmation}
                    onChange={(event) => setCommonConfirmation(event.target.value)}
                    placeholder={COMMON_PASSWORD_RESET_CONFIRMATION}
                    autoComplete="off"
                    style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "11px 12px", color: "rgba(255,255,255,0.58)", outline: "none", fontSize: 13 }}
                  />
                </label>
                <label style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.45, marginBottom: 14 }}>
                  <input type="checkbox" checked={commonAcknowledged} onChange={(event) => setCommonAcknowledged(event.target.checked)} />
                  <span>I understand this changes credentials for all normal users and forces a secure first-login password change.</span>
                </label>
                <p style={{ margin: "0 0 14px", color: MUTED, fontSize: 11, lineHeight: 1.45 }}>
                  Use at least 12 characters with uppercase, lowercase, number, and symbol characters. The password is
                  used only while the background worker is processing and is never returned or stored in the run record.
                </p>
                {commonError && <p role="alert" style={{ color: "#fca5a5", fontSize: 12 }}>{commonError}</p>}
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void runCommonReset()}
                    disabled={
                      commonLoading ||
                      commonRecoveryLoading ||
                      commonPreview.activeCredentialReset ||
                      (!resumingCommonRun && !commonPreview.eligibleToExecute) ||
                      !commonAcknowledged ||
                      commonPassword !== commonPasswordConfirm ||
                      commonConfirmation !== COMMON_PASSWORD_RESET_CONFIRMATION ||
                      commonPassword.length < 12 ||
                      !/[A-Z]/.test(commonPassword) ||
                      !/[a-z]/.test(commonPassword) ||
                      !/[0-9]/.test(commonPassword) ||
                      !/[^A-Za-z0-9]/.test(commonPassword)
                    }
                    style={{ border: `1px solid ${GOLD}66`, background: "rgba(212,175,55,0.13)", color: GOLD_L, borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 700, cursor: commonLoading ? "wait" : "pointer", opacity: commonLoading ? 0.6 : 1 }}
                  >
                    {commonLoading ? "Submitting…" : commonRun?.status === "FAILED" ? "Resume common-password reset" : "Start common-password reset"}
                  </button>
                  <button type="button" onClick={() => void loadCommonPreview()} disabled={commonLoading || commonRecoveryLoading} style={{ border: `1px solid ${BORDER}`, background: "transparent", color: MUTED, borderRadius: 8, padding: "10px 16px", fontSize: 12, cursor: "pointer" }}>
                    Refresh preview
                  </button>
                </div>
              </>
            )}

            {commonRun && (
              <div style={{ border: `1px solid ${commonRun.status === "FAILED" ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.3)"}`, background: commonRun.status === "FAILED" ? "rgba(248,113,113,0.06)" : "rgba(52,211,153,0.06)", borderRadius: 10, padding: 14, marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: commonRun.status === "FAILED" ? "#fca5a5" : "#6ee7b7", fontSize: 13, fontWeight: 700 }}>
                  {commonRun.status === "FAILED" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  Common-password reset status: {commonRun.status}
                </div>
                <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 1.5 }}>
                  Processed {commonRun.processedCount} of {commonRun.totalEligible} normal users. This worker does not expose passwords.
                </p>
                {commonRun.failureReason && <p style={{ margin: "8px 0 0", color: "#fca5a5", fontSize: 12 }}>{commonRun.failureReason}</p>}
              </div>
            )}
          </section>
        )}

        {isSuperAdmin && <DepositWalletManagement />}
      </div>
    </AdminLayout>
  );
}