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
        "group rounded-xl bg-card border border-border p-4 lg:p-5 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-gold/20",
        className
      )}
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs lg:text-sm text-muted-foreground font-medium truncate">{label}</p>
          <p className="mt-1 text-lg lg:text-2xl font-bold text-foreground tracking-tight font-heading truncate">
            {value}
          </p>
          {subValue && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{subValue}</p>
          )}
          {trend && trendLabel && (
            <div className={cn("mt-1.5 flex items-center gap-1 text-xs font-medium", trendColor)}>
              <TrendIcon className="h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0" />
              <span className="truncate">{trendLabel}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 lg:h-11 lg:w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
            iconBg
          )}
        >
          <Icon className={cn("h-4 w-4 lg:h-5 lg:w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
