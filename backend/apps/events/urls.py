from rest_framework.routers import DefaultRouter

from .views import AttendanceViewSet, EventViewSet

router = DefaultRouter()
router.register("events", EventViewSet, basename="event")
router.register("attendance", AttendanceViewSet, basename="attendance")

urlpatterns = router.urls
