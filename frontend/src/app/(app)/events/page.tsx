"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Legend, TrendChart } from "@/components/charts/charts";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import { EVENT_KINDS, kindTone } from "@/components/events/event-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, TableSkeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { PageHeader, Stat } from "@/components/ui/page";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { EventItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type DashboardAttendance = {
  attendance?: { weekly: { week: string; checked_in: number; headcount: number }[]; average: number; last: number };
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const SERIES = [
  { key: "headcount", label: "Headcount" },
  { key: "checked_in", label: "Checked in" },
];

export default function EventsPage() {
  const { can } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  // Today's events stay under "Upcoming" all day so the door team can find them.
  const [today] = useState(startOfToday);

  const params =
    tab === "upcoming"
      ? { starts_at__gte: today, ordering: "starts_at", kind, page }
      : { starts_at__lte: today, ordering: "-starts_at", kind, page };
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["events", params],
    queryFn: () => api.get<Paginated<EventItem>>("/events/", params),
    placeholderData: keepPreviousData,
  });
  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardAttendance>("/dashboard/"),
    staleTime: 5 * 60_000,
  });
  const att = dash.data?.attendance;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events & attendance"
        description="Services, meetings and classes, and who came."
        actions={
          can("events.manage") && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New event
            </Button>
          )
        }
      />

      {att && att.weekly.length > 0 && (
        <Card className="grid lg:grid-cols-4">
          <div className="grid grid-cols-2 border-b border-border lg:grid-cols-1 lg:border-b-0 lg:border-r">
            <Stat label="Average Sunday" value={fmtNumber(att.average)} sub="Last 12 weeks" />
            <Stat label="Last Sunday" value={fmtNumber(att.last)} sub={att.last >= att.average ? "At or above average" : "Below average"} tone={att.last >= att.average ? "up" : "down"} />
          </div>
          <div className="lg:col-span-3">
            <CardHeader title="Sunday attendance" action={<Legend series={SERIES} />} />
            <CardBody>
              <TrendChart
                data={att.weekly}
                x="week"
                height={170}
                series={SERIES}
                xFormat={(v) => fmtDate(v, "d MMM")}
                labelFormat={(l) => `Sunday ${fmtDate(String(l), "d MMM yyyy")}`}
              />
            </CardBody>
          </div>
        </Card>
      )}

      <Card>
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "upcoming" | "past");
            setPage(1);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pl-2 pr-3 sm:pr-5">
            <TabsList
              className="border-b-0"
              items={[
                { value: "upcoming", label: "Upcoming" },
                { value: "past", label: "Past" },
              ]}
            />
            <Select
              aria-label="Kind of event"
              className="mb-2 h-8 w-full text-[13px] sm:mb-0 sm:w-44"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All kinds</option>
              {EVENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </div>
        </Tabs>

        {error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : isLoading ? (
          <TableSkeleton />
        ) : !data || data.results.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={tab === "upcoming" ? "Nothing scheduled" : "No past events"}
            description={kind ? "Try showing all kinds of event." : tab === "upcoming" ? "Create an event to start checking people in." : undefined}
            action={
              tab === "upcoming" && !kind && can("events.manage") ? (
                <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New event</Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className={cn("divide-y divide-border transition-opacity", isFetching && "opacity-70")}>
              {data.results.map((e) => <EventRow key={e.id} event={e} past={tab === "past"} />)}
            </ul>
            <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
          </>
        )}
      </Card>

      <EventFormDialog open={creating} onOpenChange={setCreating} onSaved={(e) => router.push(`/events/${e.id}`)} />
    </div>
  );
}

function EventRow({ event: e, past }: { event: EventItem; past: boolean }) {
  const place = [e.location, e.campus?.name].filter(Boolean).join(", ");
  const isToday = fmtDate(e.starts_at, "yyyy-MM-dd") === fmtDate(new Date(), "yyyy-MM-dd");
  return (
    <li className="relative flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/60">
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md",
          e.is_cancelled ? "bg-surface-2 text-subtle" : isToday ? "bg-primary text-primary-fg" : "bg-primary-soft text-primary",
        )}
      >
        <span className="text-[10px] leading-none">{fmtDate(e.starts_at, "MMM")}</span>
        <span className="text-lg font-semibold leading-tight tabular">{fmtDate(e.starts_at, "d")}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/events/${e.id}`}
            className={cn("font-medium text-text hover:text-primary after:absolute after:inset-0 after:content-['']", e.is_cancelled && "line-through text-muted")}
          >
            {e.title}
          </Link>
          <Badge tone={kindTone(e.kind)}>{e.kind_display}</Badge>
          {e.is_cancelled && <Badge tone="red">Cancelled</Badge>}
          {isToday && !e.is_cancelled && <Badge tone="green">Today</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-muted">
          <span className="tabular">
            {fmtDate(e.starts_at, "EEEE, HH:mm")}
            {e.ends_at ? `–${fmtDate(e.ends_at, "HH:mm")}` : ""}
          </span>
          {place && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-subtle" />
              {place}
            </span>
          )}
          {e.group_name && (
            <span className="flex items-center gap-1">
              <UsersRound className="h-3.5 w-3.5 text-subtle" />
              {e.group_name}
            </span>
          )}
        </div>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        {past || e.present_count > 0 || e.headcount ? (
          <>
            <p className="text-sm font-semibold text-text tabular">
              {fmtNumber(e.present_count)}
              {e.headcount ? <span className="font-normal text-muted"> / {fmtNumber(e.headcount)}</span> : null}
            </p>
            <p className="text-xs text-muted">{e.headcount ? "checked in / headcount" : "checked in"}</p>
          </>
        ) : e.capacity ? (
          <p className="text-xs text-muted tabular">Capacity {fmtNumber(e.capacity)}</p>
        ) : null}
      </div>
    </li>
  );
}
