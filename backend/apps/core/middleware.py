from contextvars import ContextVar

_current_request: ContextVar = ContextVar("current_request", default=None)


def get_current_request():
    return _current_request.get()


def client_ip(request) -> str | None:
    if request is None:
        return None
    # Only trust X-Forwarded-For when deployed behind a known proxy.
    from django.conf import settings

    proxies = getattr(settings, "AXES_IPWARE_PROXY_COUNT", 0)
    if proxies:
        # Take the address added by the outermost trusted proxy; anything further
        # left in the header is client-controlled and could be spoofed.
        parts = [p.strip() for p in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",") if p.strip()]
        if len(parts) >= proxies:
            return parts[-proxies]
    return request.META.get("REMOTE_ADDR")


class RequestContextMiddleware:
    """Expose the current request to the audit logger without threading it through."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _current_request.set(request)
        try:
            return self.get_response(request)
        finally:
            _current_request.reset(token)


class SecurityHeadersMiddleware:
    """Defence-in-depth headers for a JSON API that serves personal data."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            # Personal data must never be stored by browsers or shared caches.
            response["Cache-Control"] = "no-store, max-age=0"
            response["Pragma"] = "no-cache"
            if not request.path.startswith("/api/v1/docs"):
                response["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"
        )
        return response
