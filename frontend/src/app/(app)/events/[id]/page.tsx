"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, Check, MapPin, MoreHorizontal, Pencil, Repeat, RotateCcw, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CheckInPanel, SecurityCode } from "@/components/events/check-in-panel";
import { EventFormDialog } from "@/components/events/event-form-dialog";
import { kindTone } from "@/components/events/event-utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtNumber, fmtTime } from "@/lib/format";
import type { EventItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type EventAttendance = {
  id: number;
  person: string;
  person_name: string;
  person_age: number | null;
  status: "present" | "absent" | "excused";
  checked_in_at: string | null;
  checked_out_at: string | null;
  security_code: string;
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { data: event, error, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get<EventItem>(`/events/${id}/`),
  });
  const canSeeAttendance = can("attendance.record", "events.view", "events.manage");
  const attendance = useQuery({
    queryKey: ["event-attendance", id],
    queryFn: () => api.get<EventAttendance[]>(`/events/${id}/attendance/`),
    enabled: canSeeAttendance,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event", id] });
    qc.invalidateQueries({ queryKey: ["events"] });
  };
  const toggleCancel = useMutation({
    mutationFn: () => api.patch<EventItem>(`/events/${id}/`, { is_cancelled: !event?.is_cancelled }),
    onSuccess: (e) => {
      toast.success(e.is_cancelled ? "Event cancelled" : "Event reinstated");
      setCancelling(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const destroy = useMutation({
    mutationFn: () => api.delete(`/events/${id}/`),
    onSuccess: () => {
      toast.success("Event deleted");
      qc.invalidateQueries({ queryKey: ["events"] });
      router.push("/events");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;
  if (isLoading || !event) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const canManage = can("events.manage");
  const canRecord = can("attendance.record");
  const place = [event.location, event.campus?.name].filter(Boolean).join(", ");
  const present = (attendance.data ?? []).filter((a) => a.status === "present");
  const children = present.filter((a) => a.security_code);
  const awaitingPickup = children.filter((a) => !a.checked_out_at);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/events", label: "Events" }}
        title={<span className={cn(event.is_cancelled && "line-through decoration-2 text-muted")}>{event.title}</span>}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-2">
              <Badge tone={kindTone(event.kind)}>{event.kind_display}</Badge>
              {event.is_cancelled && <Badge tone="red">Cancelled</Badge>}
            </span>
            <span className="flex items-center gap-1.5 tabular">
              <CalendarClock className="h-4 w-4 text-subtle" />
              {fmtDate(event.starts_at, "EEEE d MMMM yyyy, HH:mm")}
              {event.ends_at ? `–${fmtTime(event.ends_at)}` : ""}
            </span>
            {place && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-subtle" />
                {place}
              </span>
            )}
            {event.group_id && (
              <Link href={`/groups/${event.group_id}`} className="flex items-center gap-1.5 hover:text-primary">
                <UsersRound className="h-4 w-4 text-subtle" />
                {event.group_name}
              </Link>
            )}
          </span>
        }
        actions={
          canManage && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                Edit event
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => setRepeating(true)}>
                    <Repeat className="h-4 w-4" />
                    Repeat weekly
                  </MenuItem>
                  {event.is_cancelled ? (
                    <MenuItem onSelect={() => toggleCancel.mutate()}>
                      <RotateCcw className="h-4 w-4" />
                      Reinstate event
                    </MenuItem>
                  ) : (
                    <MenuItem onSelect={() => setCancelling(true)}>
                      <Ban className="h-4 w-4" />
                      Cancel event
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setDeleting(true)}>
                    <Trash2 className="h-4 w-4" />
                    Delete event
                  </MenuItem>
                </MenuContent>
              </Menu>
            </>
          )
        }
      />

      <Card className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border max-sm:[&>*]:border-border max-sm:[&>*:nth-child(-n+2)]:border-b">
        <div className="px-5 py-4">
          <p className="text-[13px] text-muted">Checked in</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular">{fmtNumber(event.present_count)}</p>
          {event.capacity ? <p className="mt-0.5 text-xs text-muted tabular">of {fmtNumber(event.capacity)} capacity</p> : null}
        </div>
        <HeadcountStat event={event} editable={canManage || canRecord} onSaved={invalidate} />
        <div className="px-5 py-4">
          <p className="text-[13px] text-muted">Children</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular">{fmtNumber(children.length)}</p>
          <p className="mt-0.5 text-xs text-muted tabular">
            {awaitingPickup.length ? `${awaitingPickup.length} waiting to be collected` : children.length ? "All collected" : "With pick-up codes"}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[13px] text-muted">Check-in</p>
          <p className="mt-1 text-2xl font-semibold text-text">{event.is_cancelled ? "Closed" : event.check_in_enabled ? "Open" : "Register"}</p>
          <p className="mt-0.5 text-xs text-muted">
            {event.is_cancelled ? "Event cancelled" : event.check_in_enabled ? "Door check-in" : "Present or absent only"}
          </p>
        </div>
      </Card>

      {event.description && (
        <p className="max-w-3xl whitespace-pre-line text-sm text-muted">{event.description}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          {event.is_cancelled ? (
            <Card className="p-8 text-center">
              <Ban className="mx-auto h-8 w-8 text-subtle" />
              <p className="mt-3 text-sm font-medium">This event has been cancelled</p>
              <p className="mt-1 text-sm text-muted">Reinstate it to check people in.</p>
            </Card>
          ) : canRecord ? (
            <CheckInPanel event={event} />
          ) : (
            <Card className="p-8 text-center text-sm text-muted">Your role can see attendance but not record it.</Card>
          )}
        </div>

        {canSeeAttendance && (
          <Card className="self-start xl:sticky xl:top-4">
            <CardHeader
              title={fmtDate(event.starts_at, "yyyy-MM-dd") >= fmtDate(new Date(), "yyyy-MM-dd") ? "Here today" : "Who came"}
              description={attendance.data ? `${present.length} ${present.length === 1 ? "person" : "people"} checked in` : undefined}
            />
            {attendance.error ? (
              <CardBody><ErrorState error={attendance.error} /></CardBody>
            ) : attendance.isLoading ? (
              <CardBody className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </CardBody>
            ) : present.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted">Nobody checked in yet.</p>
              </CardBody>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto border-t border-border">
                {[...present]
                  .sort((a, b) => (b.checked_in_at ?? "").localeCompare(a.checked_in_at ?? "") || a.person_name.localeCompare(b.person_name))
                  .map((a) => (
                    <li key={a.id} className={cn("flex items-center gap-3 px-5 py-2.5", a.checked_out_at && "opacity-60")}>
                      <Avatar name={a.person_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/people/${a.person}`} className="block truncate text-sm font-medium text-text hover:text-primary">
                          {a.person_name}
                        </Link>
                        <p className="text-xs text-muted tabular">
                          {a.checked_out_at
                            ? `Out at ${fmtTime(a.checked_out_at)}`
                            : a.checked_in_at
                              ? `In at ${fmtTime(a.checked_in_at)}`
                              : "Present"}
                          {a.person_age != null && a.person_age < 18 ? `, age ${a.person_age}` : ""}
                        </p>
                      </div>
                      {a.security_code && !a.checked_out_at && <SecurityCode code={a.security_code} />}
                      {a.checked_out_at && <Check className="h-4 w-4 text-subtle" aria-label="Checked out" />}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <EventFormDialog open={editing} onOpenChange={setEditing} event={event} />
      <RepeatDialog open={repeating} onOpenChange={setRepeating} event={event} />
      <Dialog
        open={cancelling}
        onOpenChange={setCancelling}
        size="sm"
        title="Cancel this event?"
        description="It stays in the calendar marked as cancelled, and nobody can be checked in. You can reinstate it later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(false)}>Keep event</Button>
            <Button variant="danger" loading={toggleCancel.isPending} onClick={() => toggleCancel.mutate()}>Cancel event</Button>
          </>
        }
      />
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        size="sm"
        title="Delete this event?"
        description={
          event.present_count
            ? `The attendance of ${event.present_count} ${event.present_count === 1 ? "person" : "people"} is deleted with it. Cancelling keeps the record instead.`
            : "This can't be undone."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>Keep event</Button>
            <Button variant="danger" loading={destroy.isPending} onClick={() => destroy.mutate()}>Delete event</Button>
          </>
        }
      />
    </div>
  );
}

function HeadcountStat({ event, editable, onSaved }: { event: EventItem; editable: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: () => api.patch<EventItem>(`/events/${event.id}/`, { headcount: value === "" ? null : Number(value) }),
    onSuccess: () => {
      toast.success("Headcount saved");
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="px-5 py-4">
      <p className="text-[13px] text-muted">Headcount</p>
      {editing ? (
        <form
          className="mt-1 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field className="flex-1">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label="Headcount"
              autoFocus
              className="h-9 w-24 text-lg font-semibold tabular"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            />
          </Field>
          <Button type="submit" size="sm" loading={save.isPending}>Save</Button>
        </form>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-text tabular">
            {event.headcount != null ? fmtNumber(event.headcount) : <span className="text-subtle">None</span>}
          </p>
          {editable ? (
            <button
              type="button"
              className="mt-0.5 text-xs text-primary hover:underline"
              onClick={() => {
                setValue(event.headcount != null ? String(event.headcount) : "");
                setEditing(true);
              }}
            >
              {event.headcount != null ? "Update headcount" : "Add headcount"}
            </button>
          ) : (
            <p className="mt-0.5 text-xs text-muted">Counted in the room</p>
          )}
        </>
      )}
    </div>
  );
}

function RepeatDialog({ open, onOpenChange, event }: { open: boolean; onOpenChange: (o: boolean) => void; event: EventItem }) {
  const qc = useQueryClient();
  const [weeks, setWeeks] = useState("4");
  const n = Math.max(1, Math.min(52, Number(weeks) || 0));
  const repeat = useMutation({
    mutationFn: () => api.post<EventItem[]>(`/events/${event.id}/duplicate/`, { weeks: n }),
    onSuccess: (created) => {
      toast.success(`${created.length} ${created.length === 1 ? "event" : "events"} added`);
      qc.invalidateQueries({ queryKey: ["events"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const last = new Date(event.starts_at);
  last.setDate(last.getDate() + n * 7);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Repeat weekly"
      description={`Copies "${event.title}" to the same time on the following weeks.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="repeat-form" loading={repeat.isPending}>Add {n} {n === 1 ? "event" : "events"}</Button>
        </>
      }
    >
      <form
        id="repeat-form"
        onSubmit={(e) => {
          e.preventDefault();
          repeat.mutate();
        }}
      >
        <Field label="Number of weeks" htmlFor="repeat-weeks" hint={`The last one will be on ${fmtDate(last, "EEEE d MMMM yyyy")}.`}>
          <Input id="repeat-weeks" type="number" min={1} max={52} inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
