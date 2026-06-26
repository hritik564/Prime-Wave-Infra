import { useState, useCallback, memo, useMemo } from "react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  Package, Zap, BarChart2, TrendingUp, DollarSign, Award,
  ArrowRightLeft, Shield, Globe, Settings, Edit2, Check,
  X, MoreVertical, ChevronRight, History, FileText,
  RotateCcw, Eye, Copy, Archive, Trash2, CheckCircle,
  AlertTriangle, Plus, Download, RefreshCw,
} from "lucide-react";

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

// ─── Mock data ─────────────────────────────────────────────────────────────────
const INITIAL_PLANS: Plan[] = [
  { id: "p1", name: "Starter",  color: "#60a5fa", minInvest: 100,   maxInvest: 999,    roi: 0.5,  duration: 365, autoCompound: false, status: "ACTIVE",   members: 824,  benefits: ["Daily ROI","24h claim window","Level income eligible"],       notes: "Entry plan for new members.",      claimWindow: "24 hours" },
  { id: "p2", name: "Growth",   color: "#34d399", minInvest: 1000,  maxInvest: 4999,   roi: 0.75, duration: 365, autoCompound: false, status: "ACTIVE",   members: 412,  benefits: ["Daily ROI","Binary eligible","Level income up to level 5"],   notes: "Most popular plan.",               claimWindow: "24 hours" },
  { id: "p3", name: "Pro",      color: GOLD,      minInvest: 5000,  maxInvest: 9999,   roi: 1.0,  duration: 365, autoCompound: true,  status: "ACTIVE",   members: 187,  benefits: ["Daily ROI","Auto-compound","Binary eligible","Orbit eligible"], notes: "Pro-level compensation.",          claimWindow: "24 hours" },
  { id: "p4", name: "Elite",    color: "#a78bfa", minInvest: 10000, maxInvest: 49999,  roi: 1.25, duration: 365, autoCompound: true,  status: "ACTIVE",   members: 64,   benefits: ["Priority processing","Salary eligible","All income types"],   notes: "Requires Gold rank minimum.",      claimWindow: "12 hours" },
  { id: "p5", name: "Crown",    color: "#f87171", minInvest: 50000, maxInvest: null,   roi: 1.5,  duration: 365, autoCompound: true,  status: "ACTIVE",   members: 12,   benefits: ["Dedicated support","Crown bonus","All income types"],           notes: "Invite only. Crown rank required.", claimWindow: "12 hours" },
  { id: "p6", name: "Legacy",   color: MUTED,     minInvest: 500,   maxInvest: 4999,   roi: 0.6,  duration: 180, autoCompound: false, status: "ARCHIVED", members: 0,    benefits: ["Basic ROI"],                                                   notes: "Retired plan.",                    claimWindow: "48 hours" },
];

const INITIAL_LEVELS: LevelRow[] = [
  { level: 1, rate: 5.0, qualification: "Any Active Plan",  status: "ACTIVE" },
  { level: 2, rate: 3.0, qualification: "Bronze or above",  status: "ACTIVE" },
  { level: 3, rate: 2.0, qualification: "Silver or above",  status: "ACTIVE" },
  { level: 4, rate: 1.5, qualification: "Gold or above",    status: "ACTIVE" },
  { level: 5, rate: 1.0, qualification: "Gold or above",    status: "ACTIVE" },
  { level: 6, rate: 0.8, qualification: "Diamond or above", status: "ACTIVE" },
  { level: 7, rate: 0.6, qualification: "Diamond or above", status: "ACTIVE" },
  { level: 8, rate: 0.5, qualification: "Crown",            status: "ACTIVE" },
  { level: 9, rate: 0.4, qualification: "Crown",            status: "ACTIVE" },
  { level:10, rate: 0.3, qualification: "Crown",            status: "INACTIVE" },
];

