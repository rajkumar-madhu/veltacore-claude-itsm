from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

PRIORITY_CHOICES = [("P1", "P1 - Critical"), ("P2", "P2 - High"), ("P3", "P3 - Medium"), ("P4", "P4 - Low")]


# ---------------- Service Desk ----------------

class CatalogItem(models.Model):
    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=48)
    description = models.CharField(max_length=300, blank=True, default="")
    icon = models.CharField(max_length=32, default="fa-box")
    fulfillment_days = models.PositiveSmallIntegerField(default=2)
    approval_required = models.BooleanField(default=True)
    # Extra form fields the requester fills in: [{"key", "label", "type", "options"?}]
    form_fields = models.JSONField(default=list, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "name"]

    def __str__(self):
        return self.name


class Ticket(models.Model):
    TYPE_CHOICES = [("incident", "Incident"), ("problem", "Problem"), ("change", "Change"), ("request", "Request")]
    PREFIX = {"incident": "INC", "problem": "PRB", "change": "CHG", "request": "REQ"}

    number = models.CharField(max_length=16, unique=True)
    ticket_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    priority = models.CharField(max_length=2, choices=PRIORITY_CHOICES, default="P3")
    state = models.CharField(max_length=16)
    category = models.CharField(max_length=48, blank=True, default="")
    assignment_group = models.CharField(max_length=64, blank=True, default="")
    assignee = models.CharField(max_length=64, blank=True, default="")
    requester = models.CharField(max_length=64, blank=True, default="")
    ci = models.ForeignKey("ConfigurationItem", on_delete=models.SET_NULL, null=True, blank=True, related_name="tickets")
    domain = models.ForeignKey("monitoring.BusinessDomain", on_delete=models.SET_NULL, null=True, blank=True, related_name="tickets")
    catalog_item = models.ForeignKey(CatalogItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests")
    sla_due = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    # Type-specific fields: change (risk, impact, plannedStart/End, backoutPlan),
    # problem (rootCause, workaround), request (form answers).
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number


class TicketActivity(models.Model):
    KIND_CHOICES = [("comment", "Comment"), ("work_note", "Work note"), ("state", "State change"), ("system", "System")]
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="activity")
    ts = models.DateTimeField()
    author = models.CharField(max_length=64)
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    body = models.TextField()

    class Meta:
        ordering = ["-ts", "-id"]


# ---------------- CMDB & Assets ----------------

class ConfigurationItem(models.Model):
    STATUS_CHOICES = [("operational", "Operational"), ("degraded", "Degraded"), ("maintenance", "Maintenance"), ("retired", "Retired")]
    SOURCE_CHOICES = [("device", "Network device"), ("vm", "Virtual machine"), ("service", "Domain service"), ("manual", "Manual")]
    ci_id = models.CharField(max_length=16, unique=True)            # "CI000123"
    name = models.CharField(max_length=96)
    ci_class = models.CharField(max_length=48)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="operational")
    environment = models.CharField(max_length=16, default="Production")
    site = models.ForeignKey("monitoring.Site", on_delete=models.SET_NULL, null=True, blank=True, related_name="cis")
    owner = models.CharField(max_length=64, blank=True, default="")
    criticality = models.CharField(max_length=2, choices=PRIORITY_CHOICES, default="P3")
    source = models.CharField(max_length=8, choices=SOURCE_CHOICES, default="manual")
    source_id = models.CharField(max_length=64, blank=True, default="")
    ip = models.CharField(max_length=45, blank=True, default="")
    attributes = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField()

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["source", "source_id"], condition=~models.Q(source="manual"), name="uniq_ci_source")]

    def __str__(self):
        return self.name


class CiRelationship(models.Model):
    TYPE_CHOICES = [("runs_on", "Runs on"), ("depends_on", "Depends on"), ("connects_to", "Connects to"),
                    ("hosts", "Hosts"), ("uses", "Uses"), ("member_of", "Member of")]
    source = models.ForeignKey(ConfigurationItem, on_delete=models.CASCADE, related_name="outgoing")
    target = models.ForeignKey(ConfigurationItem, on_delete=models.CASCADE, related_name="incoming")
    rel_type = models.CharField(max_length=12, choices=TYPE_CHOICES)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source", "target", "rel_type"], name="uniq_ci_rel")]


