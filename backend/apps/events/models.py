import secrets

from django.conf import settings
from django.db import models

from apps.core.models import Campus, TimeStampedModel
from apps.groups.models import Group
from apps.people.models import Person


class Event(TimeStampedModel):
    class Kind(models.TextChoices):
        SERVICE = "service", "Service"
        GROUP_MEETING = "group_meeting", "Group meeting"
        CLASS = "class", "Class / course"
        PRAYER = "prayer", "Prayer meeting"
        YOUTH = "youth", "Youth / children"
        OUTREACH = "outreach", "Outreach"
        SOCIAL = "social", "Social"
        OTHER = "other", "Other"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.SERVICE)
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=200, blank=True)
    campus = models.ForeignKey(Campus, null=True, blank=True, on_delete=models.SET_NULL)
    group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="events")
    capacity = models.PositiveIntegerField(null=True, blank=True)
    headcount = models.PositiveIntegerField(
        null=True, blank=True, help_text="Total attendance counted (incl. people not checked in)"
    )
    check_in_enabled = models.BooleanField(default=True)
    is_cancelled = models.BooleanField(default=False)

    class Meta:
        ordering = ["-starts_at"]

    def __str__(self):
        return f"{self.title} ({self.starts_at:%d %b %Y})"


def _security_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(4))


class Attendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        EXCUSED = "excused", "Excused"

    id = models.BigAutoField(primary_key=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="attendance")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="attendance")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PRESENT)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    security_code = models.CharField(max_length=8, blank=True,
                                     help_text="Child pick-up code printed on labels")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["person__last_name", "person__first_name"]
        constraints = [
            models.UniqueConstraint(fields=["event", "person"], name="unique_event_person")
        ]

    def __str__(self):
        return f"{self.person} @ {self.event}: {self.status}"

    @staticmethod
    def new_security_code():
        return _security_code()
