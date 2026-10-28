"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, Mail, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { RoleDialog } from "@/components/admin/role-dialog";
import { UserDialog } from "@/components/admin/user-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, Skeleton, TableSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtNumber, fromNow } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { PermissionGroup, Role, User } from "@/lib/types";

type Confirm = { kind: "deactivate" | "reactivate" | "reset-mfa" | "revoke"; user: User };

const CONFIRM_COPY: Record<Confirm["kind"], { title: string; body: (u: User) => string; label: string; done: string; danger: boolean }> = {
  deactivate: {
    title: "Deactivate user",
    body: (u) => `${u.full_name || u.email} will be signed out straight away and won't be able to sign in. Their history stays in the audit log, and you can reactivate them later.`,
    label: "Deactivate user",
    done: "User deactivated",
    danger: true,
  },
  reactivate: {
    title: "Reactivate user",
    body: (u) => `${u.full_name || u.email} will be able to sign in again with their existing password and role.`,
    label: "Reactivate user",
    done: "User reactivated",
    danger: false,
  },
  "reset-mfa": {
    title: "Reset two-factor authentication",
    body: (u) => `Use this if ${u.first_name || "they"} lost their phone. Their authenticator and recovery codes stop working, they're signed out everywhere, and they'll need to set up two-factor again.`,
    label: "Reset two-factor",
    done: "Two-factor reset",
    danger: true,
  },
  revoke: {
    title: "Sign out everywhere",
    body: (u) => `${u.full_name || u.email} will be signed out on every device and will need to sign in again.`,
    label: "Sign out everywhere",
    done: "User signed out everywhere",
    danger: true,
  },
};

