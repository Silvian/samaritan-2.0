"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Composer } from "@/components/messages/composer";
import { describeAudience, type Recipient, RECIPIENT_STATUS, RecipientBadge, useAudienceOptions } from "@/components/messages/shared";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { PageHeader, Stat } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import type { Message } from "@/lib/types";

export default function MessagePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: m, isLoading, error } = useQuery({
    queryKey: ["message", id],
    queryFn: () => api.get<Message>(`/messages/${id}/`),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/messages/${id}/`),
    onSuccess: () => {
      toast.success("Draft deleted");
      qc.invalidateQueries({ queryKey: ["messages"] });
      router.replace("/messages");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <ErrorState error={error} />;
  if (isLoading || !m) return <Skeleton className="h-96 w-full" />;

  const editable = m.status === "draft" && can("comms.send");

  if (editable) {
    return (
      <div>
        <PageHeader
          back={{ href: "/messages", label: "Messages" }}
          title="Edit draft"
          description={`Started ${fmtDateTime(m.created_at)}${m.created_by_name ? ` by ${m.created_by_name}` : ""}. Save your changes or send it when it's ready.`}
          actions={
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete draft
            </Button>
          }
        />
        <Composer key={m.id} message={m} />
        <Dialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          size="sm"
          title="Delete this draft?"
          description="The draft will be permanently deleted."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Delete draft</Button>
            </>
          }
        />
      </div>
    );
  }

  return <SentMessage m={m} />;
}

function SentMessage({ m }: { m: Message }) {
  const { groups, tags } = useAudienceOptions();
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const recipients = useQuery({
    queryKey: ["message-recipients", m.id],
    queryFn: () => api.get<Recipient[]>(`/messages/${m.id}/recipients/`),
    enabled: m.status !== "draft",
  });
  const all = recipients.data ?? [];
  const counts = all.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const term = search.trim().toLowerCase();
  const rows = all.filter((r) => (!filter || r.status === filter) && (!term || r.person_name.toLowerCase().includes(term) || r.email.toLowerCase().includes(term)));
  const audience = describeAudience(m.audience, groups, tags);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/messages", label: "Messages" }}
        title={m.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={m.status} />
            <span>
              {m.sent_at ? `Sent ${fmtDateTime(m.sent_at)}` : `Drafted ${fmtDateTime(m.created_at)}`}
              {m.created_by_name ? ` by ${m.created_by_name}` : ""}
            </span>
          </span>
        }
      />

      {m.status !== "draft" && (
        <Card className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x divide-border [&>*]:border-border max-sm:[&>*]:border-b">
          <Stat label="Sent" value={fmtNumber(counts.sent ?? m.recipient_count)} />
          <Stat label="Skipped: no consent" value={fmtNumber(counts.no_consent ?? 0)} />
          <Stat label="Skipped: no email" value={fmtNumber(counts.no_email ?? 0)} />
          <Stat label="Failed" value={fmtNumber(counts.failed ?? 0)} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Message" />
          <CardBody>
            <p className="mb-3 text-sm font-medium">{m.subject}</p>
            <div className="whitespace-pre-wrap rounded-md border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed">{m.body}</div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Audience" description="People matching any of these" />
          <CardBody>
            {audience.length ? (
              <ul className="space-y-1.5 text-sm">
                {audience.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-subtle">No audience chosen.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {m.status !== "draft" && (
        <Card>
          <CardHeader title="Recipients" description="Everyone in the audience, and whether the email was sent to them." />
          <div className="flex flex-wrap gap-2 px-5 pb-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="w-full sm:w-60" aria-label="Search recipients" />
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full sm:w-60" aria-label="Filter by delivery status">
              <option value="">All recipients ({fmtNumber(all.length)})</option>
              {Object.entries(RECIPIENT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label} ({fmtNumber(counts[k] ?? 0)})</option>
              ))}
            </Select>
          </div>
          {recipients.error ? (
            <ErrorState error={recipients.error} className="m-5 mt-0" />
          ) : recipients.isLoading ? (
            <TableSkeleton rows={4} />
          ) : rows.length === 0 ? (
            <EmptyState title="No recipients match" className="border-t border-border" />
          ) : (
            <div className="border-t border-border">
              <Table>
                <THead>
                  <tr>
                    <TH>Person</TH>
                    <TH className="hidden sm:table-cell">Email</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`/people/${r.person}`} className="font-medium text-text hover:text-primary">{r.person_name}</Link>
                      </TD>
                      <TD className="hidden sm:table-cell text-muted">{r.email || <span className="text-subtle">None</span>}</TD>
                      <TD>
                        <RecipientBadge status={r.status} />
                        {r.error && <span className="mt-0.5 block text-xs text-red">{r.error}</span>}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <div className="border-t border-border px-5 py-3 text-xs text-muted">
                {fmtNumber(rows.length)} of {fmtNumber(all.length)} shown. People skipped for consent can update their preferences on their profile.
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
