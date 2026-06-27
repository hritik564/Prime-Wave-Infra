/**
 * Composable table utilities for admin tables.
 *
 * Usage:
 *   <TableToolbar>
 *     <TableSearch value={q} onChange={setQ} placeholder="Search…" />
 *     <TableFilter …/>
 *   </TableToolbar>
 *   <table>
 *     <tbody>
 *       {loading ? <SkeletonRows cols={6} /> : rows.map(…)}
 *       {!loading && rows.length === 0 && <EmptyRow cols={6} />}
 *     </tbody>
 *   </table>
 *   <TablePagination page={p} pageSize={ps} total={total} … />
 */

import { memo, useRef, useEffect } from "react";
import { Search, X, ChevronLeft, ChevronRight, InboxIcon } from "lucide-react";
import { SkeletonRows } from "./Skeleton";

const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

/* ── Toolbar wrapper ────────────────────────────────────────────────────────── */

export function TableToolbar({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            10,
      marginBottom:   14,
      flexWrap:       "wrap",
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ── Search bar ─────────────────────────────────────────────────────────────── */

interface TableSearchProps {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  style?:       React.CSSProperties;
  autoFocus?:   boolean;
}

export const TableSearch = memo(function TableSearch({ value, onChange, placeholder = "Search…", style, autoFocus }: TableSearchProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        8,
      background: "rgba(255,255,255,0.04)",
      border:     `1px solid ${BORDER}`,
      borderRadius: 8,
      padding:    "6px 10px",
      flex:       1,
      maxWidth:   300,
      ...style,
    }}>
      <Search size={13} style={{ color: MUTED, flexShrink: 0 }} />
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: "none",
          border:     "none",
          outline:    "none",
          fontSize:   12,
          color:      "rgba(255,255,255,0.8)",
          width:      "100%",
        }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0, display: "flex" }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
});

/* ── Pagination ─────────────────────────────────────────────────────────────── */

interface PaginationProps {
  page:             number;
  pageSize:         number;
  total:            number;
  onPageChange:     (p: number) => void;
  onPageSizeChange?:(ps: number) => void;
  pageSizeOptions?: number[];
}

export const TablePagination = memo(function TablePagination({
  page, pageSize, total, onPageChange, onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to   = Math.min(page * pageSize, total);

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        "12px 16px",
      borderTop:      `1px solid ${BORDER}`,
      flexWrap:       "wrap",
      gap:            10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 12, color: MUTED }}>
          {total === 0 ? "No results" : `${from}–${to} of ${total.toLocaleString()}`}
        </span>
        {onPageSizeChange && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: MUTED }}>Rows</span>
            <select
              value={pageSize}
              onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
              style={{
                background:   CARD,
                border:       `1px solid ${BORDER}`,
                borderRadius: 6,
                color:        "rgba(255,255,255,0.7)",
                fontSize:     11,
                padding:      "3px 6px",
                cursor:       "pointer",
              }}
            >
              {pageSizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          style={navBtnStyle(page <= 1)}
        >«</button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={navBtnStyle(page <= 1)}
        ><ChevronLeft size={13} /></button>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", padding: "0 4px", whiteSpace: "nowrap" }}>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={navBtnStyle(page >= totalPages)}
        ><ChevronRight size={13} /></button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          style={navBtnStyle(page >= totalPages)}
        >»</button>
      </div>
    </div>
  );
});

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center",
    minWidth:     28,
    height:       28,
    background:   disabled ? "transparent" : "rgba(255,255,255,0.04)",
    border:       `1px solid ${BORDER}`,
    borderRadius: 6,
    cursor:       disabled ? "not-allowed" : "pointer",
    color:        disabled ? MUTED : "rgba(255,255,255,0.7)",
    fontSize:     11,
    fontWeight:   600,
    opacity:      disabled ? 0.4 : 1,
  };
}

/* ── Empty state row ────────────────────────────────────────────────────────── */

export function EmptyRow({ cols, message = "No results found", subtext }: { cols: number; message?: string; subtext?: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <InboxIcon size={22} style={{ color: MUTED }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>{message}</div>
          {subtext && <div style={{ fontSize: 11, color: MUTED }}>{subtext}</div>}
        </div>
      </td>
    </tr>
  );
}

/* ── Error state row ────────────────────────────────────────────────────────── */

export function ErrorRow({ cols, message = "Failed to load data", onRetry }: { cols: number; message?: string; onRetry?: () => void }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#f87171", marginBottom: 10 }}>{message}</div>
        {onRetry && (
          <button onClick={onRetry} style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 7, padding: "5px 14px", cursor: "pointer" }}>
            Retry
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── Re-export SkeletonRows for convenience ─────────────────────────────────── */
export { SkeletonRows };

/* ── Sort indicator ─────────────────────────────────────────────────────────── */

export function SortIcon({ active, dir }: { active: boolean; dir?: "asc" | "desc" }) {
  if (!active) return <span style={{ color: MUTED, fontSize: 9, marginLeft: 4 }}>↕</span>;
  return <span style={{ color: "#60a5fa", fontSize: 9, marginLeft: 4 }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

/* ── Table wrapper card ─────────────────────────────────────────────────────── */

export function TableCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background:   CARD,
      border:       `1px solid ${BORDER}`,
      borderRadius: 14,
      overflow:     "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}