function UsersTab() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [active, setActive] = useState("true");
  const search = useDebounced(q.trim(), 250);
  const [editing, setEditing] = useState<User | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const { data, error } = useQuery({
    queryKey: ["users", { page, search, active }],
    queryFn: () => api.get<Paginated<User>>("/users/", { page, search, is_active: active, ordering: "email" }),
    placeholderData: keepPreviousData,
  });

  const act = useMutation({
    mutationFn: ({ kind, user }: Confirm) => {
      if (kind === "deactivate") return api.patch(`/users/${user.id}/`, { is_active: false });
      if (kind === "reactivate") return api.patch(`/users/${user.id}/`, { is_active: true });
      if (kind === "reset-mfa") return api.post(`/users/${user.id}/reset-mfa/`);
      return api.post(`/users/${user.id}/revoke-sessions/`);
    },
    onSuccess: (_d, c) => {
      toast.success(CONFIRM_COPY[c.kind].done);
      qc.invalidateQueries({ queryKey: ["users"] });
      setConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invite = useMutation({
    mutationFn: (u: User) => api.post<{ detail: string }>(`/users/${u.id}/send-invite/`),
    onSuccess: (r) => toast.success(r.detail || "Invitation sent"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or email" className="pl-8" aria-label="Search users" />
          </div>
          <Select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} className="w-40" aria-label="Filter by status">
            <option value="true">Active users</option>
            <option value="false">Deactivated</option>
            <option value="">Everyone</option>
          </Select>
        </div>
        <Button onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4" /> Invite user</Button>
      </div>

      <Card>
        {error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : !data ? (
          <TableSkeleton />
        ) : data.results.length === 0 ? (
          <EmptyState title={search ? "No users match that search" : "No users here"} description="Invite staff and volunteers who need to use Samaritan." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Role</TH>
                  <TH>Two-factor</TH>
                  <TH>Last sign-in</TH>
                  <TH>Status</TH>
                  <TH aria-label="Actions" />
                </tr>
              </THead>
              <tbody>
                {data.results.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <TR key={u.id}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name || u.email} size="sm" />
                          <div className="min-w-0">
                            <button type="button" onClick={() => setEditing(u)} className="block truncate text-left font-medium text-text hover:text-primary">
                              {u.full_name || u.email}
                              {self && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                            </button>
                            <span className="block truncate text-xs text-muted">{u.email}</span>
                          </div>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap">
                        {u.is_superuser ? <Badge tone="violet">Superuser</Badge> : u.role ? u.role.name : <span className="text-muted">No role</span>}
                      </TD>
                      <TD>{u.mfa_enabled ? <Badge tone="green"><ShieldCheck className="h-3 w-3" /> On</Badge> : <Badge tone="gold">Not set up</Badge>}</TD>
                      <TD className="whitespace-nowrap text-muted">{u.last_login ? fromNow(u.last_login) : <span className="text-subtle">Never</span>}</TD>
                      <TD>
                        {!u.is_active ? <Badge>Deactivated</Badge> : !u.last_login ? <Badge tone="blue">Invited</Badge> : <Badge tone="green">Active</Badge>}
                      </TD>
                      <TD className="text-right">
                        <Menu>
                          <MenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${u.full_name || u.email}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem onSelect={() => setEditing(u)}><Pencil className="h-4 w-4" /> Edit user</MenuItem>
                            {u.is_active && !u.last_login && <MenuItem onSelect={() => invite.mutate(u)}><Mail className="h-4 w-4" /> Resend invitation</MenuItem>}
                            {u.mfa_enabled && !self && <MenuItem onSelect={() => setConfirm({ kind: "reset-mfa", user: u })}><KeyRound className="h-4 w-4" /> Reset two-factor</MenuItem>}
                            {!self && u.is_active && <MenuItem onSelect={() => setConfirm({ kind: "revoke", user: u })}><LogOut className="h-4 w-4" /> Sign out everywhere</MenuItem>}
                            {!self && (
                              <>
                                <MenuSeparator />
                                {u.is_active ? (
                                  <MenuItem danger onSelect={() => setConfirm({ kind: "deactivate", user: u })}><UserX className="h-4 w-4" /> Deactivate user</MenuItem>
                                ) : (
                                  <MenuItem onSelect={() => setConfirm({ kind: "reactivate", user: u })}><UserCheck className="h-4 w-4" /> Reactivate user</MenuItem>
                                )}
                              </>
                            )}
                          </MenuContent>
                        </Menu>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
          </>
        )}
      </Card>

      <UserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <UserDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} user={editing} isSelf={editing?.id === me?.id} />
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={CONFIRM_COPY[confirm.kind].title}
          description={CONFIRM_COPY[confirm.kind].body(confirm.user)}
          confirmLabel={CONFIRM_COPY[confirm.kind].label}
          danger={CONFIRM_COPY[confirm.kind].danger}
          loading={act.isPending}
          onConfirm={() => act.mutate(confirm)}
        />
      )}
    </div>
  );
}

function RolesTab() {
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/roles/") });
  const catalogue = useQuery({ queryKey: ["roles", "catalogue"], queryFn: () => api.get<PermissionGroup[]>("/roles/catalogue/"), staleTime: Infinity });
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const total = catalogue.data?.reduce((n, g) => n + g.permissions.length, 0);

  const del = useMutation({
    mutationFn: (r: Role) => api.delete(`/roles/${r.id}/`),
    onSuccess: () => {
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["roles"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (roles.error) return <ErrorState error={roles.error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted max-w-2xl">Roles bundle permissions. Give each person the least access they need for their ministry.</p>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New role</Button>
      </div>
      {!roles.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roles.data.map((r) => {
            const blocked = r.is_system ? "Built-in roles can't be deleted, but you can change their permissions." : r.user_count > 0 ? "Move this role's users to another role before deleting it." : null;
            const share = total ? Math.round((r.permissions.length / total) * 100) : 0;
            return (
              <Card key={r.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold">{r.name}</h3>
                  {r.is_system && <Badge>Built-in</Badge>}
                </div>
                <p className="mt-1 flex-1 text-[13px] text-muted">{r.description || "No description."}</p>
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted tabular">
                    <span>{fmtNumber(r.user_count)} {r.user_count === 1 ? "user" : "users"}</span>
                    <span>{r.permissions.length}{total ? ` of ${total}` : ""} permissions</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${share}%` }} /></div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /> Edit role</Button>
                  <span title={blocked ?? undefined}>
                    <Button variant="ghost" size="sm" disabled={!!blocked} onClick={() => setDeleting(r)} className="text-red hover:text-red">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </span>
                </div>
                {blocked && <p className="mt-2 text-xs text-subtle">{blocked}</p>}
              </Card>
            );
          })}
        </div>
      )}
      <RoleDialog open={creating} onOpenChange={setCreating} />
      <RoleDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} role={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete role"
        description={deleting ? `Delete the ${deleting.name} role? This can't be undone.` : undefined}
        confirmLabel="Delete role"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </div>
  );
}

export default function UsersPage() {
  const [tab, setTab] = useState("users");
  return (
    <div>
      <PageHeader title="Users & roles" description="Who can sign in to Samaritan, and what each role is allowed to see and do." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList items={[{ value: "users", label: "Users" }, { value: "roles", label: "Roles" }]} className="mb-5" />
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
