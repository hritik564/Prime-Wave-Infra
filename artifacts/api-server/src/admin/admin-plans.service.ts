import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export interface PlanCatalogItem {
  id:           string;
  name:         string;
  color:        string;
  minInvest:    number;
  maxInvest:    number | null;
  roi:          number;
  duration:     number;
  autoCompound: boolean;
  status:       PlanStatus;
  members:      number;
  benefits:     string[];
  notes:        string;
  claimWindow:  string;
}

export interface LevelConfigItem {
  level:         number;
  rate:          number;
  qualification: string;
  status:        "ACTIVE" | "INACTIVE";
}

export interface VersionEntry {
  id:          string;
  version:     string;
  publishedBy: string;
  publishedAt: string;
  changeCount: number;
}

// ─── Default data ─────────────────────────────────────────────────────────────

const DEFAULT_PLANS: PlanCatalogItem[] = [
  { id: "p1", name: "Starter",  color: "#60a5fa", minInvest: 100,   maxInvest: 999,    roi: 0.5,  duration: 365, autoCompound: false, status: "ACTIVE",   members: 0, benefits: ["Daily ROI","24h claim window","Level income eligible"],       notes: "Entry plan for new members.",      claimWindow: "24 hours" },
  { id: "p2", name: "Growth",   color: "#34d399", minInvest: 1000,  maxInvest: 4999,   roi: 0.75, duration: 365, autoCompound: false, status: "ACTIVE",   members: 0, benefits: ["Daily ROI","Binary eligible","Level income up to level 5"],   notes: "Most popular plan.",               claimWindow: "24 hours" },
  { id: "p3", name: "Pro",      color: "#D4AF37", minInvest: 5000,  maxInvest: 9999,   roi: 1.0,  duration: 365, autoCompound: true,  status: "ACTIVE",   members: 0, benefits: ["Daily ROI","Auto-compound","Binary eligible","Orbit eligible"], notes: "Pro-level compensation.",          claimWindow: "24 hours" },
  { id: "p4", name: "Elite",    color: "#a78bfa", minInvest: 10000, maxInvest: 49999,  roi: 1.25, duration: 365, autoCompound: true,  status: "ACTIVE",   members: 0, benefits: ["Priority processing","Salary eligible","All income types"],   notes: "Requires Gold rank minimum.",      claimWindow: "12 hours" },
  { id: "p5", name: "Crown",    color: "#f87171", minInvest: 50000, maxInvest: null,   roi: 1.5,  duration: 365, autoCompound: true,  status: "ACTIVE",   members: 0, benefits: ["Dedicated support","Crown bonus","All income types"],           notes: "Invite only. Crown rank required.", claimWindow: "12 hours" },
  { id: "p6", name: "Legacy",   color: "rgba(170,179,197,0.48)", minInvest: 500, maxInvest: 4999, roi: 0.6, duration: 180, autoCompound: false, status: "ARCHIVED", members: 0, benefits: ["Basic ROI"], notes: "Retired plan.", claimWindow: "48 hours" },
];

const DEFAULT_LEVELS: LevelConfigItem[] = [
  { level: 1, rate: 5.0, qualification: "Any Active Plan",  status: "ACTIVE"   },
  { level: 2, rate: 3.0, qualification: "Bronze or above",  status: "ACTIVE"   },
  { level: 3, rate: 2.0, qualification: "Silver or above",  status: "ACTIVE"   },
  { level: 4, rate: 1.5, qualification: "Gold or above",    status: "ACTIVE"   },
  { level: 5, rate: 1.0, qualification: "Gold or above",    status: "ACTIVE"   },
  { level: 6, rate: 0.8, qualification: "Diamond or above", status: "ACTIVE"   },
  { level: 7, rate: 0.6, qualification: "Diamond or above", status: "ACTIVE"   },
  { level: 8, rate: 0.5, qualification: "Crown",            status: "ACTIVE"   },
  { level: 9, rate: 0.4, qualification: "Crown",            status: "ACTIVE"   },
  { level:10, rate: 0.3, qualification: "Crown",            status: "INACTIVE" },
];

