"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge, type Tone } from "@/components/ui/badge";
import { api, type Paginated } from "@/lib/api";
import { PERSON_STATUSES, type Audience, type Group, type Tag } from "@/lib/types";

export type AudiencePreview = { matched: number; with_email: number; sendable: number; no_consent: number };

export type Recipient = {
  id: number;
  person: string;
  person_name: string;
  email: string;
  status: "sent" | "no_consent" | "no_email" | "failed";
  error: string;
  created_at: string;
};

export const RECIPIENT_STATUS: Record<Recipient["status"], { label: string; tone: Tone }> = {
  sent: { label: "Sent", tone: "green" },
  no_consent: { label: "Skipped: no email consent", tone: "gold" },
  no_email: { label: "Skipped: no email address", tone: "neutral" },
  failed: { label: "Failed", tone: "red" },
};

export function RecipientBadge({ status }: { status: Recipient["status"] }) {
  const s = RECIPIENT_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const EMPTY_AUDIENCE: Audience = { group_ids: [], tag_ids: [], person_ids: [], statuses: [] };

export function useAudienceOptions() {
  const groups = useQuery({
    queryKey: ["groups", "all-for-audience"],
    queryFn: () => api.get<Paginated<Group>>("/groups/", { page_size: 200 }),
    staleTime: 5 * 60_000,
  });
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.get<Tag[]>("/tags/"), staleTime: 5 * 60_000 });
  return { groups: groups.data?.results ?? [], tags: tags.data ?? [], loading: groups.isLoading || tags.isLoading, error: groups.error || tags.error };
}

/** Plain-language description of who a message goes to, e.g. "Members, Alpha Course group, Volunteer tag". */
export function describeAudience(a: Audience, groups: Group[], tags: Tag[]) {
  const parts: string[] = [];
  a.statuses?.forEach((s) => parts.push(PERSON_STATUSES.find((p) => p.value === s)?.label ?? s));
  a.group_ids?.forEach((id) => parts.push(`${groups.find((g) => g.id === id)?.name ?? "Unknown"} group`));
  a.tag_ids?.forEach((id) => parts.push(`${tags.find((t) => t.id === id)?.name ?? "Unknown"} tag`));
  if (a.person_ids?.length) parts.push(a.person_ids.length === 1 ? "1 individual" : `${a.person_ids.length} individuals`);
  return parts;
}

export const audienceIsEmpty = (a: Audience) => !a.group_ids.length && !a.tag_ids.length && !a.person_ids.length && !a.statuses.length;
