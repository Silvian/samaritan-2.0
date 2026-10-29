from django.db import models

from apps.core.models import Campus, TimeStampedModel
from apps.people.models import Person


class GroupType(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=20, default="indigo")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Group(TimeStampedModel):
    class Day(models.TextChoices):
        MONDAY = "mon", "Monday"
        TUESDAY = "tue", "Tuesday"
        WEDNESDAY = "wed", "Wednesday"
        THURSDAY = "thu", "Thursday"
        FRIDAY = "fri", "Friday"
        SATURDAY = "sat", "Saturday"
        SUNDAY = "sun", "Sunday"
        VARIES = "", "Varies"

    class Frequency(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        FORTNIGHTLY = "fortnightly", "Fortnightly"
        MONTHLY = "monthly", "Monthly"
        AD_HOC = "ad_hoc", "Ad hoc"

    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    group_type = models.ForeignKey(GroupType, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="groups")
    campus = models.ForeignKey(Campus, null=True, blank=True, on_delete=models.SET_NULL)
    meeting_day = models.CharField(max_length=3, choices=Day.choices, blank=True)
    meeting_time = models.TimeField(null=True, blank=True)
    frequency = models.CharField(max_length=12, choices=Frequency.choices, default=Frequency.WEEKLY)
    location = models.CharField(max_length=200, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_open = models.BooleanField(default=True, help_text="Open to new members")
    is_children = models.BooleanField(default=False, help_text="Children's / youth group")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class GroupMembership(TimeStampedModel):
    class Role(models.TextChoices):
        LEADER = "leader", "Leader"
        CO_LEADER = "co_leader", "Co-leader"
        MEMBER = "member", "Member"
        GUEST = "guest", "Guest"

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="memberships")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="group_memberships")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    joined_on = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["role", "person__last_name"]
        constraints = [
            models.UniqueConstraint(fields=["group", "person"], name="unique_group_person")
        ]

    def __str__(self):
        return f"{self.person} in {self.group} ({self.role})"
