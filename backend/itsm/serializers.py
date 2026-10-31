from django.contrib.auth import get_user_model
from rest_framework import serializers

from monitoring.models import Site

from . import workflow
from .models import (
    Alert, Asset, AuditLog, AutomationRule, BodEodCheck, BodEodRun, CatalogItem, CiRelationship, ConfigurationItem, Integration,
    KubeCluster, License, MonitoringTemplate, NotificationChannel, NotificationRule, RcaReport, Runbook, RunbookExecution,
    SoftwareProduct, SystemSetting, Ticket, TicketActivity, UptimeCheck, UserProfile, VmTemplate,
)
from .uptime import uptime_pct


class TicketActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketActivity
        fields = ["id", "ts", "author", "kind", "body"]


class TicketSerializer(serializers.ModelSerializer):
    ci_name = serializers.CharField(source="ci.name", default=None, read_only=True)
    domain_name = serializers.CharField(source="domain.name", default=None, read_only=True)
    catalog_item_name = serializers.CharField(source="catalog_item.name", default=None, read_only=True)
    sla_status = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = ["id", "number", "ticket_type", "title", "description", "priority", "state", "category", "assignment_group",
                  "assignee", "requester", "ci", "ci_name", "domain", "domain_name", "catalog_item", "catalog_item_name",
                  "sla_due", "sla_status", "created_at", "updated_at", "resolved_at", "extra"]
        read_only_fields = ["number", "state", "sla_due", "created_at", "updated_at", "resolved_at"]

    def get_sla_status(self, t):
        return workflow.sla_status(t)


class TicketDetailSerializer(TicketSerializer):
    activity = TicketActivitySerializer(many=True, read_only=True)
    transitions = serializers.SerializerMethodField()
    alerts = serializers.SerializerMethodField()

    class Meta(TicketSerializer.Meta):
        fields = TicketSerializer.Meta.fields + ["activity", "transitions", "alerts"]

    def get_transitions(self, t):
        return workflow.TRANSITIONS[t.ticket_type].get(t.state, [])

    def get_alerts(self, t):
        return [{"id": a.id, "title": a.title, "severity": a.severity, "status": a.status} for a in t.alerts.all()]


class CatalogItemSerializer(serializers.ModelSerializer):
    open_requests = serializers.SerializerMethodField()

    class Meta:
        model = CatalogItem
        fields = "__all__"

    def get_open_requests(self, c):
        return c.requests.exclude(state__in=["fulfilled", "closed", "rejected"]).count()


class ConfigurationItemSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", default=None, read_only=True)

    class Meta:
        model = ConfigurationItem
        fields = "__all__"
        read_only_fields = ["ci_id", "source", "source_id", "updated_at"]


class CiRelationshipSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source="source.name", read_only=True)
    target_name = serializers.CharField(source="target.name", read_only=True)
    source_class = serializers.CharField(source="source.ci_class", read_only=True)
    target_class = serializers.CharField(source="target.ci_class", read_only=True)

    class Meta:
        model = CiRelationship
        fields = ["id", "source", "source_name", "source_class", "rel_type", "target", "target_name", "target_class"]

    def validate(self, data):
        if data["source"] == data["target"]:
            raise serializers.ValidationError("A CI can't be related to itself.")
        return data


class AssetSerializer(serializers.ModelSerializer):
    ci_name = serializers.CharField(source="ci.name", default=None, read_only=True)

    class Meta:
        model = Asset
        fields = "__all__"


class SoftwareProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = SoftwareProduct
        fields = "__all__"


class LicenseSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model = License
        fields = "__all__"

    def get_product_name(self, lic):
        return f"{lic.product.name} {lic.product.version}"

    def validate(self, data):
        total = data.get("seats_total", getattr(self.instance, "seats_total", 0))
        used = data.get("seats_used", getattr(self.instance, "seats_used", 0))
        if used > total:
            raise serializers.ValidationError({"seats_used": "Can't exceed total seats."})
        return data


class AlertSerializer(serializers.ModelSerializer):
    ticket_number = serializers.CharField(source="ticket.number", default=None, read_only=True)

    class Meta:
        model = Alert
        fields = "__all__"
        read_only_fields = ["status", "acknowledged_by", "acknowledged_at", "resolved_at", "silenced_until", "ticket", "started_at"]


class UptimeCheckSerializer(serializers.ModelSerializer):
    uptime_pct = serializers.SerializerMethodField()

    class Meta:
        model = UptimeCheck
        fields = "__all__"
        read_only_fields = ["status", "last_checked", "last_latency_ms", "last_error", "history"]

    def get_uptime_pct(self, c):
        return uptime_pct(c)

    def validate(self, data):
        kind = data.get("kind", getattr(self.instance, "kind", None))
        target = data.get("target", getattr(self.instance, "target", ""))
        if kind == "http" and not target.startswith(("http://", "https://")):
            raise serializers.ValidationError({"target": "HTTP checks need a URL starting with http:// or https://"})
        if kind == "tcp":
            host, sep, port = target.rpartition(":")
            if not sep or not host or not port.isdigit() or not 0 < int(port) < 65536:
                raise serializers.ValidationError({"target": "TCP checks need host:port"})
        return data


class MonitoringTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonitoringTemplate
        fields = "__all__"


class BodEodCheckSerializer(serializers.ModelSerializer):
    class Meta:
        model = BodEodCheck
        fields = "__all__"


class BodEodRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = BodEodRun
        fields = "__all__"


class RunbookSerializer(serializers.ModelSerializer):
    last_execution = serializers.SerializerMethodField()
    STEP_TYPES = {"http_check", "tcp_check", "verify_health", "wait", "restart_service", "script", "notify"}

    class Meta:
        model = Runbook
        fields = "__all__"
        read_only_fields = ["updated_at"]

    def get_last_execution(self, r):
        e = r.executions.first()
        return {"id": e.id, "status": e.status, "startedAt": e.started_at} if e else None

    def validate_steps(self, steps):
        if not isinstance(steps, list) or not steps:
            raise serializers.ValidationError("Add at least one step.")
        for i, s in enumerate(steps, 1):
            if not isinstance(s, dict) or s.get("type") not in self.STEP_TYPES or not str(s.get("name", "")).strip():
                raise serializers.ValidationError(f"Step {i} needs a name and a valid type.")
        return steps


class RunbookExecutionSerializer(serializers.ModelSerializer):
    runbook_name = serializers.CharField(source="runbook.name", read_only=True)

    class Meta:
        model = RunbookExecution
        fields = "__all__"


class AutomationRuleSerializer(serializers.ModelSerializer):
    runbook_name = serializers.CharField(source="runbook.name", read_only=True)

    class Meta:
        model = AutomationRule
        fields = "__all__"
        read_only_fields = ["last_triggered", "trigger_count"]


class RcaReportSerializer(serializers.ModelSerializer):
    problem_number = serializers.CharField(source="problem.number", default=None, read_only=True)

    class Meta:
        model = RcaReport
        fields = "__all__"
        read_only_fields = ["number", "created_at", "published_at", "author"]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = "__all__"


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.RegexField(r"^[\w.@+-]{3,150}$")
    email = serializers.EmailField(allow_blank=True, default="")
    first_name = serializers.CharField(max_length=150, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, allow_blank=True, default="")
    is_active = serializers.BooleanField(default=True)
    role = serializers.ChoiceField(choices=[c for c, _ in UserProfile.ROLE_CHOICES], default="viewer")
    team = serializers.CharField(max_length=48, allow_blank=True, default="")
    phone = serializers.CharField(max_length=24, allow_blank=True, default="")
    site = serializers.SlugRelatedField(slug_field="id", queryset=Site.objects.all(), allow_null=True, required=False, default=None)
    last_login = serializers.DateTimeField(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)

    def validate_username(self, v):
        qs = get_user_model().objects.filter(username__iexact=v)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("That username is taken.")
        return v

    def to_representation(self, user):
        p = getattr(user, "profile", None)
        return {"id": user.id, "username": user.username, "email": user.email, "first_name": user.first_name,
                "last_name": user.last_name, "is_active": user.is_active, "role": p.role if p else "viewer",
                "team": p.team if p else "", "phone": p.phone if p else "", "site": p.site_id if p else None,
                "last_login": user.last_login, "date_joined": user.date_joined}

    def _apply(self, user, d):
        for f in ("username", "email", "first_name", "last_name", "is_active"):
            if f in d:
                setattr(user, f, d[f])
        user.save()
        p, _ = UserProfile.objects.get_or_create(user=user)
        for f in ("role", "team", "phone", "site"):
            if f in d:
                setattr(p, f, d[f])
        p.save()
        return user

    def create(self, d):
        user = get_user_model()(username=d["username"])
        user.set_unusable_password()  # no login UI yet; set a password via Django admin
        return self._apply(user, d)

    def update(self, user, d):
        return self._apply(user, d)


class SiteAdminSerializer(serializers.ModelSerializer):
    id = serializers.SlugField(max_length=64)
    usage = serializers.SerializerMethodField()

    class Meta:
        model = Site
        fields = ["id", "name", "region", "devices", "health", "lat", "lng", "usage"]

    def get_usage(self, s):
        return {"vms": s.vms.count(), "devices": s.network_devices.count(), "exporters": s.exporters.count()}

    def validate_id(self, v):
        if self.instance is None and Site.objects.filter(pk=v).exists():
            raise serializers.ValidationError("A site with this id already exists.")
        if self.instance is not None and v != self.instance.pk:
            raise serializers.ValidationError("Site id can't be changed.")
        return v


class IntegrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Integration
        fields = "__all__"
        read_only_fields = ["status", "last_checked", "detail"]


class NotificationChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationChannel
        fields = "__all__"
        read_only_fields = ["last_test", "last_test_result"]


class NotificationRuleSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source="channel.name", read_only=True)

    class Meta:
        model = NotificationRule
        fields = "__all__"


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = "__all__"
        read_only_fields = ["key", "value_type", "choices", "group", "description"]

    def validate_value(self, v):
        s = self.instance
        if s is None:
            return v
        if s.value_type == "number":
            try:
                float(v)
            except ValueError:
                raise serializers.ValidationError("Must be a number.")
        if s.value_type == "bool" and v not in ("true", "false"):
            raise serializers.ValidationError("Must be true or false.")
        if s.value_type == "choice" and v not in s.choices:
            raise serializers.ValidationError(f"Must be one of: {', '.join(s.choices)}")
        return v


class VmTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VmTemplate
        fields = "__all__"
        read_only_fields = ["updated_at"]


class KubeClusterSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source="site.name", default=None, read_only=True)

    class Meta:
        model = KubeCluster
        fields = "__all__"
