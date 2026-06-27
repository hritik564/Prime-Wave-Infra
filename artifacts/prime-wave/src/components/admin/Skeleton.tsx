/**
 * Skeleton loaders for the admin panel.
 * Import SkeletonStyle once at your root (or in AdminLayout) to inject the CSS.
 */

import { memo } from "react";

/* ── CSS injection ─────────────────────────────────────────────────────────── */

export function SkeletonStyle() {
  return (
    <style>{`
      @keyframes _adm_shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position: 600px 0;  }
      }
      .adm-skeleton {
        background: linear-gradient(
          90deg,
          rgba(255,255,255,0.04) 25%,
          rgba(255,255,255,0.09) 50%,
          rgba(255,255,255,0.04) 75%
        );
        background-size: 600px 100%;
        animation: _adm_shimmer 1.6s ease-in-out infinite;
        border-radius: 6px;
      }
    `}</style>
  );
}

/* ── Base skeleton ─────────────────────────────────────────────────────────── */

interface SkeletonProps {
  width?:        number | string;
  height?:       number | string;
  borderRadius?: number | string;
  style?:        React.CSSProperties;
}

export const Skeleton = memo(function Skeleton({ width = "100%", height = 14, borderRadius = 6, style }: SkeletonProps) {
  return (
    <div
      className="adm-skeleton"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
    />
  );
});

/* ── Text block ────────────────────────────────────────────────────────────── */

export function SkeletonText({ lines = 1, widths }: { lines?: number; widths?: (string | number)[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={widths?.[i] ?? (i === lines - 1 && lines > 1 ? "60%" : "100%")} height={12} />
      ))}
    </div>
  );
}

/* ── Stat card ─────────────────────────────────────────────────────────────── */

export function SkeletonCard({ height = 100 }: { height?: number }) {
  return (
    <div style={{ background: "hsl(222 62% 9%)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 20px", height }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <Skeleton width={100} height={10} />
        <Skeleton width={32} height={32} borderRadius={8} />
      </div>
      <Skeleton width={80} height={22} style={{ marginBottom: 8 }} />
      <Skeleton width={120} height={10} />
    </div>
  );
}

/* ── Table rows ────────────────────────────────────────────────────────────── */

interface SkeletonRowsProps {
  rows?:    number;
  cols?:    number;
  cellH?:  number;
}

export const SkeletonRows = memo(function SkeletonRows({ rows = 8, cols = 6, cellH = 38 }: SkeletonRowsProps) {
  const BORDER = "rgba(255,255,255,0.07)";
  return (
    <>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri}>
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} style={{ padding: "0 14px", height: cellH, borderBottom: `1px solid ${BORDER}` }}>
              <Skeleton
                width={ci === 0 ? "70%" : ci === cols - 1 ? "40%" : `${50 + (ri + ci) % 3 * 15}%`}
                height={11}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
});

/* ── Drawer / detail skeleton ──────────────────────────────────────────────── */

export function SkeletonDrawer() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <Skeleton width={48} height={48} borderRadius={12} />
        <div style={{ flex: 1 }}>
          <Skeleton width="55%" height={16} style={{ marginBottom: 10 }} />
          <Skeleton width="35%" height={11} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px 16px" }}>
            <Skeleton width="40%" height={9} style={{ marginBottom: 8 }} />
            <Skeleton width="65%" height={13} />
          </div>
        ))}
      </div>
      <SkeletonText lines={3} widths={["100%","90%","60%"]} />
    </div>
  );
}

/* ── Stats grid skeleton ───────────────────────────────────────────────────── */

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 14, marginBottom: 24 }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
