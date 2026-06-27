import { useState, useCallback, useEffect, useRef } from "react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  Package, Zap, BarChart2, TrendingUp, DollarSign, Award,
  ArrowRightLeft, Shield, Globe, Settings, Edit2, Check,
  X, MoreVertical, ChevronRight, History, FileText,
  RotateCcw, Eye, Copy, Archive, Trash2, CheckCircle,
  AlertTriangle, Plus, Download, RefreshCw,
} from "lucide-react";
import {
  adminGetPlans,
  adminCreatePlan,
  adminUpdatePlanStatus,
  adminGetPlanConfig,
  adminSaveConfigField,
  adminGetConfigVersions,
  adminGetConfigAudit,
  adminGetLevelConfig,
  adminSaveLevelConfig,
  adminGetSalaryRanks,
  type PlanItem,
  type PlanConfigSections,
  type PlanVersionEntry,
  type PlanAuditEntry,
  type LevelConfigItem,
  type SalaryRankItem,
} from "@/lib/api";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Types ─────────────────────────────────────────────────────────────────────
type PlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
interface Plan {
  id: string; name: string; color: string;
  minInvest: number; maxInvest: number | null;
  roi: number; duration: number; autoCompound: boolean;
  status: PlanStatus; members: number;
  benefits: string[]; notes: string; claimWindow: string;
}

interface LevelRow { level: number; rate: number; qualification: string; status: "ACTIVE" | "INACTIVE" }
interface SalaryRow { rank: string; color: string; monthly: number; directs: number; teamVolume: string; retention: string }
interface RankCard { id: string; name: string; color: string; gradient: string; minInvest: number; teamSize: number; groupVolume: string; bonus: string; salary: number; benefits: string[] }
interface ConfigField { key: string; label: string; value: string; unit?: string; type: "text" | "number" | "toggle"; description?: string }
interface AuditEntry { id: string; timestamp: Date; admin: string; configName: string; oldValue: string; newValue: string; reason: string }
interface ConfigVersion { id: string; version: string; publishedBy: string; publishedAt: Date; changeCount: number }

type SectionId = "plans" | "roi" | "binary" | "orbit" | "level" | "salary" | "ranks" | "transfer" | "limits" | "global";
type ConfigState = Record<SectionId, ConfigField[]>;

// ─── Static display metadata for ranks ─────────────────────────────────────────
const RANK_META: Record<string, { color: string; gradient: string; minInvest: number; teamSize: number; groupVolume: string; bonus: string; benefits: string[] }> = {
  "Bronze":      { color: "#cd7f32", gradient: "from-[#cd7f32] to-[#8B4513]", minInvest: 100,   teamSize: 2,   groupVolume: "$500",   bonus: "$25",    benefits: ["Level 1-2 income","Binary eligible"] },
  "Silver":      { color: "#c0c0c0", gradient: "from-[#c0c0c0] to-[#808080]", minInvest: 500,   teamSize: 5,   groupVolume: "$2K",    bonus: "$100",   benefits: ["Level 1-3 income","Binary + Orbit"] },
  "Gold":        { color: GOLD,      gradient: "from-[#D4AF37] to-[#B8860B]", minInvest: 1000,  teamSize: 10,  groupVolume: "$10K",   bonus: "$500",   benefits: ["Level 1-5 income","All binary types"] },
  "Platinum":    { color: GOLD,      gradient: "from-[#D4AF37] to-[#B8860B]", minInvest: 1000,  teamSize: 10,  groupVolume: "$10K",   bonus: "$500",   benefits: ["Level 1-5 income","All binary types"] },
  "Diamond":     { color: "#a5f3fc", gradient: "from-[#a5f3fc] to-[#0ea5e9]", minInvest: 5000,  teamSize: 25,  groupVolume: "$50K",   bonus: "$2000",  benefits: ["Level 1-7 income","Salary eligible","Priority support"] },
  "Crown":       { color: "#a78bfa", gradient: "from-[#a78bfa] to-[#7c3aed]", minInvest: 10000, teamSize: 50,  groupVolume: "$200K",  bonus: "$5000",  benefits: ["Level 1-9 income","Full compensation","Dedicated manager"] },
  "Royal Crown": { color: "#f87171", gradient: "from-[#f87171] to-[#dc2626]", minInvest: 50000, teamSize: 100, groupVolume: "$500K",  bonus: "$10000", benefits: ["All income types","Board access","Crown ceremony invite"] },
};