class Asset(models.Model):
    STATUS_CHOICES = [("in_use", "In use"), ("in_stock", "In stock"), ("repair", "In repair"), ("retired", "Retired")]
    asset_tag = models.CharField(max_length=24, unique=True)
    name = models.CharField(max_length=96)
    asset_type = models.CharField(max_length=32)                    # Server, Switch, Laptop, Firewall…
    vendor = models.CharField(max_length=48, blank=True, default="")
    model = models.CharField(max_length=64, blank=True, default="")
    serial = models.CharField(max_length=48, blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="in_use")
    assigned_to = models.CharField(max_length=64, blank=True, default="")
    location = models.CharField(max_length=64, blank=True, default="")
    purchase_date = models.DateField(null=True, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    warranty_end = models.DateField(null=True, blank=True)
    eol_date = models.DateField(null=True, blank=True)
    ci = models.ForeignKey(ConfigurationItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="assets")

    class Meta:
        ordering = ["asset_tag"]


class SoftwareProduct(models.Model):
    name = models.CharField(max_length=96)
    vendor = models.CharField(max_length=48)
    version = models.CharField(max_length=32)
    category = models.CharField(max_length=32)
    installs = models.PositiveIntegerField(default=0)
    eol_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["name", "version"]
        constraints = [models.UniqueConstraint(fields=["name", "version"], name="uniq_sw_version")]


class License(models.Model):
    product = models.ForeignKey(SoftwareProduct, on_delete=models.CASCADE, related_name="licenses")
    license_type = models.CharField(max_length=24)                  # Subscription, Perpetual, Per-core…
    seats_total = models.PositiveIntegerField()
    seats_used = models.PositiveIntegerField(default=0)
    expiry = models.DateField(null=True, blank=True)
    annual_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    contract_ref = models.CharField(max_length=48, blank=True, default="")

    class Meta:
        ordering = ["expiry"]


# ---------------- Monitoring ----------------

class Alert(models.Model):
    SEVERITY_CHOICES = [("critical", "Critical"), ("warning", "Warning"), ("info", "Info")]
    STATUS_CHOICES = [("firing", "Firing"), ("acknowledged", "Acknowledged"), ("silenced", "Silenced"), ("resolved", "Resolved")]
    fingerprint = models.CharField(max_length=64, unique=True)
    title = models.CharField(max_length=160)
    severity = models.CharField(max_length=8, choices=SEVERITY_CHOICES)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="firing")
    source = models.CharField(max_length=48)                        # prometheus, snmp, idrac, uptime…
    target = models.CharField(max_length=96)                        # host / service
    rule = models.CharField(max_length=96, blank=True, default="")
    labels = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField()
    acknowledged_by = models.CharField(max_length=64, blank=True, default="")
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    silenced_until = models.DateTimeField(null=True, blank=True)
    ticket = models.ForeignKey(Ticket, on_delete=models.SET_NULL, null=True, blank=True, related_name="alerts")

    class Meta:
        ordering = ["-started_at"]


class UptimeCheck(models.Model):
    KIND_CHOICES = [("http", "HTTP(S)"), ("tcp", "TCP / Telnet")]
    STATUS_CHOICES = [("up", "Up"), ("down", "Down"), ("unknown", "Unknown"), ("paused", "Paused")]
    name = models.CharField(max_length=96, unique=True)
    kind = models.CharField(max_length=4, choices=KIND_CHOICES)
    target = models.CharField(max_length=300)                       # URL or host:port
    expected_status = models.PositiveSmallIntegerField(default=200)
    interval_sec = models.PositiveIntegerField(default=60, validators=[MinValueValidator(30), MaxValueValidator(3600)])
    timeout_sec = models.PositiveSmallIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(30)])
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default="unknown")
    last_checked = models.DateTimeField(null=True, blank=True)
    last_latency_ms = models.FloatField(null=True, blank=True)
    last_error = models.CharField(max_length=200, blank=True, default="")
    tags = models.CharField(max_length=120, blank=True, default="")
    history = models.JSONField(default=list, blank=True)             # last 60 results [{ts, ok, ms}]

    class Meta:
        ordering = ["name"]


