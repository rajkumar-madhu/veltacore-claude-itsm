from django.utils import timezone

from .models import AuditLog


def actor_of(request):
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return user.get_username()
    return "anonymous (dev mode)"


def record(request, action, object_type, object_id, summary):
    AuditLog.objects.create(ts=timezone.now(), actor=actor_of(request) if request is not None else "system",
                            action=action, object_type=object_type, object_id=str(object_id)[:64], summary=summary[:300])
