import { forwardRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = useState(false);

    return (
      <div className="auth-password-wrap relative">
        <span className="auth-input-icon" aria-hidden="true">
          <LockKeyhole />
        </span>
        <Input
          type={show ? "text" : "password"}
          className={cn("auth-input pl-10 pr-10", className)}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: "hsl(var(--muted-foreground))" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "hsl(var(--foreground))")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "hsl(var(--muted-foreground))")
          }
        >
          {show ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
