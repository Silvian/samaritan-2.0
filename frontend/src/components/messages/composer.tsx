"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Mail, Save, Search, Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { PERSON_STATUSES, type Audience, type Message } from "@/lib/types";
import { cn } from "@/lib/utils";

import { type AudiencePreview, audienceIsEmpty, describeAudience, EMPTY_AUDIENCE, useAudienceOptions } from "./shared";

const MERGE_FIELDS = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{last_name}}", label: "Last name" },
];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors",
        on ? "border-primary bg-primary-soft text-primary" : "border-border-strong bg-surface text-text hover:bg-surface-2",
      )}
    >
      {on && <Check className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </button>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function Composer({ message, initialPersonIds = [] }: { message?: Message; initialPersonIds?: string[] }) {
  const qc = useQueryClient();
  const router = useRouter();
  const body = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState(message?.subject ?? "");
  const [text, setText] = useState(message?.body ?? "Dear {{first_name}},\n\n");
  const [audience, setAudience] = useState<Audience>({
    ...EMPTY_AUDIENCE,
    ...(message?.audience ?? (initialPersonIds.length ? { person_ids: initialPersonIds } : {})),
  });
  const [groupSearch, setGroupSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { groups, tags, loading } = useAudienceOptions();

  const debouncedAudience = useDebounced(audience, 300);
  const empty = audienceIsEmpty(debouncedAudience);
  const preview = useQuery({
    queryKey: ["message-preview", debouncedAudience],
    queryFn: () => api.post<AudiencePreview>("/messages/preview/", debouncedAudience),
    enabled: !empty,
    placeholderData: (prev) => prev,
  });
  const stats = empty ? null : preview.data;

  const save = useMutation({
    mutationFn: async () => {
      const payload = { subject, body: text, channel: "email", audience };
      return message ? api.patch<Message>(`/messages/${message.id}/`, payload) : api.post<Message>("/messages/", payload);
    },
  });
  const send = useMutation({ mutationFn: (id: string) => api.post<Message>(`/messages/${id}/send/`) });
  const err = save.error instanceof ApiError ? save.error : null;

  const saveDraft = () =>
    save.mutate(undefined, {
      onSuccess: (m) => {
        toast.success("Draft saved");
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.setQueryData(["message", m.id], m);
        if (!message) router.replace(`/messages/${m.id}`);
      },
      onError: (e) => toast.error(e.message),
    });

  const sendNow = async () => {
    try {
      const m = await save.mutateAsync();
      const sent = await send.mutateAsync(m.id);
      toast.success(`Message sent to ${fmtNumber(sent.recipient_count)} ${sent.recipient_count === 1 ? "person" : "people"}`);
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["message", m.id] });
      qc.invalidateQueries({ queryKey: ["message-recipients", m.id] });
      setConfirmOpen(false);
      router.replace(`/messages/${m.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const insert = (token: string) => {
    const el = body.current;
    if (!el) return setText((t) => t + token);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const visibleGroups = groups.filter((g) => g.is_active !== false && g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()));
  const ready = subject.trim() && text.trim() && !audienceIsEmpty(audience);
  const busy = save.isPending || send.isPending;
  const audienceParts = describeAudience(audience, groups, tags);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Message" description="Sent as a plain-text email from the church." />
          <CardBody className="space-y-4">
            <Field label="Subject" required htmlFor="msg-subject" error={err?.fieldError("subject")}>
              <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="e.g. Harvest supper this Saturday" />
            </Field>
            <Field label="Message" required htmlFor="msg-body" error={err?.fieldError("body")}>
              <Textarea id="msg-body" ref={body} value={text} onChange={(e) => setText(e.target.value)} className="min-h-64 font-[inherit]" />
            </Field>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Personalise with merge fields: <code className="rounded bg-surface-2 px-1 py-0.5 text-text">{"{{first_name}}"}</code> becomes each person&apos;s preferred or first name.
              </span>
              <span className="flex gap-1.5">
                {MERGE_FIELDS.map((f) => (
                  <Button key={f.token} size="sm" variant="soft" className="h-7 px-2 text-xs" onClick={() => insert(f.token)}>
                    Insert {f.label.toLowerCase()}
                  </Button>
                ))}
              </span>
            </div>
            <p className="text-xs text-muted">An unsubscribe footer with the church&apos;s contact details is added to every email automatically.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Audience" description="People who match any of your choices are included. Each person gets the message once." />
          <CardBody className="space-y-5">
            {err?.fieldError("audience") && <p className="text-xs text-red">{err.fieldError("audience")}</p>}
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">By status</legend>
              <div className="flex flex-wrap gap-2">
                {PERSON_STATUSES.filter((s) => s.value !== "deceased").map((s) => (
                  <Chip key={s.value} on={audience.statuses.includes(s.value)} onClick={() => setAudience((a) => ({ ...a, statuses: toggle(a.statuses, s.value) as Audience["statuses"] }))}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">By tag</legend>
              {loading ? (
                <Skeleton className="h-8 w-2/3" />
              ) : tags.length === 0 ? (
                <p className="text-sm text-subtle">No tags yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <Chip key={t.id} on={audience.tag_ids.includes(t.id)} onClick={() => setAudience((a) => ({ ...a, tag_ids: toggle(a.tag_ids, t.id) }))}>
                      {t.name}
                      {t.people_count !== undefined && <span className="text-xs text-muted tabular">{t.people_count}</span>}
                    </Chip>
                  ))}
                </div>
              )}
            </fieldset>
            <fieldset>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <legend className="text-[13px] font-medium">By group</legend>
                {groups.length > 8 && (
                  <div className="relative w-full sm:w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                    <Input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Filter groups" className="h-8 pl-8 text-[13px]" aria-label="Filter groups" />
                  </div>
                )}
              </div>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : visibleGroups.length === 0 ? (
                <p className="text-sm text-subtle">{groupSearch ? "No groups match." : "No groups yet."}</p>
              ) : (
                <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-md border border-border p-1 sm:grid-cols-2">
                  {visibleGroups.map((g) => {
                    const on = audience.group_ids.includes(g.id);
                    return (
                      <li key={g.id}>
                        <label className={cn("flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 text-sm hover:bg-surface-2", on && "bg-primary-soft/60")}>
                          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={on} onChange={() => setAudience((a) => ({ ...a, group_ids: toggle(a.group_ids, g.id) }))} />
                          <span className="min-w-0 flex-1 truncate">{g.name}</span>
                          <span className="text-xs text-muted tabular">{g.member_count}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
            {audience.person_ids.length > 0 && (
              <p className="text-xs text-muted">This draft also includes {audience.person_ids.length === 1 ? "1 individually chosen person" : `${audience.person_ids.length} individually chosen people`}.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <AudienceSummary stats={stats} loading={!empty && preview.isLoading} error={preview.error} empty={empty} fetching={preview.isFetching} />
        <Card>
          <CardBody className="space-y-2 pt-5">
            <Button className="w-full justify-center" onClick={() => setConfirmOpen(true)} disabled={!ready || busy || !stats?.sendable}>
              <Send className="h-4 w-4" />
              Send message
            </Button>
            <Button variant="secondary" className="w-full justify-center" onClick={saveDraft} loading={save.isPending && !send.isPending && !confirmOpen} disabled={!subject.trim() || busy}>
              <Save className="h-4 w-4" />
              Save draft
            </Button>
            {!ready && <p className="pt-1 text-xs text-muted">Add a subject, a message and at least one audience to send.</p>}
            {ready && stats && stats.sendable === 0 && <p className="pt-1 text-xs text-muted">No one in this audience can be emailed yet.</p>}
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => !busy && setConfirmOpen(o)}
        title="Send this message now?"
        description="Emails go out straight away and can't be recalled."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={sendNow} loading={busy}>
              Send to {fmtNumber(stats?.sendable ?? 0)} {stats?.sendable === 1 ? "person" : "people"}
            </Button>
          </>
        }
      >
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Subject</dt>
            <dd className="mt-0.5 font-medium">{subject}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Audience</dt>
            <dd className="mt-0.5">{audienceParts.join(", ")}</dd>
          </div>
          {stats && (
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[13px]">
              <strong className="tabular">{fmtNumber(stats.sendable)}</strong> of {fmtNumber(stats.matched)} matched {stats.matched === 1 ? "person" : "people"} will receive it.
              {stats.matched - stats.sendable > 0 && (
                <> {fmtNumber(stats.matched - stats.sendable)} will be skipped because they have no email address or haven&apos;t given email consent.</>
              )}
            </div>
          )}
        </dl>
      </Dialog>
    </div>
  );
}

function AudienceSummary({ stats, loading, error, empty, fetching }: { stats: AudiencePreview | null | undefined; loading: boolean; error: unknown; empty: boolean; fetching: boolean }) {
  const noEmail = stats ? stats.matched - stats.with_email : 0;
  const rows = stats
    ? [
        { label: "Match your audience", value: stats.matched, tone: "text-text" },
        { label: "Have no email address", value: -noEmail, tone: "text-muted" },
        { label: "Haven't given email consent", value: -stats.no_consent, tone: "text-gold" },
      ]
    : [];
  return (
    <Card>
      <CardHeader title="Who will receive this" action={fetching && !loading ? <span className="text-xs text-subtle">Updating…</span> : undefined} />
      <CardBody>
        {empty ? (
          <div className="flex flex-col items-center py-4 text-center">
            <Mail className="h-7 w-7 text-subtle" />
            <p className="mt-2 text-sm text-muted">Choose statuses, tags or groups to see who this will reach.</p>
          </div>
        ) : error ? (
          <p className="text-sm text-red">{(error as Error).message}</p>
        ) : loading || !stats ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div aria-live="polite">
            <p className="text-3xl font-semibold tabular text-green">{fmtNumber(stats.sendable)}</p>
            <p className="text-sm text-muted">{stats.sendable === 1 ? "person will receive this email" : "people will receive this email"}</p>
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex justify-between gap-3">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className={cn("tabular font-medium", r.tone)}>{r.value < 0 ? `−${fmtNumber(-r.value)}` : fmtNumber(r.value)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-border pt-2">
                <dt className="font-medium">Will be sent</dt>
                <dd className="tabular font-semibold text-green">{fmtNumber(stats.sendable)}</dd>
              </div>
            </dl>
            {stats.matched > 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2 flex" aria-hidden>
                <div className="h-2 bg-green" style={{ width: `${(stats.sendable / stats.matched) * 100}%` }} />
                <div className="h-2 bg-gold" style={{ width: `${(stats.no_consent / stats.matched) * 100}%` }} />
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-xs text-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p>
            Only people who have given consent to receive emails from the church will get this message. Everyone else is skipped automatically, in line with UK GDPR and PECR, and listed on the message afterwards.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