// All config keys with their defaults, labels, and section groupings
interface ConfigDef {
  key: string; value: string; unit?: string;
  type: "text" | "number" | "toggle";
  label: string; description: string; section: string;
}

const CONFIG_DEFS: ConfigDef[] = [
  { section:"roi",      key:"roi.default_rate", value:"0.5",    unit:"%/day",  type:"number", label:"Default ROI Rate",     description:"Base daily ROI applied to all eligible plans." },
  { section:"roi",      key:"roi.max_cap",       value:"200",    unit:"%",      type:"number", label:"Maximum ROI Cap",      description:"Total lifetime ROI cap as % of principal." },
  { section:"roi",      key:"roi.duration",      value:"365",    unit:"days",   type:"number", label:"ROI Duration",         description:"Plan duration before principal lock expires." },
  { section:"roi",      key:"roi.claim_window",  value:"24",     unit:"hours",  type:"number", label:"Claim Window",         description:"Hours within which ROI must be claimed." },
  { section:"roi",      key:"roi.exec_time",     value:"00:00",  unit:"UTC",    type:"text",   label:"Execution Time",       description:"Daily cron time for ROI distribution." },
  { section:"roi",      key:"roi.exec_freq",     value:"Daily",                 type:"text",   label:"Execution Frequency",  description:"How often the ROI engine runs." },
  { section:"binary",   key:"bin.match_rate",    value:"10",     unit:"%",      type:"number", label:"Matching Rate",        description:"% of weaker leg BV awarded as matching bonus." },
  { section:"binary",   key:"bin.daily_cap",     value:"10000",  unit:"$",      type:"number", label:"Daily Match Cap",      description:"Max daily binary reward per member." },
  { section:"binary",   key:"bin.carry_cap",     value:"50000",  unit:"BV",     type:"number", label:"Carry Forward Cap",    description:"Max carry-forward BV allowed per leg." },
  { section:"binary",   key:"bin.flush_cycle",   value:"Daily",                 type:"text",   label:"Flush Cycle",          description:"When unmatched BV is flushed." },
  { section:"binary",   key:"bin.exec_time",     value:"00:30",  unit:"UTC",    type:"text",   label:"Execution Time",       description:"Daily matching run time." },
  { section:"binary",   key:"bin.carry_exp",     value:"30",     unit:"days",   type:"number", label:"Carry Expiry",         description:"Days before carry forward expires." },
  { section:"orbit",    key:"orb.reward_rate",   value:"5",      unit:"%",      type:"number", label:"Orbit Reward Rate",    description:"% orbit reward on top of matching." },
  { section:"orbit",    key:"orb.min_bv",        value:"5000",   unit:"BV/leg", type:"number", label:"Minimum BV Required",  description:"BV each leg must achieve to trigger orbit." },
  { section:"orbit",    key:"orb.flush_cycle",   value:"Weekly",                type:"text",   label:"Flush Logic",          description:"Orbit BV flush frequency." },
  { section:"orbit",    key:"orb.exec_day",      value:"Monday",                type:"text",   label:"Execution Day",        description:"Day orbit rewards are distributed." },
  { section:"orbit",    key:"orb.exec_time",     value:"01:00",  unit:"UTC",    type:"text",   label:"Execution Time",       description:"Weekly orbit run time." },
  { section:"orbit",    key:"orb.carry_days",    value:"30",     unit:"days",   type:"number", label:"Carry Forward Days",   description:"Days orbit BV can carry forward." },
  { section:"transfer", key:"tr.release_hours",  value:"72",     unit:"hours",  type:"number", label:"Release Window",       description:"Hours before deposit is released for use." },
  { section:"transfer", key:"tr.hourly_rate",    value:"1.39",   unit:"%/h",    type:"number", label:"Hourly Release Rate",  description:"% of transfer released per hour." },
  { section:"transfer", key:"tr.fee_pct",        value:"2",      unit:"%",      type:"number", label:"Transfer Fee",         description:"Platform fee applied to each transfer." },
  { section:"transfer", key:"tr.min_amount",     value:"10",     unit:"$",      type:"number", label:"Minimum Transfer",     description:"Minimum single transfer amount." },
  { section:"transfer", key:"tr.max_amount",     value:"50000",  unit:"$",      type:"number", label:"Maximum Transfer",     description:"Maximum single transfer amount." },
  { section:"transfer", key:"tr.max_queue",      value:"100",    unit:"txns",   type:"number", label:"Maximum Queue Size",   description:"Max concurrent transfers in queue." },
  { section:"limits",   key:"lim.max_invest",    value:"500000", unit:"$",      type:"number", label:"Maximum Investment",   description:"Maximum cumulative investment per user." },
  { section:"limits",   key:"lim.min_withdraw",  value:"20",     unit:"$",      type:"number", label:"Minimum Withdrawal",   description:"Minimum withdrawal request amount." },
  { section:"limits",   key:"lim.max_withdraw",  value:"100000", unit:"$",      type:"number", label:"Maximum Withdrawal",   description:"Max single withdrawal amount." },
  { section:"limits",   key:"lim.daily_payout",  value:"50000",  unit:"$",      type:"number", label:"Max Daily Payout",     description:"Maximum total payout per member per day." },
  { section:"limits",   key:"lim.max_binary",    value:"10000",  unit:"$/day",  type:"number", label:"Max Binary Reward",    description:"Binary matching daily reward ceiling." },
  { section:"limits",   key:"lim.max_salary",    value:"10000",  unit:"$/mo",   type:"number", label:"Maximum Salary",       description:"Maximum monthly salary any rank can earn." },
  { section:"global",   key:"gl.maintenance",    value:"false",                 type:"toggle", label:"Maintenance Mode",     description:"Suspends all member-facing operations." },
  { section:"global",   key:"gl.registration",   value:"true",                  type:"toggle", label:"Registration Enabled", description:"New member registration toggle." },
  { section:"global",   key:"gl.investment",     value:"true",                  type:"toggle", label:"Investment Enabled",   description:"Allow new investment creation." },
  { section:"global",   key:"gl.withdrawal",     value:"true",                  type:"toggle", label:"Withdrawal Enabled",   description:"Allow withdrawal requests." },
  { section:"global",   key:"gl.binary",         value:"true",                  type:"toggle", label:"Binary Enabled",       description:"Binary matching engine active." },
  { section:"global",   key:"gl.notifications",  value:"true",                  type:"toggle", label:"Notifications Enabled",description:"Push and email notification system." },
  { section:"global",   key:"gl.kyc_required",   value:"false",                 type:"toggle", label:"KYC Required",         description:"Require identity verification for withdrawals." },
];

