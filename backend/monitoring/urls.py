from rest_framework.routers import DefaultRouter

from .views import MonitorViewSet, SiteViewSet, SloViewSet, SyntheticCheckViewSet

router = DefaultRouter()
router.register("sites", SiteViewSet, basename="site")
router.register("slos", SloViewSet, basename="slo")
router.register("monitors", MonitorViewSet, basename="monitor")
router.register("synthetics", SyntheticCheckViewSet, basename="synthetic")

urlpatterns = router.urls
