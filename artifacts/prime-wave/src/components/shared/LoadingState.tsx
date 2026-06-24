import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  variant?: "cards" | "table" | "page";
  rows?: number;
  className?: string;
}

export default function LoadingState({
  variant = "page",
  rows = 4,
  className,
}: LoadingStateProps) {
  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card border border-border p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-11 w-11 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={cn("rounded-xl bg-card border border-border overflow-hidden", className)}>
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-3.5 w-24" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-4 px-4 py-4",
              i < rows - 1 && "border-b border-border/50"
            )}
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20 ml-auto" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card border border-border p-5">
            <Skeleton className="h-3.5 w-28 mb-3" />
            <Skeleton className="h-7 w-36" />
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-card border border-border p-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
