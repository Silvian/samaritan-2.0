# Security and data protection

Samaritan holds personal data, and much of it is special category data under UK GDPR Article 9: religious belief is implied by church membership, and health information appears in medical and pastoral notes. Children's data is also present. This document lists the technical controls in the codebase and how they support the church's obligations as data controller. It is not legal advice; each church remains responsible for its own privacy notice, lawful bases, records of processing and DPIA.

## Authentication

| Control | Implementation |
|---|---|
| Password storage | Argon2id (`PASSWORD_HASHERS`), minimum 12 characters, common/numeric/similarity validators |
| Brute-force protection | django-axes locks a user + IP pair after 5 failures for 30 minutes; scoped DRF throttles on auth endpoints (`auth`, `sensitive`) |
| No user enumeration | Identical errors for unknown email and wrong password; password reset always returns the same message |
| Two-factor authentication | TOTP (RFC 6238) with replay protection (a time-step can't be reused), 10 single-use hashed recovery codes, lockout after 5 wrong codes. Churches can require it for everyone (`require_mfa`, on by default); the API then refuses every endpoint until the user enrols |
| Two-step login | After the password, the server returns a signed, 5-minute challenge. No session exists until the second factor succeeds |
| Session tokens | Short-lived JWT access tokens (15 min) and rotating refresh tokens (12 h) with blacklisting on rotation and logout |
| Token storage | `httpOnly`, `Secure`, `SameSite=Lax` cookies. Tokens are never exposed to JavaScript, which removes the XSS token-theft class. The refresh cookie is scoped to `/api/v1/auth/` |
| CSRF | Cookie-authenticated unsafe requests require the double-submit `X-CSRFToken` header; the API only parses JSON, so cross-site form posts (login CSRF) are rejected |
| Immediate revocation | Every token carries the user's `token_version`. Changing a password, "sign out everywhere", an admin revocation or deactivation invalidates all tokens at once |
| Idle timeout | The web app signs out after 30 minutes without activity |
| Temporary passwords | Admin-created accounts get an invitation link (no password is ever emailed); `must_change_password` blocks the API until changed |

## Authorisation

* **Role-based access control.** Roles are bundles of capability codes, such as `people.view`, `people.view_sensitive`, `giving.manage` or `privacy.manage`, defined in `apps/accounts/rbac.py`. Six default roles are seeded; administrators can create their own.
* **Fail closed.** Every view declares a `permission_map`. An action without an entry is denied (superusers aside).
* **No privilege escalation.** Users can't create roles, or assign a role, containing permissions they don't hold themselves, and can't change their own role or deactivate themselves.
* **Row-level scoping.** Group leaders only see people, groups and events for the groups they lead. Confidential care records are only visible to their author, their assignee and holders of `pastoral.view_confidential`.
* **Field-level gating.** Medical and confidential notes are removed from API responses, and rejected on write, without `people.view_sensitive`.
* **Defence in depth.** The UI hides what a role can't do, but the API enforces everything independently.
* **Non-enumerable identifiers.** UUID primary keys on every personal-data model.

## Data protection (UK GDPR)

| Principle / right | How Samaritan supports it |
|---|---|
| Security (Art. 32) | Medical notes, confidential notes, pastoral care details and notes, and MFA secrets are encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256) using keys outside the database, with rotation (`rotate_encryption_keys`). TLS in transit via your HTTPS proxy, HSTS in production. |
| Accountability (Art. 5(2)) | An append-only audit log records sign-ins, failed sign-ins, every create/update/delete with a field-level diff, every view of a person or care record, exports, erasures and messages sent. Special-category values never enter the log, only a keyed fingerprint showing that they changed. Entries can't be edited or deleted, even in Django admin. |
| Consent (Art. 7) | An append-only consent ledger per purpose (email, SMS, post, photos, directory) records method, evidence, who recorded it and whether a guardian gave it. The latest entry wins; history is kept as proof. |
| Direct marketing (PECR) | Messages are only sent to people whose latest email consent is "granted". Everyone else is skipped and listed on the message. Every email carries an opt-out footer. |
| Right of access & portability (Arts. 15, 20) | One-click JSON export of everything held about a person, including care records, giving, attendance and consents. The export is logged. |
| Right to erasure (Art. 17) | Irreversible anonymisation that keeps non-identifying aggregates (attendance counts, donation totals). It's blocked with an explanation, and needs explicit confirmation, when Gift Aid records must be kept for HMRC (Art. 17(3)(b) legal obligation). |
| Request handling | Data subject requests are tracked with the statutory one-month deadline, identity verification status, and overdue alerts on the dashboard. |
| Storage limitation (Art. 5(1)(e)) | Configurable retention periods; `apply_retention` anonymises people archived longer than the inactive retention period. |
| Data minimisation | Only names are required; sensitive fields sit in clearly marked sections; CSV exports exclude special-category data. |
| Children | Ages are computed; guardian-given consent is recorded; child check-in uses random pick-up codes needed at check-out. |

## Application hardening

* Security headers: a strict CSP and `frame-ancestors 'none'` on both apps, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and COOP. API responses send `Cache-Control: no-store` so personal data isn't cached.
* CSV exports neutralise spreadsheet formula injection (CWE-1236).
* Open-redirect protection on the post-login `next` parameter.
* Production settings refuse to start without a strong `SECRET_KEY` and encryption keys; `DEBUG` is off; Swagger docs and the Django admin path are configurable or disabled.
* Containers run as non-root users; only the web container is published; the database is on an internal network.
* `X-Forwarded-For` is only trusted for the configured number of proxies, taking the right-most trusted hop.

## Operational checklist

1. Generate fresh `DJANGO_SECRET_KEY` and `FIELD_ENCRYPTION_KEYS`, and store them in a secrets manager. **Losing the encryption keys means losing the encrypted data.**
2. Serve only over HTTPS; set `AUTH_COOKIE_SECURE=true` and `SECURE_SSL_REDIRECT=true`.
3. Keep "Require two-factor authentication" switched on.
4. Back up PostgreSQL (encrypted, access-controlled) and test restores.
5. Run `apply_retention` daily and review the Privacy page weekly.
6. Fill in the data controller, DPO contact and privacy notice URL in Settings.
7. Give each person the narrowest role they need; review users quarterly.
