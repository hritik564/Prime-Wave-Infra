import { useState, useCallback, useEffect, useRef } from "react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  Package, Zap, BarChart2, TrendingUp, DollarSign, Award,
  Wallet, Shield, Globe, Edit2, Check,
  X, ChevronRight, RotateCcw, Eye, Download,
  CheckCircle, AlertTriangle, Lock, Info,
} from "lucide-react";
import {
  adminGetPlans,
  adminUpdatePlanStatus,
  adminUpdatePlanConfig,
  adminGetPlanConfig,
  adminSaveConfigField,
  adminGetConfigVersions,
  adminGetConfigAudit,
  adminGetLevelConfig,
  adminSaveLevelConfig,
  adminGetSalaryRanks,
  adminUpdateSalaryRank,
  type PlanConfigSections,
  type PlanVersionEntry,
  type PlanAuditEntry,
  type LevelConfigItem,
  type SalaryRankItem,
} from "@/lib/api";

// ─── Design tokens ──────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Types ──────────────────────────────────────────────────────────────────
type PlanStatus = "ACTIVE" | "INACTIVE";
interface Plan {
  id: string; name: string; color: string;
  minInvest: number; maxInvest: number | null;
  roi: number; duration: number;
  status: PlanStatus; members: number;
}
interface ConfigField { key: string; label: string; value: string; unit?: string; type: "text" | "number" | "toggle"; description?: string }
interface AuditEntry  { id: string; timestamp: Date; admin: string; configName: string; oldValue: string; newValue: string; reason: string }
interface ConfigVersion { id: string; version: string; publishedBy: string; publishedAt: Date; changeCount: number }
interface ConfirmPending { configName: string; oldValue: string; newValue: string; onConfirm: (reason: string) => Promise<void> }

type SectionId = "plans" | "roi" | "binary" | "orbit" | "level" | "salary" | "ranks" | "wallet" | "limits" | "global";
type ConfigState = Record<SectionId, ConfigField[]>;

// ─── Rank display metadata ──────────────────────────────────────────────────
const RANK_META: Record<string, { color: string; benefits: string[] }> = {
  "Bronze":         { color: "#cd7f32", benefits: ["Level 1–2 income","Binary eligible","Standard support"] },
  "Silver":         { color: "#c0c0c0", benefits: ["Level 1–3 income","Binary + Orbit eligible","Standard support"] },
  "Gold":           { color: "#D4AF37", benefits: ["Level 1–5 income","All binary types","Priority queue"] },
  "Platinum":       { color: "#e5e4e2", benefits: ["Level 1–6 income","All binary types","Priority processing"] },
  "Sapphire":       { color: "#0f52ba", benefits: ["Level 1–7 income","Salary eligible","Fast withdrawal"] },
  "Ruby":           { color: "#e0115f", benefits: ["Level 1–8 income","Salary + Orbit bonus","Dedicated support"] },
  "Emerald":        { color: "#50c878", benefits: ["Level 1–9 income","All income types","Senior support"] },
  "Diamond":        { color: "#a5f3fc", benefits: ["Level 1–9 income","All income types","VIP status","Priority withdrawal"] },
  "Ambassador":     { color: "#a78bfa", benefits: ["All income types","Dedicated manager","Ambassador badge","Board updates"] },
  "Sovereign Crown":{ color: GOLD,      benefits: ["All income types","Board access","Crown ceremony invite","Maximum salary"] },
};

// ─── Nav items ──────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: SectionId; icon: React.ElementType; label: string }[] = [
  { id: "plans",  icon: Package,    label: "Investment Plans"   },
  { id: "roi",    icon: TrendingUp, label: "ROI Engine"         },
  { id: "binary", icon: BarChart2,  label: "Binary Matching"    },
  { id: "orbit",  icon: Zap,        label: "Binary Orbit"       },
  { id: "level",  icon: ChevronRight,label:"Level Income"       },
  { id: "salary", icon: DollarSign, label: "Salary Income"      },
  { id: "ranks",  icon: Award,      label: "Ranks"              },
  { id: "wallet", icon: Wallet,     label: "Wallet Rules"       },
  { id: "limits", icon: Shield,     label: "Platform Limits"    },
  { id: "global", icon: Globe,      label: "Global Configuration"},
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt$ = (n: number) => "$" + n.toLocaleString("en-US");
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const timeAgo = (d: Date) => { const h = Math.round((Date.now() - d.getTime()) / 3600000); return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };
const PLAN_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  ACTIVE:   { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  INACTIVE: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
};

