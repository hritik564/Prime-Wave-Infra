import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { SINGLE_PLAN_POLICY } from "../investments/single-plan.policy";
import { Prisma } from "@prisma/client";
import { clearSettingsCache } from "../config/settings";

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
  { id: "plan-90",  name: "Plan 90",  color: "#60a5fa", minInvest: 100, maxInvest: null, roi: 0.5,  duration: 90,  autoCompound: false, status: "ACTIVE", members: 0, benefits: [], notes: "", claimWindow: "" },
  { id: "plan-180", name: "Plan 180", color: "#34d399", minInvest: 100, maxInvest: null, roi: 0.75, duration: 180, autoCompound: false, status: "ACTIVE", members: 0, benefits: [], notes: "", claimWindow: "" },
  { id: "plan-270", name: "Plan 270", color: "#D4AF37", minInvest: 100, maxInvest: null, roi: 1.0,  duration: 270, autoCompound: false, status: "ACTIVE", members: 0, benefits: [], notes: "", claimWindow: "" },
  { id: "plan-360", name: "Plan 360", color: "#a78bfa", minInvest: 100, maxInvest: null, roi: 1.25, duration: 360, autoCompound: false, status: "ACTIVE", members: 0, benefits: [], notes: "", claimWindow: "" },
];

const DEFAULT_LEVELS: LevelConfigItem[] = [
  { level: 1, rate: 1, qualification: "Active investment required", status: "ACTIVE" },
  { level: 2, rate: 1, qualification: "Active investment required", status: "ACTIVE" },
  { level: 3, rate: 1, qualification: "Active investment required", status: "ACTIVE" },
  { level: 4, rate: 1, qualification: "Active investment required", status: "ACTIVE" },
  { level: 5, rate: 1, qualification: "Active investment required", status: "ACTIVE" },
];

interface ConfigDef {
  key: string; value: string; unit?: string;
  type: "text" | "number" | "toggle";
  label: string; description: string; section: string;
}

