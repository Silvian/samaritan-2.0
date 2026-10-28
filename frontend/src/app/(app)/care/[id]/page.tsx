"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lock, MoreHorizontal, Pencil, RotateCcw, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  AssigneeSelect,
  CARE_KINDS,
  CARE_PRIORITIES,
  CARE_STATUSES,
  ConfidentialBadge,
  FollowUp,
  invalidateCare,
  PriorityBadge,
  todayISO,
} from "@/components/care/shared";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { DefinitionList, PageHeader } from "@/components/ui/page";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fromNow } from "@/lib/format";
import type { CareRecord } from "@/lib/types";

type Patch = Partial<Pick<CareRecord, "status" | "priority" | "follow_up_on" | "assigned_to" | "kind" | "subject" | "details" | "occurred_on" | "is_confidential">>;

export default function CareRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const manage = can("pastoral.manage");
  const qc = useQueryClient();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [note, setNote] = useState("");

  const { data: r, isLoading, error } = useQuery({
    queryKey: ["care-record", id],
    queryFn: () => api.get<CareRecord>(`/care-records/${id}/`),
  });

  const update = useMutation({
    mutationFn: ({ body }: { body: Patch; msg: string }) => api.patch<CareRecord>(`/care-records/${id}/`, body),
    onSuccess: (data, { msg }) => {
      qc.setQueryData(["care-record", id], data);
      invalidateCare(qc);
      toast.success(msg);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: () => api.post(`/care-records/${id}/notes/`, { body: note }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["care-record", id] });
      qc.invalidateQueries({ queryKey: ["care-records"] });
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/care-records/${id}/`),
    onSuccess: () => {
      invalidateCare(qc);
      toast.success("Care record deleted");
      router.replace("/care");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;
  if (isLoading || !r) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const closed = r.status === "closed";
  const notes = r.notes ?? [];

  return (
    <div>
      <PageHeader
        back={{ href: "/care", label: "Pastoral care" }}
        title={r.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} />
            {r.is_confidential && <ConfidentialBadge />}
            <span>
              {r.kind_display} for{" "}
              <Link href={`/people/${r.person}`} className="text-primary hover:underline">{r.person_name}</Link>
            </span>
          </span>
        }
        actions={
          manage ? (
            <>
              {closed ? (
                <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate({ body: { status: "open" }, msg: "Care record reopened" })}>
                  <RotateCcw className="h-4 w-4" />
                  Reopen
                </Button>
              ) : (
                <Button variant="secondary" loading={update.isPending} onClick={() => update.mutate({ body: { status: "closed" }, msg: "Care record closed" })}>
                  <CheckCircle2 className="h-4 w-4" />
                  Close record
                </Button>
              )}
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit record
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    Delete record
                  </MenuItem>
                </MenuContent>
              </Menu>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Details"
              description={
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" aria-hidden />
                  Stored encrypted
                </span>
              }
            />
            <CardBody>
              {r.details ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{r.details}</p>
              ) : (
                <p className="text-sm text-subtle">No details recorded.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notes" description={notes.length ? `${notes.length} ${notes.length === 1 ? "note" : "notes"}, oldest first` : "Add a note after each contact to build up a history."} />
            <CardBody>
              {notes.length > 0 && (
                <ol className="relative mb-5 space-y-5 border-l border-border pl-5">
                  {notes.map((n) => (
                    <li key={n.id} className="relative">
                      <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" aria-hidden />
                      <p className="text-xs text-muted">
                        <span className="font-medium text-text">{n.author ?? "Unknown"}</span>, <time dateTime={n.created_at} title={fmtDateTime(n.created_at)}>{fromNow(n.created_at)}</time>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              {manage && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (note.trim()) addNote.mutate();
                  }}
                  className="space-y-2"
                >
                  <label htmlFor="care-note" className="sr-only">New note</label>
                  <Textarea id="care-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened, and what's next?" className="min-h-20" />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted">Notes are encrypted and can&apos;t be edited once added.</p>
                    <Button type="submit" size="sm" loading={addNote.isPending} disabled={!note.trim()}>Add note</Button>
                  </div>
                </form>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status and follow-up" />
            <CardBody className="space-y-4">
              {manage ? (
                <>
                  <Field label="Status" htmlFor="care-status">
                    <Select id="care-status" value={r.status} disabled={update.isPending} onChange={(e) => update.mutate({ body: { status: e.target.value as CareRecord["status"] }, msg: "Status updated" })}>
                      {CARE_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Priority" htmlFor="care-priority">
                    <Select id="care-priority" value={r.priority} disabled={update.isPending} onChange={(e) => update.mutate({ body: { priority: e.target.value as CareRecord["priority"] }, msg: "Priority updated" })}>
                      {CARE_PRIORITIES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <FollowUpField record={r} disabled={update.isPending} onSave={(v) => update.mutate({ body: { follow_up_on: v }, msg: v ? "Follow-up date set" : "Follow-up date cleared" })} />
                  <Field label="Assigned to" htmlFor="care-assignee">
                    <AssigneeSelect id="care-assignee" value={r.assigned_to ?? ""} onChange={(v) => update.mutate({ body: { assigned_to: v || null }, msg: v ? "Care record assigned" : "Care record unassigned" })} />
                  </Field>
                </>
              ) : (
                <DefinitionList
                  items={[
                    { label: "Status", value: <StatusBadge status={r.status} /> },
                    { label: "Priority", value: <PriorityBadge priority={r.priority} /> },
                    { label: "Follow up", value: <FollowUp date={r.follow_up_on} status={r.status} /> },
                    { label: "Assigned to", value: r.assigned_to_name },
                  ]}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Person" />
            <CardBody>
              <Link href={`/people/${r.person}`} className="flex items-center gap-3 rounded-md -mx-2 px-2 py-1.5 hover:bg-surface-2">
                <Avatar name={r.person_name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.person_name}</span>
                  <span className="block text-xs text-muted">View profile</span>
                </span>
                <UserRound className="h-4 w-4 text-subtle" />
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Record" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {[
                  { label: "Date of contact", value: r.occurred_on ? fmtDate(r.occurred_on) : null },
                  { label: "Created by", value: r.created_by_name },
                  { label: "Created", value: fmtDateTime(r.created_at) },
                  { label: "Last updated", value: fmtDateTime(r.updated_at) },
                  ...(r.closed_at ? [{ label: "Closed", value: fmtDateTime(r.closed_at) }] : []),
                  { label: "Visibility", value: r.is_confidential ? "Confidential" : "Everyone with pastoral care access" },
                ].map((i) => (
                  <div key={i.label}>
                    <dt className="text-xs text-muted">{i.label}</dt>
                    <dd className="mt-0.5">{i.value || <span className="text-subtle">Not recorded</span>}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen} title="Edit care record" size="lg">
        {editOpen && (
          <EditForm
            record={r}
            saving={update.isPending}
            error={update.error}
            onCancel={() => setEditOpen(false)}
            onSave={(body) => update.mutate({ body, msg: "Care record saved" }, { onSuccess: () => setEditOpen(false) })}
          />
        )}
      </Dialog>
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        size="sm"
        title="Delete this care record?"
        description="The record and all its notes will be permanently deleted. Consider closing it instead to keep the history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Delete record</Button>
          </>
        }
      />
    </div>
  );
}

function FollowUpField({ record, disabled, onSave }: { record: CareRecord; disabled: boolean; onSave: (v: string | null) => void }) {
  const [value, setValue] = useState(record.follow_up_on ?? "");
  const [synced, setSynced] = useState(record.follow_up_on);
  if (synced !== record.follow_up_on) {
    setSynced(record.follow_up_on);
    setValue(record.follow_up_on ?? "");
  }
  const changed = (value || null) !== record.follow_up_on;
  const overdue = record.status !== "closed" && record.follow_up_on && record.follow_up_on < todayISO();
  return (
    <Field label="Follow up on" htmlFor="care-follow-up" error={overdue && !changed ? "This follow-up is overdue." : undefined}>
      <div className="flex gap-2">
        <Input id="care-follow-up" type="date" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={overdue && !changed ? true : undefined} />
        {changed && (
          <Button size="md" variant="soft" disabled={disabled} onClick={() => onSave(value || null)}>Save</Button>
        )}
      </div>
    </Field>
  );
}

function EditForm({ record, saving, error, onSave, onCancel }: { record: CareRecord; saving: boolean; error: unknown; onSave: (b: Patch) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    kind: record.kind,
    subject: record.subject,
    details: record.details ?? "",
    occurred_on: record.occurred_on ?? "",
    is_confidential: record.is_confidential,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const err = error instanceof ApiError ? error : null;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...form, occurred_on: form.occurred_on || null });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind of care" error={err?.fieldError("kind")}>
          <Select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
            {CARE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date of contact" error={err?.fieldError("occurred_on")}>
          <Input type="date" value={form.occurred_on} onChange={(e) => set("occurred_on", e.target.value)} />
        </Field>
        <Field label="Subject" required className="sm:col-span-2" error={err?.fieldError("subject")} hint="A short, non-sensitive summary. It appears in lists and on the dashboard.">
          <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} maxLength={200} required />
        </Field>
        <Field label="Details" className="sm:col-span-2" error={err?.fieldError("details")} hint="Encrypted when stored.">
          <Textarea value={form.details} onChange={(e) => set("details", e.target.value)} className="min-h-32" />
        </Field>
      </div>
      <Checkbox
        label="Confidential"
        hint="Only the author, the person assigned and users with confidential care access can see this record."
        checked={form.is_confidential}
        onChange={(e) => set("is_confidential", e.target.checked)}
      />
      <div className="flex justify-end gap-2 border-t border-border -mx-5 px-5 pt-4">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={!form.subject.trim()}>Save care record</Button>
      </div>
    </form>
  );
}
