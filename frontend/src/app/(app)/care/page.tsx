"use client";

import { useQuery } from "@tanstack/react-query";
import { HandHeart, Lock, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
  CARE_KINDS,
  CARE_PRIORITIES,
  ConfidentialBadge,
  FollowUp,
  NewCareRecordDialog,
  PriorityBadge,
  todayISO,
  useAssignableUsers,
} from "@/components/care/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, Skeleton, TableSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { CareRecord } from "@/lib/types";

export default function CarePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CareList />
    </Suspense>
  );
}

const STATUS_FILTERS = [
  { value: "active", label: "Open or follow-up" },
  { value: "open", label: "Open" },
  { value: "follow_up", label: "Needs follow-up" },
  { value: "closed", label: "Closed" },
  { value: "", label: "All statuses" },
];

const PRIORITY_FILTERS = [
  { value: "", label: "Any priority" },
  { value: "high_up", label: "High or urgent" },
  ...CARE_PRIORITIES,
];

function CareList() {
  const { can, me } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const assignable = useAssignableUsers();

  // URL params from dashboard links: ?due=1 and ?priority=high (high or urgent).
  const due = sp.get("due") === "1";
  const urlPriority = sp.get("priority");
  const [status, setStatus] = useState("active");
  const [priority, setPriority] = useState(urlPriority === "high" ? "high_up" : urlPriority ?? "");
  const [kind, setKind] = useState("");
  const [assigned, setAssigned] = useState("");
  const [ordering, setOrdering] = useState(due ? "follow_up_on" : "-created_at");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const q = useDebounced(search.trim(), 300);

  const params: Record<string, unknown> = {
    search: q,
    kind,
    ordering,
    page,
    ...(status === "active" ? { status__in: "open,follow_up" } : { status }),
    ...(priority === "high_up" ? { priority__in: "high,urgent" } : { priority }),
    ...(assigned === "none" ? { assigned_to__isnull: true } : { assigned_to: assigned }),
    ...(due ? { follow_up_on__lte: todayISO() } : {}),
  };

  const list = useQuery({
    queryKey: ["care-records", "list", params],
    queryFn: () => api.get<Paginated<CareRecord>>("/care-records/", params),
    placeholderData: (prev) => prev,
  });
  const mine = useQuery({
    queryKey: ["care-records", "mine"],
    queryFn: () => api.get<CareRecord[]>("/care-records/mine/"),
  });

  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const filtered = q || kind || priority || assigned || status !== "active" || due;
  const clearAll = () => {
    setSearch("");
    setKind("");
    setPriority("");
    setAssigned("");
    setStatus("active");
    setPage(1);
    if (due || urlPriority) router.replace(pathname);
  };

  const myRecords = (mine.data ?? []).slice().sort((a, b) => (a.follow_up_on ?? "9999") < (b.follow_up_on ?? "9999") ? -1 : 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pastoral care"
        description="Visits, calls, prayer requests and support. Details are encrypted and access to every record is logged."
        actions={
          can("pastoral.manage") ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" />
              New care record
            </Button>
          ) : undefined
        }
      />

      {mine.error ? null : (
        <Card>
          <CardHeader title="Assigned to me" description={mine.data ? (myRecords.length === 0 ? "Nothing open is assigned to you." : `${myRecords.length} open ${myRecords.length === 1 ? "record" : "records"}, soonest follow-up first`) : undefined} />
          {mine.isLoading ? (
            <div className="px-5 pb-5"><Skeleton className="h-16 w-full" /></div>
          ) : myRecords.length > 0 ? (
            <ul className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-3 rounded-b-lg overflow-hidden">
              {myRecords.map((r) => (
                <li key={r.id} className="bg-surface">
                  <Link href={`/care/${r.id}`} className="block h-full px-5 py-3.5 hover:bg-surface-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                          {r.is_confidential && <Lock className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Confidential" />}
                          <span className="truncate">{r.person_name}</span>
                        </span>
                        <span className="block truncate text-[13px] text-muted">{r.subject}</span>
                      </span>
                      <PriorityBadge priority={r.priority} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{r.kind_display}</span>
                      <span>
                        Follow up: <FollowUp date={r.follow_up_on} status={r.status} className="text-xs" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      )}

      {(due || urlPriority) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/30 bg-gold-soft px-4 py-2.5 text-sm text-text">
          <span>
            {due ? "Showing records with a follow-up due today or earlier." : "Showing high and urgent records."}
          </span>
          <Button variant="ghost" size="sm" onClick={clearAll}>Show all records</Button>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={search} onChange={(e) => reset(setSearch)(e.target.value)} placeholder="Search name or subject" className="pl-8" aria-label="Search care records" />
          </div>
          <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className="w-full sm:w-48" aria-label="Status">
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <Select value={priority} onChange={(e) => reset(setPriority)(e.target.value)} className="w-full sm:w-40" aria-label="Priority">
            {PRIORITY_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <Select value={kind} onChange={(e) => reset(setKind)(e.target.value)} className="w-full sm:w-48" aria-label="Kind of care">
            <option value="">All kinds of care</option>
            {CARE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
          <Select value={assigned} onChange={(e) => reset(setAssigned)(e.target.value)} className="w-full sm:w-44" aria-label="Assigned to">
            <option value="">Anyone</option>
            {me && !assignable.some((a) => a.id === me.id) && <option value={me.id}>Me</option>}
            {assignable.map((a) => (
              <option key={a.id} value={a.id}>{a.id === me?.id && !a.name.endsWith("(me)") ? `${a.name} (me)` : a.name}</option>
            ))}
            <option value="none">Not assigned</option>
          </Select>
          <Select value={ordering} onChange={(e) => reset(setOrdering)(e.target.value)} className="w-full sm:w-44" aria-label="Sort by">
            <option value="-created_at">Newest first</option>
            <option value="follow_up_on">Follow-up date</option>
          </Select>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearAll}>Clear filters</Button>
          )}
        </div>

        {list.error ? (
          <ErrorState error={list.error} />
        ) : (
          <Card>
            {list.isLoading ? (
              <TableSkeleton />
            ) : !list.data || list.data.results.length === 0 ? (
              <EmptyState
                icon={HandHeart}
                title={filtered ? "No care records match" : "No care records yet"}
                description={filtered ? "Try changing the filters." : "Record visits, calls and prayer requests so nobody slips through the gaps."}
                action={can("pastoral.manage") && !filtered ? <Button onClick={() => setNewOpen(true)}>New care record</Button> : undefined}
              />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>Person</TH>
                      <TH>Subject</TH>
                      <TH className="hidden md:table-cell">Kind</TH>
                      <TH>Status</TH>
                      <TH className="hidden sm:table-cell">Priority</TH>
                      <TH className="hidden lg:table-cell">Assigned to</TH>
                      <TH className="hidden md:table-cell">Follow up</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {list.data.results.map((r) => (
                      <TR key={r.id} className="hover:bg-surface-2/60">
                        <TD>
                          <Link href={`/care/${r.id}`} className="flex items-center gap-1.5 font-medium text-text hover:text-primary">
                            {r.is_confidential && <Lock className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Confidential" />}
                            <span className="whitespace-nowrap">{r.person_name}</span>
                          </Link>
                          <span className="block text-xs text-muted">{fmtDate(r.occurred_on ?? r.created_at)}</span>
                        </TD>
                        <TD className="max-w-xs">
                          <Link href={`/care/${r.id}`} className="line-clamp-2 hover:text-primary">{r.subject}</Link>
                        </TD>
                        <TD className="hidden md:table-cell text-muted whitespace-nowrap">{r.kind_display}</TD>
                        <TD><StatusBadge status={r.status} /></TD>
                        <TD className="hidden sm:table-cell"><PriorityBadge priority={r.priority} /></TD>
                        <TD className="hidden lg:table-cell text-muted whitespace-nowrap">{r.assigned_to_name ?? <span className="text-subtle">Not assigned</span>}</TD>
                        <TD className="hidden md:table-cell"><FollowUp date={r.follow_up_on} status={r.status} /></TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
                <Pagination page={list.data.page} totalPages={list.data.total_pages} count={list.data.count} onPage={setPage} />
              </>
            )}
          </Card>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ConfidentialBadge /> records are only shown to their author, the person assigned and users with confidential care access.
        </p>
      </div>

      <NewCareRecordDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
