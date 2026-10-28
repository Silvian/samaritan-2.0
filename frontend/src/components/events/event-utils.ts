import { format, parseISO } from "date-fns";

import type { Tone } from "@/components/ui/badge";

export const EVENT_KINDS: { value: string; label: string; tone: Tone }[] = [
  { value: "service", label: "Service", tone: "violet" },
  { value: "group_meeting", label: "Group meeting", tone: "blue" },
  { value: "class", label: "Class / course", tone: "gold" },
  { value: "prayer", label: "Prayer meeting", tone: "blue" },
  { value: "youth", label: "Youth / children", tone: "red" },
  { value: "outreach", label: "Outreach", tone: "green" },
  { value: "social", label: "Social", tone: "green" },
  { value: "other", label: "Other", tone: "neutral" },
];

export const kindTone = (kind: string): Tone => EVENT_KINDS.find((k) => k.value === kind)?.tone ?? "neutral";

/** ISO string -> value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
}

/** <input type="datetime-local"> value -> ISO string (UTC). */
export function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
