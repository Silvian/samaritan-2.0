import json
import secrets

from cryptography.fernet import Fernet

from .base import *  # noqa: F401,F403
from .base import BASE_DIR, SECRET_KEY, SIMPLE_JWT, env

DEBUG = env.bool("DJANGO_DEBUG", default=True)
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=False)
CSRF_COOKIE_SECURE = AUTH_COOKIE_SECURE
SESSION_COOKIE_SECURE = AUTH_COOKIE_SECURE


def _local_dev_secrets() -> dict:
    """
    Per-machine development secrets, generated on first run and stored in the
    git-ignored file backend/.dev-secrets.json. Nothing secret lives in the repo.
    """
    path = BASE_DIR / ".dev-secrets.json"
    if path.exists():
        return json.loads(path.read_text())
    data = {"secret_key": secrets.token_urlsafe(64), "field_key": Fernet.generate_key().decode()}
    path.write_text(json.dumps(data, indent=2))
    path.chmod(0o600)
    return data


if SECRET_KEY.startswith("insecure") or not env.list("FIELD_ENCRYPTION_KEYS", default=[]):
    _dev = _local_dev_secrets()
    if SECRET_KEY.startswith("insecure"):
        SECRET_KEY = _dev["secret_key"]
        SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}
    if not env.list("FIELD_ENCRYPTION_KEYS", default=[]):
        FIELD_ENCRYPTION_KEYS = [_dev["field_key"]]

# Generous limits locally; brute force is still stopped by django-axes lockout.
REST_FRAMEWORK = {**REST_FRAMEWORK}  # noqa: F405
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
    "anon": "10000/hour",
    "auth": "200/minute",
}
