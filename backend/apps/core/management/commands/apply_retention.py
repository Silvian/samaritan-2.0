"""Anonymise people archived longer than the configured retention period (GDPR Art. 5(1)(e))."""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.models import ChurchSettings
from apps.core.utils import years_ago
from apps.people.models import Person
from apps.privacy.services import anonymise_person


class Command(BaseCommand):
    help = "Anonymise archived people past the retention period. Run daily from cron."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, dry_run=False, **options):
        years = ChurchSettings.load().retention_years_inactive
        cutoff = years_ago(years, timezone.now())
        due = Person.objects.filter(anonymised_at__isnull=True, archived_at__lt=cutoff)
        n = due.count()
        if dry_run:
            self.stdout.write(f"{n} people would be anonymised (archived before {cutoff:%Y-%m-%d}).")
            return
        for person in due.iterator():
            anonymise_person(person, reason=f"Retention policy: archived over {years} years")
        self.stdout.write(self.style.SUCCESS(f"Anonymised {n} people."))
