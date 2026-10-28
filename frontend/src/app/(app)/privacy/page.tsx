"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Archive, Baby, Download, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { REQUEST_KINDS, REQUEST_STATUSES, daysUntil, dueText, isClosed } from "@/components/privacy/guidance";
import { LogRequestDialog, RequestDetailDialog } from "@/components/privacy/request-dialogs";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, Skeleton, TableSkeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { PageHeader, Stat } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { DataRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

type Overview = {
  people_total: number;
  consent_coverage: { purpose: string; label: string; granted: number; recorded: number; total: number }[];
  requests: { open: number; overdue: number; due_this_week: number; by_kind: { kind: string; n: number }[] };
  retention: { inactive_years: number; due_for_anonymisation: number; anonymised_total: number };
  children: { total: number; with_guardian_photo_consent: number };
  sensitive_data: { with_medical_notes: number };
  mfa: { required: boolean };
  activity_30d: { exports: number; erasures: number; failed_logins: number };
  retention_candidates: { id: string; first_name: string; last_name: string; archived_at: string }[];
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function ConsentBars({ items }: { items: Overview["consent_coverage"] }) {
  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {items.map((c) => {
          const declined = Math.max(c.recorded - c.granted, 0);
          const none = Math.max(c.total - c.recorded, 0);
          return (
            <li key={c.purpose}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="text-text">{c.label}</span>
                <span className="tabular text-muted">
                  <span className="font-semibold text-text">{pct(c.granted, c.total)}%</span> granted, {fmtNumber(c.granted)} of {fmtNumber(c.total)}
                </span>
              </div>
              <div
                className="flex h-2.5 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${c.label}: ${c.granted} granted, ${declined} declined, ${none} with no record`}
              >
                <div className="h-full bg-green" style={{ width: `${pct(c.granted, c.total)}%` }} />
                <div className="h-full bg-red/45" style={{ width: `${pct(declined, c.total)}%` }} />
              </div>
              {none > 0 && <p className="mt-1 text-xs text-muted tabular">{fmtNumber(declined)} declined, {fmtNumber(none)} never asked</p>}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green" />Granted</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red/45" />Declined or withdrawn</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-surface-2 ring-1 ring-border" />No consent recorded</span>
      </div>
    </div>
  );
}

function ActivityRow({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number; tone?: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Icon className={cn("h-4 w-4 shrink-0 text-muted", tone)} />
      <span className="flex-1 text-sm">{label}</span>
      <span className={cn("text-sm font-semibold tabular", value > 0 && tone)}>{fmtNumber(value)}</span>
    </li>
  );
}

export default function PrivacyPage() {
  const { can } = useAuth();
  const canManage = can("privacy.manage");
  const [logOpen, setLogOpen] = useState(false);
  const [selected, setSelected] = useState<DataRequest | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");

  const overview = useQuery({ queryKey: ["privacy-overview"], queryFn: () => api.get<Overview>("/privacy/overview/") });
  const requests = useQuery({
    queryKey: ["data-requests", { page, status, kind }],
    queryFn: () => api.get<Paginated<DataRequest>>("/data-requests/", { page, status, kind, ordering: "due_on" }),
    placeholderData: keepPreviousData,
  });

  const o = overview.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy & GDPR"
        description="Consent, data subject requests and retention in one place, so you can show how your church looks after people's information."
        actions={canManage && <Button onClick={() => setLogOpen(true)}><Plus className="h-4 w-4" /> Log a request</Button>}
      />

      {overview.error ? (
        <ErrorState error={overview.error} />
      ) : !o ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border max-sm:[&>*:nth-child(-n+2)]:border-b max-sm:[&>*]:border-border">
          <Stat label="Open requests" value={fmtNumber(o.requests.open)} sub={o.requests.open ? "One-month deadline applies" : "Nothing waiting"} />
          <div className={cn(o.requests.overdue > 0 && "bg-red-soft")}>
            <Stat label="Overdue" value={<span className={cn(o.requests.overdue > 0 && "text-red")}>{fmtNumber(o.requests.overdue)}</span>} sub={o.requests.overdue ? "Past the legal deadline" : "All on time"} tone={o.requests.overdue ? "down" : undefined} />
          </div>
          <Stat label="Due this week" value={fmtNumber(o.requests.due_this_week)} sub="Within the next 7 days" />
          <Stat label="Due for anonymisation" value={fmtNumber(o.retention.due_for_anonymisation)} sub={`Archived over ${o.retention.inactive_years} years ago`} tone={o.retention.due_for_anonymisation ? "down" : undefined} />
        </Card>
      )}

      {o && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Consent coverage"
              description={`Latest consent for each purpose across ${fmtNumber(o.people_total)} active people`}
            />
            <CardBody>
              <ConsentBars items={o.consent_coverage} />
            </CardBody>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Last 30 days" description="Recorded in the audit log" />
              <CardBody className="-mt-2">
                <ul className="divide-y divide-border">
                  <ActivityRow icon={Download} label="Data exports" value={o.activity_30d.exports} tone="text-blue" />
                  <ActivityRow icon={Trash2} label="Erasures" value={o.activity_30d.erasures} tone="text-gold" />
                  <ActivityRow icon={KeyRound} label="Failed sign-ins" value={o.activity_30d.failed_logins} tone="text-red" />
                </ul>
                {can("audit.view") && <Link href="/admin/audit" className="mt-2 inline-block text-[13px] text-primary hover:underline">Open audit log</Link>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Children and sensitive data" />
              <CardBody className="-mt-1 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <Baby className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    <span className="font-semibold tabular">{fmtNumber(o.children.total)}</span> children under 18 on record.{" "}
                    <span className="tabular">{fmtNumber(o.children.with_guardian_photo_consent)}</span> ({pct(o.children.with_guardian_photo_consent, o.children.total)}%) have photo consent from a parent or guardian.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    <span className="font-semibold tabular">{fmtNumber(o.sensitive_data.with_medical_notes)}</span> people have medical notes, which are encrypted and only visible to roles with sensitive access.
                  </p>
                </div>
                <p className={cn("text-[13px]", o.mfa.required ? "text-green" : "text-muted")}>
                  {o.mfa.required ? "Two-factor authentication is required for every user." : "Two-factor authentication is optional for users."}
                  {can("settings.manage") && !o.mfa.required && (
                    <> <Link href="/admin/settings?tab=security" className="text-primary hover:underline">Change this</Link></>
                  )}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Data requests"
          description="Requests from people exercising their rights. Respond within one month of receiving them."
          action={
            <div className="hidden gap-2 sm:flex">
              <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-8 w-40 text-[13px]">
                <option value="">All statuses</option>
                {REQUEST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
              <Select aria-label="Filter by type" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} className="h-8 w-36 text-[13px]">
                <option value="">All types</option>
                {REQUEST_KINDS.map((k) => <option key={k.value} value={k.value}>{k.short}</option>)}
              </Select>
            </div>
          }
        />
        {requests.error ? (
          <div className="px-5 pb-5"><ErrorState error={requests.error} /></div>
        ) : !requests.data ? (
          <TableSkeleton rows={4} />
        ) : requests.data.results.length === 0 ? (
          <EmptyState
            title={status || kind ? "No requests match these filters" : "No data requests yet"}
            description="When someone asks to see, correct or delete their data, log it here so the deadline is tracked."
            action={canManage && !status && !kind && <Button variant="secondary" onClick={() => setLogOpen(true)}>Log a request</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Requester</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Received</TH>
                  <TH>Deadline</TH>
                  <TH className="text-center">Identity</TH>
                </tr>
              </THead>
              <tbody>
                {requests.data.results.map((r) => {
                  const closed = isClosed(r.status);
                  const days = daysUntil(r.due_on);
                  const overdue = !closed && days < 0;
                  return (
                    <TR key={r.id} className={cn("cursor-pointer hover:bg-surface-2", overdue && "bg-red-soft hover:bg-red-soft/80")} onClick={() => setSelected(r)}>
                      <TD>
                        <button type="button" className="text-left font-medium text-text hover:text-primary" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
                          {r.requester_name}
                        </button>
                        {r.person_name && r.person_name !== r.requester_name && <span className="block text-xs text-muted">About {r.person_name}</span>}
                      </TD>
                      <TD className="whitespace-nowrap">{REQUEST_KINDS.find((k) => k.value === r.kind)?.short ?? r.kind_display}</TD>
                      <TD><StatusBadge status={r.status} label={r.status_display} /></TD>
                      <TD className="whitespace-nowrap tabular text-muted">{fmtDate(r.received_on)}</TD>
                      <TD className="whitespace-nowrap tabular">
                        {closed ? (
                          <span className="text-muted">{r.completed_on ? `Closed ${fmtDate(r.completed_on)}` : "Closed"}</span>
                        ) : (
                          <>
                            <span className={cn("font-medium", overdue ? "text-red" : days <= 7 ? "text-gold" : "text-text")}>{dueText(days)}</span>
                            <span className="block text-xs text-muted">{fmtDate(r.due_on)}</span>
                          </>
                        )}
                      </TD>
                      <TD className="text-center">
                        {r.identity_verified ? <span className="text-xs text-green">Verified</span> : <span className="text-xs text-muted">Not yet</span>}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={requests.data.page} totalPages={requests.data.total_pages} count={requests.data.count} onPage={setPage} />
          </>
        )}
      </Card>

      {o && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Retention"
              description={`People archived more than ${o.retention.inactive_years} years ago should be anonymised. ${fmtNumber(o.retention.anonymised_total)} anonymised so far.`}
            />
            <CardBody className="-mt-1">
              {o.retention_candidates.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted"><Archive className="h-4 w-4" /> No one is past the retention period.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {o.retention_candidates.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/people/${p.id}`} className="truncate text-sm font-medium hover:text-primary">{p.first_name} {p.last_name}</Link>
                      <span className="shrink-0 text-xs text-muted tabular">Archived {fmtDate(p.archived_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {o.retention_candidates.length > 0 && (
                <p className="mt-3 text-[13px] text-muted">Open each profile and use Erase personal data. Gift Aid records are kept for HMRC automatically.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Handling requests" description="What each type of request asks of you" />
            <CardBody className="-mt-1">
              <dl className="space-y-3">
                {REQUEST_KINDS.map((k) => (
                  <div key={k.value}>
                    <dt className="text-sm font-medium text-text">{k.short}</dt>
                    <dd className="text-[13px] text-muted">{k.guidance}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      )}

      <LogRequestDialog open={logOpen} onOpenChange={setLogOpen} />
      <RequestDetailDialog request={selected} onOpenChange={(open) => !open && setSelected(null)} canManage={canManage} />
    </div>
  );
}
