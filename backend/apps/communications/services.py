from django.core.mail import EmailMessage, get_connection
from django.db.models import Q
from django.utils import timezone

from apps.core.models import ChurchSettings
from apps.people.models import Person
from apps.privacy.models import Consent

from .models import Message, MessageRecipient


def resolve_audience(audience: dict):
    qs = Person.objects.active()
    q = Q()
    matched_any = False
    if audience.get("group_ids"):
        q |= Q(group_memberships__group_id__in=audience["group_ids"])
        matched_any = True
    if audience.get("tag_ids"):
        q |= Q(tags__id__in=audience["tag_ids"])
        matched_any = True
    if audience.get("person_ids"):
        q |= Q(pk__in=audience["person_ids"])
        matched_any = True
    if audience.get("statuses"):
        q |= Q(status__in=audience["statuses"])
        matched_any = True
    if not matched_any:
        return qs.none()
    return qs.filter(q).distinct()


def audience_stats(audience: dict) -> dict:
    people = resolve_audience(audience)
    consented = Consent.granted_person_ids(Consent.Purpose.EMAIL)
    with_email = people.exclude(email="")
    sendable = with_email.filter(pk__in=consented)
    return {
        "matched": people.count(),
        "with_email": with_email.count(),
        "sendable": sendable.count(),
        "no_consent": with_email.exclude(pk__in=consented).count(),
    }


def render(body: str, person: Person) -> str:
    return (body.replace("{{first_name}}", person.preferred_name or person.first_name)
            .replace("{{last_name}}", person.last_name))


def send_message(message: Message) -> Message:
    church = ChurchSettings.load()
    people = list(resolve_audience(message.audience))
    consented = set(Consent.granted_person_ids(Consent.Purpose.EMAIL).values_list("person_id",
                                                                                  flat=True))
    footer = (
        f"\n\n--\n{church.name}\nYou are receiving this because you agreed to receive emails "
        f"from {church.name}. To stop, reply to this email or contact "
        f"{church.dpo_email or church.email or 'the church office'}."
    )
    sent = skipped = 0
    connection = get_connection()
    for person in people:
        if not person.email:
            status, skipped = MessageRecipient.Status.SKIPPED_NO_EMAIL, skipped + 1
        elif person.id not in consented:
            status, skipped = MessageRecipient.Status.SKIPPED_NO_CONSENT, skipped + 1
        else:
            try:
                EmailMessage(
                    subject=message.subject,
                    body=render(message.body, person) + footer,
                    to=[person.email],
                    reply_to=[church.email] if church.email else None,
                    connection=connection,
                ).send()
                status, sent = MessageRecipient.Status.SENT, sent + 1
            except Exception as exc:  # pragma: no cover - SMTP failure
                MessageRecipient.objects.create(message=message, person=person, email=person.email,
                                                status=MessageRecipient.Status.FAILED,
                                                error=str(exc)[:255])
                skipped += 1
                continue
        MessageRecipient.objects.create(message=message, person=person, email=person.email,
                                        status=status)
    message.status = Message.Status.SENT
    message.sent_at = timezone.now()
    message.recipient_count = sent
    message.skipped_count = skipped
    message.save()
    return message
