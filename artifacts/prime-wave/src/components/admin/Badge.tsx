/**
 * Unified admin status badge.
 * All status colors are defined here — import this everywhere instead of
 * using inline colour literals so the whole admin panel stays consistent.
 */

export type BadgeStatus =
  | "ACTIVE"  | "INACTIVE"  | "SUSPENDED" | "BLOCKED"
  | "PENDING" | "APPROVED"  | "COMPLETED" | "SUCCESS"
  | "REJECTED"| "FAILED"    | "CANCELLED" | "HELD"
  | "ARCHIVED"| "DISABLED"  | "RUNNING"   | "IDLE"
  | "VERIFIED"| "UNSUBMITTED"
  | string;   // graceful fallback

const STATUS_MAP: Record<string, { color: string; bg: string }> = {
  // ── Green ────────────────────────────────────────────────────────────────
  ACTIVE:       { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  APPROVED:     { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  COMPLETED:    { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  SUCCESS:      { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  VERIFIED:     { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  RUNNING:      { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  // ── Yellow ───────────────────────────────────────────────────────────────
  PENDING:      { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  HELD:         { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  IDLE:         { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  // ── Red ──────────────────────────────────────────────────────────────────
  REJECTED:     { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  FAILED:       { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  CANCELLED:    { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  SUSPENDED:    { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  BLOCKED:      { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  // ── Gray ─────────────────────────────────────────────────────────────────
  INACTIVE:     { color: "rgba(170,179,197,0.6)", bg: "rgba(170,179,197,0.08)" },
  DISABLED:     { color: "rgba(170,179,197,0.6)", bg: "rgba(170,179,197,0.08)" },
  ARCHIVED:     { color: "rgba(170,179,197,0.6)", bg: "rgba(170,179,197,0.08)" },
  UNSUBMITTED:  { color: "rgba(170,179,197,0.6)", bg: "rgba(170,179,197,0.08)" },
};

const FALLBACK = { color: "rgba(170,179,197,0.6)", bg: "rgba(170,179,197,0.08)" };

type BadgeSize = "xs" | "sm" | "md";

const SIZE_STYLE: Record<BadgeSize, { fontSize: number; padding: string; borderRadius: number }> = {
  xs: { fontSize: 9,  padding: "1px 6px",   borderRadius: 4 },
  sm: { fontSize: 10, padding: "3px 8px",   borderRadius: 5 },
  md: { fontSize: 11, padding: "4px 10px",  borderRadius: 6 },
};

interface BadgeProps {
  status: BadgeStatus;
  /** Override the display text (defaults to the status value) */
  label?: string;
  size?: BadgeSize;
  style?: React.CSSProperties;
}

export function Badge({ status, label, size = "sm", style }: BadgeProps) {
  const c = STATUS_MAP[status.toUpperCase()] ?? FALLBACK;
  const s = SIZE_STYLE[size];
  return (
    <span style={{
      display:        "inline-flex",
      alignItems:     "center",
      fontWeight:     700,
      letterSpacing:  "0.03em",
      whiteSpace:     "nowrap",
      color:          c.color,
      background:     c.bg,
      fontSize:       s.fontSize,
      padding:        s.padding,
      borderRadius:   s.borderRadius,
      ...style,
    }}>
      {label ?? status}
    </span>
  );
}

/** Returns the raw colour & background for a status — use when you need the
 *  values but can't use the Badge component directly. */
export function statusStyle(status: string) {
  return STATUS_MAP[status.toUpperCase()] ?? FALLBACK;
}
