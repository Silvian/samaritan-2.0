"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const widths = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#1d1a29]/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-[8vh] z-50 w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-border bg-surface shadow-xl",
            "max-h-[84vh] flex flex-col",
            widths[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div>
              <D.Title className="text-base font-semibold text-text">{title}</D.Title>
              {description ? (
                <D.Description className="text-sm text-muted mt-1">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          {children && <div className="px-5 pb-4 overflow-y-auto">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3 bg-surface-2 rounded-b-lg">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
