"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { api, type Paginated } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import type { PersonListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PickedPerson = { id: string; full_name: string };

/**
 * Search-as-you-type person picker backed by GET /people/?search=.
 * Shows the chosen person as a chip with a clear button.
 */
export function PersonPicker({
  value,
  onChange,
  placeholder = "Search by name or email",
  disabled,
  id,
  invalid,
  exclude = [],
}: {
  value: PickedPerson | null;
  onChange: (p: PickedPerson | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  exclude?: string[];
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useDebounced(q.trim(), 200);
  const wrap = useRef<HTMLDivElement>(null);

  const { data, isFetching, error } = useQuery({
    queryKey: ["people", "picker", search],
    queryFn: ({ signal }) => api.get<Paginated<PersonListItem>>("/people/", { search, page_size: 8 }, signal),
    enabled: open && search.length > 0,
    staleTime: 30_000,
  });
  const results = (data?.results ?? []).filter((p) => !exclude.includes(p.id));

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (p: PersonListItem) => {
    onChange({ id: p.id, full_name: p.full_name });
    setQ("");
    setOpen(false);
  };

  if (value) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface px-2">
        <Avatar name={value.full_name} size="sm" className="h-6 w-6 text-[10px]" />
        <span className="flex-1 truncate text-sm">{value.full_name}</span>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label={`Remove ${value.full_name}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open && search.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "h-9 w-full rounded-md border border-border-strong bg-surface pl-8 pr-3 text-sm text-text placeholder:text-subtle",
          "focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary disabled:opacity-60 aria-[invalid=true]:border-red",
        )}
      />
      {open && search.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg">
          {error ? (
            <li className="px-2.5 py-2 text-sm text-red">Couldn&apos;t search people. Your role may not include the directory.</li>
          ) : isFetching && !data ? (
            <li className="px-2.5 py-2 text-sm text-muted">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-muted">No one matches &ldquo;{search}&rdquo;.</li>
          ) : (
            results.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 text-sm", i === active && "bg-surface-2")}
              >
                <Avatar name={p.full_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{p.full_name}</span>
                  <span className="block truncate text-xs text-muted">{[p.email, p.household?.name].filter(Boolean).join(", ") || p.status_display}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
