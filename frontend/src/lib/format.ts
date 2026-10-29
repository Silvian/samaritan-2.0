import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

const toDate = (d: string | Date) => (typeof d === "string" ? parseISO(d) : d);

export function fmtDate(d?: string | Date | null, pattern = "d MMM yyyy") {
  if (!d) return "";
  return format(toDate(d), pattern);
}

export function fmtDateTime(d?: string | Date | null) {
  return fmtDate(d, "EEE d MMM yyyy, HH:mm");
}

export function fmtTime(d?: string | Date | null) {
  return fmtDate(d, "HH:mm");
}

export function fromNow(d?: string | Date | null) {
  if (!d) return "";
  return formatDistanceToNowStrict(toDate(d), { addSuffix: true });
}

export function fmtMoney(value: number | string | null | undefined, currency = "GBP", compact = false) {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: compact || Number.isInteger(n) ? 0 : 2,
    notation: compact && Math.abs(n) >= 10000 ? "compact" : "standard",
  }).format(n);
}

export function fmtNumber(n: number | null | undefined) {
  return new Intl.NumberFormat("en-GB").format(n ?? 0);
}

export function pctChange(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
