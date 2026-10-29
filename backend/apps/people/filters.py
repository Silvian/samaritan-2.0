from datetime import date

import django_filters
from django.db.models import Q

from .models import Household, Person


class PersonFilter(django_filters.FilterSet):
    status = django_filters.MultipleChoiceFilter(choices=Person.Status.choices)
    tag = django_filters.UUIDFilter(field_name="tags__id")
    position = django_filters.UUIDFilter(field_name="positions__id")
    group = django_filters.UUIDFilter(field_name="group_memberships__group_id")
    campus = django_filters.UUIDFilter(field_name="campus_id")
    household = django_filters.UUIDFilter(field_name="household_id")
    has_email = django_filters.BooleanFilter(method="filter_has_email")
    archived = django_filters.BooleanFilter(method="filter_archived")
    age_min = django_filters.NumberFilter(method="filter_age_min")
    age_max = django_filters.NumberFilter(method="filter_age_max")
    birthday_month = django_filters.NumberFilter(field_name="date_of_birth__month")
    created_after = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    gender = django_filters.ChoiceFilter(choices=Person.Gender.choices)

    class Meta:
        model = Person
        fields = ["status", "tag", "group", "campus", "household", "gender"]

    def filter_has_email(self, qs, name, value):
        return qs.exclude(email="") if value else qs.filter(email="")

    def filter_archived(self, qs, name, value):
        return qs.filter(archived_at__isnull=not value)

    def _years_ago(self, years):
        today = date.today()
        try:
            return today.replace(year=today.year - int(years))
        except ValueError:  # 29 Feb
            return today.replace(year=today.year - int(years), day=28)

    def filter_age_min(self, qs, name, value):
        return qs.filter(date_of_birth__lte=self._years_ago(value))

    def filter_age_max(self, qs, name, value):
        cutoff = self._years_ago(int(value) + 1)
        return qs.filter(Q(date_of_birth__gt=cutoff))


class HouseholdFilter(django_filters.FilterSet):
    campus = django_filters.UUIDFilter(field_name="campus_id")

    class Meta:
        model = Household
        fields = ["campus"]