const INITIAL_SALARY: SalaryRow[] = [
  { rank: "Bronze",    color: "#cd7f32", monthly: 0,      directs: 0,   teamVolume: "—",      retention: "—" },
  { rank: "Silver",    color: "#c0c0c0", monthly: 0,      directs: 0,   teamVolume: "—",      retention: "—" },
  { rank: "Gold",      color: GOLD,      monthly: 0,      directs: 3,   teamVolume: "$10K",   retention: "Monthly" },
  { rank: "Diamond",   color: "#a5f3fc", monthly: 2000,   directs: 5,   teamVolume: "$50K",   retention: "Monthly" },
  { rank: "Crown",     color: "#a78bfa", monthly: 5000,   directs: 10,  teamVolume: "$200K",  retention: "Monthly" },
  { rank: "Royal Crown",color:"#f87171", monthly: 10000,  directs: 20,  teamVolume: "$500K",  retention: "Monthly" },
];

const INITIAL_RANKS: RankCard[] = [
  { id: "bronze",  name: "Bronze",      color: "#cd7f32", gradient: "from-[#cd7f32] to-[#8B4513]", minInvest: 100,   teamSize: 2,   groupVolume: "$500",    bonus: "$25",     salary: 0,     benefits: ["Level 1-2 income","Binary eligible"] },
  { id: "silver",  name: "Silver",      color: "#c0c0c0", gradient: "from-[#c0c0c0] to-[#808080]", minInvest: 500,   teamSize: 5,   groupVolume: "$2K",     bonus: "$100",    salary: 0,     benefits: ["Level 1-3 income","Binary + Orbit"] },
  { id: "gold",    name: "Gold",        color: GOLD,      gradient: "from-[#D4AF37] to-[#B8860B]", minInvest: 1000,  teamSize: 10,  groupVolume: "$10K",    bonus: "$500",    salary: 0,     benefits: ["Level 1-5 income","All binary types"] },
  { id: "diamond", name: "Diamond",     color: "#a5f3fc", gradient: "from-[#a5f3fc] to-[#0ea5e9]", minInvest: 5000,  teamSize: 25,  groupVolume: "$50K",    bonus: "$2000",   salary: 2000,  benefits: ["Level 1-7 income","Salary eligible","Priority support"] },
  { id: "crown",   name: "Crown",       color: "#a78bfa", gradient: "from-[#a78bfa] to-[#7c3aed]", minInvest: 10000, teamSize: 50,  groupVolume: "$200K",   bonus: "$5000",   salary: 5000,  benefits: ["Level 1-9 income","Full compensation","Dedicated manager"] },
  { id: "royal",   name: "Royal Crown", color: "#f87171", gradient: "from-[#f87171] to-[#dc2626]", minInvest: 50000, teamSize: 100, groupVolume: "$500K",   bonus: "$10000",  salary: 10000, benefits: ["All income types","Board access","Crown ceremony invite"] },
];

type SectionId = "plans" | "roi" | "binary" | "orbit" | "level" | "salary" | "ranks" | "transfer" | "limits" | "global";

type ConfigState = Record<SectionId, ConfigField[]>;

