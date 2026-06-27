/**
 * Unified confirmation dialog for all dangerous / irreversible admin actions.
 *
 * Usage:
 *   <ConfirmDialog
 *     open={!!pending}
 *     title="Suspend Member"
 *     message={`Suspend ${member.username}? They will lose access.`}
 *     variant="danger"
 *     confirmLabel="Suspend"
 *     loading={loading}
 *     onConfirm={handleConfirm}
 *     onCancel={() => setPending(null)}
 *   />
 */

import { useEffect, useRef, memo } from "react";
import { X, AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

const BORDER = "rgba(255,255,255,0.07)";
const MUTED  = "rgba(170,179,197,0.48)";

export type DialogVariant = "danger" | "warning" | "info" | "success";

const VARIANT_CFG: Record<DialogVariant, {
  icon:   React.ElementType;
  color:  string;
  btnBg:  string;
  btnBorder: string;
  iconBg: string;
}> = {
  danger:  { icon: AlertTriangle, color: "#f87171", btnBg: "rgba(248,113,113,0.12)", btnBorder: "rgba(248,113,113,0.4)", iconBg: "rgba(248,113,113,0.1)" },
  warning: { icon: AlertCircle,   color: "#fbbf24", btnBg: "rgba(251,191,36,0.12)",  btnBorder: "rgba(251,191,36,0.4)",  iconBg: "rgba(251,191,36,0.1)"  },
  info:    { icon: Info,          color: "#60a5fa", btnBg: "rgba(96,165,250,0.12)",  btnBorder: "rgba(96,165,250,0.4)",  iconBg: "rgba(96,165,250,0.1)"  },
  success: { icon: CheckCircle,   color: "#34d399", btnBg: "rgba(52,211,153,0.12)",  btnBorder: "rgba(52,211,153,0.4)",  iconBg: "rgba(52,211,153,0.1)"  },
};

interface ConfirmDialogProps {
  open:          boolean;
  title:         string;
  message:       React.ReactNode;
  variant?:      DialogVariant;
  confirmLabel?: string;
  cancelLabel?:  string;
  loading?:      boolean;
  onConfirm:     () => void;
  onCancel:      () => void;
  /** Extra content below the message (e.g. an input field for reason) */
  children?:     React.ReactNode;
}

export const ConfirmDialog = memo(function ConfirmDialog({
  open, title, message, variant = "danger",
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  loading = false, onConfirm, onCancel, children,
}: ConfirmDialogProps) {
  const cfg     = VARIANT_CFG[variant];
  const IconCmp = cfg.icon;
  const btnRef  = useRef<HTMLButtonElement>(null);

  // Focus confirm button on open; close on Esc
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => btnRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey); };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)" }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={{
          position:     "fixed",
          top:          "50%",
          left:         "50%",
          transform:    "translate(-50%,-50%)",
          zIndex:       401,
          background:   "hsl(222 62% 10%)",
          border:       `1px solid ${BORDER}`,
          borderRadius: 16,
          width:        440,
          maxWidth:     "calc(100vw - 32px)",
          padding:      "28px 28px 24px",
          boxShadow:    "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Icon + title */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: cfg.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <IconCmp size={18} style={{ color: cfg.color }} />
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <div id="confirm-dialog-title" style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.92)", marginBottom: 6 }}>
              {title}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>
              {message}
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 2, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Optional extra content */}
        {children && <div style={{ marginBottom: 20 }}>{children}</div>}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex:         1,
              padding:      "10px 0",
              background:   "rgba(255,255,255,0.04)",
              border:       `1px solid ${BORDER}`,
              borderRadius: 9,
              cursor:       "pointer",
              fontSize:     12,
              fontWeight:   600,
              color:        MUTED,
              opacity:      loading ? 0.5 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={btnRef}
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex:         1,
              padding:      "10px 0",
              background:   cfg.btnBg,
              border:       `1px solid ${cfg.btnBorder}`,
              borderRadius: 9,
              cursor:       loading ? "not-allowed" : "pointer",
              fontSize:     12,
              fontWeight:   700,
              color:        cfg.color,
              opacity:      loading ? 0.6 : 1,
            }}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
});
