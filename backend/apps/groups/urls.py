from rest_framework.routers import DefaultRouter

from .views import GroupMembershipViewSet, GroupTypeViewSet, GroupViewSet

router = DefaultRouter()
router.register("groups", GroupViewSet, basename="group")
router.register("group-memberships", GroupMembershipViewSet, basename="group-membership")
router.register("group-types", GroupTypeViewSet, basename="group-type")

urlpatterns = router.urls
