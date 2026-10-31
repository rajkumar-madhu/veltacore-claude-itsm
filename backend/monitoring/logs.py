"""Log ingestion: store a bounded recent tail of log lines and keep exact
hourly counts per exporter (the counts drive the 24h KPIs and trend)."""
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Exporter, LogEntry, LogVolume

TAIL_LIMIT = 5000
MAX_BATCH = 500
LEVEL_FIELD = {"INFO": "info", "WARN": "warn", "ERROR": "error"}


class IngestError(Exception):
    pass


def ingest(entries):
    if not isinstance(entries, list) or not entries:
        raise IngestError("Send a non-empty 'entries' list.")
    if len(entries) > MAX_BATCH:
        raise IngestError(f"At most {MAX_BATCH} entries per request.")
    known = set(Exporter.objects.values_list("id", flat=True))
    now = timezone.now()
    rows, counts, rejected = [], {}, []
    for i, e in enumerate(entries):
        exp, level, msg = (e.get("exporter") if isinstance(e, dict) else None), None, None
        if isinstance(e, dict):
            level = str(e.get("level", "")).upper()
            level = "WARN" if level == "WARNING" else level
            msg = str(e.get("message", "")).strip()[:300]
        if exp not in known or level not in LEVEL_FIELD or not msg:
            rejected.append(i)
            continue
        rows.append(LogEntry(exporter_id=exp, ts=now, level=level, message=msg))
        key = (exp, now.replace(minute=0, second=0, microsecond=0))
        counts.setdefault(key, {"info": 0, "warn": 0, "error": 0})[LEVEL_FIELD[level]] += 1

    with transaction.atomic():
        LogEntry.objects.bulk_create(rows)
        for (exp, hour), c in counts.items():
            vol, _ = LogVolume.objects.get_or_create(exporter_id=exp, hour=hour)
            LogVolume.objects.filter(pk=vol.pk).update(info=F("info") + c["info"], warn=F("warn") + c["warn"], error=F("error") + c["error"])
        Exporter.objects.filter(pk__in={exp for exp, _ in counts}).update(last_seen=now)
        cutoff = LogEntry.objects.order_by("-ts", "-id").values_list("id", flat=True)[TAIL_LIMIT:TAIL_LIMIT + 1]
        if cutoff:
            LogEntry.objects.filter(id__lte=cutoff[0]).delete()
    return {"accepted": len(rows), "rejected": rejected}
