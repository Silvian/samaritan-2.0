"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PersonPicker, type PickedPerson } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import type { Donation, Fund } from "@/lib/types";

import { DONATION_METHODS, todayISO } from "./shared";

export function useFunds() {
  return useQuery({ queryKey: ["funds"], queryFn: () => api.get<Fund[]>("/funds/") });
}

export function invalidateGiving(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["donations", "giving-summary", "funds", "gift-aid-claimable"]) qc.invalidateQueries({ queryKey: [key] });
}

export function DonationDialog({ open, onOpenChange, donation }: { open: boolean; onOpenChange: (o: boolean) => void; donation?: Donation | null }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={donation ? "Edit donation" : "Record donation"}
      description={donation?.gift_aid_claimed_at ? "This gift has been included in a Gift Aid claim, so the donor, fund, amount and date are locked." : undefined}
    >
      {open && <DonationForm key={donation?.id ?? "new"} donation={donation} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function DonationForm({ donation, onDone }: { donation?: Donation | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: funds } = useFunds();
  const locked = !!donation?.gift_aid_claimed_at;
  const [anonymous, setAnonymous] = useState(donation ? !donation.person : false);
  const [person, setPerson] = useState<PickedPerson | null>(donation?.person ? { id: donation.person, full_name: donation.person_name ?? "" } : null);
  const [form, setForm] = useState({
    fund: donation?.fund ?? "",
    amount: donation?.amount ?? "",
    date: donation?.date ?? todayISO(),
    method: donation?.method ?? "bank_transfer",
    reference: donation?.reference ?? "",
    eligible_for_gift_aid: donation?.eligible_for_gift_aid ?? true,
    notes: donation?.notes ?? "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const activeFunds = (funds ?? []).filter((f) => f.is_active || f.id === donation?.fund);
  const fund = form.fund || activeFunds.find((f) => f.name === "General Fund")?.id || activeFunds[0]?.id || "";

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, fund, person: anonymous ? null : person?.id ?? null };
      return donation ? api.patch<Donation>(`/donations/${donation.id}/`, body) : api.post<Donation>("/donations/", body);
    },
    onSuccess: () => {
      toast.success(donation ? "Donation saved" : "Donation recorded");
      invalidateGiving(qc);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const missingDonor = !anonymous && !person;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <Field label="Donor" error={err?.fieldError("person")} hint={anonymous ? "Anonymous gifts can't be claimed for Gift Aid." : undefined}>
        {!anonymous && <PersonPicker value={person} onChange={setPerson} disabled={locked} placeholder="Search for the donor" />}
        <Checkbox label="Anonymous or loose offering" checked={anonymous} disabled={locked} onChange={(e) => setAnonymous(e.target.checked)} className="pt-1" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fund" required error={err?.fieldError("fund")}>
          <Select value={fund} onChange={(e) => set("fund", e.target.value)} disabled={locked} required>
            {activeFunds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required error={err?.fieldError("amount")}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} disabled={locked} required className="tabular" />
        </Field>
        <Field label="Date" required error={err?.fieldError("date")}>
          <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} disabled={locked} required />
        </Field>
        <Field label="Method" error={err?.fieldError("method")}>
          <Select value={form.method} onChange={(e) => set("method", e.target.value)}>
            {DONATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" hint="Cheque number, bank reference or envelope number" error={err?.fieldError("reference")} className="sm:col-span-2">
          <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} maxLength={120} />
        </Field>
      </div>
      <Checkbox
        label="Eligible for Gift Aid"
        hint="Untick if the donor received something in return, or the gift isn't from their own money. Gift Aid is only claimed when the donor also has a declaration in force."
        checked={form.eligible_for_gift_aid}
        onChange={(e) => set("eligible_for_gift_aid", e.target.checked)}
      />
      <Field label="Notes" error={err?.fieldError("notes")}>
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-16" />
      </Field>
      {err?.fieldError("non_field_errors") && <p className="text-sm text-red" role="alert">{err.fieldError("non_field_errors")}</p>}
      <div className="flex justify-end gap-2 border-t border-border -mx-5 px-5 pt-4">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={missingDonor || !fund}>
          {donation ? "Save donation" : "Record donation"}
        </Button>
      </div>
    </form>
  );
}
