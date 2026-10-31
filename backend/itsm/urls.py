from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
for prefix, vs in [
    ("tickets", views.TicketViewSet), ("catalog", views.CatalogItemViewSet), ("cis", views.ConfigurationItemViewSet),
    ("relationships", views.CiRelationshipViewSet), ("assets", views.AssetViewSet), ("software", views.SoftwareProductViewSet),
    ("licenses", views.LicenseViewSet), ("alerts", views.AlertViewSet), ("uptime", views.UptimeCheckViewSet),
    ("templates", views.MonitoringTemplateViewSet), ("bod-checks", views.BodEodCheckViewSet), ("bod-runs", views.BodEodRunViewSet),
    ("runbooks", views.RunbookViewSet), ("executions", views.RunbookExecutionViewSet), ("rules", views.AutomationRuleViewSet),
    ("rca", views.RcaReportViewSet), ("audit", views.AuditLogViewSet), ("users", views.UserViewSet), ("sites", views.SiteAdminViewSet),
    ("integrations", views.IntegrationViewSet), ("channels", views.NotificationChannelViewSet),
    ("notification-rules", views.NotificationRuleViewSet), ("settings", views.SystemSettingViewSet),
    ("vm-templates", views.VmTemplateViewSet), ("kubernetes", views.KubeClusterViewSet),
]:
    router.register(prefix, vs, basename=f"itsm-{prefix}")

urlpatterns = [
    path("roles/", views.roles),
    path("thresholds/", views.thresholds),
    path("slos/<str:slo_id>/target/", views.slo_target),
    path("overview/", views.overview),
    path("search/", views.search),
    path("health-rca/", views.rca),
    path("provisioning/", views.provisioning),
    path("analytics/", views.analytics),
    path("reports/", views.report_list),
    path("reports/<str:report_id>.csv", views.report_csv),
] + router.urls