const SALARY_META: Record<string, { color: string; directs: number; retention: string }> = {
  "Bronze":      { color: "#cd7f32", directs: 0,  retention: "—" },
  "Silver":      { color: "#c0c0c0", directs: 0,  retention: "—" },
  "Gold":        { color: GOLD,      directs: 3,  retention: "Monthly" },
  "Platinum":    { color: GOLD,      directs: 3,  retention: "Monthly" },
  "Diamond":     { color: "#a5f3fc", directs: 5,  retention: "Monthly" },
  "Crown":       { color: "#a78bfa", directs: 10, retention: "Monthly" },
  "Royal Crown": { color: "#f87171", directs: 20, retention: "Monthly" },
};

// ─── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: SectionId; icon: React.ElementType; label: string }[] = [
  { id: "plans",    icon: Package,       label: "Investment Plans"    },
  { id: "roi",      icon: TrendingUp,    label: "ROI Engine"          },
  { id: "binary",   icon: BarChart2,     label: "Binary Matching"     },
  { id: "orbit",    icon: Zap,           label: "Binary Orbit"        },
  { id: "level",    icon: ChevronRight,  label: "Level Income"        },
  { id: "salary",   icon: DollarSign,    label: "Salary Income"       },
  { id: "ranks",    icon: Award,         label: "Ranks"               },
  { id: "transfer", icon: ArrowRightLeft,label: "Transfer Rules"      },
  { id: "limits",   icon: Shield,        label: "Platform Limits"     },
  { id: "global",   icon: Globe,         label: "Global Config"       },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const $ = (n: number) => "$" + n.toLocaleString("en-US");
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const timeAgo = (d: Date) => { const h = Math.round((Date.now()-d.getTime())/3600000); return h < 24 ? `${h}h ago` : `${Math.round(h/24)}d ago`; };
const PLAN_STATUS: Record<PlanStatus,{color:string;bg:string}> = {
  ACTIVE:   { color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  INACTIVE: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  ARCHIVED: { color: MUTED,     bg: "rgba(170,179,197,0.08)" },
};

// ─── Confirm Modal ─────────────────────────────────────────────────────────────
interface ConfirmPending { configName: string; oldValue: string; newValue: string; sectionId: SectionId; key: string; rawNew: string; label: string }

function ConfirmModal({ pending, onConfirm, onCancel }: {
  pending: ConfirmPending;
  onConfirm: (reason: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [notes,  setNotes]  = useState("");
  const [ack,    setAck]    = useState(false);
  const ok = reason.trim() && ack;
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
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>CURRENT VALUE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171", fontFamily: "monospace" }}>{pending.oldValue}</div>
          </div>
          <ChevronRight size={18} style={{ color: MUTED, flexShrink: 0 }} />
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>NEW VALUE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399", fontFamily: "monospace" }}>{pending.newValue}</div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>REASON FOR CHANGE <span style={{ color: "#f87171" }}>*</span></label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Board decision, member feedback, competitive adjustment…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>ADMIN NOTES <span style={{ color: MUTED }}>(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes…" style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, cursor: "pointer" }}>
          <div onClick={() => setAck(a => !a)} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${ack ? GOLD : BORDER}`, background: ack ? `${GOLD}18` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {ack && <Check size={11} style={{ color: GOLD }} />}
          </div>
          <span style={{ fontSize: 11, color: MUTED }}>I confirm this configuration change is intentional and has been reviewed.</span>
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, color: MUTED }}>Cancel</button>
          <button onClick={() => ok && onConfirm(reason, notes)} disabled={!ok} style={{ flex: 1, padding: "10px 0", background: ok ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${ok ? "rgba(212,175,55,0.3)" : BORDER}`, borderRadius: 9, cursor: ok ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, color: ok ? GOLD_L : MUTED }}>Save Changes</button>
        </div>
      </div>
    </>
  );
}

