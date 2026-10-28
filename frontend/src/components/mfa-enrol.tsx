"use client";

import { Check, Copy, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";

export function RecoveryCodes({ codes, onDone, doneLabel = "I've saved these codes" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Each code works once if you lose your phone. Store them somewhere safe, like a password manager. You won&apos;t see them again.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-2 p-4 font-mono text-sm tabular">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(text); setSaved(true); toast.success("Codes copied"); }}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        <Button variant="secondary" size="sm" onClick={() => {
          const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
          const a = document.createElement("a");
          a.href = url; a.download = "samaritan-recovery-codes.txt"; a.click();
          URL.revokeObjectURL(url); setSaved(true);
        }}>
          <Download className="h-3.5 w-3.5" /> Download
        </Button>
      </div>
      <Button onClick={onDone} disabled={!saved}>
        <Check className="h-4 w-4" /> {doneLabel}
      </Button>
    </div>
  );
}

export function MfaEnrol({ onComplete }: { onComplete: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      setSetup(await api.post("/auth/mfa/setup/"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.post<{ recovery_codes: string[] }>("/auth/mfa/enable/", { code });
      setCodes(res.recovery_codes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't verify the code");
    } finally {
      setBusy(false);
    }
  }

  if (codes) return <RecoveryCodes codes={codes} onDone={onComplete} />;

  if (!setup)
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          You&apos;ll need an authenticator app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy.
        </p>
        <Button onClick={start} loading={busy}>Set up two-factor authentication</Button>
      </div>
    );

  return (
    <form onSubmit={confirm} className="space-y-5">
      <ol className="space-y-5 text-sm">
        <li>
          <p className="font-medium text-text">1. Scan this QR code with your authenticator app</p>
          <div className="mt-3 inline-block rounded-lg border border-border bg-white p-3">
            <QRCodeSVG value={setup.otpauth_uri} size={168} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Can&apos;t scan? Enter this key instead: <code className="select-all rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text">{setup.secret}</code>
          </p>
        </li>
        <li>
          <p className="font-medium text-text">2. Enter the 6-digit code it shows</p>
          <Field error={error} className="mt-2 max-w-48">
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              className="h-11 text-center text-lg tracking-[0.3em] tabular" required aria-label="Authentication code" />
          </Field>
        </li>
      </ol>
      <Button type="submit" loading={busy}>Turn on two-factor</Button>
    </form>
  );
}
