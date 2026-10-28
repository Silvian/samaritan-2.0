"use client";

import { useQuery } from "@tanstack/react-query";

import { BarList, ColumnChart, Legend } from "@/components/charts/charts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { Stat } from "@/components/ui/page";
import { api } from "@/lib/api";
import { fmtMoney, fmtNumber, MONTHS, pctChange } from "@/lib/format";

import { type GivingSummary, methodLabel, num } from "./shared";

export function useGivingSummary(year: number) {
  return useQuery({
    queryKey: ["giving-summary", year],
    queryFn: () => api.get<GivingSummary>("/donations/summary/", { year }),
  });
}

export function GivingOverview({ year, onYear }: { year: number; onYear: (y: number) => void }) {
  const { data, isLoading, error } = useGivingSummary(year);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  if (error) return <ErrorState error={error} />;

  const cur = data?.currency ?? "GBP";
  const money = (v: number) => fmtMoney(v, cur, true);
  const total = num(data?.total);
  const prev = num(data?.previous_year_total);
  const p = pctChange(total, prev);
  const isCurrent = year === thisYear;

  const series = [
    { key: "total", label: String(year) },
    { key: "previous", label: String(year - 1) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {isCurrent ? "Giving so far this year, compared with the whole of last year." : `Giving in ${year}, compared with ${year - 1}.`}
        </p>
        <label className="flex items-center gap-2 text-sm text-muted">
          Year
          <Select value={year} onChange={(e) => onYear(Number(e.target.value))} className="w-28">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </label>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x divide-border [&>*]:border-border max-lg:[&>*]:border-b">
          <Stat
            label={`Total given in ${year}`}
            value={fmtMoney(total, cur)}
            sub={p === null ? `${fmtMoney(prev, cur)} in ${year - 1}` : `${p > 0 ? "+" : ""}${p}% vs ${fmtMoney(prev, cur, true)} in ${year - 1}`}
            tone={p === null ? undefined : p > 0 ? "up" : p < 0 ? "down" : "flat"}
          />
          <Stat label="Named donors" value={fmtNumber(data.donor_count)} sub="Excludes anonymous gifts" />
          <Stat label="Gifts" value={fmtNumber(data.count)} />
          <Stat label="Average gift" value={fmtMoney(data.average_gift, cur)} />
          <Stat
            label="Gift Aid reclaimable"
            value={fmtMoney(data.gift_aid.reclaimable, cur)}
            sub={num(data.gift_aid.unclaimed_reclaimable) > 0 ? `${fmtMoney(data.gift_aid.unclaimed_reclaimable, cur)} not yet claimed` : "All claimed"}
          />
        </Card>
      )}

      <Card>
        <CardHeader title="Giving by month" description={`${year} against ${year - 1}`} action={<Legend series={series} />} />
        <CardBody>
          {data ? (
            <ColumnChart
              data={data.by_month.map((m) => ({ month: MONTHS[m.month - 1], total: num(m.total), previous: num(m.previous) }))}
              x="month"
              height={260}
              series={series}
              format={money}
            />
          ) : (
            <Skeleton className="h-[260px] w-full" />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By fund" description={`Totals given to each fund in ${year}`} />
          <CardBody>
            {!data ? (
              <Skeleton className="h-40 w-full" />
            ) : data.by_fund.length === 0 ? (
              <EmptyState title="No gifts recorded" className="py-8" />
            ) : (
              <BarList items={data.by_fund.map((f) => ({ label: `${f.fund__name} (${fmtNumber(f.count)} gifts)`, value: num(f.total) }))} format={(v) => fmtMoney(v, cur)} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By method" description="How people gave" />
          <CardBody>
            {!data ? (
              <Skeleton className="h-40 w-full" />
            ) : data.by_method.length === 0 ? (
              <EmptyState title="No gifts recorded" className="py-8" />
            ) : (
              <BarList items={data.by_method.map((m) => ({ label: `${methodLabel(m.method)} (${fmtNumber(m.count)} gifts)`, value: num(m.total) }))} format={(v) => fmtMoney(v, cur)} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
