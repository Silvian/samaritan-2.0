"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PersonPicker, type PickedPerson } from "@/components/person-picker";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { CareRecord, Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CARE_KINDS = [
  { value: "visit", label: "Home visit" },
  { value: "hospital", label: "Hospital visit" },
  { value: "call", label: "Phone call" },
  { value: "prayer", label: "Prayer request" },
  { value: "counselling", label: "Counselling" },
  { value: "bereavement", label: "Bereavement" },
  { value: "welfare", label: "Practical / welfare support" },
  { value: "new_believer", label: "New believer follow-up" },
  { value: "other", label: "Other" },
];

export const CARE_STATUSES = [
  { value: "open", label: "Open" },
  { value: "follow_up", label: "Needs follow-up" },
  { value: "closed", label: "Closed" },
];

export const CARE_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "normal") return <span className="text-xs text-muted">Normal</span>;
  if (priority === "low") return <span className="text-xs text-subtle">Low</span>;
  return <StatusBadge status={priority} />;
}

export function ConfidentialBadge() {
  return (
    <Badge tone="violet">
      <Lock className="h-3 w-3" aria-hidden />
      Confidential
    </Badge>
  );
}

export function FollowUp({ date, status, className }: { date: string | null; status?: string; className?: string }) {
  if (!date) return <span className={cn("text-xs text-subtle", className)}>None set</span>;
  const today = todayISO();
  const overdue = status !== "closed" && date < today;
  const due = status !== "closed" && date === today;
  return (
    <span className={cn("tabular whitespace-nowrap", overdue ? "font-medium text-red" : due ? "font-medium text-gold" : "text-text", className)}>
      {fmtDate(date)}
      {overdue && <span className="ml-1 text-xs">(overdue)</span>}
      {due && <span className="ml-1 text-xs">(today)</span>}
    </span>
  );
}

/**
 * Users who can be assigned care records. GET /users/ needs users.manage, so for
 * everyone else we fall back to offering only "me" (if the API allows it).
 */
export function useAssignableUsers() {
  const { can, me } = useAuth();
  const canList = can("users.manage");
  const users = useQuery({
    queryKey: ["users", "pastoral-assignable"],
    queryFn: async () => {
      const [u, roles] = await Promise.all([
        api.get<Paginated<User>>("/users/", { is_active: true, page_size: 200 }),
        api.get<Role[] | Paginated<Role>>("/roles/").catch(() => [] as Role[]),
      ]);
      const roleList = Array.isArray(roles) ? roles : roles.results;
      const pastoralRoles = new Set(roleList.filter((r) => r.permissions.includes("pastoral.view")).map((r) => r.id));
      return u.results.filter((x) => x.is_superuser || (x.role && pastoralRoles.has(x.role.id)));
    },
    enabled: canList,
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (canList && users.data) return users.data.map((u) => ({ id: u.id, name: u.full_name || u.email }));
  return me ? [{ id: me.id, name: `${me.full_name || me.email} (me)` }] : [];
}

export function AssigneeSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const { me } = useAuth();
  const options = useAssignableUsers();
  const known = options.some((o) => o.id === value);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not assigned</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.id === me?.id && !o.name.endsWith("(me)") ? `${o.name} (me)` : o.name}</option>
      ))}
      {value && !known && <option value={value}>Current assignee</option>}
    </Select>
  );
}

export function invalidateCare(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["care-records"] });
  qc.invalidateQueries({ queryKey: ["care-record"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

export function NewCareRecordDialog({ open, onOpenChange, person }: { open: boolean; onOpenChange: (o: boolean) => void; person?: PickedPerson }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New care record"
      description="Record pastoral contact with someone. Care records are only visible to people with pastoral care access."
    >
      {open && <CareRecordForm initialPerson={person ?? null} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function CareRecordForm({ initialPerson, onDone }: { initialPerson: PickedPerson | null; onDone: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [person, setPerson] = useState<PickedPerson | null>(initialPerson);
  const [form, setForm] = useState({
    kind: "visit",
    subject: "",
    details: "",
    priority: "normal",
    occurred_on: todayISO(),
    follow_up_on: "",
    assigned_to: "",
    is_confidential: false,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api.post<CareRecord>("/care-records/", {
        ...form,
        person: person?.id,
        occurred_on: form.occurred_on || null,
        follow_up_on: form.follow_up_on || null,
        assigned_to: form.assigned_to || null,
        status: form.follow_up_on ? "follow_up" : "open",
      }),
    onSuccess: (r) => {
      toast.success("Care record created");
      invalidateCare(qc);
      onDone();
      router.push(`/care/${r.id}`);
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
        <Field label="Person" required error={err?.fieldError("person")}>
          <PersonPicker value={person} onChange={setPerson} invalid={!!err?.fieldError("person")} />
        </Field>
        <Field label="Kind of care" error={err?.fieldError("kind")}>
          <Select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
            {CARE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Subject"
          required
          className="sm:col-span-2"
          error={err?.fieldError("subject")}
          hint="A short, non-sensitive summary such as “Visit after hospital stay”. It appears in lists and on the dashboard, so keep private details out of it."
        >
          <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} maxLength={200} required />
        </Field>
        <Field
          label="Details"
          className="sm:col-span-2"
          error={err?.fieldError("details")}
          hint="Encrypted when stored. Write only what's needed to care well, as the person can ask to see what we hold about them."
        >
          <Textarea value={form.details} onChange={(e) => set("details", e.target.value)} className="min-h-28" />
        </Field>
        <Field label="Priority" error={err?.fieldError("priority")}>
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {CARE_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Assigned to" error={err?.fieldError("assigned_to")}>
          <AssigneeSelect value={form.assigned_to} onChange={(v) => set("assigned_to", v)} />
        </Field>
        <Field label="Date of contact" error={err?.fieldError("occurred_on")}>
          <Input type="date" value={form.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} max={todayISO()} />
        </Field>
        <Field label="Follow up on" hint="Leave empty if no follow-up is needed" error={err?.fieldError("follow_up_on")}>
          <Input type="date" value={form.follow_up_on} onChange={(e) => set("follow_up_on", e.target.value)} />
        </Field>
      </div>
      <Checkbox
        label="Confidential"
        hint="Only you, the person assigned and users with confidential care access will be able to see this record."
        checked={form.is_confidential}
        onChange={(e) => set("is_confidential", e.target.checked)}
      />
      <div className="flex justify-end gap-2 border-t border-border -mx-5 px-5 pt-4">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={!person || !form.subject.trim()}>Create care record</Button>
      </div>
    </form>
  );
}