const CONFIG_DEFS: ConfigDef[] = [
  // ── ROI Engine ─────────────────────────────────────────────────────────────
  { section:"roi", key:"roi.default_rate", value:"0.8000", unit:"%/day", type:"number", label:"SINGLE Daily ROI %", description:"Code-owned rate for new SINGLE investments; legacy terms remain separate." },
  { section:"roi", key:"roi.max_cap", value:"400", unit:"%", type:"number", label:"Working ROI limit", description:"4× ROI plus original principal = 5× total entitlement." },
  { section:"roi", key:"roi.non_working_cap", value:"200", unit:"%", type:"number", label:"Non-working ROI limit", description:"2× ROI plus original principal = 3× total entitlement." },
  { section:"roi", key:"roi.duration", value:"0", type:"number", label:"Fixed duration (0 = none)", description:"No fixed maturity for new SINGLE investments." },
  { section:"roi", key:"roi.exec_time", value:"00:00 and 12:00 Europe/London", type:"text", label:"Execution times", description:"Existing London scheduler boundaries." },
  { section:"roi", key:"roi.exec_freq", value:"Twice daily", type:"text", label:"Execution frequency", description:"0.4% each cycle before compounding, subject to member cap." },
  // ── Binary Matching ────────────────────────────────────────────────────────
  { section:"binary", key:"bin.match_rate",        value:"10",    unit:"%",      type:"number", label:"Matching Percentage",       description:"% of the weaker leg BV awarded as binary matching bonus." },
  { section:"binary", key:"bin.daily_cap",         value:"10000", unit:"$",      type:"number", label:"Daily Match Cap",           description:"Maximum daily binary matching reward per member." },
  { section:"binary", key:"bin.carry_cap",         value:"50000", unit:"BV",     type:"number", label:"Carry Forward Cap",         description:"Maximum carry-forward BV allowed per leg." },
  { section:"binary", key:"bin.flush_cycle",       value:"Daily",               type:"text",   label:"Daily Flush Time",          description:"When unmatched BV is flushed each day. Carry does not expire by age." },
  { section:"binary", key:"bin.exec_time",         value:"00:30", unit:"UTC",    type:"text",   label:"Execution Time",            description:"Daily time the binary matching engine runs." },
  // ── Binary Orbit ───────────────────────────────────────────────────────────
  { section:"orbit",  key:"orb.reward_rate",       value:"5",     unit:"%",      type:"number", label:"Orbit %",                   description:"Orbit reward percentage on top of binary matching." },
  { section:"orbit",  key:"orb.min_bv",            value:"5000",  unit:"BV/leg", type:"number", label:"Minimum BV Qualification",  description:"BV each leg must achieve to trigger orbit distribution." },
  { section:"orbit",  key:"orb.exec_day",          value:"Monday",              type:"text",   label:"Orbit Execution Schedule",  description:"Day of the week orbit rewards are distributed." },
  { section:"orbit",  key:"orb.exec_time",         value:"01:00", unit:"UTC",    type:"text",   label:"Orbit Execution Time",      description:"Time of day the orbit engine processes distributions." },
  // ── Wallet Rules ───────────────────────────────────────────────────────────
  { section:"wallet", key:"wal.release_hours",     value:"72",    unit:"hours",  type:"number", label:"Release Window",            description:"Total hours over which Income Wallet transfers release to Withdrawal Wallet." },
  { section:"wallet", key:"wal.hourly_releases",   value:"1",     unit:"/hour",  type:"number", label:"Releases Per Hour",         description:"Number of release tranches sent every hour during the release window." },
  { section:"wallet", key:"wal.total_releases",    value:"72",    unit:"releases",type:"number",label:"Total Releases Per Transfer","description":"Total release tranches for each Income Wallet transfer (= Release Window × Releases/Hour)." },
  // ── Platform Limits ────────────────────────────────────────────────────────
  { section:"limits", key:"lim.min_withdraw",      value:"1",     unit:"$",      type:"number", label:"Minimum Withdrawal",        description:"Minimum withdrawal request amount." },
  { section:"limits", key:"lim.max_withdraw",      value:"100000",unit:"$",      type:"number", label:"Maximum Withdrawal",        description:"Maximum single withdrawal amount." },
  { section:"limits", key:"lim.max_daily_withdraw",value:"50000", unit:"$",      type:"number", label:"Maximum Daily Withdrawal",  description:"Maximum total withdrawal per member per day." },
  { section:"limits", key:"lim.max_binary",        value:"10000", unit:"$/day",  type:"number", label:"Maximum Binary Income",     description:"Daily binary matching income ceiling per member." },
  { section:"limits", key:"lim.max_salary",        value:"10000", unit:"$/mo",   type:"number", label:"Maximum Salary",            description:"Maximum monthly salary any rank can earn." },
  { section:"limits", key:"lim.max_invest_per_user",value:"500000",unit:"$",     type:"number", label:"Maximum Investment Per User","description":"Maximum cumulative active investment allowed per member." },
  // ── Global Configuration ───────────────────────────────────────────────────
  { section:"global", key:"gl.maintenance",        value:"false",               type:"toggle", label:"Maintenance Mode",          description:"Suspends all member-facing operations platform-wide." },
  { section:"global", key:"gl.registration",       value:"true",                type:"toggle", label:"Registration Enabled",      description:"Allow new member registration." },
  { section:"global", key:"gl.roi_engine",         value:"true",                type:"toggle", label:"ROI Engine Enabled",        description:"Automatic daily ROI distribution engine." },
  { section:"global", key:"gl.binary_engine",      value:"true",                type:"toggle", label:"Binary Engine Enabled",     description:"Binary matching engine active." },
  { section:"global", key:"gl.orbit_engine",       value:"true",                type:"toggle", label:"Orbit Engine Enabled",      description:"Binary orbit distribution engine active." },
  { section:"global", key:"gl.salary_engine",      value:"true",                type:"toggle", label:"Salary Engine Enabled",     description:"Monthly salary processing engine active." },
  { section:"global", key:"gl.withdrawal_engine",  value:"true",                type:"toggle", label:"Withdrawal Engine Enabled", description:"Allow withdrawal requests to be processed." },
  { section:"global", key:"gl.notifications",      value:"true",                type:"toggle", label:"Notifications Enabled",     description:"Push and email notification delivery." },
  { section:"global", key:"gl.kyc_required",       value:"false",               type:"toggle", label:"KYC Required",              description:"Require identity verification before withdrawal." },
];

const CONFIG_KEYS = CONFIG_DEFS.map(d => d.key);

// ─── Settings seeding ─────────────────────────────────────────────────────────

