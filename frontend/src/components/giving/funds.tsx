"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import type { Fund } from "@/lib/types";

import { invalidateGiving, useFunds } from "./donation-dialog";
import { num } from "./shared";

export function FundsTab({ currency }: { currency: string }) {
  const { can } = useAuth();
  const manage = can("giving.manage");
  const { data, isLoading, error } = useFunds();
  const [editing, setEditing] = useState<Fund | null>(null);
  const [open, setOpen] = useState(false);
  const year = new Date().getFullYear();

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  if (error) return <ErrorState error={error} />;
  const funds = [...(data ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active) || num(b.total_this_year) - num(a.total_this_year));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Restricted funds can only be spent on their stated purpose. Totals are for {year}.</p>
        {manage && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Add fund
          </Button>
        )}
      </div>
      <Card>
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : funds.length === 0 ? (
          <EmptyState title="No funds yet" description="Add a fund such as General Fund or Building Fund before recording gifts." action={manage ? <Button onClick={openNew}>Add fund</Button> : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Fund</TH>
                <TH className="text-right">Given in {year}</TH>
                <TH className="hidden sm:table-cell w-[34%]">Goal progress</TH>
                {manage && <TH className="w-10"><span className="sr-only">Actions</span></TH>}
              </tr>
            </THead>
            <tbody>
              {funds.map((f) => {
                const total = num(f.total_this_year);
                const goal = f.goal_amount ? num(f.goal_amount) : null;
                const pct = goal ? Math.min(100, Math.round((total / goal) * 100)) : null;
                return (
                  <TR key={f.id} className={f.is_active ? undefined : "opacity-60"}>
                    <TD>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text">{f.name}</span>
                        {f.is_restricted && (
                          <Badge tone="gold">
                            <Lock className="h-3 w-3" />
                            Restricted
                          </Badge>
                        )}
                        {!f.is_active && <Badge>Inactive</Badge>}
                      </div>
                      {f.description && <p className="mt-0.5 text-xs text-muted">{f.description}</p>}
                    </TD>
                    <TD className="text-right font-medium tabular whitespace-nowrap">{fmtMoney(total, currency)}</TD>
                    <TD className="hidden sm:table-cell">
                      {goal ? (
                        <div>
                          <div className="mb-1 flex justify-between text-xs text-muted tabular">
                            <span>{pct}%</span>
                            <span>of {fmtMoney(goal, currency)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`${f.name} goal progress`}>
                            <div className={pct === 100 ? "h-2 rounded-full bg-green" : "h-2 rounded-full bg-primary"} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-subtle">No goal set</span>
                      )}
                    </TD>
                    {manage && (
                      <TD>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Edit ${f.name}`}
                          onClick={() => {
                            setEditing(f);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen} title={editing ? `Edit ${editing.name}` : "Add fund"}>
        {open && <FundForm key={editing?.id ?? "new"} fund={editing} onDone={() => setOpen(false)} />}
      </Dialog>
    </div>
  );
}

function FundForm({ fund, onDone }: { fund: Fund | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: fund?.name ?? "",
    description: fund?.description ?? "",
    goal_amount: fund?.goal_amount ?? "",
    is_restricted: fund?.is_restricted ?? false,
    is_active: fund?.is_active ?? true,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, goal_amount: form.goal_amount === "" ? null : form.goal_amount };
      return fund ? api.patch(`/funds/${fund.id}/`, body) : api.post("/funds/", body);
    },
    onSuccess: () => {
      toast.success(fund ? "Fund saved" : "Fund added");
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={err?.fieldError("name")}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Goal for the year" hint="Optional target to track progress against" error={err?.fieldError("goal_amount")}>
          <Input type="number" min="0" step="0.01" value={form.goal_amount} onChange={(e) => set("goal_amount", e.target.value)} className="tabular" />
        </Field>
      </div>
      <Field label="Description" error={err?.fieldError("description")}>
        <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="min-h-16" />
      </Field>
      <Checkbox label="Restricted fund" hint="Money given can only be used for this fund's purpose." checked={form.is_restricted} onChange={(e) => set("is_restricted", e.target.checked)} />
      <Checkbox label="Active" hint="Inactive funds can't be chosen for new gifts." checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
      <div className="flex justify-end gap-2 border-t border-border -mx-5 px-5 pt-4">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{fund ? "Save fund" : "Add fund"}</Button>
      </div>
    </form>
  );
}
