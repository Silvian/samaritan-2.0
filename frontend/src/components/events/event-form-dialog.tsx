"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, ApiError, type Paginated } from "@/lib/api";
import type { Campus, EventItem, Group } from "@/lib/types";

import { EVENT_KINDS, fromLocalInput, toLocalInput } from "./event-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: EventItem;
  /** Pre-select a group (e.g. when creating from a group page). */
  defaultGroupId?: string;
  onSaved?: (e: EventItem) => void;
};

export function EventFormDialog(props: Props) {
  return props.open ? <EventForm {...props} /> : null;
}

function nextSundayAt(hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
}

function EventForm({ open, onOpenChange, event, defaultGroupId, onSaved }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    title: event?.title ?? "",
    kind: event?.kind ?? (defaultGroupId ? "group_meeting" : "service"),
    starts_at: toLocalInput(event?.starts_at ?? nextSundayAt(10)),
    ends_at: toLocalInput(event?.ends_at),
    location: event?.location ?? "",
    campus_id: event?.campus?.id ?? "",
    group_id: event?.group_id ?? defaultGroupId ?? "",
    capacity: event?.capacity != null ? String(event.capacity) : "",
    check_in_enabled: event?.check_in_enabled ?? true,
    description: event?.description ?? "",
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const campuses = useQuery({ queryKey: ["campuses"], queryFn: () => api.get<Campus[]>("/campuses/") });
  const groups = useQuery({
    queryKey: ["groups", { is_active: true, page_size: 200 }],
    queryFn: () => api.get<Paginated<Group>>("/groups/", { is_active: true, page_size: 200 }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        starts_at: fromLocalInput(form.starts_at),
        ends_at: fromLocalInput(form.ends_at),
        campus_id: form.campus_id || null,
        group_id: form.group_id || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      };
      return event ? api.patch<EventItem>(`/events/${event.id}/`, body) : api.post<EventItem>("/events/", body);
    },
    onSuccess: (e) => {
      toast.success(event ? "Event saved" : "Event created");
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event", e.id] });
      onOpenChange(false);
      onSaved?.(e);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const fe = (name: string) => (save.error instanceof ApiError ? save.error.fieldError(name) : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={event ? "Edit event" : "New event"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="event-form" loading={save.isPending}>{event ? "Save event" : "Create event"}</Button>
        </>
      }
    >
      <form
        id="event-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Title" required error={fe("title")} className="sm:col-span-2" htmlFor="e-title">
          <Input id="e-title" required value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus placeholder="Sunday Morning Service" />
        </Field>
        <Field label="Kind" error={fe("kind")} htmlFor="e-kind">
          <Select id="e-kind" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
            {EVENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </Field>
        <Field label="Group" error={fe("group_id")} htmlFor="e-group" hint="Group members make up the check-in list">
          <Select id="e-group" value={form.group_id} onChange={(e) => set("group_id", e.target.value)}>
            <option value="">Not for a group</option>
            {groups.data?.results.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Starts" required error={fe("starts_at")} htmlFor="e-start">
          <Input id="e-start" type="datetime-local" required value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
        </Field>
        <Field label="Ends" error={fe("ends_at")} htmlFor="e-end">
          <Input id="e-end" type="datetime-local" min={form.starts_at} value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
        </Field>
        <Field label="Location" error={fe("location")} htmlFor="e-loc">
          <Input id="e-loc" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Main hall" />
        </Field>
        <Field label="Campus" error={fe("campus_id")} htmlFor="e-campus">
          <Select id="e-campus" value={form.campus_id} onChange={(e) => set("campus_id", e.target.value)}>
            <option value="">No campus</option>
            {campuses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Capacity" error={fe("capacity")} htmlFor="e-cap" hint="Leave blank for no limit">
          <Input id="e-cap" type="number" min={1} inputMode="numeric" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
        </Field>
        <div className="sm:pt-7">
          <Checkbox
            label="Use check-in"
            hint="Check people in at the door; children get a pick-up code"
            checked={form.check_in_enabled}
            onChange={(e) => set("check_in_enabled", e.target.checked)}
          />
        </div>
        <Field label="Description" error={fe("description")} className="sm:col-span-2" htmlFor="e-desc">
          <Textarea id="e-desc" rows={3} className="min-h-20" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
