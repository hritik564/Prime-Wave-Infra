import { useRef, useCallback } from "react";
import { Handle, Position, type NodeTypes } from "@xyflow/react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.45)";

function initials(first: string, last: string) {
  return `${first[0] ?? "?"}${last[0] ?? ""}`.toUpperCase();
}

export interface TreeNodeData extends Record<string, unknown> {
  id:                  string;
  username:            string;
  firstName:           string;
  lastName:            string;
  status:              string;
  position:            "LEFT" | "RIGHT" | null;
  directReferralCount: number;
  depth:               number;
  onSelect?:           (data: TreeNodeData) => void;
}

function statusRing(status: string): string {
  switch (status) {
    case "ACTIVE":    return "#34d399";
    case "SUSPENDED": return "#f87171";
    default:          return "rgba(170,179,197,0.25)";
  }
}

function statusBadge(status: string): { label: string; bg: string; color: string } {
  switch (status) {
    case "ACTIVE":    return { label: "ACTIVE",   bg: "rgba(52,211,153,0.12)",  color: "#34d399" };
    case "INACTIVE":  return { label: "INACTIVE", bg: "rgba(170,179,197,0.09)", color: "rgba(170,179,197,0.55)" };
    case "SUSPENDED": return { label: "SUSPEND",  bg: "rgba(248,113,113,0.12)", color: "#f87171" };
    default:          return { label: status,     bg: "rgba(212,175,55,0.1)",   color: GOLD };
  }
}

function rankFromRefs(n: number): { label: string; color: string; bg: string } {
  if (n >= 10) return { label: "VIP",    color: GOLD_L,      bg: "rgba(212,175,55,0.14)" };
  if (n >= 6)  return { label: "GOLD",   color: GOLD,        bg: "rgba(212,175,55,0.1)"  };
  if (n >= 3)  return { label: "SILVER", color: "#94a3b8",   bg: "rgba(148,163,184,0.1)" };
  if (n >= 1)  return { label: "BRONZE", color: "#c97c3a",   bg: "rgba(201,124,58,0.1)"  };
  return              { label: "NEW",    color: "#60a5fa",   bg: "rgba(96,165,250,0.1)"  };
}

