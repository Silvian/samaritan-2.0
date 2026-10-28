from django.conf import settings
from django.db import models

from apps.core.fields import EncryptedTextField
from apps.core.models import TimeStampedModel
from apps.people.models import Person


class CareRecord(TimeStampedModel):
    """Pastoral care case. Details are encrypted at rest (religious / health data)."""

    class Kind(models.TextChoices):
        VISIT = "visit", "Home visit"
        HOSPITAL = "hospital", "Hospital visit"
        CALL = "call", "Phone call"
        PRAYER = "prayer", "Prayer request"
        COUNSELLING = "counselling", "Counselling"
        BEREAVEMENT = "bereavement", "Bereavement"
        WELFARE = "welfare", "Practical / welfare support"
        NEW_BELIEVER = "new_believer", "New believer follow-up"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        FOLLOW_UP = "follow_up", "Needs follow-up"
        CLOSED = "closed", "Closed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="care_records")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.VISIT)
    subject = models.CharField(max_length=200, help_text="Short, non-sensitive summary")
    details = EncryptedTextField(blank=True, default="")
    is_confidential = models.BooleanField(
        default=False,
        help_text="Only visible to the author, assignee and users with confidential access",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN,
                              db_index=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    occurred_on = models.DateField(null=True, blank=True)
    follow_up_on = models.DateField(null=True, blank=True, db_index=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name="care_assignments")
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.subject}"


class CareNote(TimeStampedModel):
    record = models.ForeignKey(CareRecord, on_delete=models.CASCADE, related_name="notes")
    body = EncryptedTextField()

    class Meta:
        ordering = ["created_at"]
