import { Check } from "lucide-react";

interface Rank {
  name: string;
  minVolume: string;
  color: string;
}

const RANKS: Rank[] = [
  { name: "Bronze", minVolume: "$1K", color: "#cd7f32" },
  { name: "Silver", minVolume: "$5K", color: "#C0C0C0" },
  { name: "Gold", minVolume: "$25K", color: "#D4AF37" },
  { name: "Platinum", minVolume: "$75K", color: "#a8c0d0" },
  { name: "Diamond", minVolume: "$200K", color: "#90cdf4" },
];

interface RankProgressCardProps {
  currentRank?: string;
  nextRank?: string;
  progress?: number;
  remaining?: string;
  teamVolume?: string;
}

export default function RankProgressCard({
  currentRank = "Silver",
  nextRank = "Gold",
  progress = 34,
  remaining = "$8,500",
  teamVolume = "$16,500",
}: RankProgressCardProps) {
  const currentIndex = RANKS.findIndex((r) => r.name === currentRank);
  const nextIndex = RANKS.findIndex((r) => r.name === nextRank);
  const currentRankData = RANKS[currentIndex];
  const nextRankData = RANKS[nextIndex];

  return (
    <div
      className="rounded-2xl p-5 lg:p-6 mb-5 lg:mb-8"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
            Rank Progress
          </p>
          <h3 className="text-xl font-bold font-heading text-foreground">
            {currentRank} → {nextRank}
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            Team Volume: <span className="font-semibold text-foreground">{teamVolume}</span>
          </p>
        </div>
        {/* Rank badge */}
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl font-bold font-heading text-sm"
          style={{
            background: `${currentRankData?.color}18`,
            border: `1px solid ${currentRankData?.color}40`,
            color: currentRankData?.color,
          }}
        >
          {currentRank?.slice(0, 2).toUpperCase()}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: currentRankData?.color }}>
            {currentRank}
          </span>
          <span className="text-xl font-bold font-heading" style={{ color: "#D4AF37" }}>
            {progress}%
          </span>
          <span className="text-sm font-semibold" style={{ color: nextRankData?.color }}>
            {nextRank}
          </span>
        </div>
        {/* Multi-segment track */}
        <div
          className="relative h-3 w-full rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {/* Background shimmer */}
          <div
            className="h-full rounded-full relative overflow-hidden transition-all duration-1000 ease-out"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #B8941F 0%, #D4AF37 50%, #F3D37A 80%, #D4AF37 100%)",
              boxShadow: "0 0 16px rgba(212,175,55,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            {/* Animated shimmer */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                animation: "shimmer 2s infinite",
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Current: {teamVolume}
          </span>
          <span className="text-xs font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
            <span style={{ color: "#D4AF37" }}>{remaining}</span> remaining
          </span>
        </div>
      </div>

      {/* Rank milestones */}
      <div className="flex items-center justify-between">
        {RANKS.map((rank, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={rank.name} className="flex flex-col items-center gap-1.5">
              {/* Node */}
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-300"
                style={{
                  background: isDone
                    ? rank.color
                    : isCurrent
                    ? `${rank.color}22`
                    : "rgba(255,255,255,0.06)",
                  border: `1px solid ${isDone || isCurrent ? rank.color + "80" : "rgba(255,255,255,0.1)"}`,
                  color: isDone ? "#050B1A" : rank.color,
                  boxShadow: isCurrent ? `0 0 12px ${rank.color}40` : "none",
                }}
              >
                {isDone ? <Check className="h-3 w-3" /> : rank.name.slice(0, 1)}
              </div>
              <span
                className="text-[9px] font-medium"
                style={{ color: isCurrent ? rank.color : "rgba(170,179,197,0.45)" }}
              >
                {rank.name}
              </span>
              <span
                className="text-[8px]"
                style={{ color: "rgba(170,179,197,0.3)" }}
              >
                {rank.minVolume}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
