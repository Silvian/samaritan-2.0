from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel
from apps.people.models import Person


class Consent(models.Model):
    """
    Append-only consent ledger (GDPR Art. 7: demonstrate consent).
    The latest entry per (person, purpose) is the current state.
    """

    class Purpose(models.TextChoices):
        EMAIL = "email", "Email communications"
        SMS = "sms", "SMS / text messages"
        POST = "post", "Postal mail"
        PHOTO = "photo", "Photos & video in church media"
        DIRECTORY = "directory", "Listing in the member directory"

    class Method(models.TextChoices):
        PAPER = "paper", "Paper form"
        ONLINE = "online", "Online form"
        VERBAL = "verbal", "Verbal (recorded by staff)"
        EMAIL = "email", "Email"
        IMPORT = "import", "Imported"

    id = models.BigAutoField(primary_key=True)
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="consents")
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    granted = models.BooleanField()
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.PAPER)
    evidence = models.CharField(max_length=255, blank=True,
                                help_text="Where the evidence is kept, e.g. form reference")
    given_by_guardian = models.BooleanField(default=False,
                                            help_text="Consent given by a parent/guardian (child)")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name="+")
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-recorded_at", "-id"]
        indexes = [models.Index(fields=["person", "purpose", "-recorded_at"])]

    def __str__(self):
        return f"{self.person}: {self.purpose}={'yes' if self.granted else 'no'}"

    @classmethod
    def current_for(cls, person) -> dict:
        state = {p: None for p, _ in cls.Purpose.choices}
        for c in cls.objects.filter(person=person).order_by("purpose", "-recorded_at", "-id") \
                .distinct("purpose"):
            state[c.purpose] = c
        return state

    @classmethod
    def granted_person_ids(cls, purpose: str):
        latest = (
            cls.objects.filter(purpose=purpose)
            .order_by("person_id", "-recorded_at", "-id")
            .distinct("person_id")
            .values("id")
        )
        return cls.objects.filter(id__in=latest, granted=True).values("person_id")


class DataRequest(TimeStampedModel):
    """Data subject rights request (GDPR Arts. 15-22). Statutory deadline: one month."""

    class Kind(models.TextChoices):
        ACCESS = "access", "Access (SAR)"
        RECTIFICATION = "rectification", "Rectification"
        ERASURE = "erasure", "Erasure ('right to be forgotten')"
        RESTRICTION = "restriction", "Restriction of processing"
        PORTABILITY = "portability", "Data portability"
        OBJECTION = "objection", "Objection"

    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        VERIFYING = "verifying", "Verifying identity"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        REJECTED = "rejected", "Rejected"

    person = models.ForeignKey(Person, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="data_requests")
    requester_name = models.CharField(max_length=200)
    requester_email = models.EmailField(blank=True)
    kind = models.CharField(max_length=15, choices=Kind.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.RECEIVED,
                              db_index=True)
    received_on = models.DateField(default=timezone.localdate)
    due_on = models.DateField(blank=True)
    identity_verified = models.BooleanField(default=False)
    description = models.TextField(blank=True)
    resolution = models.TextField(blank=True)
    completed_on = models.DateField(null=True, blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["due_on"]

    def save(self, *args, **kwargs):
        if not self.due_on:
            self.due_on = self.received_on + timedelta(days=30)
        super().save(*args, **kwargs)

    @property
    def is_overdue(self):
        return self.status not in (self.Status.COMPLETED, self.Status.REJECTED) and \
            self.due_on < timezone.localdate()

    def __str__(self):
        return f"{self.get_kind_display()} - {self.requester_name}"
