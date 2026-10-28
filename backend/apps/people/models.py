from datetime import date

from django.db import models
from django.utils import timezone

from apps.core.fields import EncryptedTextField
from apps.core.models import Campus, TimeStampedModel


class Tag(TimeStampedModel):
    name = models.CharField(max_length=60, unique=True)
    color = models.CharField(max_length=20, default="slate")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Position(TimeStampedModel):
    """Church office / role held by a person (Elder, Deacon, Treasurer...)."""

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Household(TimeStampedModel):
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=50, blank=True)
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    postcode = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True, default="United Kingdom")
    campus = models.ForeignKey(Campus, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class PersonQuerySet(models.QuerySet):
    def active(self):
        return self.filter(archived_at__isnull=True, anonymised_at__isnull=True)


class Person(TimeStampedModel):
    class Status(models.TextChoices):
        VISITOR = "visitor", "Visitor"
        REGULAR = "regular", "Regular attender"
        MEMBER = "member", "Member"
        INACTIVE = "inactive", "Inactive"
        FORMER = "former", "Former member"
        DECEASED = "deceased", "Deceased"

    class Gender(models.TextChoices):
        FEMALE = "female", "Female"
        MALE = "male", "Male"
        UNSPECIFIED = "", "Prefer not to say"

    class HouseholdRole(models.TextChoices):
        HEAD = "head", "Head"
        SPOUSE = "spouse", "Spouse / partner"
        CHILD = "child", "Child"
        OTHER = "other", "Other"

    class MaritalStatus(models.TextChoices):
        SINGLE = "single", "Single"
        MARRIED = "married", "Married"
        WIDOWED = "widowed", "Widowed"
        DIVORCED = "divorced", "Divorced"
        SEPARATED = "separated", "Separated"
        UNSPECIFIED = "", "Not specified"

    title = models.CharField(max_length=20, blank=True)
    first_name = models.CharField(max_length=100)
    preferred_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    marital_status = models.CharField(max_length=12, choices=MaritalStatus.choices, blank=True)
    anniversary = models.DateField(null=True, blank=True)

    email = models.EmailField(blank=True, db_index=True)
    phone_mobile = models.CharField(max_length=50, blank=True)
    phone_home = models.CharField(max_length=50, blank=True)
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    postcode = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)

    occupation = models.CharField(max_length=120, blank=True)
    employer = models.CharField(max_length=120, blank=True)

    household = models.ForeignKey(
        Household, null=True, blank=True, on_delete=models.SET_NULL, related_name="members"
    )
    household_role = models.CharField(max_length=10, choices=HouseholdRole.choices, blank=True)
    campus = models.ForeignKey(Campus, null=True, blank=True, on_delete=models.SET_NULL)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.VISITOR,
                              db_index=True)
    membership_date = models.DateField(null=True, blank=True)
    first_visit_date = models.DateField(null=True, blank=True)
    how_heard = models.CharField(max_length=200, blank=True)
    positions = models.ManyToManyField(Position, blank=True, related_name="people")
    tags = models.ManyToManyField(Tag, blank=True, related_name="people")

    # Special-category / confidential (encrypted at rest, gated by people.view_sensitive)
    medical_notes = EncryptedTextField(blank=True, default="",
                                       help_text="Allergies, medical needs (children's check-in)")
    confidential_notes = EncryptedTextField(blank=True, default="")
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=50, blank=True)

    # General notes (visible to anyone with people.view)
    notes = models.TextField(blank=True)

    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    archive_reason = models.CharField(max_length=200, blank=True)
    anonymised_at = models.DateTimeField(null=True, blank=True)
    date_of_death = models.DateField(null=True, blank=True)

    objects = PersonQuerySet.as_manager()

    SENSITIVE_FIELDS = ("medical_notes", "confidential_notes")

    class Meta:
        ordering = ["last_name", "first_name"]
        indexes = [
            models.Index(fields=["last_name", "first_name"]),
            models.Index(fields=["status", "archived_at"]),
        ]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        first = self.preferred_name or self.first_name
        return f"{first} {self.last_name}".strip()

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        today = date.today()
        dob = self.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    @property
    def is_child(self):
        return self.age is not None and self.age < 18

    @property
    def is_archived(self):
        return self.archived_at is not None

    def archive(self, reason=""):
        self.archived_at = timezone.now()
        self.archive_reason = reason
        self.save(update_fields=["archived_at", "archive_reason", "updated_at"])

    def restore(self):
        self.archived_at = None
        self.archive_reason = ""
        self.save(update_fields=["archived_at", "archive_reason", "updated_at"])


class Milestone(TimeStampedModel):
    """Faith journey and life events: baptism, membership, marriage..."""

    class Kind(models.TextChoices):
        FIRST_VISIT = "first_visit", "First visit"
        SALVATION = "salvation", "Salvation / commitment"
        BAPTISM = "baptism", "Baptism"
        CONFIRMATION = "confirmation", "Confirmation"
        DEDICATION = "dedication", "Dedication / christening"
        MEMBERSHIP = "membership", "Became a member"
        MARRIAGE = "marriage", "Marriage"
        ORDINATION = "ordination", "Ordination"
        COURSE = "course", "Completed course"
        OTHER = "other", "Other"

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="milestones")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    date = models.DateField()
    place = models.CharField(max_length=200, blank=True)
    officiant = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.get_kind_display()} - {self.person}"
