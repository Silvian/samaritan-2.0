export const REQUEST_KINDS: { value: string; label: string; short: string; guidance: string }[] = [
  {
    value: "access",
    label: "Access (SAR)",
    short: "Access",
    guidance:
      "Send the person a copy of the personal data you hold about them within one month. Use Export data on their profile, remove anything about other people, then send it securely.",
  },
  {
    value: "rectification",
    label: "Rectification",
    short: "Rectification",
    guidance:
      "Correct anything inaccurate or incomplete on their profile within one month, then tell the person what you changed.",
  },
  {
    value: "erasure",
    label: "Erasure (right to be forgotten)",
    short: "Erasure",
    guidance:
      "Delete their personal data unless you have to keep it, for example Gift Aid records for HMRC. Use Erase personal data on their profile, which keeps only the financial records the law requires.",
  },
  {
    value: "restriction",
    label: "Restriction of processing",
    short: "Restriction",
    guidance:
      "Keep their data but stop using it while the issue is resolved. Remove them from mailing lists, rotas and groups, and note what you did in the resolution.",
  },
  {
    value: "portability",
    label: "Data portability",
    short: "Portability",
    guidance:
      "Give them the data they provided to you in a machine-readable file within one month. Export data on their profile produces a JSON file you can send.",
  },
  {
    value: "objection",
    label: "Objection",
    short: "Objection",
    guidance:
      "Stop using their data for the purpose they object to. Objections to direct marketing must always be honoured: record the withdrawn consent on their profile.",
  },
];

export const REQUEST_STATUSES = [
  { value: "received", label: "Received" },
  { value: "verifying", label: "Verifying identity" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

export const kindInfo = (kind: string) => REQUEST_KINDS.find((k) => k.value === kind);

export const isClosed = (status: string) => status === "completed" || status === "rejected";

/** Whole days from today until `due` (negative when overdue). */
export function daysUntil(due: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function dueText(days: number) {
  if (days < 0) return days === -1 ? "1 day overdue" : `${-days} days overdue`;
  if (days === 0) return "Due today";
  return days === 1 ? "1 day left" : `${days} days left`;
}
