"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, Plus, Search, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GroupFormDialog } from "@/components/groups/group-form-dialog";
import { meetingSummary } from "@/components/groups/group-utils";
import { Badge, tagTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced } from "@/lib/hooks";
import type { Group, GroupType } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function GroupsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [active, setActive] = useState("true");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);

  const types = useQuery({ queryKey: ["group-types"], queryFn: () => api.get<GroupType[]>("/group-types/") });
  const params = { search: q, group_type: type, is_active: active, page, page_size: 24 };
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["groups", params],
    queryFn: () => api.get<Paginated<Group>>("/groups/", params),
    placeholderData: keepPreviousData,
  });

  const filtered = !!(q || type || active !== "true");

  return (
    <div>
      <PageHeader
        title="Groups"
        description="Small groups, ministry teams, classes and youth groups."
        actions={
          can("groups.manage") && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New group
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            aria-label="Search groups"
            placeholder="Search groups"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select aria-label="Group type" className="sm:w-44" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Select aria-label="Status" className="sm:w-36" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="">Active and inactive</option>
          </Select>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52" />)}
        </div>
      ) : !data || data.results.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title={filtered ? "No groups match these filters" : "No groups yet"}
            description={filtered ? "Try a different search or clear the filters." : "Create your first group to start tracking who belongs where."}
            action={
              !filtered && can("groups.manage") ? (
                <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New group</Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3 transition-opacity", isFetching && "opacity-70")}>
            {data.results.map((g) => <GroupCard key={g.id} group={g} />)}
          </div>
          <Card className="mt-4">
            <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
          </Card>
        </>
      )}

      <GroupFormDialog open={creating} onOpenChange={setCreating} onSaved={(g) => router.push(`/groups/${g.id}`)} />
    </div>
  );
}

function GroupCard({ group: g }: { group: Group }) {
  const pct = g.capacity ? Math.min(100, Math.round((g.member_count / g.capacity) * 100)) : null;
  const full = g.capacity != null && g.member_count >= g.capacity;
  const place = [g.location, g.campus?.name].filter(Boolean).join(", ");
  return (
    <Card className={cn("relative flex flex-col p-5 transition-colors hover:border-border-strong", !g.is_active && "opacity-75")}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/groups/${g.id}`} className="min-w-0 text-[15px] font-semibold text-text hover:text-primary after:absolute after:inset-0 after:content-['']">
          {g.name}
        </Link>
        {g.group_type && <Badge tone={tagTone(g.group_type.color)}>{g.group_type.name}</Badge>}
      </div>
      {g.description && <p className="mt-1.5 line-clamp-2 text-[13px] text-muted">{g.description}</p>}

      <ul className="mt-4 space-y-1.5 text-[13px] text-muted">
        <li className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
          <span>{meetingSummary(g)}</span>
        </li>
        {place && (
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
            <span className="truncate">{place}</span>
          </li>
        )}
        <li className="flex items-start gap-2">
          <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
          <span className="truncate">
            {g.leaders.length ? g.leaders.map((l) => l.full_name).join(", ") : <span className="text-subtle">No leader yet</span>}
          </span>
        </li>
      </ul>

      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="tabular text-text">
            <span className="font-semibold">{g.member_count}</span>
            {g.capacity ? <span className="text-muted"> of {g.capacity} places</span> : <span className="text-muted"> {g.member_count === 1 ? "member" : "members"}</span>}
          </span>
          <span className="flex flex-wrap justify-end gap-1">
            {!g.is_active && <Badge>Inactive</Badge>}
            {g.is_children && <Badge tone="red">Children</Badge>}
            {full ? <Badge tone="gold">Full</Badge> : !g.is_open && <Badge>Closed</Badge>}
          </span>
        </div>
        {pct !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className={cn("h-full rounded-full", full ? "bg-gold" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </Card>
  );
}
