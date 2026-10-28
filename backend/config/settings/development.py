from .base import *  # noqa: F401,F403
from .base import env

DEBUG = env.bool("DJANGO_DEBUG", default=True)
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=False)
CSRF_COOKIE_SECURE = AUTH_COOKIE_SECURE
SESSION_COOKIE_SECURE = AUTH_COOKIE_SECURE

if not env.list("FIELD_ENCRYPTION_KEYS", default=[]):
    # Deterministic dev-only key. NEVER use in production.
    FIELD_ENCRYPTION_KEYS = ["0n3oQ0Kq7d6yCq3m3m2d6hJ1F5p7GZpQGQx2mY2YQ6s="]

# Generous limits locally; brute force is still stopped by django-axes lockout.
REST_FRAMEWORK = {**REST_FRAMEWORK}  # noqa: F405
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
    "anon": "10000/hour",
    "auth": "200/minute",
}
