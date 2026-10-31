"""Ticket lifecycles, numbering and SLA targets per ticket type."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Ticket, TicketActivity

INITIAL = {"incident": "new", "problem": "new", "change": "draft", "request": "submitted"}

TRANSITIONS = {
    "incident": {"new": ["in_progress", "cancelled"], "in_progress": ["on_hold", "resolved"], "on_hold": ["in_progress", "resolved"],
                 "resolved": ["closed", "in_progress"], "closed": [], "cancelled": []},
    "problem": {"new": ["investigating"], "investigating": ["known_error", "resolved"], "known_error": ["resolved"],
                "resolved": ["closed", "investigating"], "closed": []},
    "change": {"draft": ["assess", "cancelled"], "assess": ["approved", "rejected"], "approved": ["scheduled", "cancelled"],
               "scheduled": ["implemented", "cancelled"], "implemented": ["closed"], "rejected": [], "cancelled": [], "closed": []},
    "request": {"submitted": ["approved", "rejected"], "approved": ["fulfilling"], "fulfilling": ["fulfilled"],
                "fulfilled": ["closed"], "rejected": [], "closed": []},
}
DONE_STATES = {"resolved", "closed", "cancelled", "rejected", "fulfilled", "implemented"}

# hours until the SLA target for incidents/requests (problems & changes have no response SLA here)
SLA_HOURS = {"incident": {"P1": 4, "P2": 8, "P3": 24, "P4": 72}, "request": {"P1": 8, "P2": 24, "P3": 48, "P4": 120}}


class WorkflowError(Exception):
    pass


def label(state):
    return state.replace("_", " ").title()


def sla_due(ticket_type, priority, start, catalog_item=None):
    if ticket_type == "request" and catalog_item is not None:
        return start + timedelta(days=catalog_item.fulfillment_days)
    hours = SLA_HOURS.get(ticket_type, {}).get(priority)
    return start + timedelta(hours=hours) if hours else None


def next_number(ticket_type):
    prefix = Ticket.PREFIX[ticket_type]
    last = (Ticket.objects.filter(number__startswith=prefix).order_by("-number").values_list("number", flat=True).first())
    n = int(last[len(prefix):]) + 1 if last else 1001
    return f"{prefix}{n:07d}"


@transaction.atomic
def create(*, ticket_type, actor, **fields):
    now = timezone.now()
    t = Ticket.objects.create(
        number=next_number(ticket_type), ticket_type=ticket_type, state=INITIAL[ticket_type], created_at=now, updated_at=now,
        sla_due=sla_due(ticket_type, fields.get("priority", "P3"), now, fields.get("catalog_item")), **fields,
    )
    TicketActivity.objects.create(ticket=t, ts=now, author=actor, kind="system", body=f"{t.get_ticket_type_display()} created")
    return t


@transaction.atomic
def transition(ticket, to_state, actor, note=""):
    allowed = TRANSITIONS[ticket.ticket_type].get(ticket.state, [])
    if to_state not in allowed:
        raise WorkflowError(f"Cannot move {ticket.number} from {label(ticket.state)} to {label(to_state)}."
                            + (f" Allowed: {', '.join(label(s) for s in allowed)}." if allowed else " It is final."))
    if ticket.ticket_type == "change" and to_state == "scheduled" and not ticket.extra.get("plannedStart"):
        raise WorkflowError("Set a planned start before scheduling this change.")
    if ticket.ticket_type == "problem" and to_state == "known_error" and not ticket.extra.get("workaround"):
        raise WorkflowError("Record a workaround before marking this a known error.")
    if to_state in ("resolved",) and not note.strip():
        raise WorkflowError("A resolution note is required.")
    now = timezone.now()
    before = ticket.state
    ticket.state = to_state
    ticket.updated_at = now
    if to_state in DONE_STATES and ticket.resolved_at is None:
        ticket.resolved_at = now
    if to_state in ("in_progress", "investigating") and before in DONE_STATES:
        ticket.resolved_at = None
    ticket.save()
    TicketActivity.objects.create(ticket=ticket, ts=now, author=actor, kind="state",
                                  body=f"{label(before)} → {label(to_state)}" + (f": {note.strip()}" if note.strip() else ""))
    return ticket


def sla_status(ticket, now=None):
    now = now or timezone.now()
    if ticket.sla_due is None:
        return "none"
    end = ticket.resolved_at or now
    if end > ticket.sla_due:
        return "breached"
    if ticket.resolved_at is None and (ticket.sla_due - now).total_seconds() < 3600:
        return "at_risk"
    return "met" if ticket.resolved_at else "on_track"