class MonitoringTemplate(models.Model):
    name = models.CharField(max_length=96, unique=True)
    applies_to = models.CharField(max_length=32)                    # device type / platform
    description = models.CharField(max_length=240, blank=True, default="")
    checks = models.JSONField(default=list)                          # [{"name", "metric", "warn", "crit", "unit"}]
    interval_sec = models.PositiveIntegerField(default=60)
    enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]


# ---------------- BOD / EOD ----------------

class BodEodCheck(models.Model):
    PHASE_CHOICES = [("BOD", "Beginning of day"), ("EOD", "End of day"), ("BOTH", "Both")]
    KIND_CHOICES = [("domain_health", "Domain health"), ("device_online", "Devices online"), ("vm_running", "VMs running"),
                    ("uptime", "Uptime checks"), ("exporters", "Exporters active"), ("slo", "SLO compliance"),
                    ("no_critical_alerts", "No critical alerts"), ("open_p1", "No open P1 incidents")]
    name = models.CharField(max_length=120, unique=True)
    phase = models.CharField(max_length=4, choices=PHASE_CHOICES)
    category = models.CharField(max_length=48)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    params = models.JSONField(default=dict, blank=True)
    critical = models.BooleanField(default=True)
    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "name"]


class BodEodRun(models.Model):
    phase = models.CharField(max_length=3)
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField()
    status = models.CharField(max_length=8)                         # pass / warn / fail
    triggered_by = models.CharField(max_length=64)
    results = models.JSONField(default=list)                         # [{check, category, status, detail, critical}]

    class Meta:
        ordering = ["-started_at"]


# ---------------- Automation ----------------

class Runbook(models.Model):
    name = models.CharField(max_length=120, unique=True)
    category = models.CharField(max_length=48)
    description = models.CharField(max_length=300, blank=True, default="")
    # [{"name", "type": http_check|tcp_check|verify_health|restart_service|script|notify|wait, "target", "params"}]
    steps = models.JSONField(default=list)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField()

    class Meta:
        ordering = ["name"]


class RunbookExecution(models.Model):
    runbook = models.ForeignKey(Runbook, on_delete=models.CASCADE, related_name="executions")
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10)                         # success / failed / partial
    mode = models.CharField(max_length=10, default="dry_run")
    triggered_by = models.CharField(max_length=96)
    step_results = models.JSONField(default=list)

    class Meta:
        ordering = ["-started_at"]


class AutomationRule(models.Model):
    name = models.CharField(max_length=120, unique=True)
    match_severity = models.CharField(max_length=8, blank=True, default="")   # "" = any
    match_source = models.CharField(max_length=48, blank=True, default="")
    match_text = models.CharField(max_length=96, blank=True, default="")     # substring of title/target
    runbook = models.ForeignKey(Runbook, on_delete=models.CASCADE, related_name="rules")
    enabled = models.BooleanField(default=True)
    last_triggered = models.DateTimeField(null=True, blank=True)
    trigger_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["name"]


# ---------------- Reports / audit ----------------

class RcaReport(models.Model):
    STATUS_CHOICES = [("draft", "Draft"), ("review", "In review"), ("published", "Published")]
    number = models.CharField(max_length=16, unique=True)
    title = models.CharField(max_length=160)
    problem = models.ForeignKey(Ticket, on_delete=models.SET_NULL, null=True, blank=True, related_name="rca_reports")
    incidents = models.JSONField(default=list, blank=True)           # incident numbers
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="draft")
    summary = models.TextField(blank=True, default="")
    root_cause = models.TextField(blank=True, default="")
    impact = models.TextField(blank=True, default="")
    timeline = models.JSONField(default=list, blank=True)            # [{ts, event}]
    actions = models.JSONField(default=list, blank=True)             # [{action, owner, due, done}]
    author = models.CharField(max_length=64)
    created_at = models.DateTimeField()
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class AuditLog(models.Model):
    ts = models.DateTimeField(db_index=True)
    actor = models.CharField(max_length=64)
    action = models.CharField(max_length=24)
    object_type = models.CharField(max_length=32)
    object_id = models.CharField(max_length=64)
    summary = models.CharField(max_length=300)

    class Meta:
        ordering = ["-ts", "-id"]