const CONFIG_KEYS = CONFIG_DEFS.map(d => d.key);

// ─── Settings seeding ─────────────────────────────────────────────────────────

export async function ensureDefaultSettings() {
  for (const def of CONFIG_DEFS) {
    await prisma.systemSettings.upsert({
      where:  { key: def.key },
      update: {}, // never overwrite existing
      create: { key: def.key, value: def.value, description: def.label },
    });
  }
}

// ─── System config (all sections) ─────────────────────────────────────────────

export async function getAllPlanConfig() {
  await ensureDefaultSettings();
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: CONFIG_KEYS } },
  });
  const byKey: Record<string, string> = {};
  for (const r of rows) byKey[r.key] = r.value;

  // Build per-section ConfigField arrays
  const sections: Record<string, { key: string; label: string; value: string; unit?: string; type: "text" | "number" | "toggle"; description?: string }[]> = {
    roi: [], binary: [], orbit: [], transfer: [], limits: [], global: [],
  };
  for (const def of CONFIG_DEFS) {
    sections[def.section]?.push({
      key:         def.key,
      label:       def.label,
      value:       byKey[def.key] ?? def.value,
      ...(def.unit && { unit: def.unit }),
      type:        def.type,
      description: def.description,
    });
  }
  return sections;
}

// ─── Save config field ────────────────────────────────────────────────────────

