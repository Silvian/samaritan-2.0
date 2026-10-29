"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { PermissionGroup, Role } from "@/lib/types";

export function RoleDialog({ open, onOpenChange, role }: { open: boolean; onOpenChange: (o: boolean) => void; role?: Role | null }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={role ? `Edit ${role.name}` : "New role"}
      description="Choose what people with this role can see and do. Changes apply the next time they load a page."
      size="lg"
    >
      {open && <RoleForm key={role?.id ?? "new"} role={role} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function RoleForm({ role, onDone }: { role?: Role | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { me } = useAuth();
  const catalogue = useQuery({ queryKey: ["roles", "catalogue"], queryFn: () => api.get<PermissionGroup[]>("/roles/catalogue/"), staleTime: Infinity });
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));

  const held = (code: string) => !!me && (me.is_superuser || me.permissions.includes(code));

  const toggle = (code: string, on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      if (on) n.add(code);
      else n.delete(code);
      return n;
    });

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description, permissions: [...perms] };
      return role ? api.patch<Role>(`/roles/${role.id}/`, body) : api.post<Role>("/roles/", body);
    },
    onSuccess: () => {
      toast.success(role ? "Role saved" : "Role created");
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const total = catalogue.data?.reduce((n, g) => n + g.permissions.length, 0) ?? 0;

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="r-name" required error={err?.fieldError("name")}>
          <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description" htmlFor="r-desc" error={err?.fieldError("description")} className="sm:col-span-2">
          <Textarea id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" placeholder="Who this role is for" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Permissions</h3>
          <span className="text-xs text-muted tabular">{perms.size} of {total} selected</span>
        </div>
        {err?.fieldError("permissions") && <p className="mb-2 text-xs text-red" role="alert">{err.fieldError("permissions")}</p>}
        {!catalogue.data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-3">
            {catalogue.data.map((g) => {
              const codes = g.permissions.map((p) => p.code);
              const grantable = codes.filter(held);
              const all = codes.every((c) => perms.has(c));
              return (
                <fieldset key={g.group} className="rounded-lg border border-border">
                  <legend className="sr-only">{g.group}</legend>
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-3 py-2 rounded-t-lg">
                    <span className="text-[13px] font-medium">{g.group}</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                      disabled={grantable.length === 0}
                      onClick={() => setPerms((s) => {
                        const n = new Set(s);
                        if (all) codes.forEach((c) => n.delete(c));
                        else grantable.forEach((c) => n.add(c));
                        return n;
                      })}
                    >
                      {all ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="grid gap-x-4 gap-y-2 p-3 sm:grid-cols-2">
                    {g.permissions.map((p) => {
                      const can = held(p.code);
                      return (
                        <label key={p.code} className={`flex items-start gap-2.5 text-sm ${can ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`} title={can ? p.code : "You can't grant a permission you don't hold yourself"}>
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded accent-[var(--primary)]"
                            checked={perms.has(p.code)}
                            disabled={!can && !perms.has(p.code)}
                            onChange={(e) => toggle(p.code, e.target.checked)}
                          />
                          <span>{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{role ? "Save role" : "Create role"}</Button>
      </div>
    </form>
  );
}