# ---------------- Administration ----------------

class UserProfile(models.Model):
    ROLE_CHOICES = [("super_admin", "Super Admin"), ("admin", "Admin"), ("operator", "Operator"), ("viewer", "Viewer")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=12, choices=ROLE_CHOICES, default="viewer")
    team = models.CharField(max_length=48, blank=True, default="")
    phone = models.CharField(max_length=24, blank=True, default="")
    site = models.ForeignKey("monitoring.Site", on_delete=models.SET_NULL, null=True, blank=True)


class Integration(models.Model):
    STATUS_CHOICES = [("connected", "Connected"), ("error", "Error"), ("not_configured", "Not configured")]
    name = models.CharField(max_length=48, unique=True)
    kind = models.CharField(max_length=24)                          # metrics, itsm, chat, virtualization…
    description = models.CharField(max_length=200, blank=True, default="")
    base_url = models.CharField(max_length=300, blank=True, default="")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="not_configured")
    last_checked = models.DateTimeField(null=True, blank=True)
    detail = models.CharField(max_length=200, blank=True, default="")
    enabled = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]


class NotificationChannel(models.Model):
    KIND_CHOICES = [("email", "Email"), ("slack", "Slack"), ("teams", "MS Teams"), ("webhook", "Webhook"), ("sms", "SMS")]
    name = models.CharField(max_length=64, unique=True)
    kind = models.CharField(max_length=8, choices=KIND_CHOICES)
    target = models.CharField(max_length=300)                       # address / channel / URL
    enabled = models.BooleanField(default=True)
    last_test = models.DateTimeField(null=True, blank=True)
    last_test_result = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["name"]


class NotificationRule(models.Model):
    name = models.CharField(max_length=96, unique=True)
    min_severity = models.CharField(max_length=8, default="critical")
    match_source = models.CharField(max_length=48, blank=True, default="")
    channel = models.ForeignKey(NotificationChannel, on_delete=models.CASCADE, related_name="rules")
    business_hours_only = models.BooleanField(default=False)
    enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]


class SystemSetting(models.Model):
    key = models.CharField(max_length=64, unique=True)
    value = models.CharField(max_length=300)
    value_type = models.CharField(max_length=8, default="text")       # text / number / bool / choice
    choices = models.JSONField(default=list, blank=True)
    group = models.CharField(max_length=32)
    description = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["group", "key"]


# ---------------- Infrastructure extras ----------------

class VmTemplate(models.Model):
    name = models.CharField(max_length=96, unique=True)
    platform = models.CharField(max_length=16, default="VMware")
    os = models.CharField(max_length=64)
    vcpu = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(128)])
    memory_gb = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(4096)])
    disk_gb = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    description = models.CharField(max_length=200, blank=True, default="")
    updated_at = models.DateTimeField()

    class Meta:
        ordering = ["name"]


class KubeCluster(models.Model):
    name = models.CharField(max_length=64, unique=True)
    version = models.CharField(max_length=16)
    distribution = models.CharField(max_length=32)
    site = models.ForeignKey("monitoring.Site", on_delete=models.SET_NULL, null=True, blank=True)
    nodes = models.JSONField(default=list)           # [{name, role, status, cpuPct, memPct, pods, kubelet}]
    workloads = models.JSONField(default=list)       # [{namespace, name, kind, desired, ready, restarts, image}]
    events = models.JSONField(default=list)          # [{ts, type, object, reason, message}]

    class Meta:
        ordering = ["name"]