export async function saveConfigField(
  key:        string,
  value:      string,
  oldValue:   string,
  reason:     string,
  label:      string,
  adminId:    string,
  adminEmail: string,
) {
  await prisma.systemSettings.upsert({
    where:  { key },
    update: { value },
    create: { key, value, description: label },
  });

  await prisma.adminLog.create({
    data: {
      adminId,
      action: "CONFIG_UPDATED",
      details: {
        key, label, oldValue, newValue: value, reason, adminEmail,
      } as Prisma.InputJsonValue,
    },
  });

  await appendVersion(adminEmail, 1);
  return { key, value };
}

// ─── Version history ──────────────────────────────────────────────────────────

const VERSIONS_KEY = "config.versions";

async function appendVersion(adminEmail: string, changeCount: number) {
  const row = await prisma.systemSettings.findUnique({ where: { key: VERSIONS_KEY } });
  let versions: VersionEntry[] = [];
  if (row) { try { versions = JSON.parse(row.value) as VersionEntry[]; } catch {} }
  const lastVer = versions.length > 0 ? parseFloat(versions[0].version) : 1.0;
  const entry: VersionEntry = {
    id:          `V-${Date.now()}`,
    version:     (lastVer + 0.1).toFixed(1),
    publishedBy: adminEmail,
    publishedAt: new Date().toISOString(),
    changeCount,
  };
  const updated = [entry, ...versions].slice(0, 20);
  await prisma.systemSettings.upsert({
    where:  { key: VERSIONS_KEY },
    update: { value: JSON.stringify(updated) },
    create: { key: VERSIONS_KEY, value: JSON.stringify(updated), description: "Config version history" },
  });
}

export async function getConfigVersions(): Promise<VersionEntry[]> {
  const row = await prisma.systemSettings.findUnique({ where: { key: VERSIONS_KEY } });
  if (!row) return [];
  try { return JSON.parse(row.value) as VersionEntry[]; } catch { return []; }
}

// ─── Config audit log ─────────────────────────────────────────────────────────

export async function getConfigAudit() {
  const logs = await prisma.adminLog.findMany({
    where:   { action: { in: ["CONFIG_UPDATED", "CONFIG_TOGGLE", "PLAN_CREATED", "PLAN_STATUS_CHANGED"] } },
    orderBy: { createdAt: "desc" },
    take:    30,
    include: { admin: { select: { email: true } } },
  });

  return logs.map(l => {
    const d = (l.details ?? {}) as Record<string, unknown>;
    return {
      id:         l.id,
      timestamp:  l.createdAt.toISOString(),
      admin:      l.admin.email,
      configName: String(d.label ?? d.key ?? l.action),
      oldValue:   String(d.oldValue ?? "—"),
      newValue:   String(d.newValue ?? d.value ?? "—"),
      reason:     String(d.reason ?? "—"),
    };
  });
}

// ─── Plans catalog ─────────────────────────────────────────────────────────────

const PLANS_KEY = "plans.catalog";

export async function getPlans(): Promise<PlanCatalogItem[]> {
  const row = await prisma.systemSettings.findUnique({ where: { key: PLANS_KEY } });
  if (!row) {
    // Seed defaults + get real member counts
    const withCounts = await attachMemberCounts(DEFAULT_PLANS);
    await prisma.systemSettings.create({
      data: { key: PLANS_KEY, value: JSON.stringify(withCounts), description: "Investment plans catalog" },
    });
    return withCounts;
  }
  try {
    const plans = JSON.parse(row.value) as PlanCatalogItem[];
    return attachMemberCounts(plans);
  } catch {
    return DEFAULT_PLANS;
  }
}

async function attachMemberCounts(plans: PlanCatalogItem[]): Promise<PlanCatalogItem[]> {
  const activeCount = await prisma.investment.count({ where: { status: "ACTIVE" } });
  const activePlans = plans.filter(p => p.status === "ACTIVE");
  const share = activePlans.length > 0 ? Math.floor(activeCount / activePlans.length) : 0;
  return plans.map(p => ({
    ...p,
    members: p.status === "ACTIVE" ? share : 0,
  }));
}

