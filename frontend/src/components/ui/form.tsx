import { forwardRef, useId } from "react";

import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-subtle " +
  "focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary disabled:opacity-60 aria-[invalid=true]:border-red";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, "h-9 pr-8 appearance-none bg-no-repeat bg-[right_0.6rem_center] bg-[length:12px]", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23888' stroke-width='1.5'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E\")" }}
      {...props}>
      {children}
    </select>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode; hint?: string }>(
  function Checkbox({ label, hint, className, id, ...props }, ref) {
    const autoId = useId();
    const cid = id ?? autoId;
    return (
      <label htmlFor={cid} className={cn("flex items-start gap-2.5 text-sm cursor-pointer", className)}>
        <input ref={ref} id={cid} type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-[var(--primary)]" {...props} />
        <span>
          <span className="text-text">{label}</span>
          {hint && <span className="block text-xs text-muted mt-0.5">{hint}</span>}
        </span>
      </label>
    );
  },
);

export function Field({
  label,
  error,
  hint,
  children,
  className,
  required,
  htmlFor,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-text">
          {label}
          {required && <span className="text-red ml-0.5" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
