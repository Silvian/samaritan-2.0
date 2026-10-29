import { cn } from "@/lib/utils";

export function scorePassword(pw: string) {
  let s = 0;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const score = scorePassword(value);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colours = ["bg-red", "bg-red", "bg-gold", "bg-green", "bg-green"];
  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full", i < score ? colours[score] : "bg-border")} />
        ))}
      </div>
      <span className="text-xs text-muted w-16 text-right">{value.length < 12 ? labels[0] : labels[score]}</span>
    </div>
  );
}
