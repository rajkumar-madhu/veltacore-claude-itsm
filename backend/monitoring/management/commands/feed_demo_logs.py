import random
import time

from django.core.management.base import BaseCommand

from monitoring import logs
from monitoring.models import Exporter

from ._seed_exporters import _msgs


class Command(BaseCommand):
    help = ("Demo only: push synthetic log lines for active exporters through the real ingestion path, "
            "so the live log view has traffic without real exporters attached.")

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=2.0, help="seconds between batches")
        parser.add_argument("--batches", type=int, default=0, help="stop after N batches (0 = run forever)")

    def handle(self, *args, interval, batches, **opts):
        rnd = random.Random()
        n = 0
        while not batches or n < batches:
            active = list(Exporter.objects.filter(status="active").values_list("id", "exporter_type"))
            if active:
                picks = rnd.sample(active, k=min(len(active), rnd.randint(1, 3)))
                entries = []
                for exp_id, typ in picks:
                    level, msg = rnd.choice(_msgs(typ))
                    entries.append({"exporter": exp_id, "level": level, "message": msg})
                logs.ingest(entries)
            n += 1
            time.sleep(interval)
