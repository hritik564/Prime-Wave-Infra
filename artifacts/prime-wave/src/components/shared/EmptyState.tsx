import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon = Inbox,
  title = "No data yet",
  description = "Nothing to show here at the moment.",
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-14 px-6 text-center",
        className
      )}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
        style={{ background: "rgba(212, 175, 55, 0.08)", border: "1px solid rgba(212, 175, 55, 0.15)" }}
      >
        <Icon className="h-7 w-7 text-gold" />
      </div>
      <h3 className="text-base font-semibold text-foreground font-heading">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
