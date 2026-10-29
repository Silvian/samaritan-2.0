"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import type { Campus, Group, GroupType } from "@/lib/types";

import { FREQUENCIES, MEETING_DAYS, meetingTime } from "./group-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: Group;
  onSaved?: (g: Group) => void;
};

export function GroupFormDialog(props: Props) {
  // Mount the form only while open so it always starts from fresh values.
  return props.open ? <GroupForm {...props} /> : null;
}

function GroupForm({ open, onOpenChange, group, onSaved }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: group?.name ?? "",
    description: group?.description ?? "",
    group_type_id: group?.group_type?.id ?? "",
    campus_id: group?.campus?.id ?? "",
    meeting_day: group?.meeting_day ?? "",
    meeting_time: meetingTime(group?.meeting_time),
    frequency: group?.frequency ?? "weekly",
    location: group?.location ?? "",
    capacity: group?.capacity != null ? String(group.capacity) : "",
    is_open: group?.is_open ?? true,
    is_children: group?.is_children ?? false,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const types = useQuery({ queryKey: ["group-types"], queryFn: () => api.get<GroupType[]>("/group-types/") });
  const campuses = useQuery({ queryKey: ["campuses"], queryFn: () => api.get<Campus[]>("/campuses/") });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        group_type_id: form.group_type_id || null,
        campus_id: form.campus_id || null,
        meeting_time: form.meeting_time || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      };
      return group ? api.patch<Group>(`/groups/${group.id}/`, body) : api.post<Group>("/groups/", body);
    },
    onSuccess: (g) => {
      toast.success(group ? "Group saved" : "Group created");
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["group", g.id] });
      onOpenChange(false);
      onSaved?.(g);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const fe = (name: string) => (save.error instanceof ApiError ? save.error.fieldError(name) : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={group ? "Edit group" : "New group"}
      description={group ? undefined : "Small groups, ministry teams, classes and anything else people belong to."}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="group-form" loading={save.isPending}>{group ? "Save group" : "Create group"}</Button>
        </>
      }
    >
      <form
        id="group-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Name" required error={fe("name")} className="sm:col-span-2" htmlFor="g-name">
          <Input id="g-name" required value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Description" error={fe("description")} className="sm:col-span-2" htmlFor="g-desc">
          <Textarea id="g-desc" rows={3} className="min-h-20" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Type" error={fe("group_type_id")} htmlFor="g-type">
          <Select id="g-type" value={form.group_type_id} onChange={(e) => set("group_type_id", e.target.value)}>
            <option value="">No type</option>
            {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Campus" error={fe("campus_id")} htmlFor="g-campus">
          <Select id="g-campus" value={form.campus_id} onChange={(e) => set("campus_id", e.target.value)}>
            <option value="">No campus</option>
            {campuses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Meeting day" error={fe("meeting_day")} htmlFor="g-day">
          <Select id="g-day" value={form.meeting_day} onChange={(e) => set("meeting_day", e.target.value)}>
            {MEETING_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label="Meeting time" error={fe("meeting_time")} htmlFor="g-time">
          <Input id="g-time" type="time" value={form.meeting_time} onChange={(e) => set("meeting_time", e.target.value)} />
        </Field>
        <Field label="How often" error={fe("frequency")} htmlFor="g-freq">
          <Select id="g-freq" value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </Field>
        <Field label="Location" error={fe("location")} htmlFor="g-loc" hint="A room, or a host's address">
          <Input id="g-loc" value={form.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Capacity" error={fe("capacity")} htmlFor="g-cap" hint="Leave blank for no limit">
          <Input id="g-cap" type="number" min={1} inputMode="numeric" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
        </Field>
        <div className="space-y-3 sm:pt-7">
          <Checkbox label="Open to new members" checked={form.is_open} onChange={(e) => set("is_open", e.target.checked)} />
          <Checkbox label="Children's or youth group" checked={form.is_children} onChange={(e) => set("is_children", e.target.checked)} />
        </div>
      </form>
    </Dialog>
  );
}
