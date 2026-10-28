"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Lock, Search, X } from "lucide-react";
import { Fragment, useState } from "react";

import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, TableSkeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, type Paginated } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { AuditEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTIONS: { value: string; label: string; tone: Tone }[] = [
  { value: "create", label: "Created", tone: "green" },
  { value: "update", label: "Updated", tone: "blue" },
  { value: "delete", label: "Deleted", tone: "red" },
  { value: "view", label: "Viewed", tone: "neutral" },
  { value: "export", label: "Exported", tone: "violet" },
  { value: "erase", label: "Erased", tone: "red" },
  { value: "login", label: "Signed in", tone: "neutral" },
  { value: "login_failed", label: "Sign-in failed", tone: "red" },
  { value: "logout", label: "Signed out", tone: "neutral" },
  { value: "mfa", label: "Two-factor", tone: "gold" },
  { value: "password", label: "Password", tone: "gold" },
  { value: "send", label: "Sent message", tone: "violet" },
  { value: "permission_denied", label: "Access denied", tone: "red" },
];

const OBJECT_TYPES: { value: string; label: string }[] = [
  { value: "people.person", label: "Person" },
  { value: "people.household", label: "Household" },
  { value: "people.tag", label: "Tag" },
  { value: "people.position", label: "Position" },
  { value: "people.milestone", label: "Milestone" },
  { value: "groups.group", label: "Group" },
  { value: "groups.grouptype", label: "Group type" },
  { value: "groups.groupmembership", label: "Group membership" },
  { value: "events.event", label: "Event" },
  { value: "giving.donation", label: "Donation" },
  { value: "giving.fund", label: "Fund" },
  { value: "giving.giftaiddeclaration", label: "Gift Aid declaration" },
  { value: "pastoral.carerecord", label: "Care record" },
  { value: "communications.message", label: "Message" },
  { value: "events.attendance", label: "Attendance" },
  { value: "pastoral.carenote", label: "Care note" },
  { value: "privacy.datarequest", label: "Data request" },
  { value: "privacy.consent", label: "Consent" },
  { value: "accounts.user", label: "User" },
  { value: "accounts.role", label: "Role" },
  { value: "core.churchsettings", label: "Church settings" },
  { value: "core.campus", label: "Campus" },
];

const actionInfo = (a: string) => ACTIONS.find((x) => x.value === a) ?? { value: a, label: a, tone: "neutral" as Tone };
const typeLabel = (t: string) => OBJECT_TYPES.find((x) => x.value === t)?.label ?? t.split(".").pop() ?? t;

const humanise = (k: string) => {
  const s = k.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function Val({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="italic text-subtle">empty</span>;
  if (typeof v === "boolean") return <span>{v ? "Yes" : "No"}</span>;
  if (typeof v === "string" && v.startsWith("[redacted]")) return <span className="inline-flex items-center gap-1 text-muted"><Lock className="h-3 w-3" /> hidden</span>;
  const text = typeof v === "object" ? JSON.stringify(v) : String(v);
  return <span className="break-all font-mono text-[12px]">{text}</span>;
}

function isDiff(v: unknown): v is { from: unknown; to: unknown } {
  return !!v && typeof v === "object" && !Array.isArray(v) && "from" in v && "to" in v;
}

function Changes({ entry }: { entry: AuditEntry }) {
  const entries = Object.entries(entry.changes ?? {});
  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted">No field changes were recorded for this event.</p>
      ) : (
        <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[minmax(140px,max-content)_1fr]">
          {entries.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="font-medium text-text">{humanise(k)}</dt>
              <dd className="min-w-0 text-text">
                {isDiff(v) ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="rounded bg-red-soft px-1.5 py-0.5 text-red line-through decoration-red/50"><Val v={v.from} /></span>
                    <ChevronRight className="h-3.5 w-3.5 text-subtle" aria-label="changed to" />
                    <span className="rounded bg-green-soft px-1.5 py-0.5 text-green"><Val v={v.to} /></span>
                  </span>
                ) : (
                  <Val v={v} />
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <p className="text-xs text-muted break-all">
        Record {entry.object_type || "unknown"}{entry.object_id ? `, id ${entry.object_id}` : ""}. Device: {entry.user_agent || "not recorded"}.
      </p>
    </div>
  );
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [objectType, setObjectType] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const search = useDebounced(q.trim(), 300);

  const filtered = !!(search || action || objectType || since || until);
  const { data, error } = useQuery({
    queryKey: ["audit-log", { page, search, action, objectType, since, until }],
    queryFn: () =>
      api.get<Paginated<AuditEntry>>("/audit-log/", {
        page,
        search,
        action,
        object_type: objectType,
        since: since ? new Date(`${since}T00:00:00`).toISOString() : "",
        until: until ? new Date(`${until}T23:59:59`).toISOString() : "",
        ordering: "-timestamp",
      }),
    placeholderData: keepPreviousData,
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Every sign-in, change, export and erasure, with who did it and from where. The log is append-only: entries can't be edited or deleted, so it stands as evidence of how personal data has been handled."
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr_auto] lg:items-end">
          <Field label="Search" htmlFor="a-q">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <Input id="a-q" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Who did it, or what it was" className="pl-8" />
            </div>
          </Field>
          <Field label="Action" htmlFor="a-action">
            <Select id="a-action" value={action} onChange={(e) => reset(setAction)(e.target.value)}>
              <option value="">Any action</option>
              {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </Field>
          <Field label="Record type" htmlFor="a-type">
            <Select id="a-type" value={objectType} onChange={(e) => reset(setObjectType)(e.target.value)}>
              <option value="">Any record</option>
              {OBJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="From" htmlFor="a-since">
            <Input id="a-since" type="date" value={since} max={until || undefined} onChange={(e) => reset(setSince)(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="a-until">
            <Input id="a-until" type="date" value={until} min={since || undefined} onChange={(e) => reset(setUntil)(e.target.value)} />
          </Field>
          <Button
            variant="ghost"
            disabled={!filtered}
            onClick={() => { setQ(""); setAction(""); setObjectType(""); setSince(""); setUntil(""); setPage(1); }}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        </div>
      </Card>

      <Card>
        {error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : !data ? (
          <TableSkeleton rows={8} />
        ) : data.results.length === 0 ? (
          <EmptyState title={filtered ? "No entries match these filters" : "Nothing logged yet"} description={filtered ? "Try a wider date range or clear the filters." : undefined} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH className="w-8" aria-label="Expand" />
                  <TH>Time</TH>
                  <TH>Who</TH>
                  <TH>Action</TH>
                  <TH>Record</TH>
                  <TH>IP address</TH>
                </tr>
              </THead>
              <tbody>
                {data.results.map((e) => {
                  const isOpen = open.has(e.id);
                  const a = actionInfo(e.action);
                  const n = Object.keys(e.changes ?? {}).length;
                  return (
                    <Fragment key={e.id}>
                      <TR className={cn("cursor-pointer hover:bg-surface-2", isOpen && "border-b-0 bg-surface-2")} onClick={() => toggle(e.id)}>
                        <TD className="pr-0">
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? "Hide details" : "Show details"}
                            onClick={(ev) => { ev.stopPropagation(); toggle(e.id); }}
                            className="rounded p-0.5 text-muted hover:text-text"
                          >
                            <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                          </button>
                        </TD>
                        <TD className="whitespace-nowrap tabular">
                          {fmtDate(e.timestamp, "d MMM yyyy")}
                          <span className="block text-xs text-muted">{fmtDate(e.timestamp, "HH:mm:ss")}</span>
                        </TD>
                        <TD className="max-w-56 truncate">{e.actor_email || <span className="text-muted">System or anonymous</span>}</TD>
                        <TD><Badge tone={a.tone}>{a.label}</Badge></TD>
                        <TD className="max-w-72">
                          <span className="block truncate font-medium text-text">{e.object_repr || "Unnamed"}</span>
                          <span className="block text-xs text-muted">
                            {typeLabel(e.object_type)}
                            {n > 0 ? `, ${n} ${n === 1 ? "field" : "fields"}` : ""}
                          </span>
                        </TD>
                        <TD className="whitespace-nowrap font-mono text-[12px] text-muted">{e.ip_address || "Unknown"}</TD>
                      </TR>
                      {isOpen && (
                        <tr className="border-b border-border bg-surface-2">
                          <td colSpan={6} className="px-5 pb-4 pt-1 sm:pl-14">
                            <Changes entry={e} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
