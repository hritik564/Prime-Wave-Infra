import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FormError } from "@/components/auth/FormError";
import { Button } from "@/components/ui/button";
import { changePassword, type AuthResponse } from "@/lib/api";

interface FirstLoginPasswordChangeProps {
  resetToken: string;
  onComplete: (result: AuthResponse) => void;
}

export default function FirstLoginPasswordChange({
  resetToken,
  onComplete,
}: FirstLoginPasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Your new password must contain an uppercase letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const result = await changePassword(currentPassword, newPassword, resetToken);
      onComplete(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthCard centerOnMobile>
      <div className="mb-6 flex justify-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            background: "rgba(212, 175, 55, 0.1)",
            border: "1px solid rgba(212, 175, 55, 0.28)",
          }}
        >
          <ShieldCheck className="h-6 w-6 text-gold" />
        </div>
      </div>
      <AuthHeader
        title="Set your new password."
        subtitle="Your temporary password was accepted. Replace it now before normal access is restored."
      />

      <form onSubmit={submit} className="auth-form mt-7 space-y-5" noValidate>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="temporary-password">
            Temporary password
          </label>
          <PasswordInput
            id="temporary-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter your temporary password"
            disabled={saving}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="new-password">
            New password
          </label>
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="Create a new password"
            disabled={saving}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="confirm-password">
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="Repeat your new password"
            disabled={saving}
          />
        </div>

        <FormError message={error} />

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saving ? "Updating password…" : "Continue securely"}
        </Button>
      </form>
    </AuthCard>
  );
}