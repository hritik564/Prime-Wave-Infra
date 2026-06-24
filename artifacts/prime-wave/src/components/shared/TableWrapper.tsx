import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface TableWrapperProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  className?: string;
  emptyState?: React.ReactNode;
}

export default function TableWrapper<T extends object>({
  columns,
  data,
  className,
  emptyState,
}: TableWrapperProps<T>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border overflow-hidden",
        className
      )}
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12">
                  {emptyState}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-border/50 transition-colors hover:bg-secondary/30",
                    i === data.length - 1 && "border-b-0"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-4 py-3 text-foreground", col.className)}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
