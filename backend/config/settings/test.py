import secrets

from cryptography.fernet import Fernet

from .base import *  # noqa: F401,F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
# Fresh throwaway keys for every test run; nothing secret is committed.
SECRET_KEY = secrets.token_urlsafe(64)
SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}  # noqa: F405
FIELD_ENCRYPTION_KEYS = [Fernet.generate_key().decode()]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
AUTH_COOKIE_SECURE = False
REST_FRAMEWORK = {**REST_FRAMEWORK}  # noqa: F405
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "user": "100000/hour",
    "anon": "100000/hour",
    "auth": "100000/minute",
    "sensitive": "100000/hour",
}
AXES_FAILURE_LIMIT = 3
