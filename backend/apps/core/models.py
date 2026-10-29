import uuid

from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base: non-enumerable UUID keys + audit timestamps."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        editable=False,
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        editable=False,
    )

    class Meta:
        abstract = True


class SingletonModel(models.Model):
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):  # pragma: no cover - singletons are never deleted
        return None

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ChurchSettings(SingletonModel):
    """Organisation-wide configuration, including GDPR controls."""

    name = models.CharField(max_length=200, default="My Church")
    legal_name = models.CharField(max_length=200, blank=True)
    charity_number = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    website = models.URLField(blank=True)
    address = models.TextField(blank=True)
    currency = models.CharField(max_length=3, default="GBP")
    timezone = models.CharField(max_length=64, default="Europe/London")
    primary_color = models.CharField(max_length=7, default="#4f46e5")

    # Data protection
    data_controller_name = models.CharField(max_length=200, blank=True)
    dpo_email = models.EmailField(blank=True, help_text="Data protection officer / contact")
    privacy_notice_url = models.URLField(blank=True)
    retention_years_inactive = models.PositiveSmallIntegerField(
        default=6,
        help_text="Archived people are anonymised after this many years.",
    )
    retention_years_financial = models.PositiveSmallIntegerField(
        default=6,
        help_text="Giving records are kept this long for HMRC / audit purposes.",
    )
    require_mfa = models.BooleanField(
        default=True, help_text="Require every user to enrol in two-factor authentication."
    )
    session_idle_minutes = models.PositiveSmallIntegerField(default=30)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "church settings"
        verbose_name_plural = "church settings"

    def __str__(self):
        return self.name


class Campus(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "campuses"

    def __str__(self):
        return self.name


class AuditLog(models.Model):
    """Append-only record of who did what to which personal data."""

    class Action(models.TextChoices):
        CREATE = "create"
        UPDATE = "update"
        DELETE = "delete"
        VIEW = "view"
        EXPORT = "export"
        ERASE = "erase"
        LOGIN = "login"
        LOGIN_FAILED = "login_failed"
        LOGOUT = "logout"
        MFA = "mfa"
        PASSWORD = "password"
        SEND = "send"
        PERMISSION_DENIED = "permission_denied"

    id = models.BigAutoField(primary_key=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_entries",
    )
    actor_email = models.CharField(max_length=254, blank=True)
    action = models.CharField(max_length=32, choices=Action.choices, db_index=True)
    object_type = models.CharField(max_length=100, blank=True, db_index=True)
    object_id = models.CharField(max_length=64, blank=True, db_index=True)
    object_repr = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [models.Index(fields=["object_type", "object_id"])]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValueError("Audit log entries are immutable")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Audit log entries cannot be deleted")

    def __str__(self):
        return f"{self.timestamp:%Y-%m-%d %H:%M} {self.actor_email} {self.action} {self.object_type}"
