# Samaritan 2.0

Next-generation church management: people and households, groups, services and check-in, giving and Gift Aid, pastoral care, email with consent checks, and GDPR tooling. It is built to hold sensitive personal data safely.

| Layer | Technology |
|---|---|
| API | Django 5.2 LTS, Django REST Framework, drf-spectacular (OpenAPI) |
| Database | PostgreSQL 16 |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, TanStack Query, Recharts, Radix UI |
| Auth | JWT in httpOnly cookies, CSRF double-submit, TOTP two-factor, Argon2, django-axes lockout |
| Deployment | Docker Compose (db + api + web), GitHub Actions CI |

The backend and frontend are fully decoupled. The frontend only talks to the versioned REST API (`/api/v1/`), which can serve any other client, such as a mobile app or an integration, using Bearer tokens.

```
samaritan-2.0/
├── backend/               Django REST API
│   ├── config/            settings (base / development / test / production), urls
│   ├── apps/
│   │   ├── core/          church settings, campuses, audit log, encrypted fields, management commands
│   │   ├── accounts/      users, roles & permissions (RBAC), login, MFA, password reset
│   │   ├── people/        people, households, tags, positions, milestones
│   │   ├── groups/        groups, group types, memberships (leaders see only their groups)
│   │   ├── events/        services & events, attendance, child check-in with pick-up codes
│   │   ├── giving/        funds, donations, Gift Aid declarations & claims, statements
│   │   ├── pastoral/      pastoral care records & notes (encrypted, confidential flag)
│   │   ├── communications/ email messages to audiences, filtered by consent
│   │   ├── privacy/       consent ledger, data subject requests, export (SAR) & erasure
│   │   └── dashboard/     aggregated statistics, permission-aware
│   └── tests/             pytest suite (auth, RBAC, GDPR, modules)
├── frontend/              Next.js app
│   └── src/
│       ├── app/(auth)/    sign in, two-factor step, password reset
│       ├── app/(app)/     dashboard and every module
│       ├── components/    UI kit, charts, shell, module components
│       └── lib/           API client, auth context, types, formatting
├── docs/SECURITY.md       security & GDPR controls
└── docker-compose.yml
```

## Features

| Module | What it covers |
|---|---|
| Dashboard | Greeting, headline stats with trends, Sunday attendance (12 weeks), giving by month, needs-attention list, upcoming events, birthdays, growth and age profile. Every section respects the viewer's role |
| People | Searchable, filterable directory, bulk tagging, CSV export (formula-injection safe), full profiles with household, groups, milestones, attendance, giving, care, consent and record history |
| Households | Family units with shared address and member roles |
| Groups | Small groups, ministry teams, classes, youth; leaders and capacity |
| Events & attendance | Services and meetings, weekly repeat, headcounts, tablet-friendly check-in, child pick-up security codes |
| Giving | Funds, donations, year-on-year analysis, UK Gift Aid declarations (with 4-year backdating), claimable list and claim marking, printable annual statements |
| Pastoral care | Visits, calls, prayer requests; encrypted details, confidential records, follow-ups, assignment, notes timeline |
| Messages | Email composer with audience builder and merge fields; only consenting people are emailed |
| Privacy & GDPR | Consent coverage, data subject requests with one-month deadline tracking, subject access export, erasure, retention policy |
| Administration | Users (invite, deactivate, reset 2FA, revoke sessions), editable roles from a permission catalogue, audit log viewer, church and security settings, lookups |

## Running locally (development)

Prerequisites: Python 3.12+, Node 22+, PostgreSQL 16.

```bash
# 1. Database
createdb samaritan

# 2. API
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # adjust DATABASE_URL if needed
python manage.py migrate
python manage.py seed_demo      # fictitious demo church (optional)
python manage.py runserver      # http://localhost:8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:3000
```

Demo logins created by `seed_demo` (password `Samaritan-Demo-2026!`): `admin@`, `pastor@`, `office@`, `finance@`, `leader@` and `readonly@example.org`. Each one shows a different role. The demo turns two-factor enforcement off so you can click around; turn it back on in Settings.

API documentation (Swagger UI) is available in development at http://localhost:8000/api/v1/docs/.

## Running with Docker

```bash
cp .env.example .env    # fill in DJANGO_SECRET_KEY, FIELD_ENCRYPTION_KEYS, POSTGRES_PASSWORD, ADMIN_*
docker compose up --build
```

Open http://localhost:3000 and sign in as `ADMIN_EMAIL`. You'll be asked to choose a new password and set up two-factor authentication. Only the web container is published; the API and database sit on internal networks.

For production, put an HTTPS reverse proxy (Caddy, nginx, a load balancer) in front of the `web` service, set `AUTH_COOKIE_SECURE=true`, `SECURE_SSL_REDIRECT=true`, your real domain in `FRONTEND_URL` / `DJANGO_ALLOWED_HOSTS`, and an SMTP server. Schedule `python manage.py apply_retention` daily.

## Tests and checks

```bash
cd backend && pytest            # 58 tests against PostgreSQL
cd backend && ruff check .
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

CI runs all of these on every push and pull request (`.github/workflows/ci.yml`).

## Management commands

| Command | Purpose |
|---|---|
| `bootstrap` | Idempotent setup: default roles, group types, funds, positions; creates the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `seed_demo [--flush]` | Fictitious demo data. Refuses to run with production settings |
| `apply_retention [--dry-run]` | Anonymises people archived longer than the retention period |
| `rotate_encryption_keys` | Re-encrypts sensitive fields after adding a new key |

## Security and GDPR

See [docs/SECURITY.md](docs/SECURITY.md) for the full list of controls and how they map to UK GDPR.

## Licence

GNU General Public Licence v3, as with the original [Samaritan](https://github.com/Silvian/samaritan).
