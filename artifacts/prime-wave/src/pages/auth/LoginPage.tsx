import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useSearch } from "wouter";
import { Loader2, Mail, UserRound, ArrowRight } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FormError } from "@/components/auth/FormError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ApiRequestError, login, adminLogin } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import type { StoredUser } from "@/lib/auth";
import FirstLoginPasswordChange from "./FirstLoginPasswordChange";

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

type LoginData = z.infer<typeof loginSchema>;

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function LoginPage() {
  const [formError, setFormError] = useState<string>();
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const { authLogin } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();

  const redirect = (() => {
    const params = new URLSearchParams(search);
    return params.get("redirect") ?? null;
  })();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  });

  const rememberMe = watch("rememberMe");

  const onSubmit = async (data: LoginData) => {
    setFormError(undefined);

    /* ── Try user login first ── */
    try {
      const result = await login(data.identifier, data.password);
      const storedUser: StoredUser = {
        ...result.user,
        type: "user",
      };
      authLogin(result.token, storedUser);
      navigate(redirect ?? "/dashboard");
      return;
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "PASSWORD_RESET_REQUIRED") {
        setPasswordResetRequired(true);
        return;
      }
      /* user login failed — fall through to admin login if identifier is an email */
    }

    /* ── Fallback: try admin login (requires email, not username) ── */
    if (isEmail(data.identifier)) {
      try {
        const result = await adminLogin(data.identifier, data.password);
        const storedUser: StoredUser = {
          id: result.admin.id,
          email: result.admin.email,
          username: result.admin.email,
          firstName: result.admin.firstName,
          lastName: result.admin.lastName,
          type: "admin",
          role: result.admin.role,
        };
        authLogin(result.token, storedUser);
        navigate("/admin");
        return;
      } catch {
        /* admin login also failed */
      }
    }

    setFormError("Invalid credentials. Please check your email/username and password.");
  };

  if (passwordResetRequired) {
    return (
      <FirstLoginPasswordChange
        onComplete={(result) => {
          authLogin(result.token, { ...result.user, type: "user" });
          navigate(redirect ?? "/dashboard");
        }}
      />
    );
  }

  return (
    <AuthCard centerOnMobile>
      <AuthHeader
        title="Welcome back."
        subtitle="Enter your credentials to access your PrimeWave account."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="auth-form space-y-5" noValidate>
        {/* Identifier */}
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email or Username</Label>
          <div className="auth-input-wrap">
            <span className="auth-input-icon" aria-hidden="true">
              {isEmail(watch("identifier") ?? "") ? <Mail /> : <UserRound />}
            </span>
            <Input
              id="identifier"
              className="auth-input pl-10"
              placeholder="you@example.com or @username"
              autoComplete="username email"
              aria-invalid={!!errors.identifier}
              {...register("identifier")}
            />
          </div>
          {errors.identifier && (
            <p className="text-xs" style={{ color: "#f87171" }}>
              {errors.identifier.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="auth-link text-xs font-medium transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs" style={{ color: "#f87171" }}>
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Remember Me */}
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="rememberMe"
            checked={rememberMe}
            onCheckedChange={(checked) =>
              setValue("rememberMe", checked === true)
            }
          />
          <Label
            htmlFor="rememberMe"
            className="font-normal cursor-pointer"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            Remember me for 30 days
          </Label>
        </div>

        {/* Form Error */}
        <FormError message={formError} />

        {/* Submit */}
        <Button
          type="submit"
          className="auth-submit w-full h-12 font-semibold text-sm transition-all"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in…
            </span>
          ) : (
            <>
              Sign In
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p
        className="mt-6 text-center text-sm"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="auth-link font-semibold transition-colors"
        >
          Create account <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
        </Link>
      </p>
    </AuthCard>
  );
}
