import { useState, useMemo, useEffect } from "react";
import {
  Users, TrendingUp, UserCheck, UserX, Copy, CheckCheck,
  Search, Link2, Hash, Award, Activity, ChevronRight, UserPlus,
  ChevronLeft, Share2,
} from "lucide-react";
import { getProfile } from "@/lib/api";
import { Link } from "wouter";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─── */
interface DirectReferral {
  id: number;
  username: string;
  joinDate: string;
  investmentStatus: "active" | "inactive" | "none";
  rank: string;
  businessVolume: number;
  avatar: string;
}

type ActivityType = "join" | "investment" | "rank";

interface TeamActivity {
  id: number;
  type: ActivityType;
  username: string;
  description: string;
  time: string;
}

/* ─── Build referral URLs for a given code and leg ─── */
function buildReferralLink(referralCode: string, leg: "L" | "R"): string {
  const base = window.location.origin;
  return `${base}/signup?ref=${referralCode}&leg=${leg}`;
}
function buildReferralCode(referralCode: string, leg: "L" | "R"): string {
  return `${referralCode}-${leg}`;
}

const TEAM_STATS = {
  totalTeamSize: 47,
  directReferrals: 8,
  totalTeamBusiness: 145200,
  leftTeamSize: 24,
  rightTeamSize: 23,
  leftBV: 892,
  rightBV: 856,
  activeMembers: 41,
  inactiveMembers: 6,
};

/* ─── Seed data ─── */
const DIRECT_REFERRALS: DirectReferral[] = [
  { id: 1, username: "alexmwangi",   joinDate: "Mar 15, 2024", investmentStatus: "active",   rank: "Silver",  businessVolume: 24800, avatar: "AM" },
  { id: 2, username: "priyasharma", joinDate: "Apr 02, 2024", investmentStatus: "active",   rank: "Bronze",  businessVolume: 18600, avatar: "PS" },
  { id: 3, username: "johnbaker",   joinDate: "Apr 18, 2024", investmentStatus: "inactive", rank: "Starter", businessVolume: 5200,  avatar: "JB" },
  { id: 4, username: "liuyang",     joinDate: "May 07, 2024", investmentStatus: "active",   rank: "Gold",    businessVolume: 41200, avatar: "LY" },
  { id: 5, username: "fatimakhan",  joinDate: "May 22, 2024", investmentStatus: "active",   rank: "Bronze",  businessVolume: 12400, avatar: "FK" },
  { id: 6, username: "davidosei",   joinDate: "Jun 03, 2024", investmentStatus: "none",     rank: "Starter", businessVolume: 0,     avatar: "DO" },
  { id: 7, username: "mariagonzal", joinDate: "Jun 14, 2024", investmentStatus: "active",   rank: "Silver",  businessVolume: 19800, avatar: "MG" },
  { id: 8, username: "rashidali",   joinDate: "Jun 20, 2024", investmentStatus: "inactive", rank: "Starter", businessVolume: 3200,  avatar: "RA" },
];

const ACTIVITY: TeamActivity[] = [
  { id: 1, type: "join",       username: "rashidali",   description: "joined your network",      time: "2h ago"  },
  { id: 2, type: "investment", username: "liuyang",     description: "invested $2,000 in PW360", time: "5h ago"  },
  { id: 3, type: "rank",       username: "alexmwangi",  description: "achieved Silver rank",      time: "1d ago"  },
  { id: 4, type: "join",       username: "mariagonzal", description: "joined your network",      time: "2d ago"  },
  { id: 5, type: "investment", username: "priyasharma", description: "invested $1,500 in PW180", time: "3d ago"  },
  { id: 6, type: "rank",       username: "liuyang",     description: "achieved Gold rank",       time: "4d ago"  },
  { id: 7, type: "investment", username: "fatimakhan",  description: "invested $1,200 in PW90",  time: "5d ago"  },
];

