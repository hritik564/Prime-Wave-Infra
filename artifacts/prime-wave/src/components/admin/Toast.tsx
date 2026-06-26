import { useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warn" | "info";
export interface ToastItem { id: number; msg: string; type: ToastType }

const CFG: Record<ToastType, { icon: React.ElementType; color: string; border: string }> = {
  success: { icon: CheckCircle,   color: "#34d399", border: "rgba(52,211,153,0.3)"  },
  error:   { icon: XCircle,       color: "#f87171", border: "rgba(248,113,113,0.3)" },
  warn:    { icon: AlertTriangle,  color: "#fbbf24", border: "rgba(251,191,36,0.3)"  },
  info:    { icon: Info,           color: "#60a5fa", border: "rgba(96,165,250,0.3)"  },
};

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column-reverse", gap: 8, minWidth: 280, maxWidth: 400, pointerEvents: "none" }}>
      {toasts.map(t => {
        const c = CFG[t.type];
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "hsl(222 62% 10%)", border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.color}`, borderRadius: 10, padding: "11px 14px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", pointerEvents: "auto" }}>
            <c.icon size={15} style={{ color: c.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.87)", flex: 1, lineHeight: 1.45 }}>{t.msg}</span>
            <button onClick={() => onDismiss(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(170,179,197,0.48)", padding: 2, flexShrink: 0, display: "flex" }}><X size={12} /></button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toast = useCallback((msg: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, toast, dismiss };
}
