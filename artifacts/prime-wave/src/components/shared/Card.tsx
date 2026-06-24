import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  gold?: boolean;
  hover?: boolean;
}

export function Card({ children, className, gold = false, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border p-6",
        "shadow-card-dark",
        gold && "border-gold/20 shadow-card-gold",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-gold cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn("text-base font-semibold text-foreground font-heading", className)}>
      {children}
    </h3>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("", className)}>{children}</div>;
}
