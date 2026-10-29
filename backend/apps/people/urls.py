from rest_framework.routers import DefaultRouter

from .views import HouseholdViewSet, MilestoneViewSet, PersonViewSet, PositionViewSet, TagViewSet

router = DefaultRouter()
router.register("people", PersonViewSet, basename="person")
router.register("households", HouseholdViewSet, basename="household")
router.register("tags", TagViewSet, basename="tag")
router.register("positions", PositionViewSet, basename="position")
router.register("milestones", MilestoneViewSet, basename="milestone")

urlpatterns = router.urls