async function savePlansCatalog(plans: PlanCatalogItem[]) {
  await prisma.systemSettings.upsert({
    where:  { key: PLANS_KEY },
    update: { value: JSON.stringify(plans) },
    create: { key: PLANS_KEY, value: JSON.stringify(plans), description: "Investment plans catalog" },
  });
}

export async function createPlan(
  data:       Omit<PlanCatalogItem, "id" | "members">,
  adminId:    string,
  adminEmail: string,
): Promise<PlanCatalogItem> {
  const current = await getPlans();
  const newPlan: PlanCatalogItem = {
    ...data,
    id:      `p-${Date.now().toString(36)}`,
    members: 0,
  };
  const updated = [...current, newPlan];
  await savePlansCatalog(updated.map(p => ({ ...p, members: p.members })));

  await prisma.adminLog.create({
    data: {
      adminId,
      action: "PLAN_CREATED",
      details: {
        planId: newPlan.id, label: `Plan created: ${newPlan.name}`,
        oldValue: "—", newValue: newPlan.name, reason: "New plan created by admin.", adminEmail,
      } as Prisma.InputJsonValue,
    },
  });
  await appendVersion(adminEmail, 1);
  return newPlan;
}

export async function updatePlanStatus(
  planId:     string,
  status:     PlanStatus,
  adminId:    string,
  adminEmail: string,
): Promise<PlanCatalogItem> {
  const current = await getPlans();
  const plan = current.find(p => p.id === planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const updated = current.map(p => p.id === planId ? { ...p, status } : p);
  await savePlansCatalog(updated.map(p => ({ ...p, members: p.members })));

  await prisma.adminLog.create({
    data: {
      adminId,
      action: "PLAN_STATUS_CHANGED",
      details: {
        planId, label: `Plan status: ${plan.name}`,
        oldValue: plan.status, newValue: status, reason: `Status changed to ${status}.`, adminEmail,
      } as Prisma.InputJsonValue,
    },
  });
  await appendVersion(adminEmail, 1);
  return { ...plan, status };
}

// ─── Level income config ──────────────────────────────────────────────────────

const LEVEL_CONFIG_KEY = "level.config";

export async function getLevelConfig(): Promise<LevelConfigItem[]> {
  const row = await prisma.systemSettings.findUnique({ where: { key: LEVEL_CONFIG_KEY } });
  if (!row) {
    await prisma.systemSettings.create({
      data: { key: LEVEL_CONFIG_KEY, value: JSON.stringify(DEFAULT_LEVELS), description: "Level income configuration" },
    });
    return DEFAULT_LEVELS;
  }
  try { return JSON.parse(row.value) as LevelConfigItem[]; } catch { return DEFAULT_LEVELS; }
}

export async function saveLevelConfig(
  levels:     LevelConfigItem[],
  adminId:    string,
  adminEmail: string,
) {
  await prisma.systemSettings.upsert({
    where:  { key: LEVEL_CONFIG_KEY },
    update: { value: JSON.stringify(levels) },
    create: { key: LEVEL_CONFIG_KEY, value: JSON.stringify(levels), description: "Level income configuration" },
  });
  await prisma.adminLog.create({
    data: {
      adminId,
      action: "CONFIG_UPDATED",
      details: {
        key: LEVEL_CONFIG_KEY, label: "Level Income Configuration",
        oldValue: "multiple", newValue: "updated", reason: "Level config updated by admin.", adminEmail,
      } as Prisma.InputJsonValue,
    },
  });
  await appendVersion(adminEmail, 1);
}

// ─── Salary ranks ─────────────────────────────────────────────────────────────

export async function getSalaryRanks() {
  const ranks = await prisma.salaryRankConfig.findMany({
    orderBy: { requiredBusiness: "asc" },
  });
  return ranks.map(r => ({
    id:                 r.id,
    rankName:           r.rankName,
    monthlySalary:      parseFloat(r.monthlySalary.toString()),
    requiredBusiness:   parseFloat(r.requiredBusiness.toString()),
    durationMonths:     r.durationMonths,
    requiresDualDirects: r.requiresDualDirects,
    allowSpill:         r.allowSpill,
    isActive:           r.isActive,
  }));
}
