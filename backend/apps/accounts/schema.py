"""OpenAPI description of the cookie / bearer JWT authentication."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class CookieJWTScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.CookieJWTAuthentication"
    name = ["cookieAuth", "bearerAuth"]

    def get_security_definition(self, auto_schema):
        return [
            {"type": "apiKey", "in": "cookie", "name": "sam_access",
             "description": "httpOnly cookie set by /auth/login/ (browsers; requires X-CSRFToken)"},
            {"type": "http", "scheme": "bearer", "bearerFormat": "JWT",
             "description": "Access token for non-browser API clients"},
        ]
