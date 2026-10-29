import { cn } from "@/lib/utils";

export const TONES = {
  neutral: "bg-surface-2 text-muted border-border",
  violet: "bg-primary-soft text-primary border-transparent",
  green: "bg-green-soft text-green border-transparent",
  gold: "bg-gold-soft text-gold border-transparent",
  red: "bg-red-soft text-red border-transparent",
  blue: "bg-blue-soft text-blue border-transparent",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  member: "violet",
  regular: "blue",
  visitor: "green",
  inactive: "neutral",
  former: "neutral",
  deceased: "neutral",
  open: "blue",
  follow_up: "gold",
  closed: "neutral",
  urgent: "red",
  high: "gold",
  normal: "neutral",
  low: "neutral",
  draft: "neutral",
  sent: "green",
  failed: "red",
  received: "blue",
  verifying: "gold",
  in_progress: "violet",
  completed: "green",
  rejected: "neutral",
  present: "green",
  absent: "neutral",
  excused: "gold",
};

const LABELS: Record<string, string> = {
  follow_up: "Needs follow-up",
  in_progress: "In progress",
  regular: "Regular",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{text}</Badge>;
}

const TAG_TONES: Record<string, Tone> = {
  emerald: "green", green: "green", indigo: "violet", violet: "violet", amber: "gold", gold: "gold",
  rose: "red", red: "red", sky: "blue", blue: "blue", slate: "neutral",
};
export const tagTone = (color: string): Tone => TAG_TONES[color] ?? "neutral";