const INITIAL_CONFIG: ConfigState = {
  plans: [],
  roi: [
    { key: "roi.default_rate",  label: "Default ROI Rate",     value: "0.5",   unit: "%/day",  type: "number", description: "Base daily ROI applied to all eligible plans." },
    { key: "roi.max_cap",       label: "Maximum ROI Cap",      value: "200",   unit: "%",      type: "number", description: "Total lifetime ROI cap as % of principal." },
    { key: "roi.duration",      label: "ROI Duration",         value: "365",   unit: "days",   type: "number", description: "Plan duration before principal lock expires." },
    { key: "roi.claim_window",  label: "Claim Window",         value: "24",    unit: "hours",  type: "number", description: "Hours within which ROI must be claimed." },
    { key: "roi.exec_time",     label: "Execution Time",       value: "00:00", unit: "UTC",    type: "text",   description: "Daily cron time for ROI distribution." },
    { key: "roi.exec_freq",     label: "Execution Frequency",  value: "Daily", type: "text",               description: "How often the ROI engine runs." },
  ],
  binary: [
    { key: "bin.match_rate",    label: "Matching Rate",        value: "10",    unit: "%",      type: "number", description: "% of weaker leg BV awarded as matching bonus." },
    { key: "bin.daily_cap",     label: "Daily Match Cap",      value: "10000", unit: "$",      type: "number", description: "Max daily binary reward per member." },
    { key: "bin.carry_cap",     label: "Carry Forward Cap",    value: "50000", unit: "BV",     type: "number", description: "Max carry-forward BV allowed per leg." },
    { key: "bin.flush_cycle",   label: "Flush Cycle",          value: "Daily", type: "text",               description: "When unmatched BV is flushed." },
    { key: "bin.exec_time",     label: "Execution Time",       value: "00:30", unit: "UTC",    type: "text",   description: "Daily matching run time." },
    { key: "bin.carry_exp",     label: "Carry Expiry",         value: "30",    unit: "days",   type: "number", description: "Days before carry forward expires." },
  ],
  orbit: [
    { key: "orb.reward_rate",   label: "Orbit Reward Rate",    value: "5",     unit: "%",      type: "number", description: "% orbit reward on top of matching." },
    { key: "orb.min_bv",        label: "Minimum BV Required",  value: "5000",  unit: "BV/leg", type: "number", description: "BV each leg must achieve to trigger orbit." },
    { key: "orb.flush_cycle",   label: "Flush Logic",          value: "Weekly",type: "text",               description: "Orbit BV flush frequency." },
    { key: "orb.exec_day",      label: "Execution Day",        value: "Monday",type: "text",               description: "Day orbit rewards are distributed." },
    { key: "orb.exec_time",     label: "Execution Time",       value: "01:00", unit: "UTC",    type: "text",   description: "Weekly orbit run time." },
    { key: "orb.carry_days",    label: "Carry Forward Days",   value: "30",    unit: "days",   type: "number", description: "Days orbit BV can carry forward." },
  ],
  level: [],
  salary: [],
  ranks: [],
  transfer: [
    { key: "tr.release_hours",  label: "Release Window",       value: "72",    unit: "hours",  type: "number", description: "Hours before deposit is released for use." },
    { key: "tr.hourly_rate",    label: "Hourly Release Rate",  value: "1.39",  unit: "%/h",    type: "number", description: "% of transfer released per hour." },
    { key: "tr.fee_pct",        label: "Transfer Fee",         value: "2",     unit: "%",      type: "number", description: "Platform fee applied to each transfer." },
    { key: "tr.min_amount",     label: "Minimum Transfer",     value: "10",    unit: "$",      type: "number", description: "Minimum single transfer amount." },
    { key: "tr.max_amount",     label: "Maximum Transfer",     value: "50000", unit: "$",      type: "number", description: "Maximum single transfer amount." },
    { key: "tr.max_queue",      label: "Maximum Queue Size",   value: "100",   unit: "txns",   type: "number", description: "Max concurrent transfers in queue." },
  ],
  limits: [
    { key: "lim.max_invest",    label: "Maximum Investment",   value: "500000",unit: "$",      type: "number", description: "Maximum cumulative investment per user." },
    { key: "lim.min_withdraw",  label: "Minimum Withdrawal",   value: "20",    unit: "$",      type: "number", description: "Minimum withdrawal request amount." },
    { key: "lim.max_withdraw",  label: "Maximum Withdrawal",   value: "100000",unit: "$",      type: "number", description: "Max single withdrawal amount." },
    { key: "lim.daily_payout",  label: "Max Daily Payout",     value: "50000", unit: "$",      type: "number", description: "Maximum total payout per member per day." },
    { key: "lim.max_binary",    label: "Max Binary Reward",    value: "10000", unit: "$/day",  type: "number", description: "Binary matching daily reward ceiling." },
    { key: "lim.max_salary",    label: "Maximum Salary",       value: "10000", unit: "$/mo",   type: "number", description: "Maximum monthly salary any rank can earn." },
  ],
  global: [
    { key: "gl.maintenance",    label: "Maintenance Mode",     value: "false", type: "toggle", description: "Suspends all member-facing operations." },
    { key: "gl.registration",   label: "Registration Enabled", value: "true",  type: "toggle", description: "New member registration toggle." },
    { key: "gl.investment",     label: "Investment Enabled",   value: "true",  type: "toggle", description: "Allow new investment creation." },
    { key: "gl.withdrawal",     label: "Withdrawal Enabled",   value: "true",  type: "toggle", description: "Allow withdrawal requests." },
    { key: "gl.binary",         label: "Binary Enabled",       value: "true",  type: "toggle", description: "Binary matching engine active." },
    { key: "gl.notifications",  label: "Notifications Enabled",value: "true",  type: "toggle", description: "Push and email notification system." },
    { key: "gl.kyc_required",   label: "KYC Required",         value: "false", type: "toggle", description: "Require identity verification for withdrawals." },
  ],
};

