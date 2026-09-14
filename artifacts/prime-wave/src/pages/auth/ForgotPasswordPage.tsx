import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Loader2, CheckCircle2, ArrowLeft, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { FormError } from "@/components/auth/FormError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const forgotSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotData) => {
    setFormError(undefined);
    await new Promise((r) => setTimeout(r, 1500));
    setSubmittedEmail(data.email);
    setSubmitted(true);
  };

  return (
    <AuthCard>
      <AnimatePresence mode="wait">
        {submitted ? (
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
              Check your inbox
            </h2>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              We&apos;ve sent a password reset link to{" "}
              <span className="font-semibold text-foreground">{submittedEmail}</span>.
              <br />
              The link will expire in 15 minutes.
            </p>

            <div
              className="mt-6 rounded-lg px-4 py-3 text-xs text-left"
              style={{
                background: "rgba(82,230,224,0.06)",
                border: "1px solid rgba(82,230,224,0.14)",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                <span>Didn&apos;t receive the email? Check your spam folder or request a new link.</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSubmitted(false)}
              >
                Resend email
              </Button>
              <Link href="/login">
                <Button variant="ghost" className="w-full text-muted-foreground">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to sign in
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
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AuthHeader
              title="Forgot Password"
              subtitle="Enter your email and we'll send a reset link"
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
                    Sending…
                  </span>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>

            <p
              className="mt-6 text-center text-sm"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthCard>
  );
}
