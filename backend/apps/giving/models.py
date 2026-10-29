from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel
from apps.people.models import Person


class Fund(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    goal_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    is_restricted = models.BooleanField(default=False, help_text="Restricted / designated fund")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class GiftAidDeclaration(TimeStampedModel):
    """UK Gift Aid declaration (HMRC). Covers donations from start_date until end_date."""

    class Method(models.TextChoices):
        WRITTEN = "written", "Written form"
        ONLINE = "online", "Online"
        ORAL = "oral", "Oral (confirmed in writing)"

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="gift_aid_declarations")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.WRITTEN)
    covers_past_four_years = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    effective_from = models.DateField(editable=False, db_index=True)

    class Meta:
        ordering = ["-start_date"]

    def save(self, *args, **kwargs):
        start = self.start_date
        if self.covers_past_four_years:
            try:
                start = start.replace(year=start.year - 4)
            except ValueError:  # 29 Feb
                start = start.replace(year=start.year - 4, day=28)
        self.effective_from = start
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Gift Aid: {self.person} from {self.start_date}"


class DonationQuerySet(models.QuerySet):
    def gift_aid_eligible(self):
        """Donations from a person with a declaration in force on the donation date."""
        decl = GiftAidDeclaration.objects.filter(
            person=models.OuterRef("person"),
            effective_from__lte=models.OuterRef("date"),
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=models.OuterRef("date")))
        return self.filter(person__isnull=False, eligible_for_gift_aid=True).filter(
            models.Exists(decl)
        )


class Donation(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CHEQUE = "cheque", "Cheque"
        BANK_TRANSFER = "bank_transfer", "Bank transfer / standing order"
        CARD = "card", "Card"
        ONLINE = "online", "Online"
        DIRECT_DEBIT = "direct_debit", "Direct debit"
        OTHER = "other", "Other"

    person = models.ForeignKey(Person, null=True, blank=True, on_delete=models.PROTECT,
                               related_name="donations",
                               help_text="Leave empty for anonymous / loose offering")
    fund = models.ForeignKey(Fund, on_delete=models.PROTECT, related_name="donations")
    amount = models.DecimalField(max_digits=12, decimal_places=2,
                                 validators=[MinValueValidator(Decimal("0.01"))])
    date = models.DateField(db_index=True)
    method = models.CharField(max_length=15, choices=Method.choices, default=Method.BANK_TRANSFER)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    eligible_for_gift_aid = models.BooleanField(
        default=True, help_text="Untick for gifts that cannot be claimed (e.g. with benefit)"
    )
    gift_aid_claimed_at = models.DateField(null=True, blank=True)

    objects = DonationQuerySet.as_manager()

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.amount} to {self.fund} on {self.date}"