export async function ensureDefaultSettings() {
  for (const def of CONFIG_DEFS) {
    await prisma.systemSettings.upsert({
      where:  { key: def.key },
      update: {},
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

  const sections: Record<string, { key: string; label: string; value: string; unit?: string; type: "text" | "number" | "toggle"; description?: string }[]> = {
    roi: [], binary: [], orbit: [], wallet: [], limits: [], global: [],
  };
  for (const def of CONFIG_DEFS) {
    sections[def.section]?.push({
      key:         def.key,
      label:       def.label,
      value:       def.section === "roi" ? ({
        "roi.default_rate": SINGLE_PLAN_POLICY.dailyROI,
        "roi.max_cap": "400", "roi.duration": "0",
        "roi.exec_time": "00:00 and 12:00 Europe/London", "roi.exec_freq": "Twice daily",
      }[def.key] ?? def.value) : (byKey[def.key] ?? def.value),
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
  if (key.startsWith("roi.") || key === "plans.catalog") assertPlanPolicyWritable();
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
const FIXED_PLAN_IDS = new Set(["plan-90", "plan-180", "plan-270", "plan-360"]);

export async function getPlans(): Promise<PlanCatalogItem[]> {
  const members = await prisma.investment.findMany({ where: { planType: "SINGLE", status: "ACTIVE" },
    distinct: ["userId"], select: { userId: true } });
  return [{
    id: "single", name: "Prime Wave Single", color: "#D4AF37", minInvest: 100,
    maxInvest: null, roi: Number(SINGLE_PLAN_POLICY.dailyROI), duration: 0,
    autoCompound: true, status: "ACTIVE", members: members.length,
    benefits: ["0.8% daily ROI", "No fixed maturity", "Shared member ROI cap"],
    notes: "Progressive minimum: (all prior investments + 1) × $100. Total entitlement 3× / 5× includes principal. Principal settlement disabled.",
    claimWindow: "ROI claimable; principal settlement disabled",
  }];
}

function assertPlanPolicyWritable(): void {
  throw new AppError("Investment policy is code-owned and locked: 0.8% daily; ROI limit 2×/4×; no fixed maturity",
    HTTP_STATUS.CONFLICT, "INVESTMENT_POLICY_LOCKED");
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
  assertPlanPolicyWritable();
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
  assertPlanPolicyWritable();
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

export async function updatePlanConfig(
  planId:     string,
  data:       { roi?: number; minInvest?: number; maxInvest?: number | null },
  adminId:    string,
  adminEmail: string,
): Promise<PlanCatalogItem> {
  assertPlanPolicyWritable();
  const current = await getPlans();
  const plan = current.find(p => p.id === planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const updated = current.map(p =>
    p.id === planId
      ? {
          ...p,
          ...(data.roi        !== undefined && { roi:       data.roi }),
          ...(data.minInvest  !== undefined && { minInvest: data.minInvest }),
          ...(data.maxInvest  !== undefined && { maxInvest: data.maxInvest }),
        }
      : p
  );
  await savePlansCatalog(updated.map(p => ({ ...p, members: p.members })));

  await prisma.adminLog.create({
    data: {
      adminId,
      action: "CONFIG_UPDATED",
      details: {
        planId, label: `Plan config: ${plan.name}`,
        oldValue: JSON.stringify({ roi: plan.roi, minInvest: plan.minInvest, maxInvest: plan.maxInvest }),
        newValue: JSON.stringify(data),
        reason: "Plan configuration updated by admin.", adminEmail,
      } as Prisma.InputJsonValue,
    },
  });
  await appendVersion(adminEmail, 1);
  return updated.find(p => p.id === planId)!;
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

  // Invalidate the settings cache so the payout engine picks up new rates
  // immediately — no server restart required.
  clearSettingsCache();

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
    id:                  r.id,
    rankName:            r.rankName,
    monthlySalary:       parseFloat(r.monthlySalary.toString()),
    requiredBusiness:    parseFloat(r.requiredBusiness.toString()),
    durationMonths:      r.durationMonths,
    requiresDualDirects: r.requiresDualDirects,
    allowSpill:          r.allowSpill,
    isActive:            r.isActive,
  }));
}

export async function updateSalaryRank(
  rankName:   string,
  data:       { monthlySalary?: number; requiredBusiness?: number; requiresDualDirects?: boolean; isActive?: boolean },
  adminId:    string,
  adminEmail: string,
) {
  const existing = await prisma.salaryRankConfig.findUnique({ where: { rankName } });
  if (!existing) throw new Error(`Rank "${rankName}" not found`);

  const updated = await prisma.salaryRankConfig.update({
    where: { rankName },
    data: {
      ...(data.monthlySalary       !== undefined && { monthlySalary:       data.monthlySalary }),
      ...(data.requiredBusiness    !== undefined && { requiredBusiness:    data.requiredBusiness }),
      ...(data.requiresDualDirects !== undefined && { requiresDualDirects: data.requiresDualDirects }),
      ...(data.isActive            !== undefined && { isActive:            data.isActive }),
    },
  });

  await prisma.adminLog.create({
    data: {
      adminId,
      action: "CONFIG_UPDATED",
      details: {
        key: `salary.${rankName}`, label: `Salary Config: ${rankName}`,
        oldValue: JSON.stringify({ monthlySalary: parseFloat(existing.monthlySalary.toString()), requiredBusiness: parseFloat(existing.requiredBusiness.toString()) }),
        newValue: JSON.stringify(data),
        reason: "Salary rank configuration updated.", adminEmail,
      } as Prisma.InputJsonValue,
    },
  });
  await appendVersion(adminEmail, 1);

  return {
    id:                  updated.id,
    rankName:            updated.rankName,
    monthlySalary:       parseFloat(updated.monthlySalary.toString()),
    requiredBusiness:    parseFloat(updated.requiredBusiness.toString()),
    durationMonths:      updated.durationMonths,
    requiresDualDirects: updated.requiresDualDirects,
    allowSpill:          updated.allowSpill,
    isActive:            updated.isActive,
  };
}
