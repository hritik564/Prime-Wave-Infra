/**
 * Standardised admin page header.
 * Every admin page should start with this component.
 */

import { memo } from "react";

const MUTED  = "rgba(170,179,197,0.48)";

interface PageHeaderProps {
  title:        string;
  subtitle?:    string;
  actions?:     React.ReactNode;
  badge?:       React.ReactNode;
}

export const PageHeader = memo(function PageHeader({ title, subtitle, actions, badge }: PageHeaderProps) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "flex-start",
      justifyContent: "space-between",
      marginBottom:   24,
      gap:            16,
      flexWrap:       "wrap",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{
            margin:     0,
            fontSize:   20,
            fontWeight: 800,
            color:      "rgba(255,255,255,0.92)",
            lineHeight: 1.3,
          }}>
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p style={{ margin: "5px 0 0", fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
});

/* ── Reusable header action button ─────────────────────────────────────────── */

interface HeaderBtnProps {
  icon?:      React.ReactNode;
  label:      string;
  onClick?:   () => void;
  variant?:   "default" | "primary" | "danger";
  disabled?:  boolean;
}

const BTN_VARIANTS = {
  default: {
    background: "rgba(255,255,255,0.05)",
    border:     "1px solid rgba(255,255,255,0.07)",
    color:      "rgba(255,255,255,0.7)",
  },
  primary: {
    background: "rgba(212,175,55,0.1)",
    border:     "1px solid rgba(212,175,55,0.25)",
    color:      "#F3D37A",
  },
  danger: {
    background: "rgba(248,113,113,0.08)",
    border:     "1px solid rgba(248,113,113,0.2)",
    color:      "#f87171",
  },
};

export const HeaderBtn = memo(function HeaderBtn({ icon, label, onClick, variant = "default", disabled }: HeaderBtnProps) {
  const v = BTN_VARIANTS[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        6,
        padding:    "7px 13px",
        borderRadius: 8,
        cursor:     disabled ? "not-allowed" : "pointer",
        fontSize:   11,
        fontWeight: 600,
        opacity:    disabled ? 0.5 : 1,
        ...v,
      }}
    >
      {icon}
      {label}
    </button>
  );
});
