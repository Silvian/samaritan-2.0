from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, CampusViewSet, ChurchSettingsView, PublicSettingsView

router = DefaultRouter()
router.register("campuses", CampusViewSet, basename="campus")
router.register("audit-log", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("settings/", ChurchSettingsView.as_view(), name="church-settings"),
    path("settings/public/", PublicSettingsView.as_view(), name="church-settings-public"),
    *router.urls,
]
