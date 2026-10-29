import type { Tone } from "@/components/ui/badge";
import type { Group, GroupMembership } from "@/lib/types";

export const MEETING_DAYS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
  { value: "", label: "Varies" },
];

export const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "ad_hoc", label: "Ad hoc" },
];

export const ROLES: { value: GroupMembership["role"]; label: string; tone: Tone }[] = [
  { value: "leader", label: "Leader", tone: "violet" },
  { value: "co_leader", label: "Co-leader", tone: "blue" },
  { value: "member", label: "Member", tone: "neutral" },
  { value: "guest", label: "Guest", tone: "gold" },
];

export const roleInfo = (role: string) => ROLES.find((r) => r.value === role) ?? ROLES[2];
export const roleRank = (role: string) => {
  const i = ROLES.findIndex((r) => r.value === role);
  return i < 0 ? 99 : i;
};

export function meetingTime(t: string | null | undefined) {
  return t ? t.slice(0, 5) : "";
}

/** "Weekly on Wednesdays at 19:00" style summary. */
export function meetingSummary(g: Pick<Group, "meeting_day" | "meeting_day_display" | "meeting_time" | "frequency">) {
  if (g.frequency === "ad_hoc") return g.meeting_day ? `As arranged, usually ${g.meeting_day_display}s` : "As arranged";
  const freq = FREQUENCIES.find((f) => f.value === g.frequency)?.label ?? "Weekly";
  const time = meetingTime(g.meeting_time);
  const day = g.meeting_day ? `${g.meeting_day_display}s` : "day varies";
  return `${freq}, ${day}${time ? ` at ${time}` : ""}`;
}
