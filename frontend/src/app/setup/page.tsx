"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MfaEnrol } from "@/components/mfa-enrol";
import { PasswordStrength } from "@/components/password-strength";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import type { Me } from "@/lib/types";

export default function SetupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, refetch } = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me/") });
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const needsPassword = me?.must_change_password;
  const needsMfa = me && me.mfa_required && !me.mfa_enabled;

  useEffect(() => {
    if (me && !needsPassword && !needsMfa) router.replace("/dashboard");
  }, [me, needsPassword, needsMfa, router]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(undefined);
    try {
      await api.post("/auth/password/change/", { current_password: current, new_password: pw });
      toast.success("Password changed");
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.fieldError("new_password") || e.fieldError("current_password") || e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-16">
      <Card className="w-full max-w-lg p-8">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Secure your account</h1>
        <p className="mt-1.5 text-sm text-muted">
          Samaritan holds sensitive information about your church family, so a couple of steps are needed before you continue.
        </p>
        <div className="mt-8">
          {!me ? null : needsPassword ? (
            <form onSubmit={changePassword} className="space-y-4">
              <h2 className="font-medium">Choose your own password</h2>
              <Field label="Temporary password" htmlFor="cur">
                <Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              </Field>
              <Field label="New password" htmlFor="new" error={err} hint="At least 12 characters">
                <Input id="new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
                <PasswordStrength value={pw} />
              </Field>
              <Button type="submit" loading={busy}>Save password</Button>
            </form>
          ) : needsMfa ? (
            <div className="space-y-4">
              <h2 className="font-medium">Turn on two-factor authentication</h2>
              <MfaEnrol onComplete={() => { qc.invalidateQueries({ queryKey: ["me"] }); router.replace("/dashboard"); }} />
            </div>
          ) : null}
        </div>
        <button className="mt-8 text-sm text-muted hover:text-text" onClick={() => api.post("/auth/logout/").finally(() => (window.location.href = "/login"))}>
          Sign out
        </button>
      </Card>
    </div>
  );
}
