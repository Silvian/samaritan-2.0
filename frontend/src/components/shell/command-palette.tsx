"use client";

import * as D from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced } from "@/lib/hooks";
import { NAV } from "@/lib/nav";
import type { PersonListItem } from "@/lib/types";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const term = useDebounced(q, 200);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const canPeople = can("people.view", "groups.lead");
  const { data, isFetching } = useQuery({
    queryKey: ["palette-people", term],
    queryFn: () => api.get<Paginated<PersonListItem>>("/people/", { search: term, page_size: 8 }),
    enabled: open && canPeople && term.length >= 2,
  });

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  const pages = NAV.flatMap((s) => s.items).filter((i) => !i.perms || can(...i.perms));

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#1d1a29]/40" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search people or jump to a page</D.Description>
          <Command shouldFilter={false} label="Search">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 text-muted" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder={canPeople ? "Search people or jump to a page" : "Jump to a page"}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-subtle"
              />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              {term.length >= 2 && canPeople && (
                <Command.Group heading="People" className="text-xs text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                  {isFetching && !data && <div className="px-2 py-2 text-sm text-muted">Searching…</div>}
                  {data?.results.length === 0 && <div className="px-2 py-2 text-sm text-muted">No one matches “{term}”.</div>}
                  {data?.results.map((p) => (
                    <Command.Item key={p.id} value={p.id} onSelect={() => go(`/people/${p.id}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-2">
                      <Avatar name={p.full_name} size="sm" />
                      <span className="flex-1">{p.full_name}</span>
                      <span className="text-xs text-muted">{p.household?.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Go to" className="text-xs text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {pages
                  .filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()))
                  .map((p) => (
                    <Command.Item key={p.href} value={p.href} onSelect={() => go(p.href)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-2">
                      <p.icon className="h-4 w-4 text-muted" />
                      {p.label}
                    </Command.Item>
                  ))}
                <Command.Item value="/account" onSelect={() => go("/account")}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-text data-[selected=true]:bg-surface-2">
                  <User className="h-4 w-4 text-muted" />
                  Your account
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
