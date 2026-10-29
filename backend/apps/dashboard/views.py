"""Aggregated dashboard statistics. Each section is included only if the user may see it."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth, TruncWeek
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.core.models import ChurchSettings
from apps.core.utils import years_ago
from apps.events.models import Attendance, Event
from apps.giving.models import Donation
from apps.groups.models import Group
from apps.pastoral.models import CareRecord
from apps.people.models import Household, Milestone, Person
from apps.privacy.models import DataRequest

AGE_BANDS = [(0, 11, "0-11"), (12, 17, "12-17"), (18, 29, "18-29"), (30, 44, "30-44"),
             (45, 64, "45-64"), (65, 200, "65+")]


def _people_section(today):
    people = Person.objects.active()
    month_ago = timezone.now() - timedelta(days=30)
    prev_month = timezone.now() - timedelta(days=60)
    by_status = dict(people.values_list("status").annotate(n=Count("id")))
    new_30 = people.filter(created_at__gte=month_ago).count()
    new_prev_30 = people.filter(created_at__gte=prev_month, created_at__lt=month_ago).count()

    ages = []
    for lo, hi, label in AGE_BANDS:
        ages.append({
            "band": label,
            "count": people.filter(date_of_birth__lte=years_ago(lo, today),
                                   date_of_birth__gt=years_ago(hi + 1, today)).count(),
        })
    ages.append({"band": "Unknown", "count": people.filter(date_of_birth__isnull=True).count()})

    growth = []
    start = (today.replace(day=1) - timedelta(days=330)).replace(day=1)
    base = Person.objects.filter(created_at__date__lt=start, anonymised_at__isnull=True).count()
    monthly = {
        r["m"].date(): r["n"]
        for r in Person.objects.filter(created_at__date__gte=start, anonymised_at__isnull=True)
        .annotate(m=TruncMonth("created_at")).values("m").annotate(n=Count("id"))
    }
    running = base
    cursor = start
    for _ in range(12):
        running += monthly.get(cursor, 0)
        growth.append({"month": cursor.isoformat(), "new": monthly.get(cursor, 0), "total": running})
        cursor = (cursor + timedelta(days=32)).replace(day=1)

    upcoming = []
    for p in people.filter(date_of_birth__isnull=False).only(
        "id", "first_name", "preferred_name", "last_name", "date_of_birth"
    ):
        try:
            nxt = p.date_of_birth.replace(year=today.year)
        except ValueError:
            nxt = p.date_of_birth.replace(year=today.year, day=28)
        if nxt < today:
            try:
                nxt = nxt.replace(year=today.year + 1)
            except ValueError:
                nxt = nxt.replace(year=today.year + 1, day=28)
        days = (nxt - today).days
        if days <= 14:
            upcoming.append({"id": str(p.id), "full_name": p.full_name, "date": nxt.isoformat(),
                             "turning": nxt.year - p.date_of_birth.year, "in_days": days})
    upcoming.sort(key=lambda x: x["in_days"])

    year_start = today.replace(month=1, day=1)
    milestones = dict(
        Milestone.objects.filter(date__gte=year_start, person__anonymised_at__isnull=True)
        .values_list("kind").annotate(n=Count("id"))
    )
    recent = people.order_by("-created_at")[:6]
    return {
        "total": people.count(),
        "members": by_status.get("member", 0),
        "households": Household.objects.count(),
        "new_30d": new_30,
        "new_prev_30d": new_prev_30,
        "by_status": [{"status": k, "count": v} for k, v in sorted(by_status.items())],
        "age_bands": ages,
        "growth": growth,
        "upcoming_birthdays": upcoming[:10],
        "milestones_ytd": milestones,
        "recent": [{"id": str(p.id), "full_name": p.full_name, "status": p.status,
                    "created_at": p.created_at.isoformat()} for p in recent],
    }


def _attendance_section(today):
    since = today - timedelta(weeks=12)
    services = Event.objects.filter(kind="service", starts_at__date__gte=since,
                                    starts_at__date__lte=today, is_cancelled=False)
    weekly_checkins = {
        r["w"].date(): r["n"]
        for r in Attendance.objects.filter(event__in=services, status="present")
        .annotate(w=TruncWeek("event__starts_at")).values("w").annotate(n=Count("id"))
    }
    weekly_headcount = {
        r["w"].date(): r["n"] or 0
        for r in services.annotate(w=TruncWeek("starts_at")).values("w")
        .annotate(n=Sum("headcount"))
    }
    weeks = []
    cursor = since - timedelta(days=since.weekday())
    while cursor + timedelta(days=6) <= today:  # complete weeks only, labelled by Sunday
        weeks.append({
            "week": (cursor + timedelta(days=6)).isoformat(),
            "checked_in": weekly_checkins.get(cursor, 0),
            "headcount": max(weekly_headcount.get(cursor, 0), weekly_checkins.get(cursor, 0)),
        })
        cursor += timedelta(weeks=1)
    vals = [w["headcount"] for w in weeks if w["headcount"]]
    upcoming = Event.objects.filter(starts_at__gte=timezone.now(), is_cancelled=False) \
        .order_by("starts_at")[:6]
    return {
        "weekly": weeks,
        "average": round(sum(vals) / len(vals)) if vals else 0,
        "last": vals[-1] if vals else 0,
        "upcoming_events": [
            {"id": str(e.id), "title": e.title, "starts_at": e.starts_at.isoformat(),
             "kind": e.kind, "location": e.location}
            for e in upcoming
        ],
    }


def _giving_section(today):
    year = today.year
    qs = Donation.objects.filter(date__year=year)
    total = qs.aggregate(t=Sum("amount"))["t"] or Decimal("0")
    prev_ytd = Donation.objects.filter(
        date__year=year - 1, date__lte=today.replace(year=year - 1) if not (
            today.month == 2 and today.day == 29) else today.replace(year=year - 1, day=28)
    ).aggregate(t=Sum("amount"))["t"] or Decimal("0")
    monthly = {
        r["m"].month: r["t"]
        for r in qs.annotate(m=TruncMonth("date")).values("m").annotate(t=Sum("amount"))
    }
    return {
        "currency": ChurchSettings.load().currency,
        "ytd": total,
        "previous_ytd": prev_ytd,
        "donors_ytd": qs.exclude(person__isnull=True).values("person").distinct().count(),
        "monthly": [{"month": m, "total": monthly.get(m, 0)} for m in range(1, 13)],
        "by_fund": list(qs.values("fund__name").annotate(total=Sum("amount")).order_by("-total")[:6]),
    }


@extend_schema(responses={200: dict})
@api_view(["GET"])
def summary(request):
    user = request.user
    today = timezone.localdate()
    data = {"church": ChurchSettings.load().name, "generated_at": timezone.now().isoformat()}

    if user.has_code("people.view"):
        data["people"] = _people_section(today)
    if user.has_code("groups.view", "groups.manage"):
        groups = Group.objects.filter(is_active=True)
        data["groups"] = {
            "active": groups.count(),
            "people_in_groups": Person.objects.active().filter(
                group_memberships__group__is_active=True).distinct().count(),
            "by_type": list(groups.values("group_type__name").annotate(n=Count("id"))
                            .order_by("-n")),
        }
    if user.has_code("events.view", "events.manage"):
        data["attendance"] = _attendance_section(today)
    if user.has_code("giving.view", "giving.manage"):
        data["giving"] = _giving_section(today)
    if user.has_code("pastoral.view"):
        care = CareRecord.objects.exclude(status="closed").filter(person__anonymised_at__isnull=True)
        if not user.has_code("pastoral.view_confidential"):
            care = care.filter(Q(is_confidential=False) | Q(created_by=user) | Q(assigned_to=user))
        data["pastoral"] = {
            "open": care.count(),
            "urgent": care.filter(priority__in=["high", "urgent"]).count(),
            "follow_ups_due": care.filter(follow_up_on__lte=today).count(),
            "assigned_to_me": care.filter(assigned_to=user).count(),
        }
    if user.has_code("privacy.view"):
        open_req = DataRequest.objects.exclude(status__in=["completed", "rejected"])
        data["privacy"] = {
            "open_requests": open_req.count(),
            "overdue_requests": open_req.filter(due_on__lt=today).count(),
        }
    return Response(data)
