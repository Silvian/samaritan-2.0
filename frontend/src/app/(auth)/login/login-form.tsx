"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

type LoginResponse = { mfa_required: boolean; challenge?: string };

function safeNext(next: string | null) {
  // Only allow same-site relative paths (open-redirect protection)
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function LoginForm() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = () => {
    qc.clear();
    window.location.href = safeNext(params.get("next"));
  };

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<LoginResponse>("/auth/login/", { email, password });
      if (res.mfa_required && res.challenge) {
        setChallenge(res.challenge);
        setPassword("");
      } else done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/mfa/verify/", { challenge, code });
      done();
    } catch (err) {
      if (err instanceof ApiError && err.code === "challenge_expired") {
        setChallenge(null);
      }
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const notice = params.get("idle")
    ? "You were signed out after 30 minutes of inactivity."
    : params.get("expired")
      ? "Your session ended. Sign in again to continue."
      : null;

  if (challenge) {
    return (
      <form onSubmit={submitCode} className="space-y-5">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-text">Two-factor check</h2>
          <p className="mt-1.5 text-sm text-muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
        </div>
        <Field label="Code" htmlFor="code" error={error ?? undefined}>
          <Input
            id="code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-11 text-center text-lg tracking-[0.3em] tabular"
            maxLength={13}
            required
          />
        </Field>
        <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
          Verify and sign in
        </Button>
        <button type="button" className="text-sm text-muted hover:text-text" onClick={() => { setChallenge(null); setError(null); }}>
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-text">Sign in</h2>
        <p className="mt-1.5 text-sm text-muted">Use the email address your church office registered for you.</p>
      </div>
      {notice && <p className="rounded-md bg-gold-soft px-3 py-2 text-sm text-gold">{notice}</p>}
      {error && <p className="rounded-md bg-red-soft px-3 py-2 text-sm text-red" role="alert">{error}</p>}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={busy}>
        Sign in
      </Button>
      <Link href="/forgot-password" className="block text-sm text-primary hover:underline">
        Forgotten your password?
      </Link>
    </form>
  );
}
