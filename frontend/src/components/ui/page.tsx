import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-text mb-2">
          <ChevronLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] leading-tight font-semibold tracking-[-0.01em] text-text">{title}</h1>
          {description && <p className="text-sm text-muted mt-1 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "up" | "down" | "flat";
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text tabular">{value}</p>
      {sub && (
        <p className={cn("mt-0.5 text-xs tabular", tone === "up" ? "text-green" : tone === "down" ? "text-red" : "text-muted")}>{sub}</p>
      )}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-muted">{i.label}</dt>
          <dd className="text-sm text-text mt-0.5 break-words">{i.value || <span className="text-subtle">Not recorded</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
