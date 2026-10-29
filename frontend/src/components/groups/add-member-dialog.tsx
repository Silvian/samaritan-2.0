"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { PersonListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ROLES } from "./group-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  existing: string[];
  onAdded: () => void;
};

export function AddMemberDialog(props: Props) {
  return props.open ? <AddMember {...props} /> : null;
}

function AddMember({ open, onOpenChange, groupId, existing, onAdded }: Props) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<PersonListItem | null>(null);
  const [role, setRole] = useState("member");
  const q = useDebounced(search.trim(), 200);

  const people = useQuery({
    queryKey: ["people", { search: q, page_size: 8 }],
    queryFn: ({ signal }) => api.get<Paginated<PersonListItem>>("/people/", { search: q, page_size: 8 }, signal),
    enabled: q.length >= 2,
  });

  const add = useMutation({
    mutationFn: () => api.post("/group-memberships/", { group: groupId, person: picked?.id, role }),
    onSuccess: () => {
      toast.success(`${picked?.full_name} added to group`);
      onAdded();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? (e.fieldError("person") ?? e.message) : e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add member"
      description="Find someone already in the church database."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!picked} loading={add.isPending} onClick={() => add.mutate()}>Add to group</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            aria-label="Search people"
            placeholder="Type a name"
            className="pl-9"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="min-h-40">
          {q.length < 2 ? (
            <p className="py-6 text-center text-sm text-muted">Type at least two letters to search.</p>
          ) : people.isLoading ? (
            <p className="py-6 text-center text-sm text-muted">Searching…</p>
          ) : people.error ? (
            <p className="py-6 text-center text-sm text-red">{(people.error as Error).message}</p>
          ) : !people.data?.results.length ? (
            <p className="py-6 text-center text-sm text-muted">Nobody matches &ldquo;{q}&rdquo;.</p>
          ) : (
            <ul className="-mx-2 space-y-0.5" role="listbox" aria-label="People">
              {people.data.results.map((p) => {
                const already = existing.includes(p.id);
                const selected = picked?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={already}
                      onClick={() => setPicked(p)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left disabled:opacity-60",
                        selected ? "bg-primary-soft" : "hover:bg-surface-2",
                      )}
                    >
                      <Avatar name={p.full_name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{p.full_name}</span>
                        <span className="block truncate text-xs text-muted">
                          {[p.household?.name, p.age != null ? `age ${p.age}` : null].filter(Boolean).join(", ") || p.email}
                        </span>
                      </span>
                      {already ? (
                        <span className="text-xs text-muted">Already a member</span>
                      ) : selected ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <StatusBadge status={p.status} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Field label="Role in the group" htmlFor="am-role">
          <Select id="am-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
