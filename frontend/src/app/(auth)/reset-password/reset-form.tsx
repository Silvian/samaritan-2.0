"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { PasswordStrength } from "@/components/password-strength";
import { api, ApiError } from "@/lib/api";

export function ResetForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/reset/confirm/", {
        uid: params.get("uid"),
        token: params.get("token"),
        new_password: password,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.fieldError("new_password") || err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="space-y-5">
        <h2 className="font-serif text-2xl font-semibold text-text">Password saved</h2>
        <p className="text-sm text-muted">Your other devices have been signed out. Sign in with your new password.</p>
        <Link href="/login" className="block text-sm text-primary hover:underline">Go to sign in</Link>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-text">Choose a new password</h2>
        <p className="mt-1.5 text-sm text-muted">At least 12 characters. A short sentence is easy to remember and hard to guess.</p>
      </div>
      {error && <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red" role="alert">{error}</p>}
      <Field label="New password" htmlFor="pw">
        <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} className="h-11" />
        <PasswordStrength value={password} />
      </Field>
      <Field label="Confirm new password" htmlFor="pw2">
        <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="h-11" />
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
        Save password
      </Button>
    </form>
  );
}