// ─── Config Card (editable) ────────────────────────────────────────────────────
function ConfigCard({ field, onEdit }: { field: ConfigField; onEdit: (f: ConfigField, newVal: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(field.value);

  const isToggle = field.type === "toggle";
  const display  = field.unit ? `${field.value} ${field.unit}` : field.value;

  const handleToggle = () => { onEdit(field, field.value === "true" ? "false" : "true"); };
  const handleApply  = () => { if (draft !== field.value) onEdit(field, draft); setEditing(false); };

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 3 }}>{field.label}</div>
          {field.description && <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5 }}>{field.description}</div>}
        </div>
        {isToggle ? (
          <button onClick={handleToggle} style={{ flexShrink: 0, width: 44, height: 24, borderRadius: 12, background: field.value === "true" ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.06)", border: `2px solid ${field.value === "true" ? "#34d399" : BORDER}`, cursor: "pointer", position: "relative", transition: "all 0.15s" }}>
            <div style={{ position: "absolute", top: 2, left: field.value === "true" ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: field.value === "true" ? "#34d399" : MUTED, transition: "left 0.15s" }} />
          </button>
        ) : (
          <button onClick={() => { setDraft(field.value); setEditing(e => !e); }} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", padding: "4px 8px", display: "flex", alignItems: "center", color: MUTED }}>
            <Edit2 size={12} />
          </button>
        )}
      </div>
      {!isToggle && (
        <div style={{ fontSize: 20, fontWeight: 800, color: GOLD_L, fontFamily: "monospace", marginBottom: editing ? 12 : 0 }}>{display}</div>
      )}
      {isToggle && (
        <div style={{ fontSize: 13, fontWeight: 700, color: field.value === "true" ? "#34d399" : "#f87171" }}>{field.value === "true" ? "Enabled" : "Disabled"}</div>
      )}
      {editing && (
        <div style={{ paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>
            <span style={{ color: "#f87171", fontFamily: "monospace" }}>{field.value}</span>
            <span style={{ margin: "0 6px" }}>→</span>
            <span style={{ color: "#34d399", fontFamily: "monospace" }}>{draft || "…"}{field.unit ? ` ${field.unit}` : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid rgba(212,175,55,0.3)`, borderRadius: 7, padding: "7px 10px", fontSize: 12, color: GOLD_L, outline: "none", fontFamily: "monospace" }} autoFocus />
            <button onClick={handleApply} style={{ padding: "7px 12px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, color: GOLD_L }}>Apply</button>
            <button onClick={() => setEditing(false)} style={{ padding: "7px 10px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 7, cursor: "pointer", color: MUTED }}><X size={12} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plan Drawer ───────────────────────────────────────────────────────────────
function PlanDrawer({ plan, onClose, onStatusChange }: { plan: Plan; onClose: () => void; onStatusChange: (id: string, s: PlanStatus) => void }) {
  const sc = PLAN_STATUS[plan.status];
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 440, zIndex: 201, background: BG, borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", boxShadow: "-12px 0 50px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${plan.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Package size={16} style={{ color: plan.color }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>{plan.name} Plan</div>
                <div style={{ fontSize: 10, color: MUTED }}>{plan.members} active members</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "4px 10px", borderRadius: 6 }}>{plan.status}</span>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED }}><X size={16} /></button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {plan.status === "ACTIVE" && <button onClick={() => onStatusChange(plan.id, "INACTIVE")} style={{ flex: 1, padding: "7px 0", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#fbbf24" }}>Deactivate</button>}
            {plan.status === "INACTIVE" && <button onClick={() => onStatusChange(plan.id, "ACTIVE")} style={{ flex: 1, padding: "7px 0", background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#34d399" }}>Activate</button>}
            <button style={{ flex: 1, padding: "7px 0", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, color: MUTED }}>Duplicate</button>
            <button onClick={() => onStatusChange(plan.id, "ARCHIVED")} style={{ flex: 1, padding: "7px 0", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 10, fontWeight: 600, color: "#f87171" }}>Archive</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Min Investment", value: $(plan.minInvest),  color: "#34d399" },
              { label: "Max Investment", value: plan.maxInvest ? $(plan.maxInvest) : "Unlimited", color: "#34d399" },
              { label: "Daily ROI",      value: `${plan.roi}%`,     color: GOLD    },
              { label: "Duration",       value: `${plan.duration} days`, color: "#60a5fa" },
              { label: "Auto Compound",  value: plan.autoCompound ? "Yes" : "No", color: plan.autoCompound ? "#34d399" : MUTED },
              { label: "Claim Window",   value: plan.claimWindow,   color: "#a78bfa" },
            ].map(s => (
              <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>{s.label.toUpperCase()}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 10 }}>BENEFITS</div>
            {plan.benefits.map(b => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <CheckCircle size={12} style={{ color: "#34d399", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{b}</span>
              </div>
            ))}
          </div>
          {plan.notes && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 6 }}>NOTES</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{plan.notes}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Section components ─────────────────────────────────────────────────────────
// Investment Plans
function InvestmentPlansSection({ plans, loading, setPlans, onView }: { plans: Plan[]; loading: boolean; setPlans: React.Dispatch<React.SetStateAction<Plan[]>>; onView: (p: Plan) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [menuId,  setMenuId]  = useState<string | null>(null);
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  const TD: React.CSSProperties = { padding: "13px 14px", fontSize: 12, color: "rgba(255,255,255,0.75)", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Investment Plans</div>
          <div style={{ fontSize: 11, color: MUTED }}>Manage all investment plan configurations.</div>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700, color: GOLD_L }}>
          <Plus size={13} /> Create Plan
        </button>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading plans…</div>
        ) : plans.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>No plans configured.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["PLAN NAME","INVESTMENT RANGE","ROI %","DURATION","AUTO COMPOUND","STATUS","MEMBERS",""].map((h, i) => <th key={h+i} style={TH}>{h}</th>)}
            </tr></thead>
            <tbody>
              {plans.map(p => {
                const sc = PLAN_STATUS[p.status];
                return (
                  <tr key={p.id} onClick={() => onView(p)} onMouseEnter={() => setHovered(p.id)} onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "pointer", background: hovered === p.id ? "rgba(255,255,255,0.025)" : "transparent" }}>
                    <td style={{ ...TD, paddingLeft: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={TD}>{$(p.minInvest)} – {p.maxInvest ? $(p.maxInvest) : "∞"}</td>
                    <td style={{ ...TD, color: GOLD, fontWeight: 700 }}>{p.roi}%</td>
                    <td style={TD}>{p.duration}d</td>
                    <td style={TD}><span style={{ fontSize: 11, fontWeight: 600, color: p.autoCompound ? "#34d399" : MUTED }}>{p.autoCompound ? "Yes" : "No"}</span></td>
                    <td style={TD}><span style={{ fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, padding: "3px 8px", borderRadius: 5 }}>{p.status}</span></td>
                    <td style={TD}>{p.members.toLocaleString()}</td>
                    <td style={{ ...TD, paddingRight: 18 }} onClick={e => e.stopPropagation()}>
                      <div style={{ position: "relative" }}>
                        <button onClick={() => setMenuId(id => id === p.id ? null : p.id)} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", padding: "4px 8px", color: MUTED }}><MoreVertical size={14} /></button>
                        {menuId === p.id && (
                          <>
                            <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={() => setMenuId(null)} />
                            <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 51, background: "hsl(222 62% 10%)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "4px 0", minWidth: 150, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
                              {[
                                { label: "View", icon: Eye,     color: "rgba(255,255,255,0.75)", onClick: () => { onView(p); setMenuId(null); } },
                                { label: "Edit", icon: Edit2,   color: GOLD_L, onClick: () => setMenuId(null) },
                                { label: "Duplicate", icon: Copy, color: MUTED, onClick: () => setMenuId(null) },
                                { label: "Archive",icon: Archive,color: "#f87171", onClick: () => { setPlans(ps => ps.map(x => x.id === p.id ? { ...x, status: "ARCHIVED" as PlanStatus } : x)); setMenuId(null); } },
                              ].map(m => (
                                <button key={m.label} onClick={m.onClick} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: m.color }}>
                                  <m.icon size={12} />{m.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
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

// Generic config section (grid of ConfigCards)
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

// Level Income section
function LevelIncomeSection({ rows, loading, onToggle }: { rows: LevelRow[]; loading: boolean; onToggle: (level: number) => void }) {
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const TD: React.CSSProperties = { padding: "13px 14px", fontSize: 12, borderBottom: `1px solid ${BORDER}` };
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Level Income</div>
        <div style={{ fontSize: 11, color: MUTED }}>Commission rates for each downline level.</div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading level config…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["LEVEL","COMMISSION %","QUALIFICATION","MAX DEPTH","STATUS"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.level}>
                  <td style={{ ...TD, paddingLeft: 18 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(212,175,55,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: GOLD }}>{r.level}</div>
                  </td>
                  <td style={{ ...TD, color: GOLD, fontWeight: 700, fontSize: 14 }}>{r.rate}%</td>
                  <td style={{ ...TD, color: MUTED }}>{r.qualification}</td>
                  <td style={{ ...TD, color: MUTED }}>10</td>
                  <td style={TD}>
                    <button onClick={() => onToggle(r.level)}
                      style={{ fontSize: 9, fontWeight: 700, color: r.status === "ACTIVE" ? "#34d399" : "#fbbf24", background: r.status === "ACTIVE" ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)", padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer" }}>
                      {r.status}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Salary section
function SalarySection({ rows, loading }: { rows: SalaryRow[]; loading: boolean }) {
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const TD: React.CSSProperties = { padding: "13px 14px", fontSize: 12, borderBottom: `1px solid ${BORDER}` };
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Salary Income</div>
        <div style={{ fontSize: 11, color: MUTED }}>Monthly salary by rank. Paid on the 1st of each month.</div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading salary config…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["RANK","MONTHLY SALARY","DIRECT REFERRALS","TEAM VOLUME","RETENTION",""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.rank}>
                  <td style={{ ...TD, paddingLeft: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: r.color }} />
                      <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{r.rank}</span>
                    </div>
                  </td>
                  <td style={{ ...TD, color: r.monthly > 0 ? "#34d399" : MUTED, fontWeight: r.monthly > 0 ? 700 : 400 }}>{r.monthly > 0 ? $(r.monthly) + "/mo" : "—"}</td>
                  <td style={{ ...TD, color: MUTED }}>{r.directs > 0 ? r.directs : "—"}</td>
                  <td style={{ ...TD, color: MUTED }}>{r.teamVolume}</td>
                  <td style={{ ...TD, color: MUTED }}>{r.retention}</td>
                  <td style={{ ...TD, paddingRight: 18 }}>
                    <button style={{ padding: "4px 10px", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 10, color: MUTED }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Rank config
function RankConfigSection({ ranks, loading }: { ranks: RankCard[]; loading: boolean }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Rank Configuration</div>
        <div style={{ fontSize: 11, color: MUTED }}>Qualification criteria and benefits for each platform rank.</div>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 12 }}>Loading rank config…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          {ranks.map(r => (
            <div key={r.id} style={{ background: CARD, border: `1px solid ${r.color}28`, borderRadius: 14, padding: "18px 18px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: r.color, opacity: 0.6 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${r.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Award size={16} style={{ color: r.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>{r.name}</div>
                  {r.salary > 0 && <div style={{ fontSize: 10, color: "#34d399", fontWeight: 600 }}>{$(r.salary)}/mo salary</div>}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Min Invest", value: $(r.minInvest) },
                  { label: "Team Size",  value: `${r.teamSize}+ members` },
                  { label: "Group Vol",  value: r.groupVolume },
                  { label: "Bonus",      value: r.bonus       },
                ].map(s => (
                  <div key={s.label} style={{ background: "rgba(255,255,255,0.025)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.82)" }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div>
                {r.benefits.map(b => (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <CheckCircle size={10} style={{ color: r.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: MUTED }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Global config (toggles)
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

// ─── Version History ────────────────────────────────────────────────────────────
function VersionHistory({ versions, loading, onRollback }: { versions: ConfigVersion[]; loading: boolean; onRollback: (v: ConfigVersion) => void }) {
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
            <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{timeAgo(v.publishedAt)} · {v.changeCount} changes</div>
            <div style={{ fontSize: 10, color: MUTED }}>{v.publishedBy.split("@")[0]}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ padding: "4px 9px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 10, color: MUTED, display: "flex", alignItems: "center", gap: 4 }}><Eye size={10} /> Compare</button>
            {i > 0 && (
              <button onClick={() => onRollback(v)} style={{ padding: "4px 9px", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 6, cursor: "pointer", fontSize: 10, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4 }}><RotateCcw size={10} /> Rollback</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Audit Log ─────────────────────────────────────────────────────────────────
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

// ─── Helpers to map API types to local UI types ────────────────────────────────

function mapSalaryRanksToRows(ranks: SalaryRankItem[]): SalaryRow[] {
  return ranks.map(r => {
    const meta = SALARY_META[r.rankName] ?? { color: MUTED, directs: 0, retention: "—" };
    const bv   = r.requiredBusiness;
    const teamVolume = bv > 0 ? (bv >= 1000 ? `$${Math.round(bv/1000)}K` : `$${bv}`) : "—";
    return {
      rank:       r.rankName,
      color:      meta.color,
      monthly:    r.monthlySalary,
      directs:    meta.directs,
      teamVolume,
      retention:  r.monthlySalary > 0 ? "Monthly" : meta.retention,
    };
  });
}

function mapSalaryRanksToCards(ranks: SalaryRankItem[]): RankCard[] {
  return ranks.map(r => {
    const meta = RANK_META[r.rankName] ?? {
      color: MUTED, gradient: "from-gray-500 to-gray-700",
      minInvest: 0, teamSize: 0, groupVolume: "—", bonus: "—", benefits: [],
    };
    return {
      id:          r.rankName.toLowerCase().replace(/\s+/g, "-"),
      name:        r.rankName,
      color:       meta.color,
      gradient:    meta.gradient,
      minInvest:   meta.minInvest,
      teamSize:    meta.teamSize,
      groupVolume: meta.groupVolume,
      bonus:       meta.bonus,
      salary:      r.monthlySalary,
      benefits:    meta.benefits,
    };
  });
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PlansPage() {
  const { toasts, toast, dismiss } = useToast();
  const [active,       setActive]      = useState<SectionId>("plans");
  const [plans,        setPlans]        = useState<Plan[]>([]);
  const [levels,       setLevels]       = useState<LevelRow[]>([]);
  const [salary,       setSalary]       = useState<SalaryRow[]>([]);
  const [ranks,        setRanks]        = useState<RankCard[]>([]);
  const [config,       setConfig]       = useState<ConfigState>({ plans: [], roi: [], binary: [], orbit: [], level: [], salary: [], ranks: [], transfer: [], limits: [], global: [] });
  const [audit,        setAudit]        = useState<AuditEntry[]>([]);
  const [versions,     setVersions]     = useState<ConfigVersion[]>([]);
  const [planDrawer,   setPlanDrawer]   = useState<Plan | null>(null);
  const [confirmPending, setConfirmPending] = useState<ConfirmPending | null>(null);
  const [publishing,   setPublishing]   = useState(false);

  // Loading flags
  const [loadingPlans,    setLoadingPlans]    = useState(true);
  const [loadingConfig,   setLoadingConfig]   = useState(false);
  const [loadingLevel,    setLoadingLevel]    = useState(true);
  const [loadingSalary,   setLoadingSalary]   = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [loadingAudit,    setLoadingAudit]    = useState(true);

  // Track which config sections are loaded to avoid duplicate fetches
  const configLoaded = useRef(false);

  // ─── Initial data load ───────────────────────────────────────────────────────
  useEffect(() => {
    // Parallel initial fetches
    adminGetPlans()
      .then(r => setPlans(r.plans as Plan[]))
      .catch(() => toast("Failed to load plans.", "error"))
      .finally(() => setLoadingPlans(false));

    adminGetLevelConfig()
      .then(r => setLevels(r.levels))
      .catch(() => {})
      .finally(() => setLoadingLevel(false));

    adminGetSalaryRanks()
      .then(r => {
        setSalary(mapSalaryRanksToRows(r.ranks));
        setRanks(mapSalaryRanksToCards(r.ranks));
      })
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

  // ─── Lazy-load system config on first config section visit ───────────────────
  useEffect(() => {
    const isConfigSection = ["roi","binary","orbit","transfer","limits","global"].includes(active);
    if (!isConfigSection || configLoaded.current) return;
    setLoadingConfig(true);
    adminGetPlanConfig()
      .then(sections => {
        configLoaded.current = true;
        setConfig(c => ({
          ...c,
          roi:      sections.roi      ?? [],
          binary:   sections.binary   ?? [],
          orbit:    sections.orbit    ?? [],
          transfer: sections.transfer ?? [],
          limits:   sections.limits   ?? [],
          global:   sections.global   ?? [],
        }));
      })
      .catch(() => toast("Failed to load configuration.", "error"))
      .finally(() => setLoadingConfig(false));
  }, [active]);

  // ─── Refresh audit + versions after a save ───────────────────────────────────
  const refreshSidebar = useCallback(() => {
    adminGetConfigVersions()
      .then(r => setVersions(r.versions.map(v => ({ ...v, publishedAt: new Date(v.publishedAt) }))))
      .catch(() => {});
    adminGetConfigAudit()
      .then(r => setAudit(r.entries.map(e => ({ ...e, timestamp: new Date(e.timestamp) }))))
      .catch(() => {});
  }, []);

  // ─── Handle config field edit ────────────────────────────────────────────────
  const handleEdit = useCallback(async (sectionId: SectionId, field: ConfigField, newVal: string) => {
    if (field.type === "toggle") {
      // Optimistic update
      setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === field.key ? { ...f, value: newVal } : f) }));
      try {
        await adminSaveConfigField(field.key, newVal, field.value, "Feature flag toggled by admin.", field.label);
        refreshSidebar();
        toast(`${field.label} ${newVal === "true" ? "enabled" : "disabled"}.`, newVal === "true" ? "success" : "info");
      } catch {
        // Rollback on failure
        setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === field.key ? { ...f, value: field.value } : f) }));
        toast("Failed to save configuration.", "error");
      }
    } else {
      setConfirmPending({
        configName: field.label,
        oldValue:   field.unit ? `${field.value} ${field.unit}` : field.value,
        newValue:   field.unit ? `${newVal} ${field.unit}` : newVal,
        sectionId,
        key:        field.key,
        rawNew:     newVal,
        label:      field.label,
      });
    }
  }, [toast, refreshSidebar]);

  const handleConfirm = useCallback(async (reason: string, _notes: string) => {
    if (!confirmPending) return;
    const { sectionId, key, configName, oldValue, rawNew, label } = confirmPending;
    setConfirmPending(null);

    // Optimistic update
    setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === key ? { ...f, value: rawNew } : f) }));

    try {
      await adminSaveConfigField(key, rawNew, oldValue, reason, label);
      refreshSidebar();
      toast(`${configName} updated successfully.`, "success");
    } catch {
      // Rollback
      setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === key ? { ...f, value: oldValue } : f) }));
      toast("Failed to save configuration.", "error");
    }
  }, [confirmPending, toast, refreshSidebar]);

  const handlePublish = useCallback(() => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      toast("Configuration is up to date. All changes are saved automatically.", "info");
    }, 800);
  }, [toast]);

  const handleRollback = useCallback((v: ConfigVersion) => {
    toast(`Rollback to v${v.version} is not available — changes are applied incrementally.`, "info");
  }, [toast]);

  // ─── Level toggle ─────────────────────────────────────────────────────────────
  const handleLevelToggle = useCallback(async (level: number) => {
    const newLevels = levels.map(r => r.level === level ? { ...r, status: r.status === "ACTIVE" ? "INACTIVE" as const : "ACTIVE" as const } : r);
    setLevels(newLevels);
    try {
      await adminSaveLevelConfig(newLevels);
      refreshSidebar();
      toast(`Level ${level} income ${newLevels.find(r => r.level === level)?.status?.toLowerCase()}.`, "info");
    } catch {
      setLevels(levels);
      toast("Failed to save level config.", "error");
    }
  }, [levels, toast, refreshSidebar]);

  // ─── Plan status change ───────────────────────────────────────────────────────
  const handlePlanStatusChange = useCallback(async (id: string, status: PlanStatus) => {
    setPlans(ps => ps.map(p => p.id === id ? { ...p, status } : p));
    setPlanDrawer(null);
    try {
      await adminUpdatePlanStatus(id, status);
      refreshSidebar();
      toast(`Plan status updated to ${status}.`, "info");
    } catch {
      setPlans(ps => ps.map(p => p.id === id ? { ...p, status: p.status } : p));
      toast("Failed to update plan status.", "error");
    }
  }, [toast, refreshSidebar]);

  // Per-section edit handler
  const makeEditHandler = (sid: SectionId) => (f: ConfigField, v: string) => handleEdit(sid, f, v);

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

        {/* Three-column layout: Left nav + Center content + Right sidebar */}
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
            {active === "plans"    && <InvestmentPlansSection plans={plans} loading={loadingPlans} setPlans={setPlans} onView={p => setPlanDrawer(p)} />}
            {active === "roi"      && <ConfigSection title="ROI Engine" subtitle="Configure the daily ROI distribution engine." fields={config.roi} loading={loadingConfig} onEdit={makeEditHandler("roi")} />}
            {active === "binary"   && <ConfigSection title="Binary Matching" subtitle="Configure binary network matching rules and caps." fields={config.binary} loading={loadingConfig} onEdit={makeEditHandler("binary")} />}
            {active === "orbit"    && <ConfigSection title="Binary Orbit" subtitle="Configure the binary orbit reward system." fields={config.orbit} loading={loadingConfig} onEdit={makeEditHandler("orbit")} />}
            {active === "level"    && <LevelIncomeSection rows={levels} loading={loadingLevel} onToggle={handleLevelToggle} />}
            {active === "salary"   && <SalarySection rows={salary} loading={loadingSalary} />}
            {active === "ranks"    && <RankConfigSection ranks={ranks} loading={loadingSalary} />}
            {active === "transfer" && <ConfigSection title="Transfer Rules" subtitle="72-hour release and transfer processing configuration." fields={config.transfer} loading={loadingConfig} onEdit={makeEditHandler("transfer")} />}
            {active === "limits"   && <ConfigSection title="Platform Limits" subtitle="System-wide investment, withdrawal, and payout limits." fields={config.limits} loading={loadingConfig} onEdit={makeEditHandler("limits")} />}
            {active === "global"   && <GlobalConfigSection fields={config.global} loading={loadingConfig} onEdit={makeEditHandler("global")} />}
          </div>

          {/* Right sidebar */}
          <div>
            <VersionHistory versions={versions} loading={loadingVersions} onRollback={handleRollback} />
            <AuditLog entries={audit} loading={loadingAudit} />
          </div>
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>

      {planDrawer && (
        <PlanDrawer
          plan={plans.find(p => p.id === planDrawer.id) ?? planDrawer}
          onClose={() => setPlanDrawer(null)}
          onStatusChange={handlePlanStatusChange}
        />
      )}
      {confirmPending && (
        <ConfirmModal pending={confirmPending} onConfirm={handleConfirm} onCancel={() => setConfirmPending(null)} />
      )}
    </AdminLayout>
  );
}
