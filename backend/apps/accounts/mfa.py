"""TOTP two-factor helpers with replay protection and recovery codes."""

import secrets
from datetime import timedelta

import pyotp
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.utils import timezone

CHALLENGE_SALT = "samaritan.mfa.challenge"
MAX_FAILURES = 5
LOCK_MINUTES = 15


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(user, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=settings.MFA_ISSUER)


def verify_totp(secret: str, code: str, last_step: int | None) -> int | None:
    """Return the matched time-step, or None. Rejects re-use of a step."""
    code = (code or "").strip().replace(" ", "")
    if not (code.isdigit() and len(code) == 6):
        return None
    totp = pyotp.TOTP(secret)
    now = timezone.now()
    for offset in (-1, 0, 1):
        at = now + timedelta(seconds=30 * offset)
        step = totp.timecode(at)
        if last_step is not None and step <= last_step:
            continue
        if secrets.compare_digest(totp.at(at), code):
            return step
    return None


def generate_recovery_codes(n: int = 10) -> tuple[list[str], list[str]]:
    plain = [f"{secrets.token_hex(3)}-{secrets.token_hex(3)}" for _ in range(n)]
    return plain, [make_password(c) for c in plain]


def use_recovery_code(user, code: str) -> bool:
    code = (code or "").strip().lower()
    remaining = []
    matched = False
    for hashed in user.recovery_codes:
        if not matched and check_password(code, hashed):
            matched = True
            continue
        remaining.append(hashed)
    if matched:
        user.recovery_codes = remaining
    return matched


def is_locked(user) -> bool:
    return bool(user.mfa_locked_until and user.mfa_locked_until > timezone.now())


def register_failure(user):
    user.mfa_failures += 1
    if user.mfa_failures >= MAX_FAILURES:
        user.mfa_locked_until = timezone.now() + timedelta(minutes=LOCK_MINUTES)
        user.mfa_failures = 0
    user.save(update_fields=["mfa_failures", "mfa_locked_until"])


def check_code(user, code: str, secret: str | None = None) -> bool:
    """Verify a TOTP or recovery code for `user`, updating replay/lockout state."""
    secret = secret or user.mfa_secret
    step = verify_totp(secret, code, user.mfa_last_used_step)
    if step is not None:
        user.mfa_last_used_step = step
        user.mfa_failures = 0
        user.save(update_fields=["mfa_last_used_step", "mfa_failures"])
        return True
    if user.mfa_enabled and use_recovery_code(user, code):
        user.mfa_failures = 0
        user.save(update_fields=["recovery_codes", "mfa_failures"])
        return True
    register_failure(user)
    return False


def make_challenge(user) -> str:
    return signing.dumps({"u": str(user.pk), "tv": user.token_version}, salt=CHALLENGE_SALT)


def read_challenge(token: str) -> dict | None:
    try:
        return signing.loads(token, salt=CHALLENGE_SALT, max_age=settings.MFA_CHALLENGE_MAX_AGE)
    except signing.BadSignature:
        return None
