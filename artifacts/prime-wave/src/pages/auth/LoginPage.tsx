import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { FormError } from "@/components/auth/FormError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

type LoginData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [formError, setFormError] = useState<string>();
  const { authLogin } = useAuth();
  const [, navigate] = useLocation();

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
    try {
      const result = await login(data.identifier, data.password);
      authLogin(result.token, result.user);
      navigate("/dashboard");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login failed. Please check your credentials.");
    }
  };

  return (
    <AuthCard>
      <AuthHeader
        title="Welcome back"
        subtitle="Sign in to your Prime Wave account"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Identifier */}
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email or Username</Label>
          <Input
            id="identifier"
            placeholder="you@example.com or @username"
            autoComplete="username email"
            aria-invalid={!!errors.identifier}
            {...register("identifier")}
          />
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
              className="text-xs font-medium transition-colors"
              style={{ color: "#D4AF37" }}
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
          className="w-full h-11 font-semibold text-sm transition-all"
          disabled={isSubmitting}
          style={{ background: "#D4AF37", color: "#050B1A" }}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in…
            </span>
          ) : (
            "Sign In"
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
          className="font-semibold transition-colors"
          style={{ color: "#D4AF37" }}
        >
          Create account
        </Link>
      </p>
    </AuthCard>
  );
}
