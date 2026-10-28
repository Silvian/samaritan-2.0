"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Badge, tagTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ListField = {
  name: string;
  label: string;
  type?: "text" | "color" | "checkbox";
  placeholder?: string;
  required?: boolean;
  /** Grid column width class on desktop. */
  width?: string;
};

type Item = { id: string; name: string } & Record<string, unknown>;

export const COLOURS = [
  { value: "slate", label: "Grey" },
  { value: "indigo", label: "Violet" },
  { value: "emerald", label: "Green" },
  { value: "amber", label: "Gold" },
  { value: "rose", label: "Red" },
  { value: "sky", label: "Blue" },
];

const TONE_LABEL: Record<string, string> = { green: "Green", violet: "Violet", gold: "Gold", red: "Red", blue: "Blue", neutral: "Grey" };
const colourLabel = (v: string) => COLOURS.find((c) => c.value === v)?.label ?? TONE_LABEL[tagTone(v)] ?? v;

function emptyValues(fields: ListField[]) {
  return Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? true : f.type === "color" ? COLOURS[0].value : ""]));
}

function FieldInput({ field, value, onChange, autoFocus }: { field: ListField; value: unknown; onChange: (v: unknown) => void; autoFocus?: boolean }) {
  if (field.type === "checkbox")
    return <Checkbox label={field.label} checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-9 items-center" />;
  if (field.type === "color")
    return (
      <Select aria-label={field.label} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {!COLOURS.some((c) => c.value === value) && value ? <option value={String(value)}>{colourLabel(String(value))}</option> : null}
        {COLOURS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
    );
  return (
    <Input
      aria-label={field.label}
      placeholder={field.placeholder ?? field.label}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
      autoFocus={autoFocus}
    />
  );
}

/** Inline add / edit / delete editor for small unpaginated lists (tags, campuses ...). */
export function ListEditor({
  title,
  description,
  path,
  queryKey,
  fields,
  noun,
  count,
}: {
  title: string;
  description: string;
  path: string;
  queryKey: string;
  fields: ListField[];
  noun: string;
  count?: (item: Item) => string | null;
}) {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: [queryKey], queryFn: () => api.get<Item[]>(path) });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => emptyValues(fields));
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, unknown>>({});
  const [deleting, setDeleting] = useState<Item | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });
  const onError = (e: Error) => toast.error(e instanceof ApiError && e.errors ? Object.values(e.errors).flat().join(" ") || e.message : e.message);
  const cap = noun.charAt(0).toUpperCase() + noun.slice(1);

  const create = useMutation({
    mutationFn: () => api.post(path, draft),
    onSuccess: () => { toast.success(`${cap} added`); invalidate(); setDraft(emptyValues(fields)); setAdding(false); },
    onError,
  });
  const update = useMutation({
    mutationFn: () => api.patch(`${path}${editId}/`, edit),
    onSuccess: () => { toast.success(`${cap} saved`); invalidate(); setEditId(null); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (item: Item) => api.delete(`${path}${item.id}/`),
    onSuccess: () => { toast.success(`${cap} deleted`); invalidate(); setDeleting(null); },
    onError: (e: Error) => { onError(e); setDeleting(null); },
  });

  const grid = "grid gap-2 sm:items-center sm:grid-cols-[var(--cols)]";
  const cols = { "--cols": `${fields.map((f) => f.width ?? "1fr").join(" ")} auto` } as React.CSSProperties;

  const display = (f: ListField, item: Item) => {
    const v = item[f.name];
    if (f.type === "color") return <Badge tone={tagTone(String(v))}>{colourLabel(String(v))}</Badge>;
    if (f.type === "checkbox") return v ? <Badge tone="green">{f.label}</Badge> : <Badge>Not {f.label.toLowerCase()}</Badge>;
    if (f.name === "name")
      return (
        <span className="min-w-0">
          <span className="block truncate font-medium text-text">{String(v)}</span>
          {count?.(item) && <span className="block text-xs text-muted">{count(item)}</span>}
        </span>
      );
    return <span className={cn("block truncate text-sm", v ? "text-text" : "text-subtle")}>{String(v || "None")}</span>;
  };

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={!adding && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add {noun}</Button>}
      />
      {error ? (
        <div className="px-5 pb-5"><ErrorState error={error} /></div>
      ) : !data ? (
        <TableSkeleton rows={3} />
      ) : (
        <ul className="border-t border-border">
          {adding && (
            <li className="border-b border-border bg-surface-2 px-5 py-3">
              <form className={grid} style={cols} onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
                {fields.map((f, i) => (
                  <FieldInput key={f.name} field={f} value={draft[f.name]} onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))} autoFocus={i === 0} />
                ))}
                <div className="flex gap-1.5">
                  <Button type="submit" size="sm" loading={create.isPending}>Add {noun}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(emptyValues(fields)); }}>Cancel</Button>
                </div>
              </form>
            </li>
          )}
          {data.length === 0 && !adding && (
            <li><EmptyState title={`No ${noun}s yet`} action={<Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add {noun}</Button>} className="py-10" /></li>
          )}
          {data.map((item) =>
            editId === item.id ? (
              <li key={item.id} className="border-b border-border bg-surface-2 px-5 py-3 last:border-0">
                <form className={grid} style={cols} onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
                  {fields.map((f, i) => (
                    <FieldInput key={f.name} field={f} value={edit[f.name]} onChange={(v) => setEdit((d) => ({ ...d, [f.name]: v }))} autoFocus={i === 0} />
                  ))}
                  <div className="flex gap-1.5">
                    <Button type="submit" size="icon" className="h-8 w-8" loading={update.isPending} aria-label={`Save ${noun}`}>{!update.isPending && <Check className="h-4 w-4" />}</Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditId(null)} aria-label="Cancel"><X className="h-4 w-4" /></Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={item.id} className="group border-b border-border px-5 py-2.5 last:border-0">
                <div className={grid} style={cols}>
                  {fields.map((f) => <div key={f.name} className="min-w-0">{display(f, item)}</div>)}
                  <div className="flex gap-1 sm:opacity-60 sm:group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => { setEditId(item.id); setEdit(Object.fromEntries(fields.map((f) => [f.name, item[f.name]]))); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red" aria-label={`Delete ${item.name}`} onClick={() => setDeleting(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${noun}`}
        description={deleting ? `Delete "${deleting.name}"? ${count?.(deleting) ? `It's currently used: ${count(deleting)}. ` : ""}This can't be undone.` : undefined}
        confirmLabel={`Delete ${noun}`}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}
