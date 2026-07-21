import { TrendingUp, Award, Target } from "lucide-react";

interface HeroCardProps {
  totalInvestment?:  string;
  todayEarnings?:    string;
  currentRank?:      string;
  nextSalaryTarget?: string;
  nextSalaryProgress?: number;
  progressLabel?:    string;
}

export default function HeroCard({
  totalInvestment    = "$0.00",
  todayEarnings      = "+$0.00",
  currentRank        = "—",
  nextSalaryTarget   = "$2,000",
  nextSalaryProgress = 0,
  progressLabel      = "Progress to Bronze",
}: HeroCardProps) {
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden mb-5 lg:mb-8"
      style={{
        background: "linear-gradient(135deg, #0A1628 0%, #0E1B37 50%, #0A1628 100%)",
        border: "1px solid rgba(212,175,55,0.25)",
        boxShadow: "0 0 0 1px rgba(212,175,55,0.08), 0 8px 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* Decorative gold glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 80% 50%, rgba(212,175,55,0.06) 0%, transparent 70%)",
        }}
      />
      {/* Decorative grid lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative p-5 lg:p-8">
        {/* Mobile layout */}
        <div className="lg:hidden">
          <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: "rgba(212,175,55,0.7)" }}>
            Total Active Investment
          </p>
          <p
            className="font-heading font-bold text-4xl mb-5"
            style={{
              background: "linear-gradient(135deg, #F3D37A 0%, #D4AF37 50%, #B8941F 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-0.02em",
            }}
          >
            {totalInvestment}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <HeroStat
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Today"
              value={todayEarnings}
              valueColor="#34d399"
            />
            <HeroStat
              icon={<Award className="h-3.5 w-3.5" />}
              label="Salary Rank"
              value={currentRank}
              valueColor="#D4AF37"
            />
            <HeroStat
              icon={<Target className="h-3.5 w-3.5" />}
              label="Next Target"
              value={nextSalaryTarget}
              valueColor="rgba(255,255,255,0.9)"
            />
          </div>
          {/* Mini progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "rgba(170,179,197,0.6)" }}>
                {progressLabel}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: "#D4AF37" }}>
                {nextSalaryProgress}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${nextSalaryProgress}%`,
                  background: "linear-gradient(90deg, #D4AF37 0%, #F3D37A 100%)",
                }}
              />
            </div>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden lg:flex items-center gap-8">
          {/* Left: Main metric */}
          <div className="flex-1">
            <p className="text-sm font-medium uppercase tracking-widest mb-2" style={{ color: "rgba(212,175,55,0.7)" }}>
              Total Active Investment
            </p>
            <p
              className="font-heading font-bold text-6xl mb-3"
              style={{
                background: "linear-gradient(135deg, #F3D37A 0%, #D4AF37 50%, #B8941F 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: "-0.03em",
              }}
            >
              {totalInvestment}
            </p>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "rgba(170,179,197,0.6)" }}>
                  {progressLabel}
                </span>
                <span className="text-sm font-semibold" style={{ color: "#D4AF37" }}>
                  {nextSalaryProgress}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${nextSalaryProgress}%`,
                    background: "linear-gradient(90deg, #D4AF37 0%, #F3D37A 100%)",
                    boxShadow: "0 0 12px rgba(212,175,55,0.4)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right: 3 stats stacked */}
          <div className="flex flex-col gap-4 min-w-[180px]">
            <DesktopHeroStat
              icon={<TrendingUp className="h-4 w-4" />}
              label="Today's Earnings"
              value={todayEarnings}
              valueColor="#34d399"
            />
            <div style={{ height: "1px", background: "rgba(212,175,55,0.1)" }} />
            <DesktopHeroStat
              icon={<Award className="h-4 w-4" />}
              label="Salary Rank"
              value={currentRank}
              valueColor="#D4AF37"
            />
            <div style={{ height: "1px", background: "rgba(212,175,55,0.1)" }} />
            <DesktopHeroStat
              icon={<Target className="h-4 w-4" />}
              label="Next Salary Target"
              value={nextSalaryTarget}
              valueColor="rgba(255,255,255,0.9)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-1"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-1" style={{ color: "rgba(170,179,197,0.6)" }}>
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-bold font-heading truncate" style={{ color: valueColor }}>
        {value}
      </p>
    </div>
  );
}

function DesktopHeroStat({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1" style={{ color: "rgba(170,179,197,0.6)" }}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-bold font-heading ml-6 truncate" style={{ color: valueColor }}>
        {value}
      </p>
    </div>
  );
}