// ─── Confirm Modal ───────────────────────────────────────────────────────────
function ConfirmModal({ pending, onCancel }: { pending: ConfirmPending; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [notes,  setNotes]  = useState("");
  const [ack,    setAck]    = useState(false);
  const ok = reason.trim().length > 0 && ack;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.55)" }} onClick={onCancel} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 301, background: "hsl(222 62% 10%)", border: `1px solid ${BORDER}`, borderRadius: 16, width: 480, padding: "28px 28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Confirm Configuration Change</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={16} /></button>
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8 }}>CONFIGURATION</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{pending.configName}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>CURRENT</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171", fontFamily: "monospace" }}>{pending.oldValue}</div>
          </div>
          <ChevronRight size={18} style={{ color: MUTED, flexShrink: 0 }} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>NEW</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399", fontFamily: "monospace" }}>{pending.newValue}</div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>REASON FOR CHANGE <span style={{ color: "#f87171" }}>*</span></label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Board decision, member feedback…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>ADMIN NOTES <span style={{ color: MUTED }}>(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, cursor: "pointer" }}>
          <div onClick={() => setAck(a => !a)} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${ack ? GOLD : BORDER}`, background: ack ? `${GOLD}18` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {ack && <Check size={11} style={{ color: GOLD }} />}
          </div>
          <span style={{ fontSize: 11, color: MUTED }}>I confirm this change is intentional and has been reviewed.</span>
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, color: MUTED }}>Cancel</button>
          <button onClick={() => ok && pending.onConfirm(reason)} disabled={!ok}
            style={{ flex: 1, padding: "10px 0", background: ok ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${ok ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 9, cursor: ok ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, color: ok ? GOLD_L : MUTED }}>
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Config Card ─────────────────────────────────────────────────────────────
function ConfigCard({ field, onEdit }: { field: ConfigField; onEdit: (f: ConfigField, newVal: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(field.value);
  const isToggle = field.type === "toggle";
  const display  = field.unit ? `${field.value} ${field.unit}` : field.value;
  const handleApply = () => { if (draft !== field.value) onEdit(field, draft); setEditing(false); };
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 3 }}>{field.label}</div>
          {field.description && <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5 }}>{field.description}</div>}
        </div>
        {isToggle ? (
          <button onClick={() => onEdit(field, field.value === "true" ? "false" : "true")} style={{ flexShrink: 0, width: 44, height: 24, borderRadius: 12, background: field.value === "true" ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.06)", border: `2px solid ${field.value === "true" ? "#34d399" : BORDER}`, cursor: "pointer", position: "relative" }}>
            <div style={{ position: "absolute", top: 2, left: field.value === "true" ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: field.value === "true" ? "#34d399" : MUTED, transition: "left 0.15s" }} />
          </button>
        ) : (
          <button onClick={() => { setDraft(field.value); setEditing(e => !e); }} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", color: MUTED }}>
            <Edit2 size={12} />
          </button>
        )}
      </div>
      {!isToggle && <div style={{ fontSize: 20, fontWeight: 800, color: GOLD_L, fontFamily: "monospace", marginBottom: editing ? 12 : 0 }}>{display}</div>}
      {isToggle && <div style={{ fontSize: 13, fontWeight: 700, color: field.value === "true" ? "#34d399" : "#f87171" }}>{field.value === "true" ? "Enabled" : "Disabled"}</div>}
      {editing && (
        <div style={{ paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>
            <span style={{ color: "#f87171", fontFamily: "monospace" }}>{field.value}</span>
            <span style={{ margin: "0 6px" }}>→</span>
            <span style={{ color: "#34d399", fontFamily: "monospace" }}>{draft || "…"}{field.unit ? ` ${field.unit}` : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: GOLD_L, outline: "none", fontFamily: "monospace" }} autoFocus />
            <button onClick={handleApply} style={{ padding: "7px 12px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, color: GOLD_L }}>Apply</button>
            <button onClick={() => setEditing(false)} style={{ padding: "7px 10px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", color: MUTED }}><X size={12} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fixed Plan Drawer ───────────────────────────────────────────────────────
function FixedPlanDrawer({ plan, onClose, onStatusChange, onRequestConfirm, onToast }: {
  plan: Plan;
  onClose: () => void;
  onStatusChange: (id: string, s: PlanStatus) => void;
  onRequestConfirm: (name: string, oldVal: string, newVal: string, action: (reason: string) => Promise<void>) => void;
  onToast: (msg: string, t: "success" | "error" | "info") => void;
}) {
  const sc = PLAN_STATUS_STYLE[plan.status] ?? PLAN_STATUS_STYLE.INACTIVE;
  const locked = plan.members > 0;
  const [editField, setEditField] = useState<"roi" | "minInvest" | "maxInvest" | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (field: "roi" | "minInvest" | "maxInvest") => {
    const cur = field === "roi" ? String(plan.roi) : field === "minInvest" ? String(plan.minInvest) : String(plan.maxInvest ?? "");
    setDraft(cur);
    setEditField(field);
  };

  const applyEdit = () => {
    if (!editField) return;
    const rawNum = parseFloat(draft);
    if (isNaN(rawNum) || rawNum < 0) { setEditField(null); return; }
    const newVal = editField === "maxInvest" && draft === "" ? null : rawNum;
    const labels: Record<string, string> = { roi: "Daily ROI %", minInvest: "Minimum Investment", maxInvest: "Maximum Investment" };
    const oldDisplay = editField === "roi" ? `${plan.roi}%` : editField === "minInvest" ? fmt$(plan.minInvest) : plan.maxInvest ? fmt$(plan.maxInvest) : "Unlimited";
    const newDisplay = editField === "roi" ? `${rawNum}%` : fmt$(rawNum);
    setEditField(null);
    onRequestConfirm(
      `${plan.name} — ${labels[editField]}`,
      oldDisplay,
      newDisplay,
      async () => {
        onClose();
        try {
          await adminUpdatePlanConfig(plan.id, { [editField]: newVal });
          onToast(`${plan.name} ${labels[editField]} updated.`, "success");
        } catch {
          onToast("Failed to update plan.", "error");
        }
      }
    );
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 420, zIndex: 201, background: BG, borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", boxShadow: "-12px 0 50px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${plan.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Package size={16} style={{ color: plan.color }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{plan.name}</div>
                <div style={{ fontSize: 10, color: MUTED }}>{plan.duration}-day fixed duration · {plan.members} active investors</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "4px 10px", borderRadius: 6 }}>{plan.status}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={16} /></button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {plan.status === "ACTIVE"   && <button onClick={() => onStatusChange(plan.id, "INACTIVE")} style={{ flex: 1, padding: "7px 0", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#fbbf24" }}>Deactivate</button>}
            {plan.status === "INACTIVE" && <button onClick={() => onStatusChange(plan.id, "ACTIVE")}   style={{ flex: 1, padding: "7px 0", background: "rgba(52,211,153,0.07)",  border: "1px solid rgba(52,211,153,0.25)",  borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#34d399" }}>Activate</button>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {locked && (
            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Lock size={14} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 11, color: "#fbbf24", lineHeight: 1.5 }}>This plan has active investors. Financial settings are locked to protect existing investments.</div>
            </div>
          )}
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 12 }}>PLAN CONFIGURATION</div>
          {[
            { label: "Daily ROI %", field: "roi" as const, display: `${plan.roi}%`, color: GOLD },
            { label: "Minimum Investment", field: "minInvest" as const, display: fmt$(plan.minInvest), color: "#34d399" },
            { label: "Maximum Investment", field: "maxInvest" as const, display: plan.maxInvest ? fmt$(plan.maxInvest) : "Unlimited", color: "#34d399" },
          ].map(({ label, field, display, color }) => (
            <div key={field} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>{label.toUpperCase()}</div>
                  {editField === field ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 6, padding: "5px 9px", fontSize: 13, color: GOLD_L, outline: "none", fontFamily: "monospace", width: 120 }} />
                      <button onClick={applyEdit} style={{ padding: "5px 10px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 700, color: GOLD_L }}>Apply</button>
                      <button onClick={() => setEditField(null)} style={{ padding: "5px 8px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", color: MUTED }}><X size={11} /></button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "monospace" }}>{display}</div>
                  )}
                </div>
                {!locked && editField !== field && (
                  <button onClick={() => startEdit(field)} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", padding: "4px 8px", color: MUTED }}>
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>DURATION</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#60a5fa", fontFamily: "monospace" }}>{plan.duration} days</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: MUTED, background: "rgba(255,255,255,0.05)", padding: "2px 7px", borderRadius: 4 }}>IMMUTABLE</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Investment Plans Section ────────────────────────────────────────────────
function InvestmentPlansSection({ plans, loading, onView }: { plans: Plan[]; loading: boolean; onView: (p: Plan) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const TD: React.CSSProperties = { padding: "13px 14px", fontSize: 12, color: "rgba(255,255,255,0.75)", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Investment Plans</div>
        <div style={{ fontSize: 11, color: MUTED }}>Four system-defined plans. Plan name and duration are immutable.</div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading plans…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["PLAN","DURATION","ROI %","INVESTMENT RANGE","INVESTORS","STATUS",""].map((h, i) => <th key={h + i} style={TH}>{h}</th>)}
            </tr></thead>
            <tbody>
              {plans.map(p => {
                const sc = PLAN_STATUS_STYLE[p.status] ?? PLAN_STATUS_STYLE.INACTIVE;
                const locked = p.members > 0;
                return (
                  <tr key={p.id} onClick={() => onView(p)} onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "pointer", background: hovered === p.id ? "rgba(255,255,255,0.025)" : "transparent" }}>
                    <td style={{ ...TD, paddingLeft: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={TD}><span style={{ fontFamily: "monospace", color: "#60a5fa", fontWeight: 700 }}>{p.duration}d</span></td>
                    <td style={{ ...TD, color: GOLD, fontWeight: 700 }}>{p.roi}%</td>
                    <td style={TD}>{fmt$(p.minInvest)} – {p.maxInvest ? fmt$(p.maxInvest) : "∞"}</td>
                    <td style={{ ...TD, color: MUTED }}>{p.members.toLocaleString()}</td>
                    <td style={TD}><span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "3px 8px", borderRadius: 5 }}>{p.status}</span></td>
                    <td style={{ ...TD, paddingRight: 18 }}>
                      {locked && <Lock size={11} style={{ color: "#fbbf24" }} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Generic Config Section ───────────────────────────────────────────────────
function ConfigSection({ title, subtitle, fields, loading, onEdit }: { title: string; subtitle: string; fields: ConfigField[]; loading: boolean; onEdit: (f: ConfigField, v: string) => void }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{title}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{subtitle}</div>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading configuration…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {fields.map(f => <ConfigCard key={f.key} field={f} onEdit={onEdit} />)}
        </div>
      )}
    </div>
  );
}

// ─── Level Income Section ────────────────────────────────────────────────────
function LevelIncomeSection({ rows, loading, onChange, onRequestConfirm, onToast, refreshSidebar }: {
  rows: LevelConfigItem[];
  loading: boolean;
  onChange: (updated: LevelConfigItem[]) => void;
  onRequestConfirm: (name: string, oldVal: string, newVal: string, action: (reason: string) => Promise<void>) => void;
  onToast: (msg: string, t: "success" | "error" | "info") => void;
  refreshSidebar: () => void;
}) {
  const [editState, setEditState] = useState<{ level: number; field: "rate" | "qualification"; draft: string } | null>(null);
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const TD: React.CSSProperties = { padding: "12px 14px", fontSize: 12, borderBottom: `1px solid ${BORDER}` };

  const startEdit = (level: number, field: "rate" | "qualification", cur: string) => setEditState({ level, field, draft: cur });

  const handleApplyRate = (level: number, oldRate: number, newRate: number) => {
    setEditState(null);
    if (newRate === oldRate || isNaN(newRate)) return;
    onRequestConfirm(
      `Level ${level} Commission Rate`,
      `${oldRate}%`,
      `${newRate}%`,
      async () => {
        const newRows = rows.map(r => r.level === level ? { ...r, rate: newRate } : r);
        onChange(newRows);
        try {
          await adminSaveLevelConfig(newRows);
          refreshSidebar();
          onToast(`Level ${level} rate updated to ${newRate}%.`, "success");
        } catch {
          onChange(rows);
          onToast("Failed to save level config.", "error");
        }
      }
    );
  };

  const handleApplyQual = async (level: number, newQual: string) => {
    setEditState(null);
    const newRows = rows.map(r => r.level === level ? { ...r, qualification: newQual } : r);
    onChange(newRows);
    try {
      await adminSaveLevelConfig(newRows);
      refreshSidebar();
      onToast(`Level ${level} qualification updated.`, "info");
    } catch {
      onChange(rows);
      onToast("Failed to save level config.", "error");
    }
  };

  const handleToggle = async (level: number) => {
    const row = rows.find(r => r.level === level);
    if (!row) return;
    const newStatus = row.status === "ACTIVE" ? "INACTIVE" as const : "ACTIVE" as const;
    const newRows = rows.map(r => r.level === level ? { ...r, status: newStatus } : r);
    onChange(newRows);
    try {
      await adminSaveLevelConfig(newRows);
      refreshSidebar();
      onToast(`Level ${level} income ${newStatus.toLowerCase()}.`, "info");
    } catch {
      onChange(rows);
      onToast("Failed to save level config.", "error");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Level Income</div>
        <div style={{ fontSize: 11, color: MUTED }}>Commission rates for each downline level. Click any value to edit.</div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading level config…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["LEVEL","COMMISSION %","QUALIFICATION RULE","STATUS"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => {
                const editingRate = editState?.level === r.level && editState.field === "rate";
                const editingQual = editState?.level === r.level && editState.field === "qualification";
                return (
                  <tr key={r.level}>
                    <td style={{ ...TD, paddingLeft: 18 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: GOLD }}>{r.level}</div>
                    </td>
                    <td style={TD}>
                      {editingRate ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input value={editState.draft} onChange={e => setEditState(s => s ? { ...s, draft: e.target.value } : null)} autoFocus
                            style={{ width: 70, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: GOLD_L, outline: "none", fontFamily: "monospace" }} />
                          <button onClick={() => handleApplyRate(r.level, r.rate, parseFloat(editState.draft))} style={{ padding: "4px 8px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 700, color: GOLD_L }}>✓</button>
                          <button onClick={() => setEditState(null)} style={{ padding: "4px 6px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 5, cursor: "pointer", color: MUTED }}><X size={10} /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(r.level, "rate", String(r.rate))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: GOLD, fontFamily: "monospace", padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
                          {r.rate}% <Edit2 size={10} style={{ color: MUTED, opacity: 0.5 }} />
                        </button>
                      )}
                    </td>
                    <td style={{ ...TD, color: MUTED, maxWidth: 240 }}>
                      {editingQual ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input value={editState.draft} onChange={e => setEditState(s => s ? { ...s, draft: e.target.value } : null)} autoFocus
                            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "rgba(255,255,255,0.8)", outline: "none" }} />
                          <button onClick={() => handleApplyQual(r.level, editState.draft)} style={{ padding: "4px 8px", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#34d399" }}>✓</button>
                          <button onClick={() => setEditState(null)} style={{ padding: "4px 6px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 5, cursor: "pointer", color: MUTED }}><X size={10} /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(r.level, "qualification", r.qualification)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: MUTED, textAlign: "left", padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
                          {r.qualification} <Edit2 size={10} style={{ opacity: 0.4 }} />
                        </button>
                      )}
                    </td>
                    <td style={TD}>
                      <button onClick={() => handleToggle(r.level)}
                        style={{ fontSize: 9, fontWeight: 700, color: r.status === "ACTIVE" ? "#34d399" : "#fbbf24", background: r.status === "ACTIVE" ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)", padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer" }}>
                        {r.status}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Salary Income Section ───────────────────────────────────────────────────
function SalaryIncomeSection({ ranks, loading, onChange, onRequestConfirm, onToast, refreshSidebar }: {
  ranks: SalaryRankItem[];
  loading: boolean;
  onChange: (updated: SalaryRankItem[]) => void;
  onRequestConfirm: (name: string, oldVal: string, newVal: string, action: (reason: string) => Promise<void>) => void;
  onToast: (msg: string, t: "success" | "error" | "info") => void;
  refreshSidebar: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [draftSalary, setDraftSalary] = useState("");
  const [draftBV,     setDraftBV]     = useState("");
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const TD: React.CSSProperties = { padding: "12px 14px", fontSize: 12, borderBottom: `1px solid ${BORDER}` };
  const meta = (name: string) => RANK_META[name] ?? { color: MUTED, benefits: [] };

  const startEdit = (r: SalaryRankItem) => {
    setEditId(r.rankName);
    setDraftSalary(String(r.monthlySalary));
    setDraftBV(String(r.requiredBusiness));
  };

  const cancelEdit = () => setEditId(null);

  const saveFinancial = (r: SalaryRankItem) => {
    const newSalary = parseFloat(draftSalary);
    const newBV     = parseFloat(draftBV);
    if (isNaN(newSalary) || isNaN(newBV)) { cancelEdit(); return; }
    const changed = newSalary !== r.monthlySalary || newBV !== r.requiredBusiness;
    if (!changed) { cancelEdit(); return; }
    setEditId(null);
    onRequestConfirm(
      `Salary Config — ${r.rankName}`,
      `$${r.monthlySalary}/mo · $${r.requiredBusiness} BV`,
      `$${newSalary}/mo · $${newBV} BV`,
      async () => {
        const updated = ranks.map(x => x.rankName === r.rankName ? { ...x, monthlySalary: newSalary, requiredBusiness: newBV } : x);
        onChange(updated);
        try {
          await adminUpdateSalaryRank(r.rankName, { monthlySalary: newSalary, requiredBusiness: newBV });
          refreshSidebar();
          onToast(`${r.rankName} salary config updated.`, "success");
        } catch {
          onChange(ranks);
          onToast("Failed to save salary config.", "error");
        }
      }
    );
  };

  const toggleDualDirects = async (r: SalaryRankItem) => {
    const newVal = !r.requiresDualDirects;
    const updated = ranks.map(x => x.rankName === r.rankName ? { ...x, requiresDualDirects: newVal } : x);
    onChange(updated);
    try {
      await adminUpdateSalaryRank(r.rankName, { requiresDualDirects: newVal });
      refreshSidebar();
      onToast(`${r.rankName} dual directs ${newVal ? "required" : "not required"}.`, "info");
    } catch {
      onChange(ranks);
      onToast("Failed to save.", "error");
    }
  };

  const toggleActive = async (r: SalaryRankItem) => {
    const newVal = !r.isActive;
    const updated = ranks.map(x => x.rankName === r.rankName ? { ...x, isActive: newVal } : x);
    onChange(updated);
    try {
      await adminUpdateSalaryRank(r.rankName, { isActive: newVal });
      refreshSidebar();
      onToast(`${r.rankName} ${newVal ? "enabled" : "disabled"}.`, "info");
    } catch {
      onChange(ranks);
      onToast("Failed to save.", "error");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Salary Income</div>
        <div style={{ fontSize: 11, color: MUTED }}>Configure monthly salary amounts and qualification requirements per rank.</div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading salary config…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["RANK","MONTHLY SALARY","TEAM BV REQUIRED","DUAL DIRECTS","ENABLED",""].map(h => <th key={h} style={TH}>{h}</th>)}
            </tr></thead>
            <tbody>
              {ranks.map(r => {
                const m = meta(r.rankName);
                const editing = editId === r.rankName;
                return (
                  <tr key={r.rankName}>
                    <td style={{ ...TD, paddingLeft: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: m.color }} />
                        <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{r.rankName}</span>
                      </div>
                    </td>
                    <td style={TD}>
                      {editing ? (
                        <input value={draftSalary} onChange={e => setDraftSalary(e.target.value)} style={{ width: 90, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: GOLD_L, outline: "none", fontFamily: "monospace" }} autoFocus />
                      ) : (
                        <span style={{ color: r.monthlySalary > 0 ? "#34d399" : MUTED, fontWeight: r.monthlySalary > 0 ? 700 : 400 }}>
                          {r.monthlySalary > 0 ? fmt$(r.monthlySalary) + "/mo" : "—"}
                        </span>
                      )}
                    </td>
                    <td style={TD}>
                      {editing ? (
                        <input value={draftBV} onChange={e => setDraftBV(e.target.value)} style={{ width: 90, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", fontFamily: "monospace" }} />
                      ) : (
                        <span style={{ color: MUTED }}>
                          {r.requiredBusiness > 0 ? (r.requiredBusiness >= 1000 ? `$${Math.round(r.requiredBusiness / 1000)}K` : fmt$(r.requiredBusiness)) : "—"}
                        </span>
                      )}
                    </td>
                    <td style={TD}>
                      <button onClick={() => toggleDualDirects(r)}
                        style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer", color: r.requiresDualDirects ? "#34d399" : MUTED, background: r.requiresDualDirects ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)" }}>
                        {r.requiresDualDirects ? "Required" : "Not Required"}
                      </button>
                    </td>
                    <td style={TD}>
                      <button onClick={() => toggleActive(r)}
                        style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer", color: r.isActive ? "#34d399" : "#fbbf24", background: r.isActive ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)" }}>
                        {r.isActive ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td style={{ ...TD, paddingRight: 14 }}>
                      {editing ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => saveFinancial(r)} style={{ padding: "4px 9px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 700, color: GOLD_L }}>Save</button>
                          <button onClick={cancelEdit} style={{ padding: "4px 7px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 5, cursor: "pointer", color: MUTED }}><X size={10} /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(r)} style={{ padding: "4px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 10, color: MUTED }}>Edit</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Ranks Section ───────────────────────────────────────────────────────────
function RanksSection({ ranks, loading }: { ranks: SalaryRankItem[]; loading: boolean }) {
  const meta = (name: string) => RANK_META[name] ?? { color: MUTED, benefits: [] };
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Ranks</div>
        <div style={{ fontSize: 11, color: MUTED }}>Visual overview of all ranks. Salary values are read from Salary Income configuration.</div>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading ranks…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          {ranks.map(r => {
            const m = meta(r.rankName);
            const qualification = r.requiresDualDirects ? "Dual directs required on each leg" : "Single active direct required";
            return (
              <div key={r.rankName} style={{ background: CARD, border: `1px solid ${m.color}28`, borderRadius: 14, padding: "18px 18px 16px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: m.color, opacity: 0.6 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${m.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Award size={16} style={{ color: m.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{r.rankName}</div>
                    {r.monthlySalary > 0
                      ? <div style={{ fontSize: 10, color: "#34d399", fontWeight: 600 }}>{fmt$(r.monthlySalary)}/mo salary</div>
                      : <div style={{ fontSize: 10, color: MUTED }}>No salary</div>
                    }
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[
                    { label: "Team BV",     value: r.requiredBusiness > 0 ? (r.requiredBusiness >= 1000 ? `$${Math.round(r.requiredBusiness/1000)}K` : fmt$(r.requiredBusiness)) : "—" },
                    { label: "Dual Directs",value: r.requiresDualDirects ? "Required" : "Not required" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "#60a5fa", marginBottom: 8, fontStyle: "italic" }}>{qualification}</div>
                {m.benefits.map(b => (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <CheckCircle size={10} style={{ color: m.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: MUTED }}>{b}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Wallet Rules Section ────────────────────────────────────────────────────
function WalletRulesSection({ fields, loading, onEdit }: { fields: ConfigField[]; loading: boolean; onEdit: (f: ConfigField, v: string) => void }) {
  const walletBox = (title: string, items: string[], receiveLabel: string, color: string) => (
    <div style={{ background: CARD, border: `1px solid ${color}28`, borderRadius: 12, padding: "14px 16px", flex: 1 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: "0.08em", marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 6 }}>{receiveLabel}</div>
      {items.map(i => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          <CheckCircle size={10} style={{ color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{i}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Wallet Rules</div>
        <div style={{ fontSize: 11, color: MUTED }}>Prime Wave wallet structure and transfer release configuration.</div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "stretch" }}>
        {walletBox("INCOME WALLET", ["ROI earnings", "Principal (on plan completion)"], "RECEIVES", "#60a5fa")}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "0 4px" }}>
          <div style={{ fontSize: 9, color: MUTED, textAlign: "center", marginBottom: 4 }}>TRANSFER</div>
          <ChevronRight size={20} style={{ color: "#60a5fa" }} />
          <div style={{ fontSize: 9, color: MUTED, textAlign: "center", marginTop: 4 }}>72h release</div>
        </div>
        {walletBox("WITHDRAWAL WALLET", ["Binary income", "Orbit income", "Level income", "Salary income", "Completed income transfers"], "RECEIVES", "#34d399")}
      </div>
      <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={14} style={{ color: "#60a5fa", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
          Transfers from the Income Wallet to the Withdrawal Wallet are released in tranches over the configured window. Binary, Orbit, Level, and Salary income are deposited directly to the Withdrawal Wallet without a release window.
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 12 }}>RELEASE CONFIGURATION</div>
      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading configuration…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {fields.map(f => <ConfigCard key={f.key} field={f} onEdit={onEdit} />)}
        </div>
      )}
    </div>
  );
}

// ─── Global Config Section ────────────────────────────────────────────────────
function GlobalConfigSection({ fields, loading, onEdit }: { fields: ConfigField[]; loading: boolean; onEdit: (f: ConfigField, v: string) => void }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Global Configuration</div>
        <div style={{ fontSize: 11, color: MUTED }}>Platform-wide feature flags. Changes take effect immediately.</div>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading global config…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {fields.map(f => {
            const on = f.value === "true";
            const isWarning = f.key === "gl.maintenance";
            return (
              <div key={f.key} style={{ background: CARD, border: `1px solid ${isWarning && on ? "rgba(248,113,113,0.3)" : BORDER}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    {isWarning && on && <AlertTriangle size={13} style={{ color: "#f87171" }} />}
                    <span style={{ fontSize: 13, fontWeight: 700, color: isWarning && on ? "#f87171" : "rgba(255,255,255,0.85)" }}>{f.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED }}>{f.description}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: on ? "#34d399" : "#f87171" }}>{on ? "ENABLED" : "DISABLED"}</span>
                  <button onClick={() => onEdit(f, on ? "false" : "true")}
                    style={{ width: 48, height: 26, borderRadius: 13, background: on ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.06)", border: `2px solid ${on ? "#34d399" : BORDER}`, cursor: "pointer", position: "relative" }}>
                    <div style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 16, height: 16, borderRadius: "50%", background: on ? "#34d399" : MUTED, transition: "left 0.15s" }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Version History ──────────────────────────────────────────────────────────
