"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { ListEditor } from "@/components/admin/list-editor";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ChurchSettings } from "@/lib/types";

const CURRENCIES = ["GBP", "EUR", "USD", "CAD", "AUD", "NZD", "CHF", "SEK", "NOK", "DKK", "ZAR", "NGN", "KES", "GHS", "INR", "SGD", "HKD", "RON"];

function timezones(current: string) {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  if (!list.length) list = ["Europe/London", "Europe/Dublin", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];
  return list.includes(current) ? list : [current, ...list];
}

type Form = ChurchSettings;

function useSettingsForm(initial: Form) {
  const qc = useQueryClient();
  const { refetch } = useAuth();
  const [form, setForm] = useState<Form>(initial);
  const save = useMutation({
    mutationFn: (keys: (keyof Form)[]) => api.patch<Form>("/settings/", Object.fromEntries(keys.map((k) => [k, form[k]]))),
    onSuccess: (data) => {
      toast.success("Settings saved");
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries({ queryKey: ["privacy-overview"] });
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const bind = (k: keyof Form) => ({
    id: `s-${k}`,
    value: String(form[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });
  return { form, setForm, save, err, bind };
}

const CHURCH_KEYS: (keyof Form)[] = ["name", "legal_name", "charity_number", "email", "phone", "website", "address", "currency", "timezone"];
const SECURITY_KEYS: (keyof Form)[] = ["data_controller_name", "dpo_email", "privacy_notice_url", "retention_years_inactive", "retention_years_financial", "require_mfa", "session_idle_minutes"];

function ChurchTab({ initial }: { initial: Form }) {
  const { form, save, err, bind } = useSettingsForm(initial);
  return (
    <Card>
      <CardHeader title="Church details" description="Shown on receipts, Gift Aid paperwork and emails sent from Samaritan." />
      <CardBody>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(CHURCH_KEYS); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Church name" htmlFor="s-name" required error={err?.fieldError("name")}>
              <Input {...bind("name")} required />
            </Field>
            <Field label="Legal name" htmlFor="s-legal_name" hint="As registered with the Charity Commission, if different." error={err?.fieldError("legal_name")}>
              <Input {...bind("legal_name")} />
            </Field>
            <Field label="Charity number" htmlFor="s-charity_number" error={err?.fieldError("charity_number")}>
              <Input {...bind("charity_number")} />
            </Field>
            <Field label="Website" htmlFor="s-website" error={err?.fieldError("website")}>
              <Input {...bind("website")} type="url" placeholder="https://" />
            </Field>
            <Field label="Email" htmlFor="s-email" error={err?.fieldError("email")}>
              <Input {...bind("email")} type="email" />
            </Field>
            <Field label="Phone" htmlFor="s-phone" error={err?.fieldError("phone")}>
              <Input {...bind("phone")} type="tel" />
            </Field>
            <Field label="Address" htmlFor="s-address" error={err?.fieldError("address")} className="sm:col-span-2">
              <Textarea {...bind("address")} className="min-h-20" />
            </Field>
            <Field label="Currency" htmlFor="s-currency" hint="Used for giving and reports." error={err?.fieldError("currency")}>
              <Select {...bind("currency")}>
                {(CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES]).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Time zone" htmlFor="s-timezone" error={err?.fieldError("timezone")}>
              <Select {...bind("timezone")}>
                {timezones(form.timezone).map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" loading={save.isPending}>Save church details</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function SecurityTab({ initial }: { initial: Form }) {
  const { me } = useAuth();
  const { form, setForm, save, err, bind } = useSettingsForm(initial);
  const turningOnMfa = form.require_mfa && !initial.require_mfa;
  const num = (k: keyof Form) => ({
    ...bind(k),
    type: "number",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value === "" ? "" : Number(e.target.value) })),
  });
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(SECURITY_KEYS); }}>
      <Card>
        <CardHeader title="Data protection" description="Who is responsible for personal data, and where people can read your privacy notice." />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data controller" htmlFor="s-data_controller_name" hint="Usually the church's legal name." error={err?.fieldError("data_controller_name")}>
              <Input {...bind("data_controller_name")} />
            </Field>
            <Field label="Data protection contact email" htmlFor="s-dpo_email" hint="Where people send data requests." error={err?.fieldError("dpo_email")}>
              <Input {...bind("dpo_email")} type="email" />
            </Field>
            <Field label="Privacy notice link" htmlFor="s-privacy_notice_url" hint="Shown on the sign-in page." error={err?.fieldError("privacy_notice_url")} className="sm:col-span-2">
              <Input {...bind("privacy_notice_url")} type="url" placeholder="https://" />
            </Field>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Retention" description="How long records are kept once they're no longer needed." />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Years to keep archived people" htmlFor="s-retention_years_inactive" hint="After this, archived people appear on the Privacy page for anonymisation." error={err?.fieldError("retention_years_inactive")}>
              <Input {...num("retention_years_inactive")} min={1} max={50} required />
            </Field>
            <Field label="Years to keep financial records" htmlFor="s-retention_years_financial" hint="HMRC expects Gift Aid records to be kept for at least 6 years." error={err?.fieldError("retention_years_financial")}>
              <Input {...num("retention_years_financial")} min={6} max={50} required />
            </Field>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Sign-in security" />
        <CardBody className="space-y-4">
          <Checkbox
            label="Require two-factor authentication for everyone"
            hint="Users without it will be asked to set it up the next time they sign in, before they can see anything."
            checked={form.require_mfa}
            onChange={(e) => setForm((f) => ({ ...f, require_mfa: e.target.checked }))}
          />
          {turningOnMfa && !me?.mfa_enabled && (
            <p className="flex items-start gap-2 rounded-md bg-gold-soft px-3 py-2 text-[13px] text-gold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              You haven&apos;t set up two-factor yourself, so you&apos;ll be asked to do it straight after saving.
            </p>
          )}
          <Field label="Sign out after inactivity (minutes)" htmlFor="s-session_idle_minutes" hint="Protects shared computers in the church office." error={err?.fieldError("session_idle_minutes")} className="max-w-xs">
            <Input {...num("session_idle_minutes")} min={5} max={720} required />
          </Field>
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>Save data protection settings</Button>
      </div>
    </form>
  );
}

const TABS = [
  { value: "church", label: "Church" },
  { value: "security", label: "Data protection & security" },
  { value: "campuses", label: "Campuses" },
  { value: "tags", label: "Tags" },
  { value: "positions", label: "Positions" },
  { value: "group-types", label: "Group types" },
];

const plural = (n: unknown, one: string, many: string) => (typeof n === "number" ? `${n} ${n === 1 ? one : many}` : null);

function SettingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab")! : "church";
  const { data, error } = useQuery({ queryKey: ["settings"], queryFn: () => api.get<ChurchSettings>("/settings/") });

  return (
    <div>
      <PageHeader title="Settings" description="Your church's details, data protection settings and the lists used across Samaritan." />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/admin/settings${v === "church" ? "" : `?tab=${v}`}`, { scroll: false })}>
        <TabsList items={TABS} className="mb-5" />
        <div className="max-w-4xl">
          <TabsContent value="church">
            {error ? <ErrorState error={error} /> : !data ? <Skeleton className="h-96" /> : <ChurchTab initial={data} key={data.name} />}
          </TabsContent>
          <TabsContent value="security">
            {error ? <ErrorState error={error} /> : !data ? <Skeleton className="h-96" /> : <SecurityTab initial={data} />}
          </TabsContent>
          <TabsContent value="campuses">
            <ListEditor
              title="Campuses"
              description="Sites or congregations that meet in different places. People, groups and events can belong to a campus."
              path="/campuses/"
              queryKey="campuses"
              noun="campus"
              fields={[
                { name: "name", label: "Name", required: true, width: "1fr" },
                { name: "address", label: "Address", width: "1.4fr" },
                { name: "is_active", label: "Active", type: "checkbox", width: "120px" },
              ]}
            />
          </TabsContent>
          <TabsContent value="tags">
            <ListEditor
              title="Tags"
              description="Labels for grouping people, such as Welcome team or Needs a lift."
              path="/tags/"
              queryKey="tags"
              noun="tag"
              count={(t) => plural(t.people_count, "person", "people")}
              fields={[
                { name: "name", label: "Name", required: true, width: "1fr" },
                { name: "color", label: "Colour", type: "color", width: "160px" },
              ]}
            />
          </TabsContent>
          <TabsContent value="positions">
            <ListEditor
              title="Positions"
              description="Roles people hold in church life, such as Elder, Treasurer or Worship leader."
              path="/positions/"
              queryKey="positions"
              noun="position"
              count={(t) => plural(t.people_count, "person", "people")}
              fields={[
                { name: "name", label: "Name", required: true, width: "1fr" },
                { name: "description", label: "Description", width: "1.6fr" },
              ]}
            />
          </TabsContent>
          <TabsContent value="group-types">
            <ListEditor
              title="Group types"
              description="Kinds of group, such as Home group, Youth or Ministry team."
              path="/group-types/"
              queryKey="group-types"
              noun="group type"
              count={(t) => plural(t.group_count, "group", "groups")}
              fields={[
                { name: "name", label: "Name", required: true, width: "1fr" },
                { name: "description", label: "Description", width: "1.4fr" },
                { name: "color", label: "Colour", type: "color", width: "140px" },
              ]}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <SettingsInner />
    </Suspense>
  );
}
