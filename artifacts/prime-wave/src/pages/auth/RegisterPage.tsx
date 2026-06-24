import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Loader2, Check, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
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

const registerSchema = z
  .object({
    firstName: z.string().min(2, "Must be at least 2 characters"),
    lastName: z.string().min(2, "Must be at least 2 characters"),
    username: z
      .string()
      .min(3, "Must be 3–20 characters")
      .max(20, "Must be 3–20 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, underscores"),
    email: z.string().email("Enter a valid email address"),
    phone: z.string().min(7, "Enter a valid phone number"),
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must include an uppercase letter")
      .regex(/[0-9]/, "Must include a number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    referralCode: z.string().optional(),
    binaryPlacement: z.enum(["LEFT", "RIGHT"], {
      required_error: "Please select a placement side",
    }),
    agreeToTerms: z
      .boolean()
      .refine((v) => v === true, {
        message: "You must agree to the Terms & Conditions",
      }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterData = z.infer<typeof registerSchema>;

type Step1Fields = "firstName" | "lastName" | "username" | "email" | "phone";
type Step2Fields = "password" | "confirmPassword";
type Step3Fields = "referralCode" | "binaryPlacement" | "agreeToTerms";

const STEP_FIELDS: Record<number, (Step1Fields | Step2Fields | Step3Fields)[]> = {
  1: ["firstName", "lastName", "username", "email", "phone"],
  2: ["password", "confirmPassword"],
  3: ["binaryPlacement", "agreeToTerms"],
};

const STEP_LABELS = ["Personal Info", "Security", "Account Setup"];

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;
  if (!password) return null;

  const colors = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400"];
  const labels = ["Weak", "Fair", "Good", "Strong"];
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
        const step = i + 1;
        const isComplete = step < current;
        const isActive = step === current;
        return (
          <div key={step} className="flex items-center">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300",
                isActive && "text-navy-950 shadow-glow-gold",
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
                style={{
                  background: isComplete ? "#D4AF37" : "hsl(var(--border))",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { agreeToTerms: false },
  });

  const passwordValue = watch("password") ?? "";
  const binaryPlacement = watch("binaryPlacement");
  const agreeToTerms = watch("agreeToTerms");

  const goNext = async () => {
    const fields = STEP_FIELDS[step];
    const valid = await trigger(fields as Parameters<typeof trigger>[0]);
    if (valid) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  };

  const goPrev = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const onSubmit = async (_data: RegisterData) => {
    setFormError(undefined);
    await new Promise((r) => setTimeout(r, 2000));
    setFormError("Registration failed. This username or email may already exist.");
  };

  const stepVariants = {
    initial: (d: number) => ({ opacity: 0, x: d > 0 ? 30 : -30 }),
    animate: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d < 0 ? 30 : -30 }),
  };

  return (
    <AuthCard maxWidth="max-w-lg">
      <AuthHeader title="Create Account" showTagline />

      <StepIndicator current={step} total={3} />

      {/* Step label */}
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
                <div className="grid grid-cols-2 gap-3">
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
                      <p className="text-xs" style={{ color: "#f87171" }}>
                        {errors.firstName.message}
                      </p>
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
                      <p className="text-xs" style={{ color: "#f87171" }}>
                        {errors.lastName.message}
                      </p>
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
                    <p className="text-xs" style={{ color: "#f87171" }}>
                      {errors.username.message}
                    </p>
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
                    <p className="text-xs" style={{ color: "#f87171" }}>
                      {errors.email.message}
                    </p>
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
                    <p className="text-xs" style={{ color: "#f87171" }}>
                      {errors.phone.message}
                    </p>
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
                    <p className="text-xs" style={{ color: "#f87171" }}>
                      {errors.password.message}
                    </p>
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
                    <p className="text-xs" style={{ color: "#f87171" }}>
                      {errors.confirmPassword.message}
                    </p>
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
                <div className="space-y-1.5">
                  <Label htmlFor="referralCode">
                    Referral Code{" "}
                    <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400 }}>
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="referralCode"
                    placeholder="Enter sponsor's referral code"
                    aria-invalid={!!errors.referralCode}
                    {...register("referralCode")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Binary Placement Side</Label>
                  <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Choose which side of your sponsor's binary tree you'll join
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {(["LEFT", "RIGHT"] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() =>
                          setValue("binaryPlacement", side, { shouldValidate: true })
                        }
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-sm font-semibold transition-all duration-200",
                          binaryPlacement === side
                            ? "text-gold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        style={{
                          background:
                            binaryPlacement === side
                              ? "rgba(212,175,55,0.08)"
                              : "hsl(var(--muted) / 0.4)",
                          borderColor:
                            binaryPlacement === side
                              ? "#D4AF37"
                              : "hsl(var(--border))",
                        }}
                      >
                        <div className="flex items-center gap-1">
                          {side === "LEFT" ? (
                            <ChevronLeft className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </div>
                        {side}
                      </button>
                    ))}
                  </div>
                  {errors.binaryPlacement && (
                    <p className="text-xs" style={{ color: "#f87171" }}>
                      {errors.binaryPlacement.message}
                    </p>
                  )}
                </div>

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
                      <a
                        href="#"
                        className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: "#D4AF37" }}
                        onClick={(e) => e.preventDefault()}
                      >
                        Terms & Conditions
                      </a>{" "}
                      and{" "}
                      <a
                        href="#"
                        className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: "#D4AF37" }}
                        onClick={(e) => e.preventDefault()}
                      >
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

        {/* Navigation Buttons */}
        <div className={cn("flex gap-3 mt-7", step > 1 ? "justify-between" : "justify-end")}>
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={goPrev}
              className="gap-1.5"
            >
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
              className="gap-1.5 font-semibold flex-1"
              disabled={isSubmitting}
              style={{ background: "#D4AF37", color: "#050B1A" }}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </span>
              ) : (
                "Create Account"
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
        <Link
          href="/login"
          className="font-semibold transition-colors"
          style={{ color: "#D4AF37" }}
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
