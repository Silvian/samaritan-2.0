"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Cake, CalendarDays, HandHeart, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { ColumnChart, Legend, TrendChart } from "@/components/charts/charts";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNumber, fromNow, MONTHS, pctChange } from "@/lib/format";

type Dashboard = {
  church: string;
  people?: {
    total: number;
    members: number;
    households: number;
    new_30d: number;
    new_prev_30d: number;
    age_bands: { band: string; count: number }[];
    growth: { month: string; new: number; total: number }[];
    upcoming_birthdays: { id: string; full_name: string; date: string; turning: number; in_days: number }[];
    milestones_ytd: Record<string, number>;
    recent: { id: string; full_name: string; status: string; created_at: string }[];
  };
  groups?: { active: number; people_in_groups: number };
  attendance?: {
    weekly: { week: string; checked_in: number; headcount: number }[];
    average: number;
    last: number;
    upcoming_events: { id: string; title: string; starts_at: string; kind: string; location: string }[];
  };
  giving?: {
    currency: string;
    ytd: string;
    previous_ytd: string;
    donors_ytd: number;
    monthly: { month: number; total: string }[];
  };
  pastoral?: { open: number; urgent: number; follow_ups_due: number; assigned_to_me: number };
  privacy?: { open_requests: number; overdue_requests: number };
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function change(cur: number, prev: number, unit = "") {
  const p = pctChange(cur, prev);
  if (p === null) return { sub: undefined, tone: undefined };
  return {
    sub: `${p > 0 ? "+" : ""}${p}% vs ${unit || "previous period"}`,
    tone: (p > 0 ? "up" : p < 0 ? "down" : "flat") as "up" | "down" | "flat",
  };
}

export default function DashboardPage() {
  const { me } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/dashboard/"),
  });

  if (error) return <ErrorState error={error} />;

  const p = data?.people;
  const a = data?.attendance;
  const g = data?.giving;
  const cur = g?.currency ?? "GBP";
  const money = (v: number) => fmtMoney(v, cur, true);

  const stats: React.ReactNode[] = [];
  if (p) {
    const c = change(p.new_30d, p.new_prev_30d, "prior 30 days");
    stats.push(<Stat key="people" label="People" value={fmtNumber(p.total)} sub={`${fmtNumber(p.households)} households`} />);
    stats.push(<Stat key="members" label="Members" value={fmtNumber(p.members)} sub={`${Math.round((p.members / Math.max(p.total, 1)) * 100)}% of everyone`} />);
    stats.push(<Stat key="new" label="New in last 30 days" value={fmtNumber(p.new_30d)} sub={c.sub} tone={c.tone} />);
  }
  if (a) stats.push(<Stat key="att" label="Average Sunday" value={fmtNumber(a.average)} sub={`${fmtNumber(a.last)} last week`} />);
  if (g) {
    const c = change(parseFloat(g.ytd), parseFloat(g.previous_ytd), "this time last year");
    stats.push(<Stat key="giving" label="Giving this year" value={fmtMoney(g.ytd, cur, true)} sub={c.sub} tone={c.tone} />);
  }

  const attention: { icon: React.ElementType; text: string; href: string; tone: string }[] = [];
  if (data?.pastoral?.follow_ups_due)
    attention.push({ icon: HandHeart, text: data.pastoral.follow_ups_due === 1 ? "1 pastoral follow-up is due" : `${data.pastoral.follow_ups_due} pastoral follow-ups are due`, href: "/care?due=1", tone: "text-gold" });
  if (data?.pastoral?.urgent)
    attention.push({ icon: AlertTriangle, text: data.pastoral.urgent === 1 ? "1 open care case is high priority" : `${data.pastoral.urgent} open care cases are high priority`, href: "/care?priority=high", tone: "text-red" });
  if (data?.privacy?.overdue_requests)
    attention.push({ icon: ShieldAlert, text: data.privacy.overdue_requests === 1 ? "1 data request is past its one-month deadline" : `${data.privacy.overdue_requests} data requests are past their one-month deadline`, href: "/privacy", tone: "text-red" });
  else if (data?.privacy?.open_requests)
    attention.push({ icon: ShieldAlert, text: data.privacy.open_requests === 1 ? "1 data request is open" : `${data.privacy.open_requests} data requests are open`, href: "/privacy", tone: "text-blue" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-[30px] leading-tight font-semibold tracking-[-0.01em]">
            {greeting()}, {me?.first_name || "there"}
          </h1>
          <p className="text-sm text-muted mt-1">Here&apos;s how {data?.church ?? "your church"} is doing this week.</p>
        </div>
        <p className="text-sm text-muted">{fmtDate(new Date(), "EEEE d MMMM yyyy")}</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : stats.length > 0 ? (
        <Card className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x [&>*]:border-border max-lg:[&>*]:border-b">
          {stats}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {a && (
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader
              title="Sunday attendance"
              description="Headcount and people checked in, last 12 weeks"
              action={<Legend series={[{ key: "headcount", label: "Headcount" }, { key: "checked_in", label: "Checked in" }]} />}
            />
            <CardBody className="flex-1 min-h-[280px]">
              <TrendChart
                data={a.weekly}
                x="week"
                height="100%"
                series={[{ key: "headcount", label: "Headcount" }, { key: "checked_in", label: "Checked in" }]}
                xFormat={(v) => fmtDate(v, "d MMM")}
                labelFormat={(l) => `Sunday ${fmtDate(String(l), "d MMM yyyy")}`}
              />
            </CardBody>
          </Card>
        )}

        <div className="space-y-6">
          {attention.length > 0 && (
            <Card>
              <CardHeader title="Needs attention" />
              <CardBody className="space-y-1 -mt-1">
                {attention.map((i) => (
                  <Link key={i.text} href={i.href} className="flex items-start gap-3 rounded-md px-2 py-2 -mx-2 text-sm hover:bg-surface-2">
                    <i.icon className={`h-4 w-4 mt-0.5 shrink-0 ${i.tone}`} />
                    <span>{i.text}</span>
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
          {a && (
            <Card>
              <CardHeader title="Coming up" action={<Link href="/events" className="text-[13px] text-primary hover:underline">All events</Link>} />
              <CardBody className="-mt-1">
                {a.upcoming_events.length === 0 ? (
                  <p className="text-sm text-muted">Nothing scheduled yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {a.upcoming_events.slice(0, 5).map((e) => (
                      <li key={e.id}>
                        <Link href={`/events/${e.id}`} className="flex gap-3 group">
                          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-primary-soft text-primary">
                            <span className="text-[10px] leading-none">{fmtDate(e.starts_at, "MMM")}</span>
                            <span className="text-base font-semibold leading-tight tabular">{fmtDate(e.starts_at, "d")}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium group-hover:text-primary">{e.title}</span>
                            <span className="block text-xs text-muted">
                              {fmtDate(e.starts_at, "EEE HH:mm")}
                              {e.location ? `, ${e.location}` : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {g && (
          <Card className="lg:col-span-2">
            <CardHeader
              title="Giving by month"
              description={`${fmtNumber(g.donors_ytd)} named donors so far this year`}
              action={<Link href="/giving" className="text-[13px] text-primary hover:underline">Giving overview</Link>}
            />
            <CardBody>
              <ColumnChart
                data={g.monthly.map((m) => ({ month: MONTHS[m.month - 1], total: parseFloat(m.total) }))}
                x="month"
                series={[{ key: "total", label: "Given" }]}
                format={money}
              />
            </CardBody>
          </Card>
        )}
        {p && (
          <Card>
            <CardHeader title="Birthdays in the next two weeks" />
            <CardBody className="-mt-1">
              {p.upcoming_birthdays.length === 0 ? (
                <p className="text-sm text-muted">No birthdays coming up.</p>
              ) : (
                <ul className="space-y-2.5">
                  {p.upcoming_birthdays.slice(0, 7).map((b) => (
                    <li key={b.id} className="flex items-center gap-3">
                      <Cake className="h-4 w-4 text-gold shrink-0" />
                      <Link href={`/people/${b.id}`} className="flex-1 truncate text-sm hover:text-primary">{b.full_name}</Link>
                      <span className="text-xs text-muted tabular">
                        {b.in_days === 0 ? "Today" : b.in_days === 1 ? "Tomorrow" : fmtDate(b.date, "EEE d MMM")}, {b.turning}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}
      </div>

      {p && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Congregation size" description="Everyone on record, by month" />
            <CardBody>
              <TrendChart
                data={p.growth}
                x="month"
                height={200}
                series={[{ key: "total", label: "People" }]}
                xFormat={(v) => fmtDate(v, "MMM")}
                labelFormat={(l) => fmtDate(String(l), "MMMM yyyy")}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Age profile" description="People with a recorded date of birth" />
            <CardBody>
              <ColumnChart data={p.age_bands.filter((b) => b.band !== "Unknown" || b.count > 0)} x="band" height={200} series={[{ key: "count", label: "People" }]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recently added" action={<Link href="/people?ordering=-created_at" className="text-[13px] text-primary hover:underline">View all</Link>} />
            <CardBody className="-mt-1">
              <ul className="space-y-2.5">
                {p.recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <Avatar name={r.full_name} size="sm" />
                    <Link href={`/people/${r.id}`} className="flex-1 truncate text-sm hover:text-primary">{r.full_name}</Link>
                    <StatusBadge status={r.status} />
                    <span className="hidden text-xs text-muted sm:inline w-20 text-right">{fromNow(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      {!isLoading && !p && !a && !g && (
        <Card className="p-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-sm text-muted">Your role doesn&apos;t include any dashboard sections yet. Use the menu to get started.</p>
        </Card>
      )}
    </div>
  );
}
