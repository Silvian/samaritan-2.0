"use client";

import * as T from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ items, className }: { items: { value: string; label: React.ReactNode; count?: number }[]; className?: string }) {
  return (
    <T.List className={cn("flex gap-1 border-b border-border overflow-x-auto", className)}>
      {items.map((i) => (
        <T.Trigger
          key={i.value}
          value={i.value}
          className="relative -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted hover:text-text data-[state=active]:border-primary data-[state=active]:text-text"
        >
          {i.label}
          {i.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-muted tabular">{i.count}</span>}
        </T.Trigger>
      ))}
    </T.List>
  );
}
