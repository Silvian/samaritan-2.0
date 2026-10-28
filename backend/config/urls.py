from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import health

api_v1 = [
    path("health/", health, name="health"),
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.accounts.admin_urls")),
    path("", include("apps.core.urls")),
    path("", include("apps.people.urls")),
    path("", include("apps.groups.urls")),
    path("", include("apps.events.urls")),
    path("", include("apps.giving.urls")),
    path("", include("apps.pastoral.urls")),
    path("", include("apps.communications.urls")),
    path("", include("apps.privacy.urls")),
    path("", include("apps.dashboard.urls")),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG or getattr(settings, "EXPOSE_API_DOCS", False):
    urlpatterns += [
        path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    ]

# Django admin is an emergency break-glass tool only; keep it off a guessable path.
if getattr(settings, "ENABLE_DJANGO_ADMIN", True):
    urlpatterns += [path(settings.DJANGO_ADMIN_PATH, admin.site.urls)]
