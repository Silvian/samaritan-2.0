"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PersonPicker, type PickedPerson } from "@/components/person-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Pagination, TableSkeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Donation, GiftAidDeclaration } from "@/lib/types";

import { invalidateGiving } from "./donation-dialog";
import { DECLARATION_METHODS, GIFT_AID_RATE, num, todayISO } from "./shared";

type Claimable = Paginated<Donation> & { total_amount?: number | string; reclaimable?: number | string };

export function GiftAidTab({ currency }: { currency: string }) {
  return (
    <div className="space-y-6">
      <ClaimableDonations currency={currency} />
      <Declarations />
    </div>
  );
}

function ClaimableDonations({ currency }: { currency: string }) {
  const { can } = useAuth();
  const manage = can("giving.manage");
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [confirm, setConfirm] = useState(false);
  const [claimedOn, setClaimedOn] = useState(todayISO());

  const { data, isLoading, error } = useQuery({
    queryKey: ["gift-aid-claimable", page],
    queryFn: () => api.get<Claimable>("/donations/gift-aid-claimable/", { page, page_size: 50 }),
    placeholderData: (prev) => prev,
  });

  const mark = useMutation({
    mutationFn: () => api.post<{ updated: number }>("/donations/mark-claimed/", { donation_ids: [...selected.keys()], claimed_on: claimedOn }),
    onSuccess: (r) => {
      toast.success(r.updated === 1 ? "1 donation marked as claimed" : `${fmtNumber(r.updated)} donations marked as claimed`);
      setSelected(new Map());
      setConfirm(false);
      invalidateGiving(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.results ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (d: Donation, on: boolean) =>
    setSelected((s) => {
      const n = new Map(s);
      if (on) n.set(d.id, num(d.amount));
      else n.delete(d.id);
      return n;
    });
  const togglePage = (on: boolean) =>
    setSelected((s) => {
      const n = new Map(s);
      rows.forEach((r) => (on ? n.set(r.id, num(r.amount)) : n.delete(r.id)));
      return n;
    });
  const selectedTotal = [...selected.values()].reduce((a, b) => a + b, 0);
  const total = data?.total_amount !== undefined ? num(data.total_amount) : null;

  return (
    <Card>
      <CardHeader
        title="Donations ready to claim"
        description="Gifts from donors with a Gift Aid declaration in force on the date they gave, not yet included in a claim to HMRC."
      />
      {data && (
        <div className="mx-5 mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          <div className="bg-surface-2 px-4 py-3">
            <p className="text-xs text-muted">Donations</p>
            <p className="text-lg font-semibold tabular">{fmtNumber(data.count)}</p>
          </div>
          <div className="bg-surface-2 px-4 py-3">
            <p className="text-xs text-muted">Total claimable</p>
            <p className="text-lg font-semibold tabular">{total === null ? "Not available" : fmtMoney(total, currency)}</p>
          </div>
          <div className="col-span-2 bg-surface-2 px-4 py-3 sm:col-span-1">
            <p className="text-xs text-muted">Gift Aid to reclaim (25%)</p>
            <p className="text-lg font-semibold tabular text-green">{total === null ? "Not available" : fmtMoney(data.reclaimable ?? total * GIFT_AID_RATE, currency)}</p>
          </div>
        </div>
      )}
      {manage && selected.size > 0 && (
        <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary-soft px-4 py-2.5 text-sm">
          <span className="text-text">
            {fmtNumber(selected.size)} selected, {fmtMoney(selectedTotal, currency)} given, <strong className="tabular">{fmtMoney(selectedTotal * GIFT_AID_RATE, currency)}</strong> to reclaim
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>Clear selection</Button>
            <Button size="sm" onClick={() => setConfirm(true)}>
              <CheckCircle2 className="h-4 w-4" />
              Mark as claimed
            </Button>
          </div>
        </div>
      )}
      {error ? (
        <ErrorState error={error} className="m-5 mt-0" />
      ) : isLoading ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing to claim" description="Every eligible gift has already been included in a claim." className="border-t border-border" />
      ) : (
        <div className="border-t border-border">
          <Table>
            <THead>
              <tr>
                {manage && (
                  <TH className="w-10">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={allOnPage} onChange={(e) => togglePage(e.target.checked)} aria-label="Select all on this page" />
                  </TH>
                )}
                <TH>Donor</TH>
                <TH>Date</TH>
                <TH className="hidden sm:table-cell">Fund</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Gift Aid</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((d) => (
                <TR key={d.id} className={selected.has(d.id) ? "bg-primary-soft/40" : undefined}>
                  {manage && (
                    <TD>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={selected.has(d.id)} onChange={(e) => toggle(d, e.target.checked)} aria-label={`Select gift from ${d.person_name} on ${fmtDate(d.date)}`} />
                    </TD>
                  )}
                  <TD>
                    <Link href={`/people/${d.person}`} className="font-medium text-text hover:text-primary">{d.person_name}</Link>
                  </TD>
                  <TD className="whitespace-nowrap tabular">{fmtDate(d.date)}</TD>
                  <TD className="hidden sm:table-cell text-muted">{d.fund_name}</TD>
                  <TD className="text-right tabular whitespace-nowrap">{fmtMoney(d.amount, currency)}</TD>
                  <TD className="text-right tabular whitespace-nowrap text-green">{fmtMoney(num(d.amount) * GIFT_AID_RATE, currency)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <Pagination page={data!.page} totalPages={data!.total_pages} count={data!.count} onPage={setPage} />
        </div>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        size="sm"
        title="Mark as claimed?"
        description={`Record that ${selected.size === 1 ? "this donation has" : `these ${fmtNumber(selected.size)} donations have`} been included in a Gift Aid claim to HMRC, reclaiming ${fmtMoney(selectedTotal * GIFT_AID_RATE, currency)}. Claimed donations are locked and can no longer be edited or deleted.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button loading={mark.isPending} onClick={() => mark.mutate()} disabled={!claimedOn}>Mark as claimed</Button>
          </>
        }
      >
        <Field label="Date claimed" required>
          <Input type="date" value={claimedOn} onChange={(e) => setClaimedOn(e.target.value)} max={todayISO()} />
        </Field>
      </Dialog>
    </Card>
  );
}

function Declarations() {
  const { can } = useAuth();
  const manage = can("giving.manage");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<GiftAidDeclaration | null>(null);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["gift-aid-declarations", q, page],
    queryFn: () => api.get<Paginated<GiftAidDeclaration>>("/gift-aid-declarations/", { search: q, page, page_size: 10 }),
    placeholderData: (prev) => prev,
  });

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader
        title="Gift Aid declarations"
        description="A declaration lets the church claim 25p for every £1 a UK taxpayer gives."
        action={
          manage ? (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Add declaration
            </Button>
          ) : undefined
        }
      />
      <div className="px-5 pb-4">
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by donor"
            className="pl-8"
            aria-label="Search declarations"
          />
        </div>
      </div>
      {error ? (
        <ErrorState error={error} className="m-5 mt-0" />
      ) : isLoading ? (
        <TableSkeleton rows={4} />
      ) : !data || data.results.length === 0 ? (
        <EmptyState title={q ? "No declarations match" : "No declarations yet"} className="border-t border-border" />
      ) : (
        <div className="border-t border-border">
          <Table>
            <THead>
              <tr>
                <TH>Donor</TH>
                <TH>Status</TH>
                <TH>From</TH>
                <TH className="hidden sm:table-cell">Until</TH>
                <TH className="hidden md:table-cell">Method</TH>
                {manage && <TH className="w-10"><span className="sr-only">Actions</span></TH>}
              </tr>
            </THead>
            <tbody>
              {data.results.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/people/${d.person}`} className="font-medium text-text hover:text-primary">{d.person_name}</Link>
                  </TD>
                  <TD>{d.is_active ? <Badge tone="green">In force</Badge> : <Badge>Ended</Badge>}</TD>
                  <TD className="whitespace-nowrap tabular">
                    {fmtDate(d.start_date)}
                    {d.covers_past_four_years && <span className="block text-xs text-muted">Covers previous 4 years</span>}
                  </TD>
                  <TD className="hidden sm:table-cell whitespace-nowrap tabular text-muted">{d.end_date ? fmtDate(d.end_date) : "Ongoing"}</TD>
                  <TD className="hidden md:table-cell text-muted">{DECLARATION_METHODS.find((m) => m.value === d.method)?.label ?? d.method}</TD>
                  {manage && (
                    <TD>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Edit declaration for ${d.person_name}`}
                        onClick={() => {
                          setEditing(d);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen} title={editing ? "Edit declaration" : "Add declaration"} description="Keep the signed form or written confirmation on file for HMRC.">
        {open && <DeclarationForm key={editing?.id ?? "new"} declaration={editing} onDone={() => setOpen(false)} />}
      </Dialog>
    </Card>
  );
}

function DeclarationForm({ declaration, onDone }: { declaration: GiftAidDeclaration | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [person, setPerson] = useState<PickedPerson | null>(declaration ? { id: declaration.person, full_name: declaration.person_name } : null);
  const [form, setForm] = useState({
    start_date: declaration?.start_date ?? todayISO(),
    end_date: declaration?.end_date ?? "",
    method: declaration?.method ?? "written",
    covers_past_four_years: declaration?.covers_past_four_years ?? true,
    notes: declaration?.notes ?? "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, end_date: form.end_date || null, person: person?.id };
      return declaration ? api.patch(`/gift-aid-declarations/${declaration.id}/`, body) : api.post("/gift-aid-declarations/", body);
    },
    onSuccess: () => {
      toast.success(declaration ? "Declaration saved" : "Declaration added");
      qc.invalidateQueries({ queryKey: ["gift-aid-declarations"] });
      invalidateGiving(qc);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Donor" required error={err?.fieldError("person")}>
        <PersonPicker value={person} onChange={setPerson} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of declaration" required error={err?.fieldError("start_date")}>
          <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
        </Field>
        <Field label="Cancelled on" hint="Leave empty while the declaration is in force" error={err?.fieldError("end_date")}>
          <Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
        </Field>
        <Field label="How it was made" error={err?.fieldError("method")} className="sm:col-span-2">
          <Select value={form.method} onChange={(e) => set("method", e.target.value)}>
            {DECLARATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Checkbox
        label="Also covers gifts in the previous four years"
        hint="Most declaration forms include this. Gifts back to four years before the declaration date become claimable."
        checked={form.covers_past_four_years}
        onChange={(e) => set("covers_past_four_years", e.target.checked)}
      />
      <Field label="Notes" error={err?.fieldError("notes")}>
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-16" />
      </Field>
      {err?.fieldError("non_field_errors") && <p className="text-sm text-red" role="alert">{err.fieldError("non_field_errors")}</p>}
      <div className="flex justify-end gap-2 border-t border-border -mx-5 px-5 pt-4">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!person}>{declaration ? "Save declaration" : "Add declaration"}</Button>
      </div>
    </form>
  );
}
