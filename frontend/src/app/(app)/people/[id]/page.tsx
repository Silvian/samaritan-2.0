"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Cake, FileText, HeartPulse, Lock, Mail, MoreHorizontal, Pencil, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { NewCareRecordDialog } from "@/components/care/shared";
import { PersonPrivacy } from "@/components/people/person-privacy";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge, tagTone } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { DefinitionList } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtMoney, fromNow } from "@/lib/format";
import type { Attendance, AuditEntry, CareRecord, Donation, Person } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = { head: "Head", spouse: "Spouse / partner", child: "Child", other: "Other", leader: "Leader", co_leader: "Co-leader", member: "Member", guest: "Guest" };
const MILESTONE_KINDS = [
  ["baptism", "Baptism"], ["membership", "Became a member"], ["salvation", "Salvation / commitment"], ["confirmation", "Confirmation"],
  ["dedication", "Dedication / christening"], ["marriage", "Marriage"], ["ordination", "Ordination"], ["course", "Completed course"],
  ["first_visit", "First visit"], ["other", "Other"],
];

function MilestoneDialog({ personId, open, onClose }: { personId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState("baptism");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");
  const save = useMutation({
    mutationFn: () => api.post("/milestones/", { person: personId, kind, date, place, notes }),
    onSuccess: () => {
      toast.success("Milestone added");
      qc.invalidateQueries({ queryKey: ["person", personId] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add a milestone"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Add milestone</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Milestone" htmlFor="kind">
          <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {MILESTONE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="mdate"><Input id="mdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Place" htmlFor="place" className="sm:col-span-2"><Input id="place" value={place} onChange={(e) => setPlace(e.target.value)} /></Field>
        <Field label="Notes" htmlFor="mnotes" className="sm:col-span-2"><Textarea id="mnotes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" /></Field>
      </div>
    </Dialog>
  );
}

function AttendanceTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["attendance", { person: id }],
    queryFn: () => api.get<Paginated<Attendance>>("/attendance/", { person: id, page_size: 50 }),
  });
  if (isLoading) return <Skeleton className="h-48" />;
  const rows = data?.results ?? [];
  if (!rows.length) return <Card><EmptyState title="No attendance recorded" description="Check-ins at services and group meetings will appear here." /></Card>;
  const last = rows[0];
  return (
    <Card>
      <CardHeader title={`${data?.count} check-ins`} description={`Last seen ${fromNow(last.event_starts_at)} at ${last.event_title}`} />
      <Table>
        <THead><tr><TH>Date</TH><TH>Event</TH><TH>Status</TH></tr></THead>
        <tbody>
          {rows.map((a) => (
            <TR key={a.id}>
              <TD className="whitespace-nowrap text-muted tabular">{fmtDate(a.event_starts_at, "EEE d MMM yyyy")}</TD>
              <TD><Link className="hover:text-primary" href={`/events/${a.event}`}>{a.event_title}</Link></TD>
              <TD><StatusBadge status={a.status} /></TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function GivingTab({ id }: { id: string }) {
  const year = new Date().getFullYear();
  const { data, isLoading } = useQuery({
    queryKey: ["donations", { person: id }],
    queryFn: () => api.get<Paginated<Donation>>("/donations/", { person: id, page_size: 100 }),
  });
  if (isLoading) return <Skeleton className="h-48" />;
  const rows = data?.results ?? [];
  const thisYear = rows.filter((d) => d.date.startsWith(String(year))).reduce((a, d) => a + parseFloat(d.amount), 0);
  return (
    <Card>
      <CardHeader
        title="Giving"
        description={rows.length ? `${fmtMoney(thisYear)} given in ${year}` : undefined}
        action={<LinkButton size="sm" variant="secondary" href={`/giving/statement?person=${id}&year=${year}`}><FileText className="h-3.5 w-3.5" /> Statement</LinkButton>}
      />
      {rows.length ? (
        <Table>
          <THead><tr><TH>Date</TH><TH>Fund</TH><TH className="text-right">Amount</TH><TH className="hidden sm:table-cell">Method</TH><TH className="hidden sm:table-cell">Gift Aid</TH></tr></THead>
          <tbody>
            {rows.map((d) => (
              <TR key={d.id}>
                <TD className="text-muted tabular">{fmtDate(d.date)}</TD>
                <TD>{d.fund_name}</TD>
                <TD className="text-right tabular font-medium">{fmtMoney(d.amount)}</TD>
                <TD className="hidden sm:table-cell text-muted">{d.method_display}</TD>
                <TD className="hidden sm:table-cell">{d.gift_aid_claimed_at ? <Badge tone="green">Claimed</Badge> : null}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No donations recorded" />
      )}
    </Card>
  );
}

function CareTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["care-records", { person: id }],
    queryFn: () => api.get<Paginated<CareRecord>>("/care-records/", { person: id }),
  });
  if (isLoading) return <Skeleton className="h-48" />;
  const rows = data?.results ?? [];
  return (
    <Card>
      <CardHeader title="Pastoral care" description="Details are encrypted. Opening a record is logged." />
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/care/${c.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-2">
                {c.is_confidential && <Lock className="h-3.5 w-3.5 text-gold" aria-label="Confidential" />}
                <span className="flex-1 text-sm font-medium">{c.subject}</span>
                <span className="text-xs text-muted">{c.kind_display}</span>
                <StatusBadge status={c.status} />
                <span className="w-24 text-right text-xs text-muted">{fmtDate(c.occurred_on ?? c.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No care records" description="Visits, calls and prayer requests will appear here." />
      )}
    </Card>
  );
}

function HistoryTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["audit", { object_id: id }],
    queryFn: () => api.get<Paginated<AuditEntry>>("/audit-log/", { object_id: id, page_size: 50 }),
  });
  if (isLoading) return <Skeleton className="h-48" />;
  return (
    <Card>
      <CardHeader title="Record history" description="Who viewed, changed or exported this person's data." />
      <ul className="divide-y divide-border">
        {data?.results.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
            <span className="w-40 shrink-0 text-xs text-muted tabular">{fmtDateTime(e.timestamp)}</span>
            <span className="font-medium">{e.actor_email || "System"}</span>
            <Badge tone={e.action === "view" ? "neutral" : e.action === "erase" ? "red" : e.action === "export" ? "gold" : "violet"}>{e.action}</Badge>
            {e.action === "update" && <span className="text-xs text-muted">{Object.keys(e.changes).join(", ")}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const { data: p, error } = useQuery({ queryKey: ["person", id], queryFn: () => api.get<Person>(`/people/${id}/`) });

  const archive = useMutation({
    mutationFn: (restore: boolean) => api.post(`/people/${id}/${restore ? "restore" : "archive"}/`, restore ? {} : { reason: "Archived from profile" }),
    onSuccess: (_, restore) => {
      toast.success(restore ? "Person restored" : "Person archived");
      qc.invalidateQueries({ queryKey: ["person", id] });
      qc.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update"),
  });

  if (error) return <ErrorState error={error} />;
  if (!p) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>;

  const address = [p.address_line1, p.address_line2, p.city, p.region, p.postcode].filter(Boolean).join(", ");
  const tabs = [
    { value: "overview", label: "Overview" },
    ...(can("events.view", "events.manage") ? [{ value: "attendance", label: "Attendance" }] : []),
    ...(can("giving.view", "giving.manage") ? [{ value: "giving", label: "Giving" }] : []),
    ...(can("pastoral.view") ? [{ value: "care", label: "Pastoral care" }] : []),
    ...(can("people.view") ? [{ value: "privacy", label: "Consent & privacy" }] : []),
    ...(can("audit.view") ? [{ value: "history", label: "History" }] : []),
  ];

  return (
    <div className="space-y-6">
      <Link href="/people" className="text-[13px] text-muted hover:text-text">People</Link>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={p.full_name} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[30px] leading-tight font-semibold">{p.title ? `${p.title} ` : ""}{p.full_name}</h1>
          {p.preferred_name && <p className="text-sm text-muted">Legal name {p.first_name} {p.last_name}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={p.status} label={p.status_display} />
            {p.age !== null && <span className="flex items-center gap-1"><Cake className="h-3.5 w-3.5" /> {p.age}{p.is_child ? ", child" : ""}</span>}
            {p.household && <Link href={`/households/${p.household.id}`} className="hover:text-primary">{p.household.name}</Link>}
            {p.campus && <span>{p.campus.name} campus</span>}
            {p.tags.map((t) => <Badge key={t.id} tone={tagTone(t.color)}>{t.name}</Badge>)}
          </div>
          {p.archived_at && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-gold-soft px-3 py-1.5 text-sm text-gold">
              <Archive className="h-4 w-4" /> Archived {fmtDate(p.archived_at)}{p.archive_reason ? `: ${p.archive_reason}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {p.email && <a href={`mailto:${p.email}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-surface text-muted hover:text-text" aria-label={`Email ${p.full_name}`}><Mail className="h-4 w-4" /></a>}
          {p.phone_mobile && <a href={`tel:${p.phone_mobile}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-surface text-muted hover:text-text" aria-label={`Call ${p.full_name}`}><Phone className="h-4 w-4" /></a>}
          {can("people.edit") && <LinkButton variant="secondary" href={`/people/${id}/edit`}><Pencil className="h-4 w-4" /> Edit</LinkButton>}
          {(can("people.archive") || can("pastoral.manage")) && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
              </MenuTrigger>
              <MenuContent>
                {can("pastoral.manage") && <MenuItem onSelect={() => setCareOpen(true)}><HeartPulse className="h-4 w-4" /> Log pastoral care</MenuItem>}
                {can("people.archive") && <MenuSeparator />}
                {can("people.archive") &&
                  (p.archived_at ? (
                    <MenuItem onSelect={() => archive.mutate(true)}><ArchiveRestore className="h-4 w-4" /> Restore</MenuItem>
                  ) : (
                    <MenuItem onSelect={() => archive.mutate(false)}><Archive className="h-4 w-4" /> Archive</MenuItem>
                  ))}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList items={tabs} />
        <TabsContent value="overview" className="pt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader title="Contact" />
                <CardBody>
                  <DefinitionList items={[
                    { label: "Email", value: p.email && <a className="text-primary hover:underline" href={`mailto:${p.email}`}>{p.email}</a> },
                    { label: "Mobile", value: p.phone_mobile },
                    { label: "Home phone", value: p.phone_home },
                    { label: "Address", value: address },
                  ]} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Personal" />
                <CardBody>
                  <DefinitionList items={[
                    { label: "Date of birth", value: p.date_of_birth && fmtDate(p.date_of_birth) },
                    { label: "Gender", value: p.gender ? p.gender[0].toUpperCase() + p.gender.slice(1) : "" },
                    { label: "Marital status", value: p.marital_status ? p.marital_status[0].toUpperCase() + p.marital_status.slice(1) : "" },
                    { label: "Anniversary", value: p.anniversary && fmtDate(p.anniversary) },
                    { label: "Occupation", value: [p.occupation, p.employer].filter(Boolean).join(", ") },
                    { label: "Emergency contact", value: [p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(", ") },
                  ]} />
                </CardBody>
              </Card>
              {p.can_view_sensitive && (p.medical_notes || p.confidential_notes) && (
                <Card className="border-gold/40">
                  <CardHeader title={<span className="flex items-center gap-2"><Lock className="h-4 w-4 text-gold" /> Sensitive</span>} description="Encrypted. Only visible to people with sensitive-data access." />
                  <CardBody>
                    <DefinitionList items={[
                      { label: "Medical notes and allergies", value: p.medical_notes },
                      { label: "Confidential notes", value: p.confidential_notes },
                    ]} />
                  </CardBody>
                </Card>
              )}
              {p.notes && (
                <Card>
                  <CardHeader title="Notes" />
                  <CardBody><p className="whitespace-pre-wrap text-sm leading-relaxed">{p.notes}</p></CardBody>
                </Card>
              )}
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader title="Church life" />
                <CardBody>
                  <DefinitionList items={[
                    { label: "First visit", value: p.first_visit_date && fmtDate(p.first_visit_date) },
                    { label: "Member since", value: p.membership_date && fmtDate(p.membership_date) },
                    { label: "How they heard", value: p.how_heard },
                    { label: "Positions", value: p.positions.map((x) => x.name).join(", ") },
                  ]} />
                </CardBody>
              </Card>
              {p.household && (
                <Card>
                  <CardHeader title="Household" action={<Link href={`/households/${p.household.id}`} className="text-[13px] text-primary hover:underline">Open</Link>} />
                  <CardBody className="-mt-1">
                    {p.household_members.length ? (
                      <ul className="space-y-2.5">
                        {p.household_members.map((m) => (
                          <li key={m.id} className="flex items-center gap-3">
                            <Avatar name={m.full_name} size="sm" />
                            <Link href={`/people/${m.id}`} className="flex-1 text-sm hover:text-primary">{m.full_name}</Link>
                            <span className="text-xs text-muted">{ROLE_LABEL[m.household_role] ?? ""}{m.age !== null ? `, ${m.age}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-muted">No one else in this household.</p>}
                  </CardBody>
                </Card>
              )}
              <Card>
                <CardHeader title="Groups" />
                <CardBody className="-mt-1">
                  {p.groups.length ? (
                    <ul className="space-y-2">
                      {p.groups.map((g) => (
                        <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                          <Link href={`/groups/${g.id}`} className="hover:text-primary">{g.name}</Link>
                          <Badge tone={g.role === "leader" || g.role === "co_leader" ? "violet" : "neutral"}>{ROLE_LABEL[g.role]}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">Not in any groups yet.</p>}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Milestones" action={can("people.edit") && <Button size="sm" variant="ghost" onClick={() => setMilestoneOpen(true)}><Plus className="h-3.5 w-3.5" /> Add</Button>} />
                <CardBody className="-mt-1">
                  {p.milestones.length ? (
                    <ol className="relative space-y-4 border-l border-border pl-4">
                      {p.milestones.map((m) => (
                        <li key={m.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-gold" />
                          <p className="text-sm font-medium">{m.kind_display}</p>
                          <p className="text-xs text-muted">{fmtDate(m.date)}{m.place ? `, ${m.place}` : ""}</p>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-muted">Baptism, membership and other milestones appear here.</p>}
                </CardBody>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="attendance" className="pt-6"><AttendanceTab id={id} /></TabsContent>
        <TabsContent value="giving" className="pt-6"><GivingTab id={id} /></TabsContent>
        <TabsContent value="care" className="pt-6"><CareTab id={id} /></TabsContent>
        <TabsContent value="privacy" className="pt-6"><PersonPrivacy person={p} /></TabsContent>
        <TabsContent value="history" className="pt-6"><HistoryTab id={id} /></TabsContent>
      </Tabs>
      <MilestoneDialog personId={id} open={milestoneOpen} onClose={() => setMilestoneOpen(false)} />
      <NewCareRecordDialog open={careOpen} onOpenChange={setCareOpen} person={{ id: p.id, full_name: p.full_name }} />
    </div>
  );
}
