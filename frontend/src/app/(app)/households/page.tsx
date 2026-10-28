"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Home, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, TableSkeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, type Paginated } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { Household } from "@/lib/types";

export default function HouseholdsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebounced(search);
  const { data, isLoading, error } = useQuery({
    queryKey: ["households", { term, page }],
    queryFn: () => api.get<Paginated<Household>>("/households/", { search: term, page, page_size: 50 }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Households" description="Families and people who live together. New households are created when you add a person." />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input className="pl-9" placeholder="Household name, street or postcode" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search households" />
      </div>
      <Card>
        {error ? <ErrorState error={error} className="m-5" /> : isLoading ? <TableSkeleton /> : !data?.results.length ? (
          <EmptyState icon={Home} title="No households found" />
        ) : (
          <>
            <Table>
              <THead><tr><TH>Household</TH><TH>People</TH><TH className="hidden md:table-cell">Address</TH><TH className="hidden lg:table-cell">Campus</TH></tr></THead>
              <tbody>
                {data.results.map((h) => (
                  <TR key={h.id} className="hover:bg-surface-2/60">
                    <TD><Link href={`/households/${h.id}`} className="font-medium hover:text-primary">{h.name}</Link></TD>
                    <TD className="text-muted">
                      <span className="tabular">{h.member_count}</span>
                      <span className="ml-2 hidden sm:inline">{h.members.slice(0, 4).map((m) => m.full_name.split(" ")[0]).join(", ")}{h.members.length > 4 ? "…" : ""}</span>
                    </TD>
                    <TD className="hidden md:table-cell text-muted">{[h.address_line1, h.city, h.postcode].filter(Boolean).join(", ")}</TD>
                    <TD className="hidden lg:table-cell text-muted">{h.campus?.name}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
