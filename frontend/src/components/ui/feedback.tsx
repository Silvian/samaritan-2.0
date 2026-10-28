import { AlertTriangle, Inbox } from "lucide-react";

import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-14 px-6", className)}>
      <Icon className="h-8 w-8 text-subtle mb-3" />
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, className }: { error: unknown; className?: string }) {
  const msg =
    error instanceof ApiError
      ? error.status === 403
        ? "Your role doesn't include access to this. Ask an administrator if you need it."
        : error.status === 404
          ? "This record doesn't exist or you don't have access to it."
          : error.message
      : "Couldn't reach the server. Check your connection and try again.";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-red/30 bg-red-soft px-4 py-3 text-sm text-red", className)}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <p>{msg}</p>
    </div>
  );
}

export function Pagination({ page, totalPages, count, onPage }: { page: number; totalPages: number; count: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return <div className="px-5 py-3 text-xs text-muted border-t border-border">{count} {count === 1 ? "record" : "records"}</div>;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border text-sm">
      <span className="text-xs text-muted tabular">
        Page {page} of {totalPages}, {count} records
      </span>
      <div className="flex gap-2">
        <button className="rounded-md border border-border-strong px-3 py-1 text-[13px] disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="rounded-md border border-border-strong px-3 py-1 text-[13px] disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
