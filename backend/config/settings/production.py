from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import FIELD_ENCRYPTION_KEYS, SECRET_KEY, env

DEBUG = False

if SECRET_KEY.startswith("insecure") or len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set to a strong random value")
if not FIELD_ENCRYPTION_KEYS:
    raise ImproperlyConfigured("FIELD_ENCRYPTION_KEYS must be set in production")

# Secure cookies are mandatory over HTTPS. AUTH_COOKIE_SECURE=false exists only for
# trying the Docker stack on http://localhost; never disable it on a real server.
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=True)
CSRF_COOKIE_SECURE = AUTH_COOKIE_SECURE
SESSION_COOKIE_SECURE = AUTH_COOKIE_SECURE
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000 if AUTH_COOKIE_SECURE else 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/?$"]
