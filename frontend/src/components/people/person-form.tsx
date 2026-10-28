"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, ApiError, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounced } from "@/lib/hooks";
import { type Campus, type Household, type Person, PERSON_STATUSES, type Position, type Tag } from "@/lib/types";
import { cn } from "@/lib/utils";

type FormState = Record<string, string>;

const TEXT_FIELDS = [
  "title", "first_name", "preferred_name", "last_name", "gender", "date_of_birth", "marital_status", "anniversary",
  "email", "phone_mobile", "phone_home", "address_line1", "address_line2", "city", "region", "postcode", "country",
  "occupation", "employer", "household_role", "status", "membership_date", "first_visit_date", "how_heard", "notes",
  "medical_notes", "confidential_notes", "emergency_contact_name", "emergency_contact_phone",
] as const;
const DATE_FIELDS = new Set(["date_of_birth", "anniversary", "membership_date", "first_visit_date"]);

function initialState(p?: Person): FormState {
  const s: FormState = {};
  for (const f of TEXT_FIELDS) {
    const v = p ? (p as unknown as Record<string, unknown>)[f] : undefined;
    s[f] = v == null ? "" : String(v);
  }
  if (!p) {
    s.status = "visitor";
    s.country = "United Kingdom";
    s.first_visit_date = new Date().toISOString().slice(0, 10);
  }
  return s;
}

function Section({ title, description, children, icon }: { title: string; description?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2">{icon}{title}</span>} description={description} />
      <CardBody className="grid gap-4 sm:grid-cols-2">{children}</CardBody>
    </Card>
  );
}

