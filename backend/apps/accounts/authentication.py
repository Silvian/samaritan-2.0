"""
JWT authentication from httpOnly cookies (browser) or Bearer header (API clients).

Cookie-authenticated requests are CSRF-protected (double-submit token), since
the browser attaches cookies automatically. Tokens carry the user's
`token_version`; bumping it (password change, logout-everywhere,
deactivation) invalidates every outstanding token immediately.
"""

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken


class _CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


def enforce_csrf(request):
    check = _CSRFCheck(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            from_cookie = False
        else:
            raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
            from_cookie = True
        if not raw_token:
            return None

        validated = self.get_validated_token(raw_token)
        user = self.get_user(validated)
        if not user.is_active:
            raise exceptions.AuthenticationFailed("User is inactive", code="user_inactive")
        if validated.get("tv") != user.token_version:
            raise exceptions.AuthenticationFailed("Session has been revoked", code="token_revoked")
        if from_cookie:
            enforce_csrf(request)
        return user, validated

    def authenticate_header(self, request):
        # Ensures DRF returns 401 (not 403) for unauthenticated requests.
        return 'Bearer realm="api"'


def issue_tokens(user) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    refresh["tv"] = user.token_version
    access = refresh.access_token
    access["tv"] = user.token_version
    return str(access), str(refresh)


def set_auth_cookies(response, access: str, refresh: str):
    common = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "domain": settings.AUTH_COOKIE_DOMAIN,
    }
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS,
        access,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        path="/",
        **common,
    )
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.AUTH_COOKIE_REFRESH_PATH,
        **common,
    )
    # Presence-only hint for the frontend router (contains no secret).
    response.set_cookie(
        "sam_session",
        "1",
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path="/",
        httponly=False,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        domain=settings.AUTH_COOKIE_DOMAIN,
    )


def clear_auth_cookies(response):
    domain = settings.AUTH_COOKIE_DOMAIN
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS, path="/", domain=domain)
    response.delete_cookie(
        settings.AUTH_COOKIE_REFRESH, path=settings.AUTH_COOKIE_REFRESH_PATH, domain=domain
    )
    response.delete_cookie("sam_session", path="/", domain=domain)