const INITIAL_AUDIT: AuditEntry[] = [
  { id: "AU1", timestamp: new Date(Date.now()-2*3600000),  admin: "superadmin@primewave.io", configName: "Default ROI Rate",      oldValue: "0.4%",      newValue: "0.5%",     reason: "Platform adjustment per board decision Q2." },
  { id: "AU2", timestamp: new Date(Date.now()-26*3600000), admin: "finance@primewave.io",    configName: "Daily Match Cap",        oldValue: "$8,000",    newValue: "$10,000",  reason: "Increased to accommodate growth." },
  { id: "AU3", timestamp: new Date(Date.now()-72*3600000), admin: "rewards@primewave.io",    configName: "Carry Forward Cap",      oldValue: "40,000 BV", newValue: "50,000 BV",reason: "Member feedback, carry forward too restrictive." },
  { id: "AU4", timestamp: new Date(Date.now()-120*3600000),admin: "superadmin@primewave.io", configName: "Transfer Fee",           oldValue: "3%",        newValue: "2%",       reason: "Competitive pricing adjustment." },
  { id: "AU5", timestamp: new Date(Date.now()-168*3600000),admin: "finance@primewave.io",    configName: "Maximum Withdrawal",     oldValue: "$50,000",   newValue: "$100,000", reason: "VIP member accommodation." },
];

const INITIAL_VERSIONS: ConfigVersion[] = [
  { id: "V4", version: "1.4", publishedBy: "superadmin@primewave.io",  publishedAt: new Date(Date.now()-2*3600000),  changeCount: 2 },
  { id: "V3", version: "1.3", publishedBy: "finance@primewave.io",     publishedAt: new Date(Date.now()-7*86400000), changeCount: 5 },
  { id: "V2", version: "1.2", publishedBy: "rewards@primewave.io",     publishedAt: new Date(Date.now()-14*86400000),changeCount: 3 },
  { id: "V1", version: "1.1", publishedBy: "superadmin@primewave.io",  publishedAt: new Date(Date.now()-30*86400000),changeCount: 8 },
];

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
interface ConfirmPending { configName: string; oldValue: string; newValue: string; sectionId: SectionId; key: string }

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
function InvestmentPlansSection({ plans, setPlans, onView }: { plans: Plan[]; setPlans: React.Dispatch<React.SetStateAction<Plan[]>>; onView: (p: Plan) => void }) {
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
                              { label: "Archive",icon: Archive,color: "#f87171", onClick: () => { setPlans(ps => ps.map(x => x.id === p.id ? { ...x, status: "ARCHIVED" } : x)); setMenuId(null); } },
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
      </div>
    </div>
  );
}

// Generic config section (grid of ConfigCards)
function ConfigSection({ title, subtitle, fields, onEdit }: { title: string; subtitle: string; fields: ConfigField[]; onEdit: (f: ConfigField, v: string) => void }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{title}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{subtitle}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {fields.map(f => <ConfigCard key={f.key} field={f} onEdit={onEdit} />)}
      </div>
    </div>
  );
}

