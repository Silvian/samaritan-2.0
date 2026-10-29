"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, LogOut, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { MfaEnrol, RecoveryCodes } from "@/components/mfa-enrol";
import { PasswordStrength } from "@/components/password-strength";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import type { Me } from "@/lib/types";

function ProfileCard({ me }: { me: Me }) {
  const { refetch } = useAuth();
  const [first, setFirst] = useState(me.first_name);
  const [last, setLast] = useState(me.last_name);
  const save = useMutation({
    mutationFn: () => api.patch<Me>("/auth/me/", { first_name: first, last_name: last }),
    onSuccess: () => { toast.success("Profile saved"); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const dirty = first !== me.first_name || last !== me.last_name;
  return (
    <Card>
      <CardHeader title="Profile" />
      <CardBody>
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={me.full_name || me.email} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-medium">{me.full_name || me.email}</p>
            <p className="truncate text-sm text-muted">{me.email}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {me.is_superuser ? <Badge tone="violet">Superuser</Badge> : me.role ? <Badge tone="violet">{me.role.name}</Badge> : <Badge>No role</Badge>}
            </div>
          </div>
        </div>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="a-first" required error={err?.fieldError("first_name")}>
              <Input id="a-first" value={first} onChange={(e) => setFirst(e.target.value)} required autoComplete="given-name" />
            </Field>
            <Field label="Last name" htmlFor="a-last" required error={err?.fieldError("last_name")}>
              <Input id="a-last" value={last} onChange={(e) => setLast(e.target.value)} required autoComplete="family-name" />
            </Field>
          </div>
          <p className="text-xs text-muted">To change your email address or role, ask an administrator.</p>
          <Button type="submit" loading={save.isPending} disabled={!dirty}>Save profile</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const { refetch } = useAuth();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const save = useMutation({
    mutationFn: () => api.post("/auth/password/change/", { current_password: current, new_password: pw }),
    onSuccess: () => {
      toast.success("Password changed. Your other devices have been signed out.");
      setCurrent(""); setPw(""); setConfirm("");
      refetch();
    },
    onError: (e: Error) => { if (!(e instanceof ApiError && e.errors)) toast.error(e.message); },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const mismatch = confirm.length > 0 && confirm !== pw;
  return (
    <Card>
      <CardHeader title="Password" description="Changing your password signs you out on every other device." />
      <CardBody>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch) save.mutate(); }}>
          <input type="text" autoComplete="username" className="hidden" readOnly aria-hidden tabIndex={-1} />
          <Field label="Current password" htmlFor="pw-cur" required error={err?.fieldError("current_password")}>
            <Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="pw-new" required error={err?.fieldError("new_password")} hint="At least 12 characters. A short phrase is easier to remember.">
              <Input id="pw-new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={12} />
              <PasswordStrength value={pw} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-confirm" required error={mismatch ? "The passwords don't match." : undefined}>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-invalid={mismatch || undefined} />
            </Field>
          </div>
          <Button type="submit" loading={save.isPending} disabled={!current || !pw || mismatch}>Change password</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function CodeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.trim())}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={20}
      className="h-11 max-w-48 text-center text-lg tracking-[0.3em] tabular"
      required
    />
  );
}

function RegenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { refetch } = useAuth();
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const gen = useMutation({
    mutationFn: () => api.post<{ recovery_codes: string[] }>("/auth/mfa/recovery-codes/", { code }),
    onSuccess: (r) => { setCodes(r.recovery_codes); setCode(""); refetch(); },
  });
  const close = () => { onOpenChange(false); setCodes(null); setCode(""); gen.reset(); };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title={codes ? "Your new recovery codes" : "Get new recovery codes"}
      description={codes ? undefined : "Your old recovery codes will stop working. Enter a code from your authenticator app to continue."}
      size="sm"
    >
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => { toast.success("New recovery codes saved"); close(); }} />
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); gen.mutate(); }}>
          <Field label="Authentication code" htmlFor="rc-code" error={gen.error?.message}>
            <CodeInput id="rc-code" value={code} onChange={setCode} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" loading={gen.isPending}>Get new codes</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function DisableDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { refetch } = useAuth();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const off = useMutation({
    mutationFn: () => api.post("/auth/mfa/disable/", { password, code }),
    onSuccess: () => { toast.success("Two-factor authentication turned off"); onOpenChange(false); setPassword(""); setCode(""); refetch(); },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { off.reset(); setPassword(""); setCode(""); } }}
      title="Turn off two-factor authentication"
      description="Your account will be protected by your password alone. Confirm with your password and a code from your authenticator app."
      size="sm"
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); off.mutate(); }}>
        {off.error && <p className="text-[13px] text-red" role="alert">{off.error.message}</p>}
        <Field label="Password" htmlFor="d-pw">
          <Input id="d-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Authentication code" htmlFor="d-code">
          <CodeInput id="d-code" value={code} onChange={setCode} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="danger" loading={off.isPending}>Turn off two-factor</Button>
        </div>
      </form>
    </Dialog>
  );
}

