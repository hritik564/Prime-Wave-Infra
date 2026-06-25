import { useState, useEffect } from "react";
import { Loader2, User, Lock, Wallet, Check, Moon, Sun } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import SectionHeader from "@/components/shared/SectionHeader";
import { getProfile, updateProfile, changePassword, type ProfileData } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useLocation } from "wouter";

function Card({ children, title, icon: Icon }: { children: React.ReactNode; title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }) {
  return (
    <div
      className="rounded-2xl overflow-hidden mb-5"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
    >
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
          <Icon className="h-4 w-4" style={{ color: "#D4AF37" }} />
        </div>
        <h3 className="text-base font-semibold font-heading text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", readOnly }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      readOnly={readOnly}
      className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
      style={{
        background: readOnly ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: readOnly ? "rgba(170,179,197,0.5)" : "hsl(var(--foreground))",
        cursor: readOnly ? "not-allowed" : "text",
      }}
    />
  );
}

function SaveButton({ loading, saved, onClick, disabled }: { loading: boolean; saved: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
      style={
        loading || disabled
          ? { background: "rgba(255,255,255,0.06)", color: "rgba(170,179,197,0.4)", cursor: "not-allowed" }
          : saved
          ? { background: "rgba(52,211,153,0.15)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }
          : { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37" }
      }
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
      {loading ? "Saving…" : saved ? "Saved!" : "Save Changes"}
    </button>
  );
}

export default function SettingsPage() {
  const { user, authLogout } = useAuth();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [firstName, setFirstName]       = useState("");
  const [lastName, setLastName]         = useState("");
  const [phone, setPhone]               = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);
  const [profileError, setProfileError]   = useState<string>();

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving]               = useState(false);
  const [pwSaved, setPwSaved]                 = useState(false);
  const [pwError, setPwError]                 = useState<string>();

  // Theme
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("pw:theme") !== "light"; } catch { return true; }
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await getProfile();
        setProfile(data);
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setPhone(data.phone ?? "");
        setWalletAddress((data as ProfileData & { walletAddress?: string }).walletAddress ?? "");
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError(undefined);
    try {
      const updated = await updateProfile({ firstName, lastName, phone, walletAddress });
      setProfile(updated);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError("All password fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    setPwSaving(true);
    setPwError(undefined);
    try {
      await changePassword(currentPassword, newPassword);
      setPwSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSaved(false), 2500);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setPwSaving(false);
    }
  };

  const handleThemeToggle = () => {
    const next = !darkMode;
    setDarkMode(next);
    try { localStorage.setItem("pw:theme", next ? "dark" : "light"); } catch {}
  };

  const handleLogout = () => {
    authLogout();
    navigate("/login");
  };

  return (
    <AppLayout pageTitle="Settings" notificationCount={0}>
      <PageContainer>
        <SectionHeader title="Settings" />

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
          </div>
        ) : (
          <>
            {/* ── Profile ── */}
            <Card title="Profile Information" icon={User}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Field label="First Name">
                  <TextInput value={firstName} onChange={setFirstName} placeholder="First name" />
                </Field>
                <Field label="Last Name">
                  <TextInput value={lastName} onChange={setLastName} placeholder="Last name" />
                </Field>
                <Field label="Email">
                  <TextInput value={profile?.email ?? ""} readOnly />
                </Field>
                <Field label="Username">
                  <TextInput value={profile?.username ?? ""} readOnly />
                </Field>
                <Field label="Phone">
                  <TextInput value={phone} onChange={setPhone} placeholder="+1 234 567 8900" />
                </Field>
                <Field label="Referral Code">
                  <TextInput value={profile?.referralCode ?? ""} readOnly />
                </Field>
              </div>
              {profileError && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{profileError}</p>}
              <SaveButton loading={profileSaving} saved={profileSaved} onClick={handleSaveProfile} />
            </Card>

            {/* ── Wallet Address ── */}
            <Card title="Withdrawal Wallet Address" icon={Wallet}>
              <p className="text-xs mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
                Your USDT (TRC-20 / ERC-20) wallet address for receiving withdrawals.
              </p>
              <Field label="Wallet Address">
                <TextInput
                  value={walletAddress}
                  onChange={setWalletAddress}
                  placeholder="e.g. TRx... or 0x..."
                />
              </Field>
              <SaveButton loading={profileSaving} saved={profileSaved} onClick={handleSaveProfile} />
            </Card>

            {/* ── Password ── */}
            <Card title="Change Password" icon={Lock}>
              <div className="space-y-0">
                <Field label="Current Password">
                  <TextInput type="password" value={currentPassword} onChange={setCurrentPassword} placeholder="••••••••" />
                </Field>
                <Field label="New Password">
                  <TextInput type="password" value={newPassword} onChange={setNewPassword} placeholder="••••••••" />
                </Field>
                <Field label="Confirm New Password">
                  <TextInput type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" />
                </Field>
              </div>
              {pwError && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{pwError}</p>}
              <SaveButton
                loading={pwSaving}
                saved={pwSaved}
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
              />
            </Card>

            {/* ── Theme ── */}
            <div
              className="rounded-2xl p-5 mb-5 flex items-center justify-between"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
                  {darkMode ? <Moon className="h-4 w-4" style={{ color: "#D4AF37" }} /> : <Sun className="h-4 w-4" style={{ color: "#D4AF37" }} />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Theme</p>
                  <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{darkMode ? "Dark mode" : "Light mode"}</p>
                </div>
              </div>
              <button
                onClick={handleThemeToggle}
                className="relative h-7 w-12 rounded-full transition-all duration-300"
                style={{
                  background: darkMode ? "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)" : "rgba(255,255,255,0.15)",
                  boxShadow: darkMode ? "0 0 12px rgba(212,175,55,0.4)" : "none",
                }}
              >
                <span
                  className="absolute top-0.5 h-6 w-6 rounded-full shadow-sm transition-all duration-300"
                  style={{ background: "#fff", left: darkMode ? "calc(100% - 26px)" : "2px" }}
                />
              </button>
            </div>

            {/* ── Account Info ── */}
            <div className="rounded-2xl p-5 mb-5 space-y-3" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
              <p className="text-sm font-semibold font-heading text-foreground">Account Info</p>
              {[
                { label: "Member Since", value: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—" },
                { label: "Direct Referrals", value: String(profile?.directReferralCount ?? 0) },
                { label: "Status", value: profile?.status ?? "ACTIVE" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
                  <span className="text-xs font-semibold text-foreground">{value}</span>
                </div>
              ))}
            </div>

            {/* ── Logout ── */}
            <button
              onClick={handleLogout}
              className="w-full rounded-2xl py-4 font-semibold text-sm transition-all"
              style={{ background: "rgba(248,113,113,0.08)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
            >
              Sign Out
            </button>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
}
