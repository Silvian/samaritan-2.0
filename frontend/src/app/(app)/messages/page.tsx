"use client";

import { useQuery } from "@tanstack/react-query";
import { Mail, PenLine, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Pagination, TableSkeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import type { Message } from "@/lib/types";

export default function MessagesPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);
  const params = { status, search: q, page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["messages", params],
    queryFn: () => api.get<Paginated<Message>>("/messages/", params),
    placeholderData: (prev) => prev,
  });
  const drafts = useQuery({
    queryKey: ["messages", "draft-count"],
    queryFn: () => api.get<Paginated<Message>>("/messages/", { status: "draft", page_size: 1 }),
  });

  const newButton = can("comms.send") ? (
    <LinkButton href="/messages/new">
      <PenLine className="h-4 w-4" />
      New message
    </LinkButton>
  ) : null;

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Emails sent to groups, tags and congregations. Only people who've given email consent receive them."
        actions={newButton}
      />
      <Tabs
        value={status || "all"}
        onValueChange={(v) => {
          setStatus(v === "all" ? "" : v);
          setPage(1);
        }}
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
          <TabsList
            className="border-b-0"
            items={[
              { value: "all", label: "All" },
              { value: "draft", label: "Drafts", count: drafts.data?.count },
              { value: "sent", label: "Sent" },
            ]}
          />
          <div className="relative mb-2 w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by subject"
              className="pl-8"
              aria-label="Search messages"
            />
          </div>
        </div>
      </Tabs>

      {error ? (
        <ErrorState error={error} />
      ) : (
        <Card>
          {isLoading ? (
            <TableSkeleton />
          ) : !data || data.results.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={q ? "No messages match" : status === "draft" ? "No drafts" : status === "sent" ? "Nothing sent yet" : "No messages yet"}
              description={q ? undefined : "Write to a group, a tag or the whole congregation. Drafts are saved here until you send them."}
              action={!q ? newButton : undefined}
            />
          ) : (
            <>
              <Table>
                <THead>
                  <tr>
                    <TH>Subject</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Sent to</TH>
                    <TH className="hidden md:table-cell text-right">Skipped</TH>
                    <TH className="hidden lg:table-cell">Written by</TH>
                    <TH className="hidden sm:table-cell">Date</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.results.map((m) => (
                    <TR key={m.id}>
                      <TD className="max-w-md">
                        <Link href={`/messages/${m.id}`} className="block truncate font-medium text-text hover:text-primary">{m.subject || "(No subject)"}</Link>
                        <span className="block truncate text-xs text-muted">{m.body.replace(/\s+/g, " ").slice(0, 120)}</span>
                      </TD>
                      <TD><StatusBadge status={m.status} /></TD>
                      <TD className="text-right tabular">{m.status === "draft" ? <span className="text-subtle">Not sent</span> : fmtNumber(m.recipient_count)}</TD>
                      <TD className="hidden md:table-cell text-right tabular text-muted">{m.status === "draft" ? "" : fmtNumber(m.skipped_count)}</TD>
                      <TD className="hidden lg:table-cell text-muted">{m.created_by_name}</TD>
                      <TD className="hidden sm:table-cell whitespace-nowrap text-muted tabular">
                        <span title={fmtDateTime(m.sent_at ?? m.created_at)}>
                          {m.sent_at ? `Sent ${fmtDate(m.sent_at)}` : `Drafted ${fmtDate(m.created_at)}`}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={data.page} totalPages={data.total_pages} count={data.count} onPage={setPage} />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
