import { useState } from "react";
import { Handle, Position, type NodeTypes } from "@xyflow/react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.55)";

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
  faded:               boolean;
  onSelect?:           (data: TreeNodeData) => void;
}

function RootNode({ data }: { data: TreeNodeData }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg,rgba(212,175,55,0.16) 0%,rgba(212,175,55,0.06) 100%)",
        border: "2px solid rgba(212,175,55,0.55)", borderRadius: 14,
        padding: "10px 14px", minWidth: 155,
        boxShadow: "0 0 28px rgba(212,175,55,0.2),0 4px 20px rgba(0,0,0,0.5)",
        opacity: data.faded ? 0.18 : 1,
        transition: "opacity 0.18s ease",
      }}>
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(212,175,55,0.6)", width: 8, height: 8, border: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 15, flexShrink: 0,
          background: "rgba(212,175,55,0.15)", border: "1px solid rgba(212,175,55,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: GOLD_L, fontSize: 10, fontWeight: 800,
        }}>{initials(data.firstName, data.lastName)}</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD_L, lineHeight: 1.2 }}>You</div>
          <div style={{ fontSize: 9, color: "rgba(212,175,55,0.5)", lineHeight: 1.3 }}>@{data.username}</div>
        </div>
      </div>
      <div style={{ marginTop: 7, fontSize: 9, color: "rgba(212,175,55,0.5)", textAlign: "center" }}>
        {data.directReferralCount} direct ref{data.directReferralCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function MemberNode({ data }: { data: TreeNodeData }) {
  const [hovered, setHovered] = useState(false);
  const isActive = data.status === "ACTIVE";
  const isLeft   = data.position === "LEFT";
  const armColor = isLeft ? "#60a5fa" : "#a78bfa";
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => data.onSelect?.(data)}
      style={{
        background: "hsl(221 59% 10%)",
        border: `1.5px solid ${hovered ? armColor : isActive ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.09)"}`,
        borderRadius: 12, padding: "8px 12px", minWidth: 140,
        cursor: "pointer",
        boxShadow: hovered
          ? `0 8px 28px rgba(0,0,0,0.55),0 0 16px ${armColor}28`
          : "0 4px 18px rgba(0,0,0,0.4)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        opacity: data.faded ? 0.18 : 1,
        transition: "border-color 0.18s,box-shadow 0.18s,transform 0.18s,opacity 0.18s",
      }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "rgba(255,255,255,0.15)", width: 6, height: 6, border: "none" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.15)", width: 6, height: 6, border: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: GOLD, fontSize: 9, fontWeight: 800,
          }}>{initials(data.firstName, data.lastName)}</div>
          <div style={{
            position: "absolute", bottom: 0, right: 0, width: 7, height: 7,
            borderRadius: "50%", background: isActive ? "#34d399" : "rgba(170,179,197,0.3)",
            border: "1.5px solid hsl(221 59% 10%)",
          }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))", lineHeight: 1.2 }}>
            @{data.username}
          </div>
          <div style={{ fontSize: 9, color: MUTED, lineHeight: 1.3, marginTop: 1 }}>
            {data.directReferralCount} ref{data.directReferralCount !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
        color: armColor,
        background: isLeft ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)",
        padding: "2px 6px", borderRadius: 4,
      }}>
        {data.position ?? "—"} ARM
      </span>
    </div>
  );
}

function EmptySlotNode({ data }: { data: Record<string, unknown> & { side: string } }) {
  const [hovered, setHovered] = useState(false);
  const isLeft = data.side === "LEFT";
  const color  = isLeft ? "#60a5fa" : "#a78bfa";
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? (isLeft ? "rgba(96,165,250,0.05)" : "rgba(167,139,250,0.05)") : "rgba(255,255,255,0.015)",
        border: `1px dashed ${hovered ? color : isLeft ? "rgba(96,165,250,0.2)" : "rgba(167,139,250,0.2)"}`,
        borderRadius: 12, padding: "10px 16px", minWidth: 128,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 5,
        transition: "all 0.2s ease",
        cursor: "default",
      }}>
      <Handle type="target" position={Position.Top}
        style={{ background: "rgba(255,255,255,0.08)", width: 6, height: 6, border: "none" }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: "rgba(255,255,255,0.08)", width: 6, height: 6, border: "none" }} />
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        border: `1.5px dashed ${color}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: `${color}70`, fontSize: 14, fontWeight: 300,
      }}>+</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: `${color}70`, letterSpacing: "0.04em" }}>
          Open Position
        </div>
        <div style={{ fontSize: 8, color: `${color}45`, marginTop: 1 }}>
          {data.side} arm
        </div>
      </div>
    </div>
  );
}

export const nodeTypes: NodeTypes = {
  rootNode:   RootNode   as never,
  memberNode: MemberNode as never,
  emptySlot:  EmptySlotNode as never,
};
