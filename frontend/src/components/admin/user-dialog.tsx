"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PersonPicker, type PickedPerson } from "@/components/person-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import type { Role, User } from "@/lib/types";

/** Invite (no `user`) or edit an existing user. */
export function UserDialog({
  open,
  onOpenChange,
  user,
  isSelf,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user?: User | null;
  isSelf?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Edit ${user.full_name || user.email}` : "Invite a user"}
      description={user ? undefined : "They'll get an email with a link to choose a password. The link is valid for one hour; you can resend it."}
      size="lg"
    >
      {open && <UserForm key={user?.id ?? "new"} user={user} isSelf={isSelf} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function UserForm({ user, isSelf, onDone }: { user?: User | null; isSelf?: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/roles/") });
  const [form, setForm] = useState({
    email: user?.email ?? "",
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    role_id: user?.role?.id ?? "",
  });
  const [person, setPerson] = useState<PickedPerson | null>(
    user?.person ? { id: user.person, full_name: user.person_name ?? "Linked person" } : null,
  );
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { ...form, role_id: form.role_id || null, person: person?.id ?? null };
      if (user && isSelf) delete body.role_id;
      return user ? api.patch<User>(`/users/${user.id}/`, body) : api.post<User>("/users/", body);
    },
    onSuccess: () => {
      toast.success(user ? "User saved" : `Invitation sent to ${form.email}`);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const role = roles.data?.find((r) => r.id === form.role_id);

  return (
    <form id="user-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="u-first" required error={err?.fieldError("first_name")}>
          <Input id="u-first" value={form.first_name} onChange={set("first_name")} required />
        </Field>
        <Field label="Last name" htmlFor="u-last" required error={err?.fieldError("last_name")}>
          <Input id="u-last" value={form.last_name} onChange={set("last_name")} required />
        </Field>
        <Field label="Email" htmlFor="u-email" required error={err?.fieldError("email")} className="sm:col-span-2">
          <Input id="u-email" type="email" value={form.email} onChange={set("email")} required autoComplete="off" />
        </Field>
        <Field
          label="Role"
          htmlFor="u-role"
          error={err?.fieldError("role_id")}
          hint={isSelf ? "You can't change your own role." : role ? role.description || `${role.permissions.length} permissions` : "Without a role they can sign in but see nothing."}
          className="sm:col-span-2"
        >
          <Select id="u-role" value={form.role_id} onChange={set("role_id")} disabled={isSelf}>
            <option value="">No role</option>
            {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field
          label="Linked person"
          hint="Optional. Links this login to their record in the directory, for example so group leaders see their own groups."
          error={err?.fieldError("person")}
          className="sm:col-span-2"
        >
          <PersonPicker value={person} onChange={setPerson} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{user ? "Save user" : "Send invitation"}</Button>
      </div>
    </form>
  );
}
