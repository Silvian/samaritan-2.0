"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Household } from "@/lib/types";

const ROLE: Record<string, string> = { head: "Head", spouse: "Spouse / partner", child: "Child", other: "Other" };
const FIELDS = [
  ["name", "Household name"], ["phone", "Phone"], ["address_line1", "Address line 1"], ["address_line2", "Address line 2"],
  ["city", "Town or city"], ["region", "County"], ["postcode", "Postcode"], ["country", "Country"],
] as const;

export default function HouseholdPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const { data: h, error } = useQuery({ queryKey: ["household", id], queryFn: () => api.get<Household>(`/households/${id}/`) });

  const save = useMutation({
    mutationFn: () => api.patch(`/households/${id}/`, form),
    onSuccess: () => {
      toast.success("Household saved");
      qc.invalidateQueries({ queryKey: ["household", id] });
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
  });

  if (error) return <ErrorState error={error} />;
  if (!h) return <Skeleton className="h-64" />;
  const order = { head: 0, spouse: 1, child: 2, other: 3, "": 4 } as Record<string, number>;
  const members = [...h.members].sort((a, b) => (order[a.household_role] ?? 4) - (order[b.household_role] ?? 4) || (b.age ?? 0) - (a.age ?? 0));

  return (
    <>
      <PageHeader
        title={h.name}
        back={{ href: "/households", label: "Households" }}
        description={
          <span className="flex flex-wrap gap-4">
            {h.address_line1 && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{[h.address_line1, h.address_line2, h.city, h.postcode].filter(Boolean).join(", ")}</span>}
            {h.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{h.phone}</span>}
          </span>
        }
        actions={
          <>
            {can("people.edit") && (
              <Button variant="secondary" onClick={() => { setForm(Object.fromEntries(FIELDS.map(([k]) => [k, String(h[k] ?? "")]))); setEditing(true); }}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            {can("people.create") && <LinkButton href="/people/new"><Plus className="h-4 w-4" /> Add person</LinkButton>}
          </>
        }
      />
      <Card>
        <CardHeader title={`${members.length} ${members.length === 1 ? "person" : "people"}`} />
        <ul className="divide-y divide-border border-t border-border">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/people/${m.id}`} className="flex flex-wrap items-center gap-4 px-5 py-3 hover:bg-surface-2">
                <Avatar name={m.full_name} />
                <span className="min-w-40 flex-1">
                  <span className="block font-medium">{m.full_name}</span>
                  <span className="block text-xs text-muted">{ROLE[m.household_role] ?? "Member"}{m.age !== null ? `, ${m.age}` : ""}</span>
                </span>
                <span className="hidden text-sm text-muted md:block">{m.email}</span>
                <StatusBadge status={m.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Dialog open={editing} onOpenChange={setEditing} title="Edit household" description="Changing the address here doesn't update each person's own address."
        footer={<><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save household</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, label]) => (
            <Field key={k} label={label} htmlFor={k} className={k === "name" ? "sm:col-span-2" : undefined}>
              <Input id={k} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </Field>
          ))}
        </div>
      </Dialog>
    </>
  );
}