function TwoFactorCard({ me }: { me: Me }) {
  const { refetch } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [regen, setRegen] = useState(false);
  const [disable, setDisable] = useState(false);
  const low = me.recovery_codes_remaining <= 3;

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        description="A code from your phone as well as your password, so a stolen password isn't enough to get in."
        action={me.mfa_enabled ? <Badge tone="green"><ShieldCheck className="h-3 w-3" /> On</Badge> : <Badge tone="gold">Off</Badge>}
      />
      <CardBody>
        {!me.mfa_enabled ? (
          enrolling ? (
            <MfaEnrol onComplete={() => { setEnrolling(false); toast.success("Two-factor authentication is on"); refetch(); }} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Samaritan holds sensitive details about people in your church. We strongly recommend turning this on.
              </p>
              <Button onClick={() => setEnrolling(true)}><ShieldCheck className="h-4 w-4" /> Set up two-factor</Button>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${low ? "border-gold/30 bg-gold-soft" : "border-border bg-surface-2"}`}>
              {low ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green" />}
              <p>
                <span className="font-semibold tabular">{me.recovery_codes_remaining}</span> recovery {me.recovery_codes_remaining === 1 ? "code" : "codes"} left.{" "}
                {low ? "Get a new set so you can still sign in if you lose your phone." : "Use one if you ever lose access to your authenticator app."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setRegen(true)}><RefreshCw className="h-4 w-4" /> Get new recovery codes</Button>
              <span title={me.mfa_required ? "Your church requires two-factor authentication for everyone" : undefined}>
                <Button variant="ghost" className="text-red hover:text-red" disabled={me.mfa_required} onClick={() => setDisable(true)}>
                  <ShieldOff className="h-4 w-4" /> Turn off two-factor
                </Button>
              </span>
            </div>
            {me.mfa_required && (
              <p className="text-xs text-muted">Your church requires two-factor authentication for every user, so it can&apos;t be turned off. If you&apos;ve lost your phone, ask an administrator to reset it.</p>
            )}
          </div>
        )}
      </CardBody>
      <RegenerateDialog open={regen} onOpenChange={setRegen} />
      <DisableDialog open={disable} onOpenChange={setDisable} />
    </Card>
  );
}

function SessionsCard({ me }: { me: Me }) {
  const { logout } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title="Devices" description={me.last_login ? `Last signed in ${fmtDateTime(me.last_login)}.` : undefined} />
      <CardBody className="space-y-3">
        <p className="text-sm text-muted">
          Left yourself signed in on a shared or lost device? Sign out everywhere, including this browser. You&apos;ll need to sign in again.
        </p>
        <Button variant="secondary" onClick={() => setConfirm(true)}><LogOut className="h-4 w-4" /> Sign out of all devices</Button>
      </CardBody>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sign out of all devices"
        description="Every session, including this one, will end straight away."
        confirmLabel="Sign out everywhere"
        loading={busy}
        onConfirm={async () => { setBusy(true); await logout(true); }}
      />
    </Card>
  );
}

export default function AccountPage() {
  const { me } = useAuth();
  return (
    <div>
      <PageHeader title="Your account" description="Your details, password and how you sign in." />
      {!me ? (
        <Skeleton className="h-96 max-w-4xl" />
      ) : (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <ProfileCard me={me} />
            <SessionsCard me={me} />
          </div>
          <div className="space-y-6">
            <TwoFactorCard me={me} />
            <PasswordCard />
          </div>
        </div>
      )}
    </div>
  );
}
