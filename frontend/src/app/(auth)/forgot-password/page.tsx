"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/password/reset/", { email });
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-text">Reset your password</h2>
        <p className="mt-1.5 text-sm text-muted">We&apos;ll email you a link that works for one hour.</p>
      </div>
      {sent ? (
        <p className="rounded-md bg-green-soft px-3 py-2.5 text-sm text-green">
          If {email} is registered, a reset link is on its way. Check your inbox and spam folder.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
          </Field>
          <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
            Email me a reset link
          </Button>
        </form>
      )}
      <Link href="/login" className="block text-sm text-primary hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
