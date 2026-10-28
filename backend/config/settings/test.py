from .base import *  # noqa: F401,F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
FIELD_ENCRYPTION_KEYS = ["0n3oQ0Kq7d6yCq3m3m2d6hJ1F5p7GZpQGQx2mY2YQ6s="]
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
SECRET_KEY = "test-secret-key-that-is-long-enough-for-hs256-signing-0123456789"
SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}  # noqa: F405
