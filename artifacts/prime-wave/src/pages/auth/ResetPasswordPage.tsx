import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FormError } from "@/components/auth/FormError";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/lib/api";

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetData = z.infer<typeof resetSchema>;

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;
  const colors = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400"];
  const labels = ["Weak", "Fair", "Good", "Strong"];

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= strength ? colors[strength - 1] : "bg-border"
            }`}
          />
        ))}
      </div>
      <p
        className="text-xs"
        style={{
          color:
            strength <= 1
              ? "#f87171"
              : strength === 2
              ? "#fb923c"
              : strength === 3
              ? "#fbbf24"
              : "#34d399",
        }}
      >
        {labels[strength - 1] ?? "Enter a password"}
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetData>({
    resolver: zodResolver(resetSchema),
  });

  const passwordValue = watch("password") ?? "";

  const onSubmit = async (data: ResetData) => {
    setFormError(undefined);
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFormError("This reset link is missing its token. Request a new link.");
      return;
    }

    try {
      await resetPassword(token, data.password);
      setSuccess(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to reset your password.");
    }
  };

  return (
    <AuthCard>
      <AnimatePresence mode="wait">
        {success ? (
          /* ── Success State ── */
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center py-4"
          >
            <div className="flex justify-center mb-5">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full"
                style={{
                  background: "rgba(52,211,153,0.1)",
                  border: "2px solid rgba(52,211,153,0.25)",
                }}
              >
                <CheckCircle2 className="h-10 w-10" style={{ color: "#34d399" }} />
              </div>
            </div>
            <h2 className="text-xl font-bold font-heading text-foreground">
              Password Reset!
            </h2>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Your password has been updated successfully. You can now sign in with your new credentials.
            </p>
            <div className="mt-6">
              <Link href="/login">
                <Button
                  className="w-full h-11 font-semibold"
                  style={{ background: "var(--pw-cyan)", color: "#071113" }}
                >
                  Sign In
                </Button>
              </Link>
            </div>
          </motion.div>
        ) : (
          /* ── Form State ── */
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <AuthHeader
              title="Reset Password"
              subtitle="Choose a strong new password for your account"
            />

            <div
              className="mb-5 flex items-center gap-2.5 rounded-lg px-3 py-2.5"
              style={{
                background: "rgba(82,230,224,0.06)",
                border: "1px solid rgba(82,230,224,0.14)",
              }}
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-400" />
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                Your reset link is valid. Create a new password below.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="password">New Password</Label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                {errors.password ? (
                  <p className="text-xs" style={{ color: "#f87171" }}>
                    {errors.password.message}
                  </p>
                ) : (
                  <PasswordStrengthBar password={passwordValue} />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-xs" style={{ color: "#f87171" }}>
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <FormError message={formError} />

              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                disabled={isSubmitting}
                style={{ background: "var(--pw-cyan)", color: "#071113" }}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Resetting…
                  </span>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthCard>
  );
}
