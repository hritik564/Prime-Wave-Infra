import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type TrendDirection = "up" | "down" | "neutral";

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: TrendDirection;
  trendLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  className?: string;
}

export default function MetricCard({
  label,
  value,
  subValue,
  trend,
  trendLabel,
  icon: Icon,
  iconColor = "text-gold",
  iconBg = "bg-gold/10",
  className,
}: MetricCardProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const trendColor =
    trend === "up"
      ? "text-emerald-400"
      : trend === "down"
        ? "text-red-400"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "group rounded-xl bg-card border border-border p-5 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-gold/20",
        className
      )}
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground font-medium truncate">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-foreground tracking-tight font-heading">
            {value}
          </p>
          {subValue && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subValue}</p>
          )}
          {trend && trendLabel && (
            <div className={cn("mt-2 flex items-center gap-1 text-xs font-medium", trendColor)}>
              <TrendIcon className="h-3.5 w-3.5" />
              <span>{trendLabel}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ml-3 transition-transform duration-200 group-hover:scale-110",
            iconBg
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