// Level Income section
function LevelIncomeSection({ rows, setRows }: { rows: LevelRow[]; setRows: React.Dispatch<React.SetStateAction<LevelRow[]>> }) {
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const TD: React.CSSProperties = { padding: "13px 14px", fontSize: 12, borderBottom: `1px solid ${BORDER}` };
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Level Income</div>
        <div style={{ fontSize: 11, color: MUTED }}>Commission rates for each downline level.</div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
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
                  <button onClick={() => setRows(rs => rs.map(x => x.level === r.level ? { ...x, status: x.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } : x))}
                    style={{ fontSize: 9, fontWeight: 700, color: r.status === "ACTIVE" ? "#34d399" : "#fbbf24", background: r.status === "ACTIVE" ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)", padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer" }}>
                    {r.status}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Salary section
function SalarySection({ rows }: { rows: SalaryRow[] }) {
  const TH: React.CSSProperties = { padding: "10px 14px", fontSize: 10, fontWeight: 700, color: MUTED, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const TD: React.CSSProperties = { padding: "13px 14px", fontSize: 12, borderBottom: `1px solid ${BORDER}` };
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Salary Income</div>
        <div style={{ fontSize: 11, color: MUTED }}>Monthly salary by rank. Paid on the 1st of each month.</div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
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
      </div>
    </div>
  );
}

// Rank config
function RankConfigSection({ ranks }: { ranks: RankCard[] }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Rank Configuration</div>
        <div style={{ fontSize: 11, color: MUTED }}>Qualification criteria and benefits for each platform rank.</div>
      </div>
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
    </div>
  );
}

// Global config (toggles)
function GlobalConfigSection({ fields, onEdit }: { fields: ConfigField[]; onEdit: (f: ConfigField, v: string) => void }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Global Configuration</div>
        <div style={{ fontSize: 11, color: MUTED }}>Platform-wide feature flags. Changes take effect immediately.</div>
      </div>
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
    </div>
  );
}

