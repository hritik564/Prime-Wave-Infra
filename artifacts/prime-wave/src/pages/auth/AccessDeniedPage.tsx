import { ShieldOff } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";

export default function AccessDeniedPage() {
  const { isAuthenticated, isAdmin, authLogout } = useAuth();
  const [, navigate] = useLocation();

  const handleGoBack = () => {
    if (isAdmin) navigate("/admin");
    else if (isAuthenticated) navigate("/dashboard");
    else navigate("/login");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "hsl(222 62% 7%)" }}
    >
      <div className="flex flex-col items-center text-center max-w-sm w-full">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl mb-6"
          style={{
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)",
          }}
        >
          <ShieldOff className="h-9 w-9" style={{ color: "#f87171" }} />
        </div>

        <h1
          className="text-3xl font-bold font-heading mb-2"
          style={{ color: "#f87171" }}
        >
          Access Denied
        </h1>

        <p
          className="text-sm mb-1 font-semibold tracking-widest uppercase"
          style={{ color: "rgba(170,179,197,0.48)" }}
        >
          403 — Unauthorized
        </p>

        <p
          className="mt-4 text-sm leading-relaxed"
          style={{ color: "rgba(170,179,197,0.7)" }}
        >
          You don&apos;t have permission to access this page. If you believe
          this is a mistake, contact your administrator.
        </p>

        <div className="flex gap-3 mt-8 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleGoBack}
          >
            Go to Dashboard
          </Button>
          {isAuthenticated && (
            <Button
              variant="ghost"
              className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-950/20"
              onClick={authLogout}
            >
              Sign Out
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
