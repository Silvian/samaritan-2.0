"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, MoreHorizontal, Pencil, Trash2, UserMinus, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EventFormDialog } from "@/components/events/event-form-dialog";
import { AddMemberDialog } from "@/components/groups/add-member-dialog";
import { GroupFormDialog } from "@/components/groups/group-form-dialog";
import { meetingSummary, roleInfo, roleRank, ROLES } from "@/components/groups/group-utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, tagTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { DefinitionList, PageHeader, Stat } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { EventItem, Group, GroupMembership } from "@/lib/types";

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<GroupMembership | null>(null);

  const { data: group, error, isLoading } = useQuery({
    queryKey: ["group", id],
    queryFn: () => api.get<Group>(`/groups/${id}/`),
  });
  const members = useQuery({
    queryKey: ["group-memberships", id],
    queryFn: () => api.get<GroupMembership[]>("/group-memberships/", { group: id }),
  });
  const events = useQuery({
    queryKey: ["events", { group: id }],
    queryFn: () => api.get<Paginated<EventItem>>("/events/", { group: id, ordering: "-starts_at", page_size: 10 }),
    enabled: can("events.view", "events.manage", "groups.lead"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["group-memberships", id] });
    qc.invalidateQueries({ queryKey: ["group", id] });
    qc.invalidateQueries({ queryKey: ["groups"] });
  };

  const changeRole = useMutation({
    mutationFn: ({ m, role }: { m: GroupMembership; role: string }) => api.patch(`/group-memberships/${m.id}/`, { role }),
    onSuccess: () => {
      toast.success("Role changed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (m: GroupMembership) => api.delete(`/group-memberships/${m.id}/`),
    onSuccess: () => {
      toast.success("Removed from group");
      setRemoving(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleActive = useMutation({
    mutationFn: () => api.patch<Group>(`/groups/${id}/`, { is_active: !group?.is_active }),
    onSuccess: (g) => {
      toast.success(g.is_active ? "Group reactivated" : "Group deactivated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const destroy = useMutation({
    mutationFn: () => api.delete(`/groups/${id}/`),
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: ["groups"] });
      router.push("/groups");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;
  if (isLoading || !group) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const canManage = can("groups.manage");
  const canEdit = canManage || group.is_leader;
  const sorted = [...(members.data ?? [])].sort(
    (a, b) => roleRank(a.role) - roleRank(b.role) || a.person_name.localeCompare(b.person_name),
  );
  const guests = sorted.filter((m) => m.role === "guest").length;
  const now = new Date().toISOString();
  const lastMet = events.data?.results.find((e) => e.starts_at <= now && !e.is_cancelled && e.present_count > 0);
  const place = [group.location, group.campus?.name].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/groups", label: "Groups" }}
        title={group.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {group.group_type && <Badge tone={tagTone(group.group_type.color)}>{group.group_type.name}</Badge>}
            {!group.is_active && <Badge>Inactive</Badge>}
            {group.is_children && <Badge tone="red">Children</Badge>}
            <span>{meetingSummary(group)}</span>
          </span>
        }
        actions={
          <>
            {canEdit && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                Edit group
              </Button>
            )}
            {(canManage || can("events.manage")) && (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {can("events.manage") && (
                    <MenuItem onSelect={() => setPlanning(true)}>
                      <CalendarPlus className="h-4 w-4" />
                      Plan a meeting
                    </MenuItem>
                  )}
                  {canManage && (
                    <>
                      {can("events.manage") && <MenuSeparator />}
                      <MenuItem onSelect={() => toggleActive.mutate()}>
                        <UsersRound className="h-4 w-4" />
                        {group.is_active ? "Deactivate group" : "Reactivate group"}
                      </MenuItem>
                      <MenuItem danger onSelect={() => setDeleting(true)}>
                        <Trash2 className="h-4 w-4" />
                        Delete group
                      </MenuItem>
                    </>
                  )}
                </MenuContent>
              </Menu>
            )}
          </>
        }
      />

      <Card className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border max-sm:[&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-border">
        <Stat
          label="Members"
          value={fmtNumber(group.member_count)}
          sub={group.capacity ? `of ${group.capacity} places` : "No limit"}
          tone={group.capacity && group.member_count >= group.capacity ? "down" : undefined}
        />
        <Stat label="Leaders" value={fmtNumber(group.leaders.length)} sub={group.leaders.length ? group.leaders.map((l) => l.full_name.split(" ")[0]).join(", ") : "None yet"} />
        <Stat
          label="Meetings"
          value={events.data ? fmtNumber(events.data.count) : "None"}
          sub={lastMet ? `${lastMet.present_count} present on ${fmtDate(lastMet.starts_at, "d MMM")}` : guests ? `${guests} ${guests === 1 ? "guest" : "guests"} in the group` : "No attendance yet"}
        />
        <Stat label="New members" value={group.is_open ? "Open" : "Closed"} sub={group.is_open ? "Anyone can join" : "Not taking new members"} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Members"
              description={members.data ? `${sorted.length} ${sorted.length === 1 ? "person" : "people"}` : undefined}
              action={
                canEdit && (
                  <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
                    <UserPlus className="h-3.5 w-3.5" />
                    Add member
                  </Button>
                )
              }
            />
            {members.error ? (
              <CardBody><ErrorState error={members.error} /></CardBody>
            ) : members.isLoading ? (
              <TableSkeleton rows={5} />
            ) : sorted.length === 0 ? (
              <EmptyState
                icon={UsersRound}
                title="No members yet"
                description="Add the people who belong to this group, starting with its leader."
                action={canEdit ? <Button size="sm" onClick={() => setAdding(true)}><UserPlus className="h-3.5 w-3.5" />Add member</Button> : undefined}
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Name</TH>
                    <TH>Role</TH>
                    <TH className="hidden md:table-cell">Contact</TH>
                    <TH className="hidden sm:table-cell">Joined</TH>
                    {canEdit && <TH className="w-10" aria-label="Actions" />}
                  </tr>
                </THead>
                <tbody>
                  {sorted.map((m) => {
                    const r = roleInfo(m.role);
                    return (
                      <TR key={m.id}>
                        <TD>
                          <div className="flex items-center gap-3">
                            <Avatar name={m.person_name} size="sm" />
                            <Link href={`/people/${m.person}`} className="whitespace-nowrap font-medium text-text hover:text-primary">
                              {m.person_name}
                            </Link>
                          </div>
                        </TD>
                        <TD>
                          {canEdit ? (
                            <Select
                              aria-label={`Role for ${m.person_name}`}
                              className="h-8 w-32 text-[13px]"
                              value={m.role}
                              disabled={changeRole.isPending}
                              onChange={(e) => changeRole.mutate({ m, role: e.target.value })}
                            >
                              {ROLES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                            </Select>
                          ) : (
                            <Badge tone={r.tone}>{r.label}</Badge>
                          )}
                        </TD>
                        <TD className="hidden md:table-cell text-muted">
                          <div className="max-w-56 truncate">{m.person_email || m.person_phone || <span className="text-subtle">None</span>}</div>
                          {m.person_email && m.person_phone && <div className="text-xs tabular">{m.person_phone}</div>}
                        </TD>
                        <TD className="hidden sm:table-cell text-muted tabular whitespace-nowrap">{fmtDate(m.joined_on) || <span className="text-subtle">Not recorded</span>}</TD>
                        {canEdit && (
                          <TD>
                            <Button variant="ghost" size="icon" aria-label={`Remove ${m.person_name}`} onClick={() => setRemoving(m)}>
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </TD>
                        )}
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="About this group" />
            <CardBody className="space-y-4">
              {group.description && <p className="text-sm text-text whitespace-pre-line">{group.description}</p>}
              <DefinitionList
                items={[
                  { label: "Meets", value: meetingSummary(group) },
                  { label: "Where", value: place },
                  { label: "Leaders", value: group.leaders.map((l) => l.full_name).join(", ") },
                  { label: "Capacity", value: group.capacity ? `${group.capacity} people` : "No limit" },
                ]}
              />
            </CardBody>
          </Card>

          {events.data && (
            <Card>
              <CardHeader
                title="Meetings and events"
                action={
                  can("events.manage") && (
                    <Button size="sm" variant="ghost" onClick={() => setPlanning(true)}>
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Plan
                    </Button>
                  )
                }
              />
              <CardBody className="-mt-1">
                {events.data.results.length === 0 ? (
                  <p className="text-sm text-muted">No meetings recorded for this group yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {events.data.results.map((e) => (
                      <li key={e.id}>
                        <Link href={`/events/${e.id}`} className="group flex items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-primary-soft text-primary">
                            <span className="text-[10px] leading-none">{fmtDate(e.starts_at, "MMM")}</span>
                            <span className="text-base font-semibold leading-tight tabular">{fmtDate(e.starts_at, "d")}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium group-hover:text-primary">{e.title}</span>
                            <span className="block text-xs text-muted">
                              {fmtDate(e.starts_at, "EEE HH:mm")}
                              {e.is_cancelled && ", cancelled"}
                            </span>
                          </span>
                          <span className="text-right text-xs text-muted tabular">
                            <span className="block text-sm font-semibold text-text">{e.present_count}</span>
                            present
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <GroupFormDialog open={editing} onOpenChange={setEditing} group={group} />
      <AddMemberDialog open={adding} onOpenChange={setAdding} groupId={group.id} existing={sorted.map((m) => m.person)} onAdded={refresh} />
      <EventFormDialog open={planning} onOpenChange={setPlanning} defaultGroupId={group.id} onSaved={(e) => router.push(`/events/${e.id}`)} />

      <Dialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        size="sm"
        title="Remove from group?"
        description={removing ? `${removing.person_name} will no longer be listed in ${group.name}. Their attendance history is kept.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Keep</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>Remove from group</Button>
          </>
        }
      />
      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        size="sm"
        title="Delete this group?"
        description="Memberships are deleted too. Past events stay but are no longer linked to the group. If the group has just finished, deactivating it keeps its history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button>
            <Button variant="danger" loading={destroy.isPending} onClick={() => destroy.mutate()}>Delete group</Button>
          </>
        }
      />
    </div>
  );
}
