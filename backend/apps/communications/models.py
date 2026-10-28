from django.db import models

from apps.core.models import TimeStampedModel
from apps.people.models import Person


class Message(TimeStampedModel):
    class Channel(models.TextChoices):
        EMAIL = "email", "Email"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    subject = models.CharField(max_length=200)
    body = models.TextField(help_text="Plain text. Merge fields: {{first_name}}, {{last_name}}")
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.EMAIL)
    audience = models.JSONField(
        default=dict, blank=True,
        help_text='{"group_ids": [], "tag_ids": [], "statuses": [], "person_ids": []}',
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    sent_at = models.DateTimeField(null=True, blank=True)
    recipient_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.subject


class MessageRecipient(models.Model):
    class Status(models.TextChoices):
        SENT = "sent", "Sent"
        SKIPPED_NO_CONSENT = "no_consent", "Skipped: no consent"
        SKIPPED_NO_EMAIL = "no_email", "Skipped: no email address"
        FAILED = "failed", "Failed"

    id = models.BigAutoField(primary_key=True)
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="recipients")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="message_receipts")
    email = models.EmailField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices)
    error = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["person__last_name"]
        constraints = [
            models.UniqueConstraint(fields=["message", "person"], name="unique_message_person")
        ]
