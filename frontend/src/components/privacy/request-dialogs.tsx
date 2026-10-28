"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PersonPicker, type PickedPerson } from "@/components/person-picker";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { DefinitionList } from "@/components/ui/page";
import { api, ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { DataRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

import { daysUntil, dueText, isClosed, kindInfo, REQUEST_KINDS, REQUEST_STATUSES } from "./guidance";

function Guidance({ kind }: { kind: string }) {
  const info = kindInfo(kind);
  if (!info) return null;
  return (
    <div className="flex gap-2.5 rounded-md border border-blue/20 bg-blue-soft px-3 py-2.5 text-[13px] text-text">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
      <p>
        <span className="font-medium">{info.short}: </span>
        {info.guidance}
      </p>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function LogRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [form, setForm] = useState({ requester_name: "", requester_email: "", kind: "access", received_on: today(), description: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => api.post<DataRequest>("/data-requests/", { ...form, person: person?.id ?? null }),
    onSuccess: () => {
      toast.success("Request logged");
      qc.invalidateQueries({ queryKey: ["data-requests"] });
      qc.invalidateQueries({ queryKey: ["privacy-overview"] });
      setPerson(null);
      setForm({ requester_name: "", requester_email: "", kind: "access", received_on: today(), description: "" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log a data request"
      description="Record a request from someone exercising their data protection rights. You have one month from the date it was received to respond."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="log-request" loading={save.isPending}>Log request</Button>
        </>
      }
    >
      <form id="log-request" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Person the request is about" hint="Leave empty if they aren't on record yet." error={err?.fieldError("person")}>
          <PersonPicker
            value={person}
            onChange={(p) => {
              setPerson(p);
              if (p && !form.requester_name) setForm((f) => ({ ...f, requester_name: p.full_name }));
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Requester name" htmlFor="rq-name" required error={err?.fieldError("requester_name")}>
            <Input id="rq-name" value={form.requester_name} onChange={set("requester_name")} required />
          </Field>
          <Field label="Requester email" htmlFor="rq-email" error={err?.fieldError("requester_email")}>
            <Input id="rq-email" type="email" value={form.requester_email} onChange={set("requester_email")} />
          </Field>
          <Field label="Type of request" htmlFor="rq-kind" required error={err?.fieldError("kind")}>
            <Select id="rq-kind" value={form.kind} onChange={set("kind")}>
              {REQUEST_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>
          <Field label="Received on" htmlFor="rq-recv" required hint="The deadline is one month from this date." error={err?.fieldError("received_on")}>
            <Input id="rq-recv" type="date" value={form.received_on} max={today()} onChange={set("received_on")} required />
          </Field>
        </div>
        <Guidance kind={form.kind} />
        <Field label="What they asked for" htmlFor="rq-desc" hint="How the request arrived and what it covers." error={err?.fieldError("description")}>
          <Textarea id="rq-desc" value={form.description} onChange={set("description")} />
        </Field>
      </form>
    </Dialog>
  );
}

export function RequestDetailDialog({
  request,
  onOpenChange,
  canManage,
}: {
  request: DataRequest | null;
  onOpenChange: (o: boolean) => void;
  canManage: boolean;
}) {
  return (
    <Dialog
      open={!!request}
      onOpenChange={onOpenChange}
      title={request ? `${request.kind_display} request from ${request.requester_name}` : "Data request"}
      size="lg"
    >
      {request && <RequestDetail key={request.id} request={request} canManage={canManage} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function RequestDetail({ request, canManage, onDone }: { request: DataRequest; canManage: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    status: request.status,
    identity_verified: request.identity_verified,
    description: request.description,
    resolution: request.resolution,
  });
  const save = useMutation({
    mutationFn: () => api.patch<DataRequest>(`/data-requests/${request.id}/`, form),
    onSuccess: () => {
      toast.success("Request updated");
      qc.invalidateQueries({ queryKey: ["data-requests"] });
      qc.invalidateQueries({ queryKey: ["privacy-overview"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closed = isClosed(request.status);
  const days = daysUntil(request.due_on);
  const closing = isClosed(form.status) && !closed;

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={request.status} label={request.status_display} />
        {!closed && (
          <span className={cn("text-[13px] font-medium tabular", days < 0 ? "text-red" : days <= 7 ? "text-gold" : "text-muted")}>
            {dueText(days)}
          </span>
        )}
      </div>
      <DefinitionList
        items={[
          {
            label: "Person",
            value: request.person ? (
              <Link href={`/people/${request.person}`} className="text-primary hover:underline">{request.person_name}</Link>
            ) : (
              "Not linked to a record"
            ),
          },
          { label: "Requester", value: [request.requester_name, request.requester_email].filter(Boolean).join(", ") },
          { label: "Received", value: fmtDate(request.received_on) },
          { label: closed ? "Completed" : "Due by", value: closed ? fmtDate(request.completed_on) : fmtDate(request.due_on) },
          ...(request.handled_by_name ? [{ label: "Handled by", value: request.handled_by_name }] : []),
        ]}
      />
      <Guidance kind={request.kind} />
      {request.person && ["access", "portability", "erasure", "rectification"].includes(request.kind) && !closed && (
        <p className="text-[13px] text-muted">
          Open{" "}
          <Link href={`/people/${request.person}`} className="text-primary hover:underline">{request.person_name}&apos;s profile</Link>{" "}
          to {request.kind === "erasure" ? "erase their personal data" : request.kind === "rectification" ? "correct their details" : "export their data"}.
        </p>
      )}

      {canManage ? (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="rd-status">
              <Select id="rd-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {REQUEST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
            <div className="sm:pt-7">
              <Checkbox
                label="Identity verified"
                hint="Check who they are before releasing or deleting anything."
                checked={form.identity_verified}
                onChange={(e) => setForm((f) => ({ ...f, identity_verified: e.target.checked }))}
              />
            </div>
          </div>
          <Field label="What they asked for" htmlFor="rd-desc">
            <Textarea id="rd-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Resolution" htmlFor="rd-res" hint={closing ? "Say what you did, or why the request was refused. This is kept as evidence." : "What has been done so far."}>
            <Textarea id="rd-res" value={form.resolution} onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))} />
          </Field>
          {closing && !form.identity_verified && form.status === "completed" && (
            <p className="text-[13px] text-gold">You&apos;re completing this request without confirming the requester&apos;s identity.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onDone}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>Save request</Button>
          </div>
        </div>
      ) : (
        <DefinitionList
          items={[
            { label: "What they asked for", value: request.description },
            { label: "Resolution", value: request.resolution },
            { label: "Identity verified", value: request.identity_verified ? "Yes" : "No" },
          ]}
        />
      )}
    </form>
  );
}
