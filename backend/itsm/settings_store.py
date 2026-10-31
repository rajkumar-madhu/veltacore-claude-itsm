"""Read access to SystemSetting values for code that honours them."""
from .models import SystemSetting

# Settings the platform actually reads today; the rest are stored for future use and labelled as such in the UI.
APPLIED = {"automation.mode", "alerts.auto_incident_severity", "uptime.default_interval"}


def get(key, default=None):
    v = SystemSetting.objects.filter(key=key).values_list("value", flat=True).first()
    return default if v is None else v


def get_int(key, default):
    try:
        return int(float(get(key, default)))
    except (TypeError, ValueError):
        return default
