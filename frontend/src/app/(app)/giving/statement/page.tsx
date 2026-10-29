"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { PersonPicker, type PickedPerson } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { Donation } from "@/lib/types";

type Statement = {
  church: { name: string; charity_number: string; address: string; currency: string };
  person: { id: string; full_name: string; address: string };
  year: number;
  total: number | string;
  by_fund: { fund__name: string; total: number | string }[];
  donations: Donation[];
};

// Hide the app shell when printing so only the statement is on paper.
const PRINT_CSS = `
@media print {
  @page { margin: 18mm; }
  html, body { background: #fff !important; }
  .lg\\:pl-64 > aside, .lg\\:pl-64 > header, .lg\\:pl-64 > footer, [data-sonner-toaster] { display: none !important; }
  .lg\\:pl-64 { padding-left: 0 !important; }
  main { padding: 0 !important; max-width: none !important; }
}`;

export default function StatementPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <StatementView />
    </Suspense>
  );
}

function StatementView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const personId = sp.get("person");
  const thisYear = new Date().getFullYear();
  const year = Number(sp.get("year")) || thisYear;
  const [picked, setPicked] = useState<PickedPerson | null>(null);

  const go = (person: string | null, y: number) => router.replace(person ? `${pathname}?person=${person}&year=${y}` : pathname);

  const { data, isLoading, error } = useQuery({
    queryKey: ["giving-statement", personId, year],
    queryFn: () => api.get<Statement>("/donations/statement/", { person: personId, year }),
    enabled: !!personId,
  });

  const years = Array.from({ length: 7 }, (_, i) => thisYear - i);

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="print:hidden">
        <PageHeader
          title="Giving statement"
          description="An annual summary of a donor's gifts, for their records or tax return."
          back={{ href: "/giving?tab=donations", label: "Giving" }}
          actions={
            data ? (
              <Button onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            ) : undefined
          }
        />
        <Card className="mb-6">
          <CardBody className="grid gap-4 pt-5 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <Field label="Donor">
              <PersonPicker
                value={picked ?? (data ? { id: data.person.id, full_name: data.person.full_name } : null)}
                onChange={(p) => {
                  setPicked(p);
                  if (p) go(p.id, year);
                }}
              />
            </Field>
            <Field label="Year">
              <Select value={year} onChange={(e) => go(personId, Number(e.target.value))} disabled={!personId}>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>
      </div>

      {!personId ? (
        <p className="text-sm text-muted print:hidden">Choose a donor to see their statement.</p>
      ) : error ? (
        <ErrorState error={error} />
      ) : isLoading || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <StatementDocument s={data} />
      )}
    </div>
  );
}

function StatementDocument({ s }: { s: Statement }) {
  const cur = s.church.currency || "GBP";
  return (
    <article className="mx-auto max-w-3xl rounded-lg border border-border bg-surface px-6 py-8 sm:px-10 sm:py-10 print:max-w-none print:border-0 print:p-0 print:text-black">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <p className="font-serif text-2xl font-semibold">{s.church.name}</p>
          {s.church.address && <p className="mt-1 whitespace-pre-line text-sm text-muted print:text-black">{s.church.address}</p>}
          {s.church.charity_number && <p className="mt-1 text-sm text-muted print:text-black">Registered charity {s.church.charity_number}</p>}
        </div>
        <div className="text-right">
          <p className="font-serif text-xl font-semibold">Giving statement</p>
          <p className="text-sm text-muted print:text-black">1 January to 31 December {s.year}</p>
          <p className="text-sm text-muted print:text-black">Issued {fmtDate(new Date())}</p>
        </div>
      </div>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted print:text-black">Prepared for</p>
          <p className="mt-0.5 font-medium">{s.person.full_name}</p>
          {s.person.address && <p className="text-sm text-muted print:text-black">{s.person.address}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted print:text-black">Total given in {s.year}</p>
          <p className="mt-0.5 text-3xl font-semibold tabular">{fmtMoney(s.total, cur)}</p>
          <p className="text-sm text-muted print:text-black">{s.donations.length === 1 ? "1 gift" : `${s.donations.length} gifts`}</p>
        </div>
      </section>

      {s.donations.length === 0 ? (
        <p className="border-t border-border py-8 text-center text-sm text-muted">No gifts were recorded for {s.person.full_name} in {s.year}.</p>
      ) : (
        <>
          {s.by_fund.length > 1 && (
            <section className="border-t border-border py-5">
              <h2 className="mb-2 text-sm font-semibold">By fund</h2>
              <table className="w-full text-sm">
                <tbody>
                  {s.by_fund.map((f) => (
                    <tr key={f.fund__name}>
                      <td className="py-1">{f.fund__name}</td>
                      <td className="py-1 text-right tabular">{fmtMoney(f.total, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="border-t border-border pt-5">
            <h2 className="mb-2 text-sm font-semibold">Gifts</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted print:text-black">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Fund</th>
                  <th className="hidden py-2 pr-3 font-medium sm:table-cell print:table-cell">Method</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {s.donations.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0 break-inside-avoid">
                    <td className="py-1.5 pr-3 tabular whitespace-nowrap">{fmtDate(d.date)}</td>
                    <td className="py-1.5 pr-3">{d.fund_name}</td>
                    <td className="hidden py-1.5 pr-3 text-muted sm:table-cell print:table-cell print:text-black">{d.method_display}</td>
                    <td className="py-1.5 text-right tabular whitespace-nowrap">{fmtMoney(d.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className="pt-2" colSpan={2}>Total</td>
                  <td className="hidden sm:table-cell print:table-cell" />
                  <td className="pt-2 text-right tabular">{fmtMoney(s.total, cur)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </>
      )}

      <p className="mt-8 border-t border-border pt-4 text-xs text-muted print:text-black">
        Thank you for your generosity. Please keep this statement for your records.
      </p>
    </article>
  );
}
