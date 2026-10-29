from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("consents", views.ConsentViewSet, basename="consent")
router.register("data-requests", views.DataRequestViewSet, basename="data-request")

urlpatterns = [
    path("consents/current/", views.ConsentViewSet.as_view({"get": "current"}),
         name="consent-current"),
    path("privacy/overview/", views.privacy_overview, name="privacy-overview"),
    path("privacy/people/<uuid:pk>/export/", views.export_person, name="privacy-export"),
    path("privacy/people/<uuid:pk>/erase/", views.erase_person, name="privacy-erase"),
    *router.urls,
]
