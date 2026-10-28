"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { api, ApiError, download, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { ConsentState, DataRequest, Person } from "@/lib/types";

type ConsentRecord = {
  id: number;
  purpose: string;
  purpose_display: string;
  granted: boolean;
  method_display: string;
  evidence: string;
  given_by_guardian: boolean;
  recorded_by_name: string | null;
  recorded_at: string;
};

const METHODS = [
  { value: "paper", label: "Paper form" },
  { value: "online", label: "Online form" },
  { value: "verbal", label: "Verbal (recorded by staff)" },
  { value: "email", label: "Email" },
];

function ConsentDialog({ person, purpose, onClose }: { person: Person; purpose: ConsentState | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [granted, setGranted] = useState<"yes" | "no">(purpose?.granted ? "no" : "yes");
  const [method, setMethod] = useState("paper");
  const [evidence, setEvidence] = useState("");
  const [guardian, setGuardian] = useState(person.is_child);
  const save = useMutation({
    mutationFn: () =>
      api.post("/consents/", { person: person.id, purpose: purpose?.purpose, granted: granted === "yes", method, evidence, given_by_guardian: guardian }),
    onSuccess: () => {
      toast.success("Consent recorded");
      qc.invalidateQueries({ queryKey: ["consents", person.id] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't record consent"),
  });
  return (
    <Dialog
      open={!!purpose}
      onOpenChange={(o) => !o && onClose()}
      title={`${purpose?.label ?? ""}`}
      description="Each change is added to the consent history, so you can show when and how consent was given or withdrawn."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Record consent</Button></>}
    >
      <div className="space-y-4">
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Decision</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={granted === "yes"} onChange={() => setGranted("yes")} className="accent-[var(--primary)]" /> Gives consent</label>
          <label className="flex items-center gap-2"><input type="radio" checked={granted === "no"} onChange={() => setGranted("no")} className="accent-[var(--primary)]" /> Withdraws or declines</label>
        </fieldset>
        <Field label="How was this given?" htmlFor="method">
          <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="Evidence" htmlFor="evidence" hint="Where the form or email is kept, e.g. “Welcome card, filed Oct 2026”">
          <Input id="evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        </Field>
        {person.is_child && <Checkbox checked={guardian} onChange={(e) => setGuardian(e.target.checked)} label="Given by a parent or guardian" hint="Required for children under 13 in the UK." />}
      </div>
    </Dialog>
  );
}

function EraseDialog({ person, open, onClose }: { person: Person; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [hold, setHold] = useState<string | null>(null);
  const erase = useMutation({
    mutationFn: (override: boolean) =>
      api.post(`/privacy/people/${person.id}/erase/`, { confirm_name: name, reason, override_financial_hold: override }),
    onSuccess: () => {
      toast.success("Personal data erased");
      router.push("/people");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "financial_hold") setHold(e.message);
      else toast.error(e instanceof ApiError ? e.message : "Couldn't erase");
    },
  });
  const fullName = `${person.first_name} ${person.last_name}`;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Erase personal data"
      description="This permanently removes their name, contact details, notes, care records, group memberships and consents. Attendance and giving totals are kept without identifying them. This can't be undone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={erase.isPending} disabled={name.trim().toLowerCase() !== fullName.toLowerCase() || !reason.trim()} onClick={() => erase.mutate(!!hold)}>
            {hold ? "Erase and keep financial records" : "Erase permanently"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {hold && <p className="rounded-md bg-gold-soft px-3 py-2 text-sm text-gold">{hold}</p>}
        <Field label="Reason" htmlFor="reason" hint="For example: erasure request received 12 Oct 2026">
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" />
        </Field>
        <Field label={`Type “${fullName}” to confirm`} htmlFor="confirm">
          <Input id="confirm" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
      </div>
    </Dialog>
  );
}

export function PersonPrivacy({ person }: { person: Person }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState<ConsentState | null>(null);
  const [erasing, setErasing] = useState(false);
  const current = useQuery({
    queryKey: ["consents", person.id, "current"],
    queryFn: () => api.get<ConsentState[]>("/consents/current/", { person: person.id }),
  });
  const history = useQuery({
    queryKey: ["consents", person.id, "history"],
    queryFn: () => api.get<Paginated<ConsentRecord>>("/consents/", { person: person.id, page_size: 50 }),
  });
  const requests = useQuery({
    queryKey: ["data-requests", { person: person.id }],
    queryFn: () => api.get<Paginated<DataRequest>>("/data-requests/", { person: person.id }),
    enabled: can("privacy.view"),
  });
  const canRecord = can("privacy.manage", "people.edit");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Consent" description="Email and SMS are only sent to people who have consented. Photo and directory consent guide what staff can share." />
          <CardBody>
            {!current.data ? (
              <Skeleton className="h-40" />
            ) : (
              <ul className="divide-y divide-border">
                {current.data.map((c) => (
                  <li key={c.purpose} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="flex-1 text-sm font-medium">{c.label}</span>
                    {c.granted === null ? (
                      <Badge>Not asked</Badge>
                    ) : c.granted ? (
                      <Badge tone="green">Consented</Badge>
                    ) : (
                      <Badge tone="red">Declined</Badge>
                    )}
                    <span className="w-28 text-xs text-muted">{c.recorded_at ? fmtDate(c.recorded_at) : ""}</span>
                    {canRecord && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Update</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Consent history" description="Every change is kept so you can demonstrate consent." />
          {history.data?.results.length ? (
            <Table>
              <THead><tr><TH>Date</TH><TH>Purpose</TH><TH>Decision</TH><TH className="hidden md:table-cell">Method</TH><TH className="hidden md:table-cell">Recorded by</TH></tr></THead>
              <tbody>
                {history.data.results.map((h) => (
                  <TR key={h.id}>
                    <TD className="whitespace-nowrap text-muted">{fmtDateTime(h.recorded_at)}</TD>
                    <TD>{h.purpose_display}</TD>
                    <TD>{h.granted ? <Badge tone="green">Consented</Badge> : <Badge tone="red">Declined</Badge>}{h.given_by_guardian && <span className="ml-2 text-xs text-muted">by guardian</span>}</TD>
                    <TD className="hidden md:table-cell text-muted">{h.method_display}{h.evidence ? `, ${h.evidence}` : ""}</TD>
                    <TD className="hidden md:table-cell text-muted">{h.recorded_by_name ?? "System"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <CardBody><p className="text-sm text-muted">No consent has been recorded yet.</p></CardBody>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        {can("privacy.manage") && (
          <Card>
            <CardHeader title="Data subject rights" />
            <CardBody className="space-y-4">
              <div>
                <Button variant="secondary" className="w-full justify-center" onClick={() =>
                  download(`/privacy/people/${person.id}/export/`, undefined, "subject-access.json")
                    .then(() => toast.success("Data exported"))
                    .catch((e) => toast.error(e.message))
                }>
                  <Download className="h-4 w-4" /> Export their data
                </Button>
                <p className="mt-1.5 text-xs text-muted">A complete copy for a subject access or portability request. The export is logged.</p>
              </div>
              <div>
                <Button variant="danger" className="w-full justify-center" onClick={() => setErasing(true)}>
                  <Trash2 className="h-4 w-4" /> Erase personal data
                </Button>
                <p className="mt-1.5 text-xs text-muted">For erasure requests or when retention expires.</p>
              </div>
            </CardBody>
          </Card>
        )}
        {can("privacy.view") && (
          <Card>
            <CardHeader title="Requests" />
            <CardBody>
              {requests.data?.results.length ? (
                <ul className="space-y-3">
                  {requests.data.results.map((r) => (
                    <li key={r.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r.kind_display}</span>
                        <StatusBadge status={r.status} label={r.status_display} />
                      </div>
                      <p className="text-xs text-muted">Received {fmtDate(r.received_on)}, due {fmtDate(r.due_on)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted"><ShieldCheck className="h-4 w-4" /> No data requests from this person.</p>
              )}
            </CardBody>
          </Card>
        )}
      </div>
      <ConsentDialog key={editing?.purpose ?? "none"} person={person} purpose={editing} onClose={() => setEditing(null)} />
      <EraseDialog person={person} open={erasing} onClose={() => setErasing(false)} />
    </div>
  );
}