/* ─── Formatters ─── */
function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}
function fmtFull(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─── Avatar ─── */
function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";
  return (
    <div
      className={`${dim} flex items-center justify-center rounded-full font-bold shrink-0`}
      style={{ background: "linear-gradient(135deg, rgba(212,175,55,0.2) 0%, rgba(212,175,55,0.1) 100%)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.25)" }}
    >
      {initials}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: accent ? "rgba(212,175,55,0.06)" : "hsl(var(--card))",
        border: `1px solid ${accent ? "rgba(212,175,55,0.2)" : "hsl(var(--border))"}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
      }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
          style={{ background: accent ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.05)" }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: accent ? "#D4AF37" : "rgba(170,179,197,0.6)" }} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "rgba(170,179,197,0.5)" }}>
          {label}
        </span>
      </div>
      <p className="text-xl font-bold font-heading" style={{ color: accent ? "#F3D37A" : "hsl(var(--foreground))" }}>
        {value}
      </p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: "rgba(170,179,197,0.45)" }}>{sub}</p>}
    </div>
  );
}

/* ─── Copy Button ─── */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 min-h-[44px] shrink-0"
      style={
        copied
          ? { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
          : { background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }
      }
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

/* ─── Rank Badge ─── */
function RankBadge({ rank }: { rank: string }) {
  const color =
    rank === "Gold"   ? { bg: "rgba(212,175,55,0.12)", text: "#D4AF37",  border: "rgba(212,175,55,0.25)" } :
    rank === "Silver" ? { bg: "rgba(148,163,184,0.1)", text: "#94a3b8", border: "rgba(148,163,184,0.2)" } :
    rank === "Bronze" ? { bg: "rgba(205,127,50,0.1)",  text: "#cd7f32", border: "rgba(205,127,50,0.2)"  } :
                        { bg: "rgba(255,255,255,0.05)", text: "rgba(170,179,197,0.6)", border: "rgba(255,255,255,0.08)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
      style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
    >
      {rank}
    </span>
  );
}

/* ─── Investment Status Badge ─── */
function InvBadge({ status }: { status: DirectReferral["investmentStatus"] }) {
  const map = { active: "success", inactive: "warning", none: "secondary" } as const;
  const label = { active: "Active", inactive: "Inactive", none: "No Plan" };
  return <Badge variant={map[status]}>{label[status]}</Badge>;
}

/* ─── Activity icon ─── */
function ActivityIcon({ type }: { type: ActivityType }) {
  const cfg = {
    join:       { Icon: UserPlus,    bg: "rgba(96,165,250,0.1)",  color: "#60a5fa" },
    investment: { Icon: TrendingUp,  bg: "rgba(212,175,55,0.1)",  color: "#D4AF37" },
    rank:       { Icon: Award,       bg: "rgba(52,211,153,0.1)",  color: "#34d399" },
  }[type];
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: cfg.bg }}>
      <cfg.Icon className="h-4 w-4" style={{ color: cfg.color }} />
    </div>
  );
}

/* ─── Direct Referral Card (mobile) ─── */
function ReferralCard({ r }: { r: DirectReferral }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
    >
      <div className="flex items-start gap-3 mb-3">
        <Avatar initials={r.avatar} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">@{r.username}</p>
          <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>Joined {r.joinDate}</p>
        </div>
        <InvBadge status={r.investmentStatus} />
      </div>
      <div className="flex items-center justify-between pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "rgba(170,179,197,0.5)" }}>Rank</span>
          <RankBadge rank={r.rank} />
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold" style={{ color: "#D4AF37" }}>{fmtFull(r.businessVolume)}</p>
          <p className="text-[10px]" style={{ color: "rgba(170,179,197,0.45)" }}>Business Vol.</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Dual Referral Card ─── */
function DualReferralCard({ referralCode }: { referralCode: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (value: string, key: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const share = async (value: string) => {
    if (navigator.share) {
      try { await navigator.share({ url: value, title: "Join Prime Wave" }); } catch { /* dismissed */ }
    } else {
      copyText(value, `share-${value}`);
    }
  };

  const legs: Array<{ leg: "L" | "R"; label: string; color: string; Icon: typeof ChevronLeft }> = [
    { leg: "L", label: "Left Team", color: "#60a5fa", Icon: ChevronLeft },
    { leg: "R", label: "Right Team", color: "#D4AF37", Icon: ChevronRight },
  ];

  return (
    <div
      className="rounded-2xl p-5 mb-5 lg:mb-6"
      style={{ background: "hsl(var(--card))", border: "1px solid rgba(212,175,55,0.18)", boxShadow: "0 0 0 1px rgba(212,175,55,0.05), 0 4px 24px rgba(0,0,0,0.3)" }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(212,175,55,0.1)" }}>
          <Link2 className="h-4 w-4" style={{ color: "#D4AF37" }} />
        </div>
        <div>
          <h3 className="text-base font-semibold font-heading text-foreground">Your Referral Links</h3>
          <p className="text-[11px]" style={{ color: "rgba(170,179,197,0.5)" }}>Share the correct link to place members on the right side</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {legs.map(({ leg, label, color, Icon }) => {
          const link = buildReferralLink(referralCode, leg);
          const code = buildReferralCode(referralCode, leg);
          const linkKey = `link-${leg}`;
          const codeKey = `code-${leg}`;

          return (
            <div
              key={leg}
              className="rounded-xl p-4 space-y-3"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: `1px solid ${leg === "L" ? "rgba(96,165,250,0.15)" : "rgba(212,175,55,0.15)"}`,
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                  style={{ background: leg === "L" ? "rgba(96,165,250,0.1)" : "rgba(212,175,55,0.1)" }}
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
              </div>

              {/* Code row */}
              <div className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(170,179,197,0.45)" }} />
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "rgba(170,179,197,0.4)" }}>Code</p>
                    <p className="text-sm font-bold text-foreground tracking-wider truncate">{code}</p>
                  </div>
                </div>
                <button
                  onClick={() => copyText(code, codeKey)}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 shrink-0"
                  style={
                    copied === codeKey
                      ? { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
                      : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {copied === codeKey ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied === codeKey ? "Copied" : "Copy"}
                </button>
              </div>

              {/* Link row */}
              <div className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Link2 className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(170,179,197,0.45)" }} />
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: "rgba(170,179,197,0.4)" }}>Link</p>
                    <p className="text-xs text-foreground truncate" style={{ maxWidth: 160 }}>{link}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => copyText(link, linkKey)}
                    className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200"
                    style={
                      copied === linkKey
                        ? { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }
                        : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }
                    }
                  >
                    {copied === linkKey ? <CheckCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === linkKey ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={() => void share(link)}
                    className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200"
                    style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <Share2 className="h-3 w-3" />
                    Share
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function TeamPage() {
  const [search, setSearch] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const filteredReferrals = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return DIRECT_REFERRALS;
    return DIRECT_REFERRALS.filter(
      (r) => r.username.toLowerCase().includes(q)
    );
  }, [search]);

  const hasReferrals = DIRECT_REFERRALS.length > 0;

  // Fetch real referral code from user profile
  useEffect(() => {
    getProfile()
      .then((p) => setReferralCode(p.referralCode))
      .catch(() => {});
  }, []);

  const copyLink = (leg: "L" | "R") => {
    if (!referralCode) return;
    navigator.clipboard.writeText(buildReferralLink(referralCode, leg)).catch(() => {});
  };

  return (
    <AppLayout pageTitle="Team" notificationCount={3}>
      <PageContainer>

        {/* ── Hero ── */}
        <div
          className="relative rounded-2xl overflow-hidden p-5 lg:p-8 mb-5 lg:mb-6"
          style={{
            background: "linear-gradient(135deg, #0A1628 0%, #0E1B37 50%, #0A1628 100%)",
            border: "1px solid rgba(212,175,55,0.22)",
            boxShadow: "0 0 0 1px rgba(212,175,55,0.06), 0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 50% at 10% 50%, rgba(212,175,55,0.07) 0%, transparent 70%)" }} />
          <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{ backgroundImage: "linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.7)" }}>Network Overview</span>
            </div>
            <p className="text-3xl lg:text-4xl font-bold font-heading mb-1" style={{ color: "#F3D37A" }}>
              {TEAM_STATS.totalTeamSize} Members
            </p>
            <p className="text-sm mb-6" style={{ color: "rgba(170,179,197,0.6)" }}>Total team across all levels</p>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Direct Referrals",     value: TEAM_STATS.directReferrals,                       color: "#60a5fa" },
                { label: "Total BV",              value: `${TEAM_STATS.leftBV + TEAM_STATS.rightBV}`,      color: "#D4AF37" },
                { label: "Team Business",         value: fmtK(TEAM_STATS.totalTeamBusiness),               color: "#34d399" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl p-3 text-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <p className="text-[9px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>{s.label}</p>
                  <p className="text-base font-bold font-heading" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 lg:mb-6">
          <StatCard label="Left Team"    value={TEAM_STATS.leftTeamSize}  sub={`${TEAM_STATS.leftBV} BV`}  icon={Users}      />
          <StatCard label="Right Team"   value={TEAM_STATS.rightTeamSize} sub={`${TEAM_STATS.rightBV} BV`} icon={Users}      />
          <StatCard label="Active"       value={TEAM_STATS.activeMembers}  sub="members earning"            icon={UserCheck}  accent />
          <StatCard label="Inactive"     value={TEAM_STATS.inactiveMembers} sub="members idle"              icon={UserX}      />
          <StatCard label="Left BV"      value={TEAM_STATS.leftBV}         sub="business volume"            icon={TrendingUp} />
          <StatCard label="Right BV"     value={TEAM_STATS.rightBV}        sub="business volume"            icon={TrendingUp} />
          <StatCard label="Total Team"   value={TEAM_STATS.totalTeamSize}  sub="all levels"                 icon={Users}      />
          <StatCard label="Team Business" value={fmtK(TEAM_STATS.totalTeamBusiness)} sub="total invested"   icon={TrendingUp} accent />
        </div>

        {/* ── Referral Section ── */}
        {referralCode
          ? <DualReferralCard referralCode={referralCode} />
          : (
            <div
              className="rounded-2xl p-5 mb-5 lg:mb-6 flex items-center gap-3"
              style={{ background: "hsl(var(--card))", border: "1px solid rgba(212,175,55,0.18)" }}
            >
              <Link2 className="h-4 w-4 shrink-0" style={{ color: "rgba(212,175,55,0.4)" }} />
              <span className="text-sm" style={{ color: "rgba(170,179,197,0.5)" }}>Loading referral links…</span>
            </div>
          )
        }

        {/* ── Direct Referrals ── */}
        <div className="mb-5 lg:mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold font-heading text-foreground">
              Direct Referrals
              <span className="ml-2 text-xs font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>({DIRECT_REFERRALS.length})</span>
            </h3>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "rgba(170,179,197,0.4)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username..."
              className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none transition-all duration-200 min-h-[48px]"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--foreground))",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.4)")}
              onBlur={(e)  => (e.target.style.borderColor = "hsl(var(--border))")}
            />
          </div>

          {!hasReferrals ? (
            /* Empty state */
            <div
              className="flex flex-col items-center justify-center py-16 rounded-2xl text-center"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}>
                <Users className="h-8 w-8" style={{ color: "rgba(212,175,55,0.5)" }} />
              </div>
              <h3 className="text-lg font-semibold font-heading text-foreground mb-2">No team members yet</h3>
              <p className="text-sm max-w-xs mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
                Share your referral link to grow your team and start earning network income.
              </p>
              <button
                onClick={() => copyLink("L")}
                className="flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-sm"
                style={{ background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" }}
              >
                <Link2 className="h-4 w-4" />
                Invite Your First Member
              </button>
            </div>
          ) : filteredReferrals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-2xl text-center" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
              <Search className="h-8 w-8 mb-3" style={{ color: "rgba(170,179,197,0.3)" }} />
              <p className="text-sm font-medium text-foreground">No results for "{search}"</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>Try a different username</p>
            </div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="space-y-3 lg:hidden">
                {filteredReferrals.map((r) => <ReferralCard key={r.id} r={r} />)}
              </div>

              {/* Desktop: table */}
              <div className="hidden lg:block rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid hsl(var(--border))" }}>
                      {["Member", "Joined", "Status", "Rank", "Business Volume"].map((h) => (
                        <th key={h} className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(170,179,197,0.5)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReferrals.map((r, i) => (
                      <tr
                        key={r.id}
                        style={{
                          background: i % 2 === 0 ? "hsl(var(--card))" : "rgba(255,255,255,0.015)",
                          borderBottom: i < filteredReferrals.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        }}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar initials={r.avatar} size="sm" />
                            <span className="font-medium text-foreground">@{r.username}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4" style={{ color: "hsl(var(--muted-foreground))" }}>{r.joinDate}</td>
                        <td className="px-5 py-4"><InvBadge status={r.investmentStatus} /></td>
                        <td className="px-5 py-4"><RankBadge rank={r.rank} /></td>
                        <td className="px-5 py-4 font-semibold" style={{ color: "#D4AF37" }}>{fmtFull(r.businessVolume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Team Activity ── */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "rgba(212,175,55,0.1)" }}>
              <Activity className="h-4 w-4" style={{ color: "#D4AF37" }} />
            </div>
            <h3 className="text-base font-semibold font-heading text-foreground">Team Activity</h3>
          </div>

          <div
            className="rounded-2xl overflow-hidden divide-y"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)", "--tw-divide-opacity": "1" } as React.CSSProperties}
          >
            {ACTIVITY.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3.5 px-5 py-4"
                style={{ borderColor: "rgba(255,255,255,0.04)" }}
              >
                <ActivityIcon type={a.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">@{a.username}</span>{" "}
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{a.description}</span>
                  </p>
                </div>
                <span className="text-[11px] shrink-0 ml-2" style={{ color: "rgba(170,179,197,0.4)" }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>

      </PageContainer>
    </AppLayout>
  );
}
