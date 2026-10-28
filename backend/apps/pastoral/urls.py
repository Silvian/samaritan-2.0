from rest_framework.routers import DefaultRouter

from .views import CareRecordViewSet

router = DefaultRouter()
router.register("care-records", CareRecordViewSet, basename="care-record")

urlpatterns = router.urls
