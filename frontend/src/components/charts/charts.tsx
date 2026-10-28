"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const CHART = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

type Series = { key: string; label: string };
type Fmt = (v: number) => string;

const axis = { stroke: "var(--subtle)", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, series, format, labelFormat }: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string | number;
  series: Series[];
  format?: Fmt;
  labelFormat?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-text">{labelFormat ? labelFormat(label ?? "") : label}</p>
      {series.map((s, i) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <p key={s.key} className="flex items-center gap-2 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: CHART[i] }} />
            <span className="flex-1">{s.label}</span>
            <span className="font-medium text-text tabular">{format ? format(p.value) : p.value}</span>
          </p>
        );
      })}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {series.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: CHART[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function TrendChart<T extends Record<string, unknown>>({
  data, x, series, height = 240, format, xFormat, labelFormat,
}: {
  data: T[];
  x: keyof T & string;
  series: Series[];
  height?: number | string;
  format?: Fmt;
  xFormat?: (v: string) => string;
  labelFormat?: (l: string | number) => string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`Trend of ${series.map((s) => s.label).join(" and ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART[i]} stopOpacity={i === 0 ? 0.18 : 0} />
                <stop offset="100%" stopColor={CHART[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={x as string} {...axis} tickFormatter={xFormat} minTickGap={24} />
          <YAxis {...axis} tickFormatter={format} width={56} allowDecimals={false} />
          <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<TooltipBox series={series} format={format} labelFormat={labelFormat} />} />
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} stroke={CHART[i]} strokeWidth={2}
              strokeDasharray={i === 1 ? "4 3" : undefined}
              fill={`url(#fill-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ColumnChart<T extends Record<string, unknown>>({
  data, x, series, height = 240, format, xFormat, labelFormat,
}: {
  data: T[];
  x: keyof T & string;
  series: Series[];
  height?: number;
  format?: Fmt;
  xFormat?: (v: string) => string;
  labelFormat?: (l: string | number) => string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`Columns of ${series.map((s) => s.label).join(" and ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={x as string} {...axis} tickFormatter={xFormat} />
          <YAxis {...axis} tickFormatter={format} width={56} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TooltipBox series={series} format={format} labelFormat={labelFormat} />} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} fill={CHART[i]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked magnitude as plain HTML bars: readable labels, no legend needed. */
export function BarList({ items, format }: { items: { label: string; value: number; href?: string }[]; format?: Fmt }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-text">{i.label}</span>
            <span className="tabular text-muted">{format ? format(i.value) : i.value}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: CHART[0] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
