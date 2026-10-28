"""GDPR data subject rights: access/portability export and erasure (anonymisation)."""

from django.db import transaction
from django.utils import timezone

from apps.core import audit
from apps.core.models import AuditLog, ChurchSettings
from apps.core.utils import years_ago
from apps.people.models import Person

from .models import Consent

ERASED = "Erased"


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def export_person_data(person: Person) -> dict:
    """Everything we hold about a person, in a portable structure (Arts. 15 & 20)."""
    from apps.events.models import Attendance
    from apps.giving.models import Donation, GiftAidDeclaration
    from apps.groups.models import GroupMembership
    from apps.pastoral.models import CareRecord

    profile = {}
    for field in person._meta.concrete_fields:
        if field.name in {"id", "created_by", "updated_by", "household", "campus"}:
            continue
        profile[field.name] = _iso(getattr(person, field.attname))
    church = ChurchSettings.load()
    return {
        "generated_at": timezone.now().isoformat(),
        "controller": {
            "name": church.legal_name or church.name,
            "contact": church.dpo_email or church.email,
            "charity_number": church.charity_number,
        },
        "subject": {"id": str(person.id), "name": person.full_name},
        "profile": profile,
        "household": (
            {"name": person.household.name, "address": ", ".join(filter(None, [
                person.household.address_line1, person.household.city,
                person.household.postcode]))}
            if person.household_id else None
        ),
        "tags": list(person.tags.values_list("name", flat=True)),
        "positions": list(person.positions.values_list("name", flat=True)),
        "milestones": [
            {"kind": m.get_kind_display(), "date": _iso(m.date), "place": m.place, "notes": m.notes}
            for m in person.milestones.all()
        ],
        "groups": [
            {"group": m.group.name, "role": m.get_role_display(), "joined_on": _iso(m.joined_on)}
            for m in GroupMembership.objects.filter(person=person).select_related("group")
        ],
        "attendance": [
            {"event": a.event.title, "date": _iso(a.event.starts_at), "status": a.status}
            for a in Attendance.objects.filter(person=person).select_related("event")
        ],
        "giving": [
            {"date": _iso(d.date), "fund": d.fund.name, "amount": str(d.amount),
             "method": d.get_method_display()}
            for d in Donation.objects.filter(person=person).select_related("fund")
        ],
        "gift_aid_declarations": [
            {"start_date": _iso(g.start_date), "end_date": _iso(g.end_date), "method": g.method}
            for g in GiftAidDeclaration.objects.filter(person=person)
        ],
        "pastoral_care": [
            {"date": _iso(c.occurred_on or c.created_at), "kind": c.get_kind_display(),
             "subject": c.subject, "details": c.details,
             "notes": [{"date": _iso(n.created_at), "body": n.body} for n in c.notes.all()]}
            for c in CareRecord.objects.filter(person=person).prefetch_related("notes")
        ],
        "consents": [
            {"purpose": c.get_purpose_display(), "granted": c.granted, "method": c.method,
             "recorded_at": _iso(c.recorded_at)}
            for c in person.consents.all()
        ],
        "communications": [
            {"subject": r.message.subject, "sent_at": _iso(r.message.sent_at), "status": r.status}
            for r in person.message_receipts.select_related("message")
        ],
    }


def financial_hold(person: Person) -> bool:
    """True if Gift Aid-claimed donations must be retained for HMRC (legal obligation)."""
    from apps.giving.models import Donation

    years = ChurchSettings.load().retention_years_financial
    cutoff = years_ago(years)
    return Donation.objects.filter(person=person, gift_aid_claimed_at__gte=cutoff).exists()


@transaction.atomic
def anonymise_person(person: Person, *, reason: str = "", keep_financial: bool = True) -> Person:
    """
    Irreversibly remove personal data (Art. 17) while keeping non-identifying
    aggregates (attendance counts, donation totals) intact.
    """
    from apps.events.models import Attendance
    from apps.giving.models import GiftAidDeclaration
    from apps.groups.models import GroupMembership
    from apps.pastoral.models import CareRecord

    before_name = person.full_name
    blank_fields = [
        "title", "preferred_name", "gender", "marital_status", "email", "phone_mobile",
        "phone_home", "address_line1", "address_line2", "city", "region", "postcode", "country",
        "occupation", "employer", "household_role", "how_heard", "notes", "medical_notes",
        "confidential_notes", "emergency_contact_name", "emergency_contact_phone",
        "archive_reason",
    ]
    for f in blank_fields:
        setattr(person, f, "")
    for f in ["date_of_birth", "anniversary", "membership_date", "first_visit_date",
              "date_of_death", "household", "campus"]:
        setattr(person, f, None)
    person.first_name = ERASED
    person.last_name = f"Person {str(person.id)[:8]}"
    person.anonymised_at = timezone.now()
    person.archived_at = person.archived_at or timezone.now()
    person.save()

    person.tags.clear()
    person.positions.clear()
    person.milestones.all().delete()
    GroupMembership.objects.filter(person=person).delete()
    CareRecord.objects.filter(person=person).delete()
    Attendance.objects.filter(person=person).update(security_code="")
    Consent.objects.filter(person=person).delete()
    if not (keep_financial and financial_hold(person)):
        GiftAidDeclaration.objects.filter(person=person).delete()
    person.message_receipts.update(email="")
    if hasattr(person, "user_account") and person.user_account:
        user = person.user_account
        user.person = None
        user.save(update_fields=["person"])

    audit.log(AuditLog.Action.ERASE, person, object_repr=f"Erased record ({str(person.id)[:8]})",
              changes={"reason": reason, "previous_name_redacted": bool(before_name)})
    return person