// ── Root Node ──────────────────────────────────────────────────────────────────
function RootNode({ data }: { data: TreeNodeData }) {
  return (
    <div style={{
      background: "linear-gradient(135deg,rgba(212,175,55,0.13) 0%,rgba(212,175,55,0.04) 100%)",
      border: "1.5px solid rgba(212,175,55,0.45)",
      borderRadius: 11, padding: "8px 11px", minWidth: 148,
      boxShadow: "0 0 22px rgba(212,175,55,0.16),0 4px 16px rgba(0,0,0,0.45)",
    }}>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(212,175,55,0.55)", width: 6, height: 6, border: "none" }} />

      {/* Row 1 */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 15,
            background: "rgba(212,175,55,0.13)",
            border: `2px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: GOLD_L, fontSize: 10, fontWeight: 800,
          }}>{initials(data.firstName, data.lastName)}</div>
          <div style={{
            position: "absolute", bottom: 0, right: 0,
            width: 7, height: 7, borderRadius: "50%",
            background: "#34d399", border: "1.5px solid hsl(221 59% 8%)",
          }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: GOLD_L }}>You</span>
            <span style={{
              fontSize: 7, fontWeight: 700, letterSpacing: "0.06em",
              color: GOLD, background: "rgba(212,175,55,0.13)",
              padding: "2px 5px", borderRadius: 4,
            }}>ROOT</span>
          </div>
          <div style={{ fontSize: 8, color: "rgba(212,175,55,0.45)", marginTop: 1 }}>
            @{data.username}
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div style={{
        fontSize: 8, color: "rgba(212,175,55,0.4)", textAlign: "center",
        background: "rgba(212,175,55,0.04)", borderRadius: 5,
        padding: "3px 0",
      }}>
        👥 {data.directReferralCount} direct ref{data.directReferralCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ── Member Node ────────────────────────────────────────────────────────────────
function MemberNode({ data }: { data: TreeNodeData }) {
  const cardRef  = useRef<HTMLDivElement>(null);
  const isLeft   = data.position === "LEFT";
  const armColor = isLeft ? "#60a5fa" : "#a78bfa";
  const badge    = statusBadge(data.status);
  const rank     = rankFromRefs(data.directReferralCount);
  const ring     = statusRing(data.status);

  const onEnter = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform   = "translateY(-3px)";
    el.style.borderColor = isLeft ? "rgba(96,165,250,0.38)" : "rgba(167,139,250,0.38)";
    el.style.boxShadow   = `0 10px 30px rgba(0,0,0,0.5),0 0 18px ${armColor}28`;
  }, [isLeft, armColor]);

  const onLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform   = "translateY(0)";
    el.style.borderColor = "rgba(255,255,255,0.07)";
    el.style.boxShadow   = "0 4px 16px rgba(0,0,0,0.38)";
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: "hsl(221 59% 8%)",
        border: "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 11, padding: "7px 10px", minWidth: 148,
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.38)",
        transition: "transform 0.18s ease,border-color 0.18s ease,box-shadow 0.18s ease",
      }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "rgba(255,255,255,0.1)", width: 5, height: 5, border: "none" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.1)", width: 5, height: 5, border: "none" }} />

      {/* Row 1: Avatar · Username · Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            background: "rgba(212,175,55,0.08)",
            border: `2px solid ${ring}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: GOLD, fontSize: 9, fontWeight: 800,
          }}>{initials(data.firstName, data.lastName)}</div>
          <div style={{
            position: "absolute", bottom: 0, right: 0,
            width: 7, height: 7, borderRadius: "50%",
            background: ring, border: "1.5px solid hsl(221 59% 8%)",
          }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 3 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.88)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: 72,
            }}>@{data.username}</div>
            <div style={{
              fontSize: 7, fontWeight: 700, letterSpacing: "0.05em",
              color: badge.color, background: badge.bg,
              padding: "2px 5px", borderRadius: 4, flexShrink: 0,
            }}>{badge.label}</div>
          </div>
          <div style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>
            👥 {data.directReferralCount} ref{data.directReferralCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Row 2: Metric boxes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 5 }}>
        <div style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.055)",
          borderRadius: 6, padding: "4px 6px", textAlign: "center",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.65)", lineHeight: 1.2 }}>—</div>
          <div style={{ fontSize: 7, color: MUTED, letterSpacing: "0.04em", marginTop: 1 }}>INVEST</div>
        </div>
        <div style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.055)",
          borderRadius: 6, padding: "4px 6px", textAlign: "center",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.65)", lineHeight: 1.2 }}>— BV</div>
          <div style={{ fontSize: 7, color: MUTED, letterSpacing: "0.04em", marginTop: 1 }}>BV VALUE</div>
        </div>
      </div>

      {/* Row 3: Rank pill · Arm badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <div style={{
          fontSize: 7, fontWeight: 700, letterSpacing: "0.05em",
          color: rank.color, background: rank.bg,
          padding: "2px 6px", borderRadius: 4,
        }}>{rank.label}</div>
        <div style={{
          fontSize: 7, fontWeight: 700, letterSpacing: "0.05em",
          color: armColor,
          background: isLeft ? "rgba(96,165,250,0.09)" : "rgba(167,139,250,0.09)",
          padding: "2px 6px", borderRadius: 4,
        }}>{data.position ?? "—"} ARM</div>
      </div>
    </div>
  );
}

// ── Empty Slot Node ────────────────────────────────────────────────────────────
function EmptySlotNode({ data }: { data: Record<string, unknown> & { side: string } }) {
  const cardRef  = useRef<HTMLDivElement>(null);
  const isLeft   = data.side === "LEFT";
  const color    = isLeft ? "#60a5fa" : "#a78bfa";
  const baseBorder = isLeft ? "rgba(96,165,250,0.18)" : "rgba(167,139,250,0.18)";

  const onEnter = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.borderColor = GOLD;
    el.style.boxShadow   = "0 0 14px rgba(212,175,55,0.14)";
    el.style.background  = "rgba(212,175,55,0.035)";
  }, []);

  const onLeave = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.borderColor = baseBorder;
    el.style.boxShadow   = "none";
    el.style.background  = "rgba(255,255,255,0.012)";
  }, [baseBorder]);

  return (
    <div
      ref={cardRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: "rgba(255,255,255,0.012)",
        border: `1px dashed ${baseBorder}`,
        borderRadius: 10, padding: "9px 12px", minWidth: 108,
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 5, transition: "all 0.18s ease", cursor: "default",
      }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "rgba(255,255,255,0.07)", width: 5, height: 5, border: "none" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.07)", width: 5, height: 5, border: "none" }} />

      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        border: `1.5px dashed ${color}45`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: `${color}65`, fontSize: 15, fontWeight: 300, lineHeight: 1,
      }}>+</div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: `${color}75`, letterSpacing: "0.05em" }}>
          INVITE MEMBER
        </div>
        <div style={{ fontSize: 7, color: `${color}45`, marginTop: 3, letterSpacing: "0.04em", fontWeight: 600 }}>
          {data.side} POSITION
        </div>
      </div>
    </div>
  );
}

export const nodeTypes: NodeTypes = {
  rootNode:   RootNode      as never,
  memberNode: MemberNode    as never,
  emptySlot:  EmptySlotNode as never,
};