export function PersonForm({ person }: { person?: Person }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useAuth();
  const sensitive = person ? person.can_view_sensitive : can("people.view_sensitive");
  const [f, setF] = useState<FormState>(() => initialState(person));
  const [tagIds, setTagIds] = useState<string[]>(person?.tags.map((t) => t.id) ?? []);
  const [positionIds, setPositionIds] = useState<string[]>(person?.positions.map((p) => p.id) ?? []);
  const [campusId, setCampusId] = useState(person?.campus?.id ?? "");
  const [household, setHousehold] = useState<{ id: string; name: string } | null>(person?.household ?? null);
  const [newHousehold, setNewHousehold] = useState(false);
  const [hhSearch, setHhSearch] = useState("");
  const hhTerm = useDebounced(hhSearch, 200);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api.get<Tag[]>("/tags/") });
  const positions = useQuery({ queryKey: ["positions"], queryFn: () => api.get<Position[]>("/positions/") });
  const campuses = useQuery({ queryKey: ["campuses"], queryFn: () => api.get<Campus[]>("/campuses/") });
  const households = useQuery({
    queryKey: ["households", "search", hhTerm],
    queryFn: () => api.get<Paginated<Household>>("/households/", { search: hhTerm, page_size: 6 }),
    enabled: hhTerm.length >= 2,
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      let householdId = household?.id ?? null;
      if (newHousehold) {
        const hh = await api.post<Household>("/households/", {
          name: `${f.last_name} household`,
          address_line1: f.address_line1, address_line2: f.address_line2, city: f.city,
          region: f.region, postcode: f.postcode, country: f.country, campus_id: campusId || null,
        });
        householdId = hh.id;
      }
      const body: Record<string, unknown> = {};
      for (const k of TEXT_FIELDS) {
        if (!sensitive && (k === "medical_notes" || k === "confidential_notes")) continue;
        body[k] = DATE_FIELDS.has(k) ? f[k] || null : f[k];
      }
      Object.assign(body, {
        tag_ids: tagIds, position_ids: positionIds, campus_id: campusId || null, household_id: householdId,
      });
      return person ? api.patch<Person>(`/people/${person.id}/`, body) : api.post<Person>("/people/", body);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["people"] });
      qc.invalidateQueries({ queryKey: ["person", saved.id] });
      toast.success(person ? "Changes saved" : "Person added");
      router.push(`/people/${saved.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.errors) {
        const e: Record<string, string> = {};
        for (const k of Object.keys(err.errors)) e[k] = err.fieldError(k) ?? "";
        setErrors(e);
      }
      toast.error(err instanceof ApiError ? err.message : "Couldn't save");
    },
  });

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} htmlFor={k} error={errors[k]} required={props.required}>
      <Input id={k} value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} {...props} />
    </Field>
  );

  return (
    <form
      className="space-y-6 max-w-4xl"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        save.mutate();
      }}
    >
      <Section title="Personal details">
        <div className="grid grid-cols-[96px_1fr] gap-3 sm:col-span-2">
          <Field label="Title" htmlFor="title">
            <Input id="title" value={f.title} onChange={set("title")} placeholder="Mrs" />
          </Field>
          {field("first_name", "First name", { required: true, autoFocus: !person })}
        </div>
        {field("last_name", "Last name", { required: true })}
        {field("preferred_name", "Preferred name")}
        {field("date_of_birth", "Date of birth", { type: "date" })}
        <Field label="Gender" htmlFor="gender">
          <Select id="gender" value={f.gender} onChange={set("gender")}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
        <Field label="Marital status" htmlFor="marital_status">
          <Select id="marital_status" value={f.marital_status} onChange={set("marital_status")}>
            <option value="">Not specified</option>
            {["single", "married", "widowed", "divorced", "separated"].map((m) => (
              <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>
            ))}
          </Select>
        </Field>
        {field("anniversary", "Wedding anniversary", { type: "date" })}
        {field("occupation", "Occupation")}
      </Section>

      <Section title="Contact and address">
        {field("email", "Email", { type: "email" })}
        {field("phone_mobile", "Mobile", { type: "tel" })}
        {field("phone_home", "Home phone", { type: "tel" })}
        <div className="hidden sm:block" />
        {field("address_line1", "Address line 1")}
        {field("address_line2", "Address line 2")}
        {field("city", "Town or city")}
        {field("region", "County")}
        {field("postcode", "Postcode")}
        {field("country", "Country")}
      </Section>

      <Section title="Household" description="People in the same household share an address and appear together on giving statements and check-in.">
        <div className="sm:col-span-2 space-y-3">
          {household && !newHousehold ? (
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm font-medium">{household.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setHousehold(null)}>Change</Button>
            </div>
          ) : newHousehold ? (
            <div className="flex items-center justify-between rounded-md border border-dashed border-border-strong px-3 py-2">
              <span className="text-sm">A new household, “{f.last_name || "Surname"} household”, will be created with this address.</span>
              <Button variant="ghost" size="sm" onClick={() => setNewHousehold(false)}>Undo</Button>
            </div>
          ) : (
            <>
              <Input placeholder="Search households by name or postcode" value={hhSearch} onChange={(e) => setHhSearch(e.target.value)} aria-label="Search households" />
              {households.data && (
                <ul className="rounded-md border border-border divide-y divide-border">
                  {households.data.results.map((h) => (
                    <li key={h.id}>
                      <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => setHousehold({ id: h.id, name: h.name })}>
                        <span>{h.name}</span>
                        <span className="text-muted">{h.postcode}, {h.member_count} people</span>
                      </button>
                    </li>
                  ))}
                  {households.data.results.length === 0 && <li className="px-3 py-2 text-sm text-muted">No households match.</li>}
                </ul>
              )}
              <Button variant="soft" size="sm" onClick={() => setNewHousehold(true)}>Create a new household</Button>
            </>
          )}
        </div>
        {(household || newHousehold) && (
          <Field label="Role in household" htmlFor="household_role">
            <Select id="household_role" value={f.household_role} onChange={set("household_role")}>
              <option value="">Not specified</option>
              <option value="head">Head</option>
              <option value="spouse">Spouse / partner</option>
              <option value="child">Child</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        )}
      </Section>

      <Section title="Church life">
        <Field label="Status" htmlFor="status">
          <Select id="status" value={f.status} onChange={set("status")}>
            {PERSON_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Campus" htmlFor="campus">
          <Select id="campus" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
            <option value="">None</option>
            {campuses.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        {field("first_visit_date", "First visit", { type: "date" })}
        {field("membership_date", "Member since", { type: "date" })}
        {field("how_heard", "How they heard about us")}
        <div className="sm:col-span-2 space-y-2">
          <p className="text-[13px] font-medium">Tags</p>
          <div className="flex flex-wrap gap-2">
            {tags.data?.map((t) => (
              <button type="button" key={t.id} onClick={() => toggle(tagIds, setTagIds, t.id)} aria-pressed={tagIds.includes(t.id)}
                className={cn("rounded-full border px-3 py-1 text-[13px]", tagIds.includes(t.id) ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-text")}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2 space-y-2">
          <p className="text-[13px] font-medium">Positions held</p>
          <div className="flex flex-wrap gap-2">
            {positions.data?.map((p) => (
              <button type="button" key={p.id} onClick={() => toggle(positionIds, setPositionIds, p.id)} aria-pressed={positionIds.includes(p.id)}
                className={cn("rounded-full border px-3 py-1 text-[13px]", positionIds.includes(p.id) ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-text")}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2" hint="Visible to everyone who can see this person. Keep confidential matters in pastoral care.">
          <Textarea id="notes" value={f.notes} onChange={set("notes")} />
        </Field>
      </Section>

      <Section
        title="Emergency and medical"
        icon={<Lock className="h-4 w-4 text-gold" />}
        description={sensitive ? "Medical and confidential notes are encrypted and only visible to people with sensitive-data access." : "You can record an emergency contact. Medical and confidential notes need sensitive-data access."}
      >
        {field("emergency_contact_name", "Emergency contact")}
        {field("emergency_contact_phone", "Emergency contact phone", { type: "tel" })}
        {sensitive && (
          <>
            <Field label="Medical notes and allergies" htmlFor="medical_notes" className="sm:col-span-2" hint="Shown at children's check-in.">
              <Textarea id="medical_notes" value={f.medical_notes} onChange={set("medical_notes")} />
            </Field>
            <Field label="Confidential notes" htmlFor="confidential_notes" className="sm:col-span-2">
              <Textarea id="confidential_notes" value={f.confidential_notes} onChange={set("confidential_notes")} />
            </Field>
          </>
        )}
      </Section>

      {!person && (
        <Card className="p-5">
          <Checkbox label="I have told this person how we will use their data" hint="Point them to the church's privacy notice. Record any consents on their profile after saving." required />
        </Card>
      )}

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{person ? "Save changes" : "Add person"}</Button>
      </div>
    </form>
  );
}
