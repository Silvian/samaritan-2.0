from rest_framework.routers import DefaultRouter

from .views import DonationViewSet, FundViewSet, GiftAidDeclarationViewSet

router = DefaultRouter()
router.register("funds", FundViewSet, basename="fund")
router.register("donations", DonationViewSet, basename="donation")
router.register("gift-aid-declarations", GiftAidDeclarationViewSet, basename="gift-aid-declaration")

urlpatterns = router.urls
