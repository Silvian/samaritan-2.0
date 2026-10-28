"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LogOut, Search, Ticket, UserCheck, UserX, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { fmtTime } from "@/lib/format";
import type { EventItem, RosterEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

type AttendanceResult = {
  id: number;
  person: string;
  person_name: string;
  status: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  security_code: string;
};

type Recent = { person_id: string; name: string; code: string };

const isIn = (r: RosterEntry) => r.status === "present" && !r.checked_out_at;

export function CheckInPanel({ event }: { event: EventItem }) {
  const qc = useQueryClient();
  const isGroup = !!event.group_id;
  const register = !event.check_in_enabled; // take a register instead of door check-in
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  const [checkingOut, setCheckingOut] = useState<RosterEntry | null>(null);
  const [confirmAbsent, setConfirmAbsent] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(search.trim(), 200);

  // Group events: the roster is the member list (server ignores q, so filter here).
  // Other events: search the whole church by name or household.
  const rosterQ = isGroup ? "" : q;
  const roster = useQuery({
    queryKey: ["roster", event.id, rosterQ],
    queryFn: ({ signal }) => api.get<RosterEntry[]>(`/events/${event.id}/roster/`, { q: rosterQ }, signal),
    enabled: isGroup || q.length >= 2,
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    const list = roster.data ?? [];
    if (!isGroup) return q.length >= 2 ? list : [];
    const needle = q.toLowerCase();
    return needle
      ? list.filter((r) => r.full_name.toLowerCase().includes(needle) || (r.household ?? "").toLowerCase().includes(needle))
      : list;
  }, [roster.data, isGroup, q]);

  const patchRoster = (personId: string, patch: Partial<RosterEntry>) =>
    qc.setQueriesData<RosterEntry[]>({ queryKey: ["roster", event.id] }, (old) =>
      old?.map((r) => (r.person_id === personId ? { ...r, ...patch } : r)),
    );
  const afterChange = () => {
    qc.invalidateQueries({ queryKey: ["roster", event.id] });
    qc.invalidateQueries({ queryKey: ["event-attendance", event.id] });
    qc.invalidateQueries({ queryKey: ["event", event.id] });
    qc.invalidateQueries({ queryKey: ["events"] });
  };
  const withBusy = async <T,>(ids: string[], fn: () => Promise<T>) => {
    setBusy((b) => new Set([...b, ...ids]));
    try {
      return await fn();
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        ids.forEach((i) => n.delete(i));
        return n;
      });
    }
  };

  const checkIn = async (people: RosterEntry[]) => {
    const ids = people.map((p) => p.person_id);
    await withBusy(ids, async () => {
      const done: Recent[] = [];
      for (const p of people) {
        try {
          const a = await api.post<AttendanceResult>(`/events/${event.id}/check-in/`, { person_id: p.person_id });
          patchRoster(p.person_id, { status: "present", checked_in_at: a.checked_in_at, checked_out_at: null, security_code: a.security_code });
          if (a.security_code) done.push({ person_id: p.person_id, name: p.full_name, code: a.security_code });
        } catch (e) {
          toast.error(`${p.full_name}: ${(e as Error).message}`);
        }
      }
      if (done.length) setRecent((r) => [...done, ...r.filter((x) => !done.some((d) => d.person_id === x.person_id))].slice(0, 4));
      const ok = people.length === 1 ? `${people[0].full_name} checked in` : `${people.length} people checked in`;
      toast.success(ok);
      afterChange();
    });
  };

  const checkOut = useMutation({
    mutationFn: ({ entry, code }: { entry: RosterEntry; code?: string }) =>
      api.post<AttendanceResult>(`/events/${event.id}/check-out/`, { person_id: entry.person_id, security_code: code ?? "" }),
    onSuccess: (a, { entry }) => {
      toast.success(`${entry.full_name} checked out`);
      patchRoster(entry.person_id, { checked_out_at: a.checked_out_at });
      setRecent((r) => r.filter((x) => x.person_id !== entry.person_id));
      setCheckingOut(null);
      afterChange();
    },
    onError: (e: Error, { entry }) => {
      if (!(e instanceof ApiError && e.fieldError("security_code"))) toast.error(`${entry.full_name}: ${e.message}`);
    },
  });

  const record = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: "present" | "absent" }) =>
      withBusy(ids, () => api.post<{ updated: number }>(`/events/${event.id}/record-attendance/`, { person_ids: ids, status })),
    onSuccess: (res, { ids, status }) => {
      ids.forEach((id) => patchRoster(id, { status, checked_out_at: null }));
      if (ids.length > 1) toast.success(`${res.updated} marked ${status}`);
      setConfirmAbsent(false);
      afterChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = roster.data ?? [];
  const unmarked = all.filter((r) => !r.status);
  const presentCount = all.filter((r) => r.status === "present").length;

  // Non-group results grouped by household so a family can be checked in together.
  const households = useMemo(() => {
    if (isGroup) return null;
    const map = new Map<string, RosterEntry[]>();
    for (const r of rows) {
      const k = r.household ?? `solo:${r.person_id}`;
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows, isGroup]);

  const renderRow = (r: RosterEntry) => (
    <RosterRow
      key={r.person_id}
      entry={r}
      register={register}
      busy={busy.has(r.person_id) || (checkOut.isPending && checkOut.variables?.entry.person_id === r.person_id)}
      onCheckIn={() => checkIn([r])}
      onCheckOut={() => (r.security_code ? setCheckingOut(r) : checkOut.mutate({ entry: r }))}
      onMark={(status) => record.mutate({ ids: [r.person_id], status })}
    />
  );

  return (
    <Card>
      <CardHeader
        title={register ? "Take the register" : "Check in"}
        description={
          isGroup
            ? `${presentCount} of ${all.length} members present`
            : register
              ? "Find people by name and mark them present."
              : "Search by first name, surname or household."
        }
        action={
          isGroup && all.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="soft"
                disabled={record.isPending || presentCount === all.length}
                onClick={() => record.mutate({ ids: all.map((r) => r.person_id), status: "present" })}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Everyone present
              </Button>
              {unmarked.length > 0 && unmarked.length < all.length ? (
                <Button size="sm" variant="secondary" disabled={record.isPending} onClick={() => record.mutate({ ids: unmarked.map((r) => r.person_id), status: "absent" })}>
                  <UserX className="h-3.5 w-3.5" />
                  Mark the rest absent
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={record.isPending} onClick={() => setConfirmAbsent(true)}>
                  <UserX className="h-3.5 w-3.5" />
                  Everyone absent
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="px-5 pb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
          <Input
            ref={inputRef}
            type="search"
            aria-label={isGroup ? "Filter members" : "Search people to check in"}
            placeholder={isGroup ? "Filter members" : "Start typing a name"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-14 rounded-lg pl-12 pr-12 text-lg [&::-webkit-search-cancel-button]:hidden"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="mx-5 mb-4 rounded-lg border border-gold/40 bg-gold-soft p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-text">
              <Ticket className="h-4 w-4 text-gold" />
              Write the pick-up code on each child&apos;s label
            </p>
            <button type="button" className="rounded-md p-1 text-muted hover:text-text" aria-label="Dismiss pick-up codes" onClick={() => setRecent([])}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-3 grid gap-3 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
            {recent.map((r) => (
              <li key={r.person_id} className="flex items-center justify-between gap-3 rounded-md bg-surface px-4 py-3">
                <span className="min-w-0 truncate text-[15px] font-medium">{r.name}</span>
                <SecurityCode code={r.code} size="lg" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-border">
        {roster.error ? (
          <div className="p-5"><ErrorState error={roster.error} /></div>
        ) : !isGroup && q.length < 2 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <UserCheck className="h-9 w-9 text-subtle" />
            <p className="mt-3 text-[15px] font-medium text-text">Who&apos;s arriving?</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Type at least two letters of a name or household. Families appear together so you can check everyone in at once.
            </p>
          </div>
        ) : roster.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted">
            {isGroup && !q ? "This group has no members yet." : <>Nobody matches &ldquo;{q}&rdquo;. Check the spelling, or try their household name.</>}
          </div>
        ) : households ? (
          <ul className={cn("divide-y divide-border", roster.isFetching && "opacity-80")}>
            {households.map(([key, people]) => {
              const waiting = people.filter((p) => !isIn(p));
              const isHousehold = people.length > 1 && !key.startsWith("solo:");
              return (
                <li key={key}>
                  {isHousehold && (
                    <div className="flex items-center justify-between gap-3 bg-surface-2/60 px-5 py-2">
                      <span className="text-[13px] font-medium text-muted">{key}</span>
                      {!register && waiting.length > 1 && (
                        <Button size="sm" variant="soft" disabled={waiting.some((p) => busy.has(p.person_id))} onClick={() => checkIn(waiting)}>
                          <UserCheck className="h-3.5 w-3.5" />
                          Check in all {waiting.length}
                        </Button>
                      )}
                    </div>
                  )}
                  <ul className="divide-y divide-border">{people.map(renderRow)}</ul>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className={cn("divide-y divide-border", roster.isFetching && "opacity-80")}>{rows.map(renderRow)}</ul>
        )}
      </div>

      <CheckOutDialog
        entry={checkingOut}
        pending={checkOut.isPending}
        error={checkOut.error instanceof ApiError ? checkOut.error.fieldError("security_code") : undefined}
        onClose={() => {
          setCheckingOut(null);
          checkOut.reset();
        }}
        onSubmit={(code) => checkingOut && checkOut.mutate({ entry: checkingOut, code })}
      />

      <Dialog
        open={confirmAbsent}
        onOpenChange={setConfirmAbsent}
        size="sm"
        title="Mark everyone absent?"
        description="This replaces any check-ins already recorded for this meeting."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAbsent(false)}>Cancel</Button>
            <Button variant="danger" loading={record.isPending} onClick={() => record.mutate({ ids: all.map((r) => r.person_id), status: "absent" })}>
              Mark everyone absent
            </Button>
          </>
        }
      />
    </Card>
  );
}

export function SecurityCode({ code, size = "md" }: { code: string; size?: "md" | "lg" }) {
  return (
    <span
      aria-label={`Pick-up code ${code.split("").join(" ")}`}
      className={cn(
        "inline-flex items-center rounded-md border border-gold/50 bg-surface font-mono font-bold tracking-[0.2em] text-text tabular",
        size === "lg" ? "px-3 py-1 text-2xl" : "px-2 py-0.5 text-[15px]",
      )}
    >
      {code}
    </span>
  );
}

function RosterRow({
  entry: r,
  register,
  busy,
  onCheckIn,
  onCheckOut,
  onMark,
}: {
  entry: RosterEntry;
  register: boolean;
  busy: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onMark: (status: "present" | "absent") => void;
}) {
  const here = isIn(r);
  const left = r.status === "present" && !!r.checked_out_at;
  const meta = [r.household, r.age != null ? `age ${r.age}` : null].filter(Boolean).join(", ");

  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3", here && "bg-green-soft/40")}>
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <span className="relative">
          <Avatar name={r.full_name} size="lg" />
          {here && <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-surface text-green" />}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-medium text-text">{r.full_name}</span>
            {r.is_child && <Badge tone="blue">Child</Badge>}
          </p>
          <p className="truncate text-[13px] text-muted">
            {here ? (
              <span className="text-green">Checked in at {fmtTime(r.checked_in_at)}</span>
            ) : left ? (
              <>Checked out at {fmtTime(r.checked_out_at)}</>
            ) : r.status === "absent" ? (
              <>Marked absent</>
            ) : r.status === "excused" ? (
              <>Excused</>
            ) : (
              meta || "Not checked in"
            )}
            {(here || left || r.status) && meta ? <span className="text-subtle">, {meta}</span> : null}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-end">
        {here && r.security_code && <SecurityCode code={r.security_code} size="lg" />}
        {register ? (
          <>
            <Button size="lg" variant={r.status === "present" ? "soft" : "secondary"} className="min-w-28 justify-center" disabled={busy || r.status === "present"} onClick={() => onMark("present")}>
              Present
            </Button>
            <Button size="lg" variant={r.status === "absent" ? "soft" : "ghost"} className="justify-center" disabled={busy || r.status === "absent"} onClick={() => onMark("absent")}>
              Absent
            </Button>
          </>
        ) : here ? (
          <Button size="lg" variant="secondary" className="min-w-32 justify-center" loading={busy} onClick={onCheckOut}>
            {!busy && <LogOut className="h-4 w-4" />}
            Check out
          </Button>
        ) : (
          <Button size="lg" className="min-w-32 justify-center" loading={busy} onClick={onCheckIn}>
            {left ? "Check in again" : "Check in"}
          </Button>
        )}
      </div>
    </li>
  );
}

function CheckOutDialog({
  entry,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  entry: RosterEntry | null;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  return entry ? <CheckOutForm entry={entry} pending={pending} error={error} onClose={onClose} onSubmit={onSubmit} /> : null;
}

function CheckOutForm({
  entry,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  entry: RosterEntry;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={`Check out ${entry.full_name}`}
      description="Ask the adult collecting this child for the code on their pick-up label."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="checkout-form" loading={pending} disabled={code.length < 4}>Check out</Button>
        </>
      }
    >
      <form
        id="checkout-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length >= 4) onSubmit(code);
        }}
      >
        <Field label="Pick-up code" error={error} htmlFor="checkout-code">
          <Input
            id="checkout-code"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            aria-invalid={!!error}
            className="h-16 text-center font-mono text-3xl font-bold uppercase tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          />
        </Field>
      </form>
    </Dialog>
  );
}
