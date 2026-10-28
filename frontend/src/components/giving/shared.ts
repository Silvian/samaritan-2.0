export const DONATION_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank transfer / standing order" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
  { value: "direct_debit", label: "Direct debit" },
  { value: "other", label: "Other" },
];

export const methodLabel = (v: string) => DONATION_METHODS.find((m) => m.value === v)?.label ?? v;

export const DECLARATION_METHODS = [
  { value: "written", label: "Written form" },
  { value: "online", label: "Online" },
  { value: "oral", label: "Oral (confirmed in writing)" },
];

export const GIFT_AID_RATE = 0.25;

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export type GivingSummary = {
  year: number;
  currency: string;
  total: number | string;
  previous_year_total: number | string;
  count: number;
  donor_count: number;
  average_gift: number | string;
  by_month: { month: number; total: number | string; previous: number | string }[];
  by_fund: { fund__id: string; fund__name: string; total: number | string; count: number }[];
  by_method: { method: string; total: number | string; count: number }[];
  gift_aid: {
    eligible_total: number | string;
    reclaimable: number | string;
    unclaimed_total: number | string;
    unclaimed_reclaimable: number | string;
  };
  top_donors_count: number;
};

export const num = (v: number | string | null | undefined) => (typeof v === "string" ? parseFloat(v) : (v ?? 0));
