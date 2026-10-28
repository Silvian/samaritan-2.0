# Frontend conventions (Samaritan 2.0)

Next.js 16 App Router + React 19 + Tailwind v4 + TanStack Query. Read `AGENTS.md` (Next 16 differs from older versions; docs in node_modules/next/dist/docs).

## Structure
- Authenticated pages live in `src/app/(app)/<route>/page.tsx` and are `"use client"` components. The `(app)/layout.tsx` already provides the shell, auth and `instant = false`. Do NOT export `instant` or `metadata` from client pages.
- Dynamic routes: use `useParams<{ id: string }>()` from `next/navigation`. If you use `useSearchParams`, wrap the component using it in `<Suspense>` (export a default page that renders `<Suspense><Inner/></Suspense>`).
- Data: `api.get/post/patch/delete` from `@/lib/api` (paths are relative to /api/v1 and MUST end with a trailing slash, e.g. `/people/`). Lists are paginated: `Paginated<T>` = {count,page,page_size,total_pages,results}. Some endpoints are unpaginated arrays (tags, positions, campuses, funds, roles, group-types, group-memberships).
- Use `useQuery` / `useMutation` from TanStack Query; invalidate the relevant query keys after mutations; show `toast.success("…")` / `toast.error(err.message)` from `sonner`.
- Permissions: `const { can, me } = useAuth()` from `@/lib/auth`; hide actions the user can't perform (`can("people.edit")`). The API enforces anyway.
- Errors: `<ErrorState error={error} />`; loading: `<TableSkeleton />` / `<Skeleton />`; empty: `<EmptyState title description action />` (from `@/components/ui/feedback`). `ApiError.fieldError(name)` gives per-field validation messages.

## Components (src/components/ui)
- `PageHeader` (title in serif, description, actions, back link), `Stat`, `DefinitionList` – page.tsx
- `Card`, `CardHeader`, `CardBody` – card.tsx
- `Button`, `LinkButton` (variants primary/secondary/ghost/danger/soft; sizes sm/md/lg/icon; `loading`) – button.tsx
- `Input`, `Textarea`, `Select`, `Checkbox`, `Field` (label/error/hint wrapper) – form.tsx
- `Badge` (tones neutral/violet/green/gold/red/blue), `StatusBadge status=…`, `tagTone(color)` – badge.tsx
- `Avatar name=…` – avatar.tsx; `Dialog open onOpenChange title description footer size` – dialog.tsx
- `Tabs`, `TabsList items=[{value,label,count}]`, `TabsContent` – tabs.tsx; `Menu*` dropdown – menu.tsx
- `Table, THead, TH, TR, TD` – table.tsx; `Pagination` – feedback.tsx
- Charts: `TrendChart`, `ColumnChart`, `BarList`, `Legend` in `src/components/charts/charts.tsx`. At most 4 series, fixed colour order. Read dashboard/page.tsx for usage.
- Formatting: `fmtDate, fmtDateTime, fmtMoney, fmtNumber, fromNow, MONTHS` in `@/lib/format`. `cn()` in `@/lib/utils`.
- Shared types in `@/lib/types` (Person, Group, EventItem, Donation, CareRecord, Message, DataRequest, User, Role, AuditEntry, ChurchSettings…).

## Visual rules
- Colour tokens only (bg-surface, text-muted, border-border, bg-primary, text-green, bg-gold-soft …). Never raw hex.
- Page titles come from PageHeader (serif). Section titles are CardHeader titles (sans, 15px semibold).
- Sentence case everywhere. No ALL CAPS labels, no eyebrow labels above headings, no "→" arrows in buttons, no " · " joined meta strings (use commas).
- Copy: plain, user-facing language. Buttons say exactly what they do ("Save person", "Record donation"); toasts mirror them ("Person saved").
- Tables: wrap in a Card; first column is the primary link (text-text hover:text-primary font-medium). Use tabular numbers (`tabular`) for figures.
- Forms: two-column grid on desktop (`grid sm:grid-cols-2 gap-4`), one column on mobile. Put forms in Cards or Dialogs.
- Keep it responsive down to 375px wide.

## Quality gate
- `npx tsc --noEmit` and `npx eslint src` must pass for your files.
- Dev server runs at http://localhost:3000 (Django at :8000). Demo login: admin@example.org / Samaritan-Demo-2026!
