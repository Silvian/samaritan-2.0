"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Tag as TagIcon, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge, tagTone } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, TableSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, ApiError, download, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced } from "@/lib/hooks";
import { type Campus, PERSON_STATUSES, type PersonListItem, type Tag } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = ["member", "regular", "visitor"];

function PeopleInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { can } = useAuth();

  const [search, setSearch] = useState(sp.get("search") ?? "");
  const term = useDebounced(search, 250);
  const statuses = sp.getAll("status");
  const tag = sp.get("tag") ?? "";
  const campus = sp.get("campus") ?? "";
  const archived = sp.get("archived") === "true";
  const ordering = sp.get("ordering") ?? "last_name";
  const page = Number(sp.get("page") ?? 1);
  const [selected, setSelected] = useState<string[]>([]);

  const setParam = (key: string, value: string | string[] | null) => {
    const next = new URLSearchParams(sp.toString());
    next.delete(key);
    if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
    else if (value) next.set(key, value);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
    setSelected([]);
  };

  const params = {
    search: term,
    status: statuses,
    tag,
    campus,
    archived: archived ? "true" : undefined,
    ordering,
    page,
    page_size: 50,
  };
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["people", params],
    queryFn: () => api.get<Paginated<PersonListItem>>("/people/", params),
    placeholderData: keepPreviousData,
  });
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.get<Tag[]>("/tags/") });
  const campuses = useQuery({ queryKey: ["campuses"], queryFn: () => api.get<Campus[]>("/campuses/") });

  const bulkTag = useMutation({
    mutationFn: (v: { tag: Tag; remove: boolean }) =>
      api.post<{ updated: number }>("/people/bulk-tag/", { person_ids: selected, tag_id: v.tag.id, remove: v.remove }),
    onSuccess: (res, v) => {
      toast.success(`${v.remove ? "Removed" : "Added"} “${v.tag.name}” ${v.remove ? "from" : "to"} ${res.updated} people`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update tags"),
  });

  const rows = data?.results ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggleStatus = (s: string) =>
    setParam("status", statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s]);

  return (
    <>
      <PageHeader
        title="People"
        description={data ? `${data.count.toLocaleString("en-GB")} ${archived ? "archived " : ""}${data.count === 1 ? "person" : "people"}${statuses.length || tag || campus || term ? " match your filters" : ""}` : "Everyone connected with your church"}
        actions={
          <>
            {can("people.export") && (
              <Button variant="secondary" onClick={() => download("/people/export/", { ...params, page: undefined, page_size: undefined }, "people.csv").catch((e) => toast.error(e.message))}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            )}
            {can("people.create") && (
              <LinkButton href="/people/new">
                <Plus className="h-4 w-4" /> Add person
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); if (page !== 1) setParam("page", null); }} placeholder="Name, email, phone or postcode" className="pl-9" aria-label="Search people" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {PERSON_STATUSES.filter((s) => s.value !== "deceased").map((s) => (
            <button key={s.value} onClick={() => toggleStatus(s.value)} aria-pressed={statuses.includes(s.value)}
              className={cn("rounded-full border px-3 py-1 text-[13px] transition-colors", statuses.includes(s.value) ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-muted hover:text-text")}>
              {s.label}
            </button>
          ))}
          {statuses.length === 0 && (
            <button onClick={() => setParam("status", ACTIVE_STATUSES)} className="px-2 py-1 text-[13px] text-primary hover:underline">Active only</button>
          )}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <Select value={tag} onChange={(e) => setParam("tag", e.target.value)} aria-label="Filter by tag" className="w-36">
            <option value="">Any tag</option>
            {tags.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          {(campuses.data?.length ?? 0) > 1 && (
            <Select value={campus} onChange={(e) => setParam("campus", e.target.value)} aria-label="Filter by campus" className="w-36">
              <option value="">All campuses</option>
              {campuses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Select value={archived ? "archived" : ""} onChange={(e) => setParam("archived", e.target.value ? "true" : null)} aria-label="Show archived" className="w-32">
            <option value="">Current</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-soft px-4 py-2 text-sm">
          <span className="font-medium text-primary">{selected.length} selected</span>
          {can("people.edit") && (
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" variant="secondary"><TagIcon className="h-3.5 w-3.5" /> Tag</Button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuLabel>Add tag</MenuLabel>
                {tags.data?.map((t) => <MenuItem key={t.id} onSelect={() => bulkTag.mutate({ tag: t, remove: false })}>{t.name}</MenuItem>)}
                <MenuLabel>Remove tag</MenuLabel>
                {tags.data?.map((t) => <MenuItem key={`r${t.id}`} onSelect={() => bulkTag.mutate({ tag: t, remove: true })}>{t.name}</MenuItem>)}
              </MenuContent>
            </Menu>
          )}
          {can("comms.send") && (
            <LinkButton size="sm" variant="secondary" href={`/messages/new?people=${selected.join(",")}`}>Email</LinkButton>
          )}
          <button className="ml-auto text-muted hover:text-text" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <Card className={cn(isFetching && !isLoading && "opacity-70 transition-opacity")}>
        {error ? (
          <ErrorState error={error} className="m-5" />
        ) : isLoading ? (
          <TableSkeleton rows={10} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={term || statuses.length || tag ? "No one matches these filters" : "No people yet"}
            description={term || statuses.length || tag ? "Try a different search or clear a filter." : "Add the first person to start building your directory."}
            action={can("people.create") && !term ? <LinkButton href="/people/new"><Plus className="h-4 w-4" /> Add person</LinkButton> : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH className="w-10">
                    <input type="checkbox" aria-label="Select all on this page" checked={allSelected} className="accent-[var(--primary)]"
                      onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))} />
                  </TH>
                  <TH>
                    <button onClick={() => setParam("ordering", ordering === "last_name" ? "-last_name" : "last_name")} className="hover:text-text">Name</button>
                  </TH>
                  <TH>Status</TH>
                  <TH className="hidden md:table-cell">Contact</TH>
                  <TH className="hidden lg:table-cell">Household</TH>
                  <TH className="hidden sm:table-cell text-right">Age</TH>
                  <TH className="hidden xl:table-cell">Tags</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((p) => (
                  <TR key={p.id} className={cn("hover:bg-surface-2/60", selected.includes(p.id) && "bg-primary-soft/50")}>
                    <TD>
                      <input type="checkbox" aria-label={`Select ${p.full_name}`} checked={selected.includes(p.id)} className="accent-[var(--primary)]"
                        onChange={() => setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))} />
                    </TD>
                    <TD>
                      <Link href={`/people/${p.id}`} className="flex items-center gap-3 font-medium text-text hover:text-primary">
                        <Avatar name={p.full_name} size="sm" />
                        <span>
                          {p.last_name}, {p.preferred_name || p.first_name}
                          {p.archived_at && <span className="ml-2 text-xs font-normal text-muted">archived</span>}
                        </span>
                      </Link>
                    </TD>
                    <TD><StatusBadge status={p.status} label={p.status_display} /></TD>
                    <TD className="hidden md:table-cell">
                      <span className="block text-text">{p.email}</span>
                      <span className="block text-xs text-muted">{p.phone_mobile}</span>
                    </TD>
                    <TD className="hidden lg:table-cell">
                      {p.household ? (
                        <Link href={`/households/${p.household.id}`} className="text-muted hover:text-primary">{p.household.name}</Link>
                      ) : <span className="text-subtle">None</span>}
                    </TD>
                    <TD className="hidden sm:table-cell text-right tabular text-muted">{p.age ?? ""}</TD>
                    <TD className="hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.tags.slice(0, 3).map((t) => <Badge key={t.id} tone={tagTone(t.color)}>{t.name}</Badge>)}
                        {p.tags.length > 3 && <span className="text-xs text-muted">+{p.tags.length - 3}</span>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {data && <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={(p) => setParam("page", String(p))} />}
          </>
        )}
      </Card>
    </>
  );
}

export default function PeoplePage() {
  return (
    <Suspense>
      <PeopleInner />
    </Suspense>
  );
}
