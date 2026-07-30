import { useState } from "react";
import { useAuth } from "@/providers/AuthProvider";

export default function ImpersonationBanner() {
  const { isImpersonating, user, exitImpersonation } = useAuth();
  const [exiting, setExiting] = useState(false);

  if (!isImpersonating) return null;

  async function handleExit() {
    if (exiting) return;
    setExiting(true);
    try {
      await exitImpersonation();
    } finally {
      setExiting(false);
    }
  }

  return (
    <div
      style={{
        background:     "linear-gradient(135deg, #b91c1c, #ea580c)",
        color:          "#fff",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "10px 20px",
        gap:            12,
        flexShrink:     0,
        boxShadow:      "0 2px 12px rgba(0,0,0,0.4)",
        zIndex:         50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.01em" }}>
            Impersonated Session
          </span>
          <span style={{ fontSize: 11, opacity: 0.85 }}>
            You are viewing{" "}
            <strong>@{user?.username ?? "user"}</strong>'s account as Super Admin.
            All actions are logged.
          </span>
        </div>
      </div>

      <button
        onClick={handleExit}
        disabled={exiting}
        style={{
          flexShrink:   0,
          background:   "rgba(255,255,255,0.15)",
          border:       "1px solid rgba(255,255,255,0.45)",
          borderRadius: 8,
          color:        "#fff",
          padding:      "7px 18px",
          fontSize:     12,
          fontWeight:   700,
          cursor:       exiting ? "not-allowed" : "pointer",
          whiteSpace:   "nowrap",
          opacity:      exiting ? 0.6 : 1,
          transition:   "opacity 0.15s",
        }}
      >
        {exiting ? "Exiting…" : "Exit Impersonation"}
      </button>
    </div>
  );
}
