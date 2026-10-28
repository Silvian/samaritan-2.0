from datetime import date, datetime


def years_ago(years: int, today: date | datetime | None = None):
    """Same calendar day `years` ago (29 Feb falls back to 28 Feb)."""
    from django.utils import timezone

    today = today or timezone.localdate()
    try:
        return today.replace(year=today.year - years)
    except ValueError:
        return today.replace(year=today.year - years, day=28)