// ─── Version History ────────────────────────────────────────────────────────────
function VersionHistory({ versions, onRollback }: { versions: ConfigVersion[]; onRollback: (v: ConfigVersion) => void }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", marginBottom: 14 }}>VERSION HISTORY</div>
      {versions.map((v, i) => (
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
function AuditLog({ entries }: { entries: AuditEntry[] }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.07em" }}>CHANGE AUDIT LOG</div>
        <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, borderRadius: 6, cursor: "pointer", fontSize: 10, color: MUTED }}><Download size={10} /> Export</button>
      </div>
      {entries.slice(0, 8).map((e, i) => (
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PlansPage() {
  const { toasts, toast, dismiss } = useToast();
  const [active,  setActive]  = useState<SectionId>("plans");
  const [plans,   setPlans]   = useState<Plan[]>(INITIAL_PLANS);
  const [levels,  setLevels]  = useState<LevelRow[]>(INITIAL_LEVELS);
  const [config,  setConfig]  = useState<ConfigState>(INITIAL_CONFIG);
  const [audit,   setAudit]   = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [versions,setVersions]= useState<ConfigVersion[]>(INITIAL_VERSIONS);
  const [planDrawer, setPlanDrawer] = useState<Plan | null>(null);
  const [confirmPending, setConfirmPending] = useState<ConfirmPending | null>(null);
  const [publishing, setPublishing] = useState(false);

  const handleEdit = useCallback((sectionId: SectionId, field: ConfigField, newVal: string) => {
    if (field.type === "toggle") {
      // Toggles apply immediately with audit
      setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === field.key ? { ...f, value: newVal } : f) }));
      const entry: AuditEntry = { id: `AU-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io", configName: field.label, oldValue: field.value === "true" ? "Enabled" : "Disabled", newValue: newVal === "true" ? "Enabled" : "Disabled", reason: "Feature flag toggled by admin." };
      setAudit(a => [entry, ...a]);
      toast(`${field.label} ${newVal === "true" ? "enabled" : "disabled"}.`, newVal === "true" ? "success" : "info");
    } else {
      setConfirmPending({ configName: field.label, oldValue: field.unit ? `${field.value} ${field.unit}` : field.value, newValue: field.unit ? `${newVal} ${field.unit}` : newVal, sectionId, key: field.key });
    }
  }, [toast]);

  const handleConfirm = useCallback((reason: string, _notes: string) => {
    if (!confirmPending) return;
    const { sectionId, key, configName, oldValue, newValue } = confirmPending;
    setConfig(c => ({ ...c, [sectionId]: c[sectionId].map(f => f.key === key ? { ...f, value: newValue.replace(/[^0-9.:a-zA-Z%\s\/]/g, "") } : f) }));
    const entry: AuditEntry = { id: `AU-${Date.now()}`, timestamp: new Date(), admin: "superadmin@primewave.io", configName, oldValue, newValue, reason };
    setAudit(a => [entry, ...a]);
    setConfirmPending(null);
    toast(`${configName} updated successfully.`, "success");
  }, [confirmPending, toast]);

  const handlePublish = useCallback(() => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      const newVer: ConfigVersion = { id: `V-${Date.now()}`, version: (parseFloat(versions[0].version) + 0.1).toFixed(1), publishedBy: "superadmin@primewave.io", publishedAt: new Date(), changeCount: 1 };
      setVersions(v => [newVer, ...v]);
      toast("Configuration published successfully. v" + newVer.version + " is now live.", "success");
    }, 1800);
  }, [versions, toast]);

  const handleRollback = useCallback((v: ConfigVersion) => {
    toast(`Rolled back to v${v.version}. Configuration restored.`, "info");
  }, [toast]);

  // Memoize the make-edit handler per section
  const makeEditHandler = (sid: SectionId) => (f: ConfigField, v: string) => handleEdit(sid, f, v);

  const sectionTitle: Record<SectionId, string> = {
    plans: "Investment Plans", roi: "ROI Engine", binary: "Binary Matching", orbit: "Binary Orbit",
    level: "Level Income", salary: "Salary Income", ranks: "Rank Configuration",
    transfer: "Transfer Rules", limits: "Platform Limits", global: "Global Configuration",
  };

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

        {/* Two-column layout: Left nav + Right content */}
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
            {active === "plans"    && <InvestmentPlansSection plans={plans} setPlans={setPlans} onView={p => { setPlanDrawer(p); }} />}
            {active === "roi"      && <ConfigSection title="ROI Engine" subtitle="Configure the daily ROI distribution engine." fields={config.roi} onEdit={makeEditHandler("roi")} />}
            {active === "binary"   && <ConfigSection title="Binary Matching" subtitle="Configure binary network matching rules and caps." fields={config.binary} onEdit={makeEditHandler("binary")} />}
            {active === "orbit"    && <ConfigSection title="Binary Orbit" subtitle="Configure the binary orbit reward system." fields={config.orbit} onEdit={makeEditHandler("orbit")} />}
            {active === "level"    && <LevelIncomeSection rows={levels} setRows={setLevels} />}
            {active === "salary"   && <SalarySection rows={INITIAL_SALARY} />}
            {active === "ranks"    && <RankConfigSection ranks={INITIAL_RANKS} />}
            {active === "transfer" && <ConfigSection title="Transfer Rules" subtitle="72-hour release and transfer processing configuration." fields={config.transfer} onEdit={makeEditHandler("transfer")} />}
            {active === "limits"   && <ConfigSection title="Platform Limits" subtitle="System-wide investment, withdrawal, and payout limits." fields={config.limits} onEdit={makeEditHandler("limits")} />}
            {active === "global"   && <GlobalConfigSection fields={config.global} onEdit={makeEditHandler("global")} />}
          </div>

          {/* Right sidebar: Version History + Audit */}
          <div>
            <VersionHistory versions={versions} onRollback={handleRollback} />
            <AuditLog entries={audit} />
          </div>
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>

      {planDrawer && (
        <PlanDrawer
          plan={plans.find(p => p.id === planDrawer.id) ?? planDrawer}
          onClose={() => setPlanDrawer(null)}
          onStatusChange={(id, s) => { setPlans(ps => ps.map(p => p.id === id ? { ...p, status: s } : p)); setPlanDrawer(null); toast(`Plan status updated to ${s}.`, "info"); }}
        />
      )}
      {confirmPending && (
        <ConfirmModal pending={confirmPending} onConfirm={handleConfirm} onCancel={() => setConfirmPending(null)} />
      )}
    </AdminLayout>
  );
}
