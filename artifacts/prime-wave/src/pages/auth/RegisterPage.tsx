import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Loader2, Check, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight,
  Info, AlertCircle, UserCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FormError } from "@/components/auth/FormError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { register as apiRegister, resolveReferralCode } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import type { StoredUser } from "@/lib/auth";

// ── Zod schema ────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    firstName:    z.string().min(2, "Must be at least 2 characters"),
    lastName:     z.string().min(2, "Must be at least 2 characters"),
    username:     z
      .string()
      .min(3, "Must be 3–20 characters")
      .max(20, "Must be 3–20 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, underscores"),
    email:        z.string().email("Enter a valid email address"),
    phone:        z.string().min(7, "Enter a valid phone number"),
    password:     z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must include an uppercase letter")
      .regex(/[0-9]/, "Must include a number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    referralCode: z.string().min(1, "A referral code is required to join Prime Wave"),
    leg:          z.enum(["L", "R"]).optional(),
    agreeToTerms: z.boolean().refine((v) => v === true, {
      message: "You must agree to the Terms & Conditions",
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .superRefine((data, ctx) => {
    if (!data.leg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["leg"],
        message: "Please select a placement side (Left Team or Right Team).",
      });
    }
  });

type RegisterData = z.infer<typeof registerSchema>;

type Step1Fields = "firstName" | "lastName" | "username" | "email" | "phone";
type Step2Fields = "password" | "confirmPassword";
type Step3Fields = "referralCode" | "leg" | "agreeToTerms";

const STEP_FIELDS: Record<number, (Step1Fields | Step2Fields | Step3Fields)[]> = {
  1: ["firstName", "lastName", "username", "email", "phone"],
  2: ["password", "confirmPassword"],
  3: ["referralCode", "leg", "agreeToTerms"],
};

const STEP_LABELS = ["Personal Info", "Security", "Account Setup"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Splits a referral code that may contain a placement suffix.
 * Supports:  "ABCD1234-L"  →  { baseCode: "ABCD1234", leg: "L" }
 * Also normalises: trims whitespace, uppercases.
 */
function parseCodeSuffix(code: string): { baseCode: string; leg: "L" | "R" | null } {
  const upper = code.trim().toUpperCase();
  if (upper.endsWith("-L")) return { baseCode: upper.slice(0, -2), leg: "L" };
  if (upper.endsWith("-R")) return { baseCode: upper.slice(0, -2), leg: "R" };
  return { baseCode: upper, leg: null };
}

const SESSION_KEY = "_pw_referral";

/**
 * Reads URL params and sessionStorage to produce a normalised referral context.
 *
 * Supported URL formats:
 *   /register?ref=MASTERROOT
 *   /register?ref=MASTERROOT&leg=L
 *   /register?ref=MASTERROOT&leg=R
 *   /register?ref=MASTERROOT-L
 *   /register?ref=MASTERROOT-R
 *
 * When URL params are present they are saved to sessionStorage so a page
 * refresh preserves the referral context.
 */
function resolveReferralParams(): {
  code:       string;       // normalised base code (no suffix)
  leg:        "L" | "R" | null;
  hasUrlCode: boolean;      // code came from URL / session → field is read-only
  hasUrlLeg:  boolean;      // leg came from URL / session → leg is locked
} {
  const sp = new URLSearchParams(window.location.search);
  const rawRef = sp.get("ref")?.trim() ?? "";
  const rawLeg = (sp.get("leg") ?? "").trim().toUpperCase();

  // Support ?ref=MASTERROOT-L  (suffix embedded in the ref param itself)
  const { baseCode: refBase, leg: suffixLeg } = parseCodeSuffix(rawRef);
  const paramLeg: "L" | "R" | null =
    rawLeg === "L" || rawLeg === "R" ? (rawLeg as "L" | "R") : suffixLeg;

  if (refBase) {
    // URL has a referral code — save to sessionStorage and use it
    const stored = paramLeg ? `${refBase}|${paramLeg}` : refBase;
    try { sessionStorage.setItem(SESSION_KEY, stored); } catch { /* ignore */ }
    return {
      code:       refBase,
      leg:        paramLeg,
      hasUrlCode: true,
      hasUrlLeg:  paramLeg === "L" || paramLeg === "R",
    };
  }

  // No URL params — try to restore from sessionStorage (survives refresh)
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const [c, l] = stored.split("|");
      const code = c?.trim().toUpperCase() ?? "";
      const leg  = (l === "L" || l === "R") ? l : null;
      if (code) {
        return { code, leg, hasUrlCode: true, hasUrlLeg: !!leg };
      }
    }
  } catch { /* ignore */ }

  return { code: "", leg: null, hasUrlCode: false, hasUrlLeg: false };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;
  if (!password) return null;

  const colors    = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400"];
  const labels    = ["Weak", "Fair", "Good", "Strong"];
  const textColors = ["#f87171", "#fb923c", "#fbbf24", "#34d399"];

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i <= strength ? colors[strength - 1] : "bg-border"
            )}
          />
        ))}
      </div>
      <p className="text-xs" style={{ color: textColors[strength - 1] ?? "hsl(var(--muted-foreground))" }}>
        {labels[strength - 1] ?? ""}
      </p>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-7">
      {Array.from({ length: total }).map((_, i) => {
        const step      = i + 1;
        const isComplete = step < current;
        const isActive   = step === current;
        return (
          <div key={step} className="flex items-center">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                isActive   && "text-navy-950 shadow-glow-gold",
                isComplete && "text-gold",
                !isActive && !isComplete && "text-muted-foreground"
              )}
              style={{
                background: isActive
                  ? "#D4AF37"
                  : isComplete
                  ? "rgba(212,175,55,0.15)"
                  : "hsl(var(--muted))",
                border: isComplete ? "1px solid rgba(212,175,55,0.3)" : undefined,
              }}
            >
              {isComplete ? <Check className="h-3.5 w-3.5" /> : step}
            </div>
            {i < total - 1 && (
              <div
                className="mx-1.5 h-0.5 w-8 rounded-full transition-all duration-500"
                style={{ background: isComplete ? "#D4AF37" : "hsl(var(--border))" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Leg picker ────────────────────────────────────────────────────────────────

interface LegPickerProps {
  value:    "L" | "R" | undefined;
  locked:   boolean;
  onChange: (leg: "L" | "R") => void;
}

function LegPicker({ value, locked, onChange }: LegPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["L", "R"] as const).map((side) => {
        const isSelected = value === side;
        const label      = side === "L" ? "Left Team" : "Right Team";
        return (
          <button
            key={side}
            type="button"
            disabled={locked && value !== side}
            onClick={() => { if (!locked) onChange(side); }}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 py-3.5 px-4 rounded-xl font-semibold text-sm transition-all",
              locked && value !== side && "opacity-30 cursor-not-allowed",
              !locked && !isSelected && "hover:border-yellow-500/40 cursor-pointer",
            )}
            style={{
              background: isSelected ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.03)",
              border:     `1px solid ${isSelected ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.08)"}`,
              color:      isSelected ? "#D4AF37" : "hsl(var(--muted-foreground))",
            }}
          >
            {isSelected && <Check className="h-4 w-4" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const { authLogin } = useAuth();
  const [step,      setStep]      = useState(1);
  const [direction, setDirection] = useState(1);
  const [formError, setFormError] = useState<string>();

  // Sponsor lookup state
  const [sponsorInfo,    setSponsorInfo]    = useState<{ username: string; firstName: string; lastName: string } | null>(null);
  const [sponsorLoading, setSponsorLoading] = useState(false);
  const [sponsorError,   setSponsorError]   = useState(false);

  // ── Resolve referral context from URL + sessionStorage ──────────────────────
  // useMemo with [] runs once per mount; safe for sessionStorage side-effects.
  const { code: urlRef, leg: urlLeg, hasUrlCode, hasUrlLeg } = useMemo(
    () => resolveReferralParams(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── React Hook Form ─────────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      agreeToTerms: false,
      referralCode: urlRef || "",
      leg:          (urlLeg === "L" || urlLeg === "R") ? urlLeg : undefined,
    },
  });

  const passwordValue   = watch("password") ?? "";
  const agreeToTerms    = watch("agreeToTerms");
  const referralCodeVal = watch("referralCode") ?? "";
  const legValue        = watch("leg");

  // ── Derived base code (no suffix) — used for API calls ─────────────────────
  const derivedBaseCode = useMemo(() => {
    if (hasUrlCode) return urlRef;
    return parseCodeSuffix(referralCodeVal).baseCode;
  }, [hasUrlCode, urlRef, referralCodeVal]);

  // ── Auto-parse leg suffix when user types manually ──────────────────────────
  // Only runs when the referral code was NOT supplied via URL.
  useEffect(() => {
    if (hasUrlCode) return;
    const { leg } = parseCodeSuffix(referralCodeVal);
    if (leg && leg !== legValue) {
      setValue("leg", leg, { shouldValidate: true });
    } else if (!leg && legValue) {
      setValue("leg", undefined, { shouldValidate: false });
    }
  }, [referralCodeVal, legValue, setValue, hasUrlCode]);

  // ── Sponsor lookup — triggers as soon as a valid base code is available ─────
  // Does NOT wait for legValue: you can verify a sponsor without knowing placement.
  useEffect(() => {
    if (!derivedBaseCode) {
      setSponsorInfo(null);
      setSponsorError(false);
      return;
    }
    let cancelled = false;
    setSponsorLoading(true);
    setSponsorError(false);
    resolveReferralCode(derivedBaseCode)
      .then((info) => {
        if (!cancelled) { setSponsorInfo(info); setSponsorError(false); }
      })
      .catch(() => {
        if (!cancelled) { setSponsorInfo(null); setSponsorError(true); }
      })
      .finally(() => { if (!cancelled) setSponsorLoading(false); });
    return () => { cancelled = true; };
  }, [derivedBaseCode]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const goNext = async () => {
    const fields = STEP_FIELDS[step];
    const valid  = await trigger(fields as Parameters<typeof trigger>[0]);
    if (valid) { setDirection(1); setStep((s) => s + 1); }
  };

  const goPrev = () => { setDirection(-1); setStep((s) => s - 1); };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const onSubmit = async (data: RegisterData) => {
    setFormError(undefined);
    try {
      // Always send the clean base code (no suffix) to the backend
      const baseCode = hasUrlCode ? urlRef : parseCodeSuffix(data.referralCode).baseCode;
      const result   = await apiRegister({
        firstName:    data.firstName,
        lastName:     data.lastName,
        username:     data.username,
        email:        data.email,
        phone:        data.phone,
        password:     data.password,
        referralCode: baseCode || data.referralCode,
        leg:          data.leg as "L" | "R",
      });
      // Clear saved referral params on successful registration
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
      const storedUser: StoredUser = { ...result.user, type: "user" };
      authLogin(result.token, storedUser);
      window.location.href = "/dashboard";
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Registration failed. This username or email may already exist.",
      );
    }
  };

  // ── Animation variants ──────────────────────────────────────────────────────
  const stepVariants = {
    initial: (d: number) => ({ opacity: 0, x: d > 0 ? 30 : -30 }),
    animate: { opacity: 1, x: 0 },
    exit:    (d: number) => ({ opacity: 0, x: d < 0 ? 30 : -30 }),
  };

  // ── Sponsor card visibility ─────────────────────────────────────────────────
  // Show the sponsor verification card as soon as we have a code to look up.
  const showSponsorCard = !!(derivedBaseCode && (sponsorInfo || sponsorLoading || sponsorError));

  return (
    <AuthCard maxWidth="max-w-lg">
      <AuthHeader title="Create Account" showTagline />

      <StepIndicator current={step} total={3} />

      <p
        className="text-center text-xs font-semibold uppercase tracking-widest mb-6"
        style={{ color: "#D4AF37" }}
      >
        Step {step}: {STEP_LABELS[step - 1]}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeInOut" }}
          >

            {/* ── Step 1: Personal Info ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      autoComplete="given-name"
                      aria-invalid={!!errors.firstName}
                      {...register("firstName")}
                    />
                    {errors.firstName && (
                      <p className="text-xs" style={{ color: "#f87171" }}>{errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      autoComplete="family-name"
                      aria-invalid={!!errors.lastName}
                      {...register("lastName")}
                    />
                    {errors.lastName && (
                      <p className="text-xs" style={{ color: "#f87171" }}>{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="john_doe"
                    autoComplete="username"
                    aria-invalid={!!errors.username}
                    {...register("username")}
                  />
                  {errors.username && (
                    <p className="text-xs" style={{ color: "#f87171" }}>{errors.username.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-xs" style={{ color: "#f87171" }}>{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    autoComplete="tel"
                    aria-invalid={!!errors.phone}
                    {...register("phone")}
                  />
                  {errors.phone && (
                    <p className="text-xs" style={{ color: "#f87171" }}>{errors.phone.message}</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 2: Security ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput
                    id="password"
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                  {errors.password ? (
                    <p className="text-xs" style={{ color: "#f87171" }}>{errors.password.message}</p>
                  ) : (
                    <PasswordStrengthBar password={passwordValue} />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <PasswordInput
                    id="confirmPassword"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirmPassword}
                    {...register("confirmPassword")}
                  />
                  {errors.confirmPassword && (
                    <p className="text-xs" style={{ color: "#f87171" }}>{errors.confirmPassword.message}</p>
                  )}
                </div>

                <div
                  className="rounded-lg px-3 py-2.5 text-xs"
                  style={{
                    background: "rgba(212,175,55,0.05)",
                    border: "1px solid rgba(212,175,55,0.1)",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  Password must be at least 8 characters, include one uppercase letter and one number.
                </div>
              </div>
            )}

            {/* ── Step 3: Account Setup ── */}
            {step === 3 && (
              <div className="space-y-5">

                {/* Referral Code */}
                <div className="space-y-1.5">
                  <Label htmlFor="referralCode">
                    Referral Code <span style={{ color: "#f87171" }}>*</span>
                  </Label>

                  {hasUrlCode ? (
                    /* Locked — came from referral link or sessionStorage */
                    <div
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{
                        background: "rgba(212,175,55,0.06)",
                        border: "1px solid rgba(212,175,55,0.2)",
                      }}
                    >
                      <Check className="h-4 w-4 shrink-0" style={{ color: "#D4AF37" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                          style={{ color: "rgba(212,175,55,0.7)" }}>
                          Referral Code
                        </p>
                        <p className="text-sm font-bold text-foreground tracking-wider">{urlRef}</p>
                      </div>
                      <input type="hidden" {...register("referralCode")} />
                    </div>
                  ) : (
                    /* Editable — direct registration */
                    <Input
                      id="referralCode"
                      placeholder="e.g. ABCD1234-L or ABCD1234-R"
                      aria-invalid={!!errors.referralCode}
                      {...register("referralCode")}
                    />
                  )}

                  {errors.referralCode && (
                    <p className="text-xs" style={{ color: "#f87171" }}>{errors.referralCode.message}</p>
                  )}
                  {!hasUrlCode && !errors.referralCode && (
                    <p className="text-xs flex items-start gap-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                      <Info className="h-3 w-3 mt-0.5 shrink-0" />
                      Include the placement side: e.g. ABCD1234<strong>-L</strong> or ABCD1234<strong>-R</strong>
                    </p>
                  )}
                </div>

                {/* Sponsor verification card — appears as soon as code is looked up */}
                {showSponsorCard && (
                  <div
                    className="rounded-xl px-4 py-3"
                    style={{
                      background: sponsorError
                        ? "rgba(248,113,113,0.06)"
                        : "rgba(212,175,55,0.06)",
                      border: `1px solid ${sponsorError
                        ? "rgba(248,113,113,0.2)"
                        : "rgba(212,175,55,0.18)"}`,
                    }}
                  >
                    {sponsorLoading ? (
                      <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(212,175,55,0.7)" }}>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Verifying sponsor…
                      </div>
                    ) : sponsorError ? (
                      <div className="flex items-center gap-2 text-xs" style={{ color: "#f87171" }}>
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Referral code not found. Check the code and try again.
                      </div>
                    ) : sponsorInfo ? (
                      <div className="space-y-2.5">
                        {/* Sponsor row */}
                        <div className="flex items-center gap-2.5">
                          <UserCheck className="h-4 w-4 shrink-0" style={{ color: "#34d399" }} />
                          <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0"
                            style={{ color: "rgba(212,175,55,0.6)", minWidth: "4.5rem" }}>
                            Sponsor
                          </span>
                          <span className="text-sm font-semibold text-foreground truncate">
                            {sponsorInfo.firstName} {sponsorInfo.lastName}{" "}
                            <span style={{ color: "rgba(170,179,197,0.6)" }}>
                              (@{sponsorInfo.username})
                            </span>
                          </span>
                        </div>

                        {/* Placement row — only shown once leg is chosen */}
                        {legValue && (
                          <div className="flex items-center gap-2.5">
                            <Check className="h-4 w-4 shrink-0" style={{ color: "#D4AF37" }} />
                            <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0"
                              style={{ color: "rgba(212,175,55,0.6)", minWidth: "4.5rem" }}>
                              Placement
                            </span>
                            <span className="text-sm font-semibold" style={{ color: "#F3D37A" }}>
                              {legValue === "L" ? "Left Team" : "Right Team"}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Placement picker */}
                {/* Show when:
                    - hasUrlCode + !hasUrlLeg  → locked code, no leg in URL → user must choose
                    - !hasUrlCode              → manual entry → parse suffix auto, or let user pick
                    - never shown when hasUrlLeg → leg already locked from URL */}
                {!hasUrlLeg && derivedBaseCode && !sponsorError && (
                  <div className="space-y-2">
                    <Label>
                      Placement <span style={{ color: "#f87171" }}>*</span>
                    </Label>
                    {hasUrlCode ? (
                      /* URL-locked code but no leg — mandatory picker */
                      <>
                        <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Your referral link does not specify a team. Please choose where you'd like to be placed:
                        </p>
                        <LegPicker
                          value={legValue}
                          locked={false}
                          onChange={(l) => setValue("leg", l, { shouldValidate: true })}
                        />
                      </>
                    ) : (
                      /* Manual entry — show picker only if suffix has been parsed */
                      legValue && (
                        <LegPicker
                          value={legValue}
                          locked={false}
                          onChange={(l) => setValue("leg", l, { shouldValidate: true })}
                        />
                      )
                    )}
                    {errors.leg && (
                      <p className="text-xs" style={{ color: "#f87171" }}>{errors.leg.message}</p>
                    )}
                  </div>
                )}

                {/* Terms & Conditions */}
                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    id="agreeToTerms"
                    checked={agreeToTerms}
                    onCheckedChange={(c) =>
                      setValue("agreeToTerms", c === true, { shouldValidate: true })
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="agreeToTerms"
                      className="font-normal cursor-pointer leading-relaxed"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      I agree to the{" "}
                      <a href="#" className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: "#D4AF37" }}
                        onClick={(e) => e.preventDefault()}>
                        Terms & Conditions
                      </a>{" "}
                      and{" "}
                      <a href="#" className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: "#D4AF37" }}
                        onClick={(e) => e.preventDefault()}>
                        Privacy Policy
                      </a>
                    </Label>
                    {errors.agreeToTerms && (
                      <p className="text-xs mt-1" style={{ color: "#f87171" }}>
                        {errors.agreeToTerms.message}
                      </p>
                    )}
                  </div>
                </div>

                <FormError message={formError} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className={cn("flex gap-3 mt-7", step > 1 ? "justify-between" : "justify-end")}>
          {step > 1 && (
            <Button type="button" variant="outline" onClick={goPrev} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}

          {step < 3 ? (
            <Button
              type="button"
              onClick={goNext}
              className="gap-1.5 font-semibold"
              style={{ background: "#D4AF37", color: "#050B1A" }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isSubmitting}
              className="gap-1.5 font-semibold"
              style={{ background: "#D4AF37", color: "#050B1A" }}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating Account…</>
              ) : (
                <>Create Account <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          )}
        </div>
      </form>

      <p
        className="mt-6 text-center text-sm"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        Already have an account?{" "}
        <Link href="/login" className="font-semibold hover:underline underline-offset-2"
          style={{ color: "#D4AF37" }}>
          Sign In
        </Link>
      </p>
    </AuthCard>
  );
}
