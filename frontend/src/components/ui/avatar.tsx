import { cn, initials } from "@/lib/utils";

// Deterministic hue from the liturgical palette so the same person keeps the same colour.
const HUES = ["bg-primary-soft text-primary", "bg-green-soft text-green", "bg-gold-soft text-gold", "bg-blue-soft text-blue", "bg-red-soft text-red"];

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const sizes = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm", xl: "h-16 w-16 text-lg" };
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", HUES[hash % HUES.length], sizes[size], className)}>
      {initials(name) || "?"}
    </span>
  );
}
