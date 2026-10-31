from rest_framework.routers import DefaultRouter

from .views import BusinessDomainViewSet, MonitorViewSet, SiteViewSet, SloViewSet, NetworkDeviceViewSet, SyntheticCheckViewSet, VirtualMachineViewSet

router = DefaultRouter()
router.register("sites", SiteViewSet, basename="site")
router.register("slos", SloViewSet, basename="slo")
router.register("monitors", MonitorViewSet, basename="monitor")
router.register("synthetics", SyntheticCheckViewSet, basename="synthetic")
router.register("vms", VirtualMachineViewSet, basename="vm")
router.register("devices", NetworkDeviceViewSet, basename="device")
router.register("domains", BusinessDomainViewSet, basename="domain")

urlpatterns = router.urls