function VersionHistory({ versions, loading }: { versions: ConfigVersion[]; loading: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 14 }}>VERSION HISTORY</div>
      {loading ? (
        <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: "16px 0" }}>Loading…</div>
      ) : versions.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: "16px 0" }}>No versions yet.</div>
      ) : versions.map((v, i) => (
        <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < versions.length - 1 ? `1px solid ${BORDER}` : "none" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? GOLD_L : "rgba(255,255,255,0.75)" }}>v{v.version}</span>
              {i === 0 && <span style={{ fontSize: 9, fontWeight: 700, color: GOLD, background: "rgba(212,175,55,0.12)", padding: "1px 6px", borderRadius: 4 }}>CURRENT</span>}
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{timeAgo(v.publishedAt)} · {v.changeCount} change{v.changeCount !== 1 ? "s" : ""}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{v.publishedBy.split("@")[0]}</div>
          </div>
          <button style={{ padding: "4px 9px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 10, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}><Eye size={10} /> Compare</button>
        </div>
      ))}
    </div>
  );
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
function AuditLog({ entries, loading }: { entries: AuditEntry[]; loading: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em" }}>CHANGE AUDIT LOG</div>
        <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 10, color: MUTED }}><Download size={10} /> Export</button>
      </div>
      {loading ? (
        <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: "16px 0" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: "16px 0" }}>No changes recorded yet.</div>
      ) : entries.slice(0, 8).map((e, i) => (
        <div key={e.id} style={{ padding: "10px 0", borderBottom: i < Math.min(entries.length - 1, 7) ? `1px solid ${BORDER}` : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{e.configName}</span>
            <span style={{ fontSize: 10, color: MUTED }}>{fmtDate(e.timestamp)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: "#f87171", fontFamily: "monospace" }}>{e.oldValue}</span>
            <ChevronRight size={10} style={{ color: MUTED }} />
            <span style={{ fontSize: 11, color: "#34d399", fontFamily: "monospace" }}>{e.newValue}</span>
          </div>
          <div style={{ fontSize: 10, color: "#60a5fa" }}>{e.admin.split("@")[0]} · {e.reason}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlansPage() {
  const { toasts, toast, dismiss } = useToast();
  const [active,   setActive]   = useState<SectionId>("plans");
  const [plans,    setPlans]    = useState<Plan[]>([]);
  const [levels,   setLevels]   = useState<LevelConfigItem[]>([]);
  const [salaryRanks, setSalaryRanks] = useState<SalaryRankItem[]>([]);
  const [config,   setConfig]   = useState<ConfigState>({
    plans: [], roi: [], binary: [], orbit: [], level: [], salary: [], ranks: [], wallet: [], limits: [], global: [],
  });
  const [audit,    setAudit]    = useState<AuditEntry[]>([]);
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [planDrawer,     setPlanDrawer]     = useState<Plan | null>(null);
  const [confirmPending, setConfirmPending] = useState<ConfirmPending | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [loadingPlans,    setLoadingPlans]    = useState(true);
  const [loadingConfig,   setLoadingConfig]   = useState(false);
  const [loadingLevel,    setLoadingLevel]    = useState(true);
  const [loadingSalary,   setLoadingSalary]   = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingAudit,    setLoadingAudit]    = useState(true);

  const configLoaded = useRef(false);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    adminGetPlans()
      .then(r => setPlans(r.plans.map(p => ({ id: p.id, name: p.name, color: p.color, minInvest: p.minInvest, maxInvest: p.maxInvest, roi: p.roi, duration: p.duration, status: (p.status === "ARCHIVED" ? "INACTIVE" : p.status) as PlanStatus, members: p.members }))))
      .catch(() => toast("Failed to load plans.", "error"))
      .finally(() => setLoadingPlans(false));

    adminGetLevelConfig()
      .then(r => setLevels(r.levels))
      .catch(() => {})
      .finally(() => setLoadingLevel(false));

    adminGetSalaryRanks()
      .then(r => setSalaryRanks(r.ranks))
      .catch(() => {})
      .finally(() => setLoadingSalary(false));

    adminGetConfigVersions()
      .then(r => setVersions(r.versions.map(v => ({ ...v, publishedAt: new Date(v.publishedAt) }))))
      .catch(() => {})
      .finally(() => setLoadingVersions(false));

    adminGetConfigAudit()
      .then(r => setAudit(r.entries.map(e => ({ ...e, timestamp: new Date(e.timestamp) }))))
      .catch(() => {})
      .finally(() => setLoadingAudit(false));
  }, []);

  // ── Lazy-load system config ──────────────────────────────────────────────
  useEffect(() => {
    const isConfigSection = ["roi","binary","orbit","wallet","limits","global"].includes(active);
    if (!isConfigSection || configLoaded.current) return;
    setLoadingConfig(true);
    adminGetPlanConfig()
      .then(sections => {
        configLoaded.current = true;
        setConfig(c => ({
          ...c,
          roi:    sections.roi    ?? [],
          binary: sections.binary ?? [],
          orbit:  sections.orbit  ?? [],
          wallet: sections.wallet ?? [],
          limits: sections.limits ?? [],
          global: sections.global ?? [],
        }));
      })
      .catch(() => toast("Failed to load configuration.", "error"))
      .finally(() => setLoadingConfig(false));
  }, [active]);

  // ── Refresh sidebar after saves ──────────────────────────────────────────
  const refreshSidebar = useCallback(() => {
    adminGetConfigVersions()
      .then(r => setVersions(r.versions.map(v => ({ ...v, publishedAt: new Date(v.publishedAt) }))))
      .catch(() => {});
    adminGetConfigAudit()
      .then(r => setAudit(r.entries.map(e => ({ ...e, timestamp: new Date(e.timestamp) }))))
      .catch(() => {});
  }, []);

  // ── Confirm request helper ───────────────────────────────────────────────
  const requestConfirm = useCallback((
    configName: string,
    oldValue:   string,
    newValue:   string,
    onConfirm:  (reason: string) => Promise<void>,
  ) => {
    setConfirmPending({ configName, oldValue, newValue, onConfirm: async (reason) => {
      setConfirmPending(null);
      await onConfirm(reason);
    }});
  }, []);

  // ── Config field edit ────────────────────────────────────────────────────
  const handleEdit = useCallback(async (sectionId: SectionId, field: ConfigField, newVal: string) => {
    if (field.type === "toggle") {
      setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === field.key ? { ...f, value: newVal } : f) }));
      try {
        await adminSaveConfigField(field.key, newVal, field.value, "Feature flag toggled by admin.", field.label);
        refreshSidebar();
        toast(`${field.label} ${newVal === "true" ? "enabled" : "disabled"}.`, newVal === "true" ? "success" : "info");
      } catch {
        setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === field.key ? { ...f, value: field.value } : f) }));
        toast("Failed to save configuration.", "error");
      }
    } else {
      requestConfirm(
        field.label,
        field.unit ? `${field.value} ${field.unit}` : field.value,
        field.unit ? `${newVal} ${field.unit}` : newVal,
        async () => {
          setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === field.key ? { ...f, value: newVal } : f) }));
          try {
            await adminSaveConfigField(field.key, newVal, field.value, "Configuration updated by admin.", field.label);
            refreshSidebar();
            toast(`${field.label} updated.`, "success");
          } catch {
            setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === field.key ? { ...f, value: field.value } : f) }));
            toast("Failed to save configuration.", "error");
          }
        }
      );
    }
  }, [toast, refreshSidebar, requestConfirm]);

  const makeEditHandler = (sid: SectionId) => (f: ConfigField, v: string) => handleEdit(sid, f, v);

  // ── Plan status change ───────────────────────────────────────────────────
  const handlePlanStatusChange = useCallback(async (id: string, status: PlanStatus) => {
    setPlans(ps => ps.map(p => p.id === id ? { ...p, status } : p));
    setPlanDrawer(null);
    try {
      await adminUpdatePlanStatus(id, status);
      refreshSidebar();
      toast(`Plan ${status === "ACTIVE" ? "activated" : "deactivated"}.`, "info");
    } catch {
      setPlans(ps => ps.map(p => p.id === id ? { ...p, status: p.status } : p));
      toast("Failed to update plan status.", "error");
    }
  }, [toast, refreshSidebar]);

  const handlePublish = useCallback(() => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      toast("Configuration is up to date. All changes are saved automatically.", "info");
    }, 800);
  }, [toast]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div style={{ padding: "24px 28px", minHeight: "100vh", background: BG, boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>Plans & Compensation Configuration</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>Configure investment plans, compensation rules and platform reward systems.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}><Download size={13} /> Export Config</button>
            <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}><RotateCcw size={13} /> Restore Defaults</button>
            <button onClick={handlePublish} disabled={publishing}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: publishing ? "rgba(212,175,55,0.05)" : "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: publishing ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, color: publishing ? MUTED : GOLD_L }}>
              <CheckCircle size={13} />{publishing ? "Publishing…" : "Publish Changes"}
            </button>
          </div>
        </div>

        {/* 3-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 260px", gap: 16 }}>

          {/* Section nav */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "8px 0", alignSelf: "start" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", padding: "8px 16px 6px" }}>SECTIONS</div>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActive(item.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 16px", background: active === item.id ? "rgba(212,175,55,0.07)" : "none", border: "none", borderLeft: `2px solid ${active === item.id ? GOLD : "transparent"}`, cursor: "pointer", textAlign: "left", color: active === item.id ? GOLD_L : MUTED, fontSize: 12, fontWeight: active === item.id ? 700 : 500 }}>
                <item.icon size={13} style={{ flexShrink: 0 }} />
                {item.label}
              </button>
            ))}
          </div>

          {/* Main content */}
          <div>
            {active === "plans"  && <InvestmentPlansSection plans={plans} loading={loadingPlans} onView={p => setPlanDrawer(p)} />}
            {active === "roi"    && <ConfigSection title="ROI Engine" subtitle="Automatic daily ROI distribution. No manual claim required." fields={config.roi} loading={loadingConfig} onEdit={makeEditHandler("roi")} />}
            {active === "binary" && <ConfigSection title="Binary Matching" subtitle="Configure binary network matching rules and caps." fields={config.binary} loading={loadingConfig} onEdit={makeEditHandler("binary")} />}
            {active === "orbit"  && <ConfigSection title="Binary Orbit" subtitle="Configure the binary orbit reward system." fields={config.orbit} loading={loadingConfig} onEdit={makeEditHandler("orbit")} />}
            {active === "level"  && <LevelIncomeSection rows={levels} loading={loadingLevel} onChange={setLevels} onRequestConfirm={requestConfirm} onToast={toast} refreshSidebar={refreshSidebar} />}
            {active === "salary" && <SalaryIncomeSection ranks={salaryRanks} loading={loadingSalary} onChange={setSalaryRanks} onRequestConfirm={requestConfirm} onToast={toast} refreshSidebar={refreshSidebar} />}
            {active === "ranks"  && <RanksSection ranks={salaryRanks} loading={loadingSalary} />}
            {active === "wallet" && <WalletRulesSection fields={config.wallet} loading={loadingConfig} onEdit={makeEditHandler("wallet")} />}
            {active === "limits" && <ConfigSection title="Platform Limits" subtitle="System-wide investment, withdrawal, and income limits." fields={config.limits} loading={loadingConfig} onEdit={makeEditHandler("limits")} />}
            {active === "global" && <GlobalConfigSection fields={config.global} loading={loadingConfig} onEdit={makeEditHandler("global")} />}
          </div>

          {/* Right sidebar */}
          <div>
            <VersionHistory versions={versions} loading={loadingVersions} />
            <AuditLog entries={audit} loading={loadingAudit} />
          </div>
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>

      {planDrawer && (
        <FixedPlanDrawer
          plan={plans.find(p => p.id === planDrawer.id) ?? planDrawer}
          onClose={() => setPlanDrawer(null)}
          onStatusChange={handlePlanStatusChange}
          onRequestConfirm={requestConfirm}
          onToast={toast}
        />
      )}
      {confirmPending && (
        <ConfirmModal pending={confirmPending} onCancel={() => setConfirmPending(null)} />
      )}
    </AdminLayout>
  );
}
