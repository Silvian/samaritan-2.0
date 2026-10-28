"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Pagination, TableSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, download, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Donation } from "@/lib/types";

import { DonationDialog, invalidateGiving, useFunds } from "./donation-dialog";
import { DONATION_METHODS } from "./shared";

export function DonationsTab({ currency }: { currency: string }) {
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const manage = can("giving.manage");
  const { data: funds } = useFunds();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ fund: "", method: "", date__gte: "", date__lte: "" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Donation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Donation | null>(null);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search.trim(), 300);

  const params = { ...filters, search: q };
  const { data, isLoading, error } = useQuery({
    queryKey: ["donations", params, page],
    queryFn: () => api.get<Paginated<Donation>>("/donations/", { ...params, page }),
    placeholderData: (prev) => prev,
  });

  const remove = useMutation({
    mutationFn: (d: Donation) => api.delete(`/donations/${d.id}/`),
    onSuccess: () => {
      toast.success("Donation deleted");
      invalidateGiving(qc);
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setFilter = (k: keyof typeof filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const filtered = q || Object.values(filters).some(Boolean);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download("/donations/export/", params, "donations.csv");
      toast.success("Donations exported");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search donor or reference"
            className="pl-8"
            aria-label="Search donations"
          />
        </div>
        <Select value={filters.fund} onChange={(e) => setFilter("fund", e.target.value)} className="w-full sm:w-40" aria-label="Fund">
          <option value="">All funds</option>
          {funds?.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
        <Select value={filters.method} onChange={(e) => setFilter("method", e.target.value)} className="w-full sm:w-44" aria-label="Method">
          <option value="">All methods</option>
          {DONATION_METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </Select>
        <label className="flex w-full items-center gap-1.5 text-[13px] text-muted sm:w-auto">
          From
          <Input type="date" value={filters.date__gte} onChange={(e) => setFilter("date__gte", e.target.value)} className="flex-1 sm:w-38" />
        </label>
        <label className="flex w-full items-center gap-1.5 text-[13px] text-muted sm:w-auto">
          to
          <Input type="date" value={filters.date__lte} onChange={(e) => setFilter("date__lte", e.target.value)} className="flex-1 sm:w-38" />
        </label>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setFilters({ fund: "", method: "", date__gte: "", date__lte: "" });
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" onClick={exportCsv} loading={exporting}>
            {!exporting && <Download className="h-4 w-4" />}
            Export CSV
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} />
      ) : (
        <Card>
          {isLoading ? (
            <TableSkeleton />
          ) : !data || data.results.length === 0 ? (
            <EmptyState
              title={filtered ? "No donations match these filters" : "No donations recorded yet"}
              description={filtered ? "Try a different fund, method or date range." : "Gifts you record will appear here."}
              action={manage && !filtered ? <Button onClick={openNew}>Record donation</Button> : undefined}
            />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <TH>Donor</TH>
                    <TH>Date</TH>
                    <TH>Fund</TH>
                    <TH className="hidden md:table-cell">Method</TH>
                    <TH className="hidden lg:table-cell">Reference</TH>
                    <TH className="hidden sm:table-cell">Gift Aid</TH>
                    <TH className="text-right">Amount</TH>
                    <TH className="w-10"><span className="sr-only">Actions</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {data.results.map((d) => (
                    <TR key={d.id}>
                      <TD>
                        {d.person ? (
                          <Link href={`/people/${d.person}`} className="font-medium text-text hover:text-primary">{d.person_name}</Link>
                        ) : (
                          <span className="text-muted">Anonymous</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap tabular">{fmtDate(d.date)}</TD>
                      <TD>{d.fund_name}</TD>
                      <TD className="hidden md:table-cell text-muted">{d.method_display}</TD>
                      <TD className="hidden lg:table-cell text-muted">{d.reference}</TD>
                      <TD className="hidden sm:table-cell">
                        {d.gift_aid_claimed_at ? (
                          <Badge tone="green">Claimed {fmtDate(d.gift_aid_claimed_at, "d MMM yyyy")}</Badge>
                        ) : d.person && d.eligible_for_gift_aid ? (
                          <span className="text-xs text-muted">If declared</span>
                        ) : (
                          <span className="text-xs text-subtle">Not eligible</span>
                        )}
                      </TD>
                      <TD className="text-right font-medium tabular whitespace-nowrap">{fmtMoney(d.amount, currency)}</TD>
                      <TD>
                        <Menu>
                          <MenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for donation on ${fmtDate(d.date)}`} className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </MenuTrigger>
                          <MenuContent>
                            {d.person && (
                              <MenuItem onSelect={() => router.push(`/giving/statement?person=${d.person}&year=${d.date.slice(0, 4)}`)}>
                                <FileText className="h-4 w-4" />
                                Giving statement for {d.date.slice(0, 4)}
                              </MenuItem>
                            )}
                            {manage && (
                              <>
                                <MenuItem
                                  onSelect={() => {
                                    setEditing(d);
                                    setDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit donation
                                </MenuItem>
                                <MenuSeparator />
                                <MenuItem danger disabled={!!d.gift_aid_claimed_at} onSelect={() => setDeleting(d)}>
                                  <Trash2 className="h-4 w-4" />
                                  Delete donation
                                </MenuItem>
                              </>
                            )}
                          </MenuContent>
                        </Menu>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
            </>
          )}
        </Card>
      )}

      <DonationDialog open={dialogOpen} onOpenChange={setDialogOpen} donation={editing} />
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this donation?"
        size="sm"
        description={deleting ? `${fmtMoney(deleting.amount, currency)} to ${deleting.fund_name} on ${fmtDate(deleting.date)}${deleting.person_name ? ` from ${deleting.person_name}` : ""}. This can't be undone.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>Delete donation</Button>
          </>
        }
      />
    </div>
  );
}
