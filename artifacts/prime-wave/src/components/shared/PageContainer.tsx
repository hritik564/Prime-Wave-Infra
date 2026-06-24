import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageContainer({
  children,
  className,
}: PageContainerProps) {
  return (
    <div className={cn("p-6 lg:p-8 max-w-screen-2xl mx-auto w-full", className)}>
      {children}
    </div>
  );
}
