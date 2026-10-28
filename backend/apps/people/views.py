import csv

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import audit
from apps.core.models import AuditLog
from apps.core.viewsets import AuditedModelViewSet

from .filters import HouseholdFilter, PersonFilter
from .models import Household, Milestone, Person, Position, Tag
from .scoping import people_visible_to
from .serializers import (
    ArchiveSerializer,
    BulkTagSerializer,
    HouseholdSerializer,
    MilestoneSerializer,
    PersonListSerializer,
    PersonSerializer,
    PositionSerializer,
    TagSerializer,
)

VIEW_PEOPLE = ("people.view", "groups.lead")

EXPORT_COLUMNS = [
    ("first_name", "First name"), ("last_name", "Last name"), ("preferred_name", "Preferred name"),
    ("email", "Email"), ("phone_mobile", "Mobile"), ("phone_home", "Home phone"),
    ("address_line1", "Address 1"), ("address_line2", "Address 2"), ("city", "City"),
    ("region", "Region"), ("postcode", "Postcode"), ("country", "Country"),
    ("date_of_birth", "Date of birth"), ("status", "Status"), ("membership_date", "Member since"),
]


def _csv_safe(value):
    """Neutralise spreadsheet formula injection (CWE-1236)."""
    text = "" if value is None else str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


class PersonViewSet(AuditedModelViewSet):
    audit_reads = True
    filterset_class = PersonFilter
    search_fields = ["first_name", "last_name", "preferred_name", "email", "phone_mobile",
                     "postcode"]
    ordering_fields = ["last_name", "first_name", "created_at", "date_of_birth", "status"]
    ordering = ["last_name", "first_name"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_map = {
        "list": VIEW_PEOPLE,
        "retrieve": VIEW_PEOPLE,
        "create": "people.create",
        "partial_update": "people.edit",
        "archive": "people.archive",
        "restore": "people.archive",
        "export": "people.export",
        "bulk_tag": "people.edit",
        "duplicates": "people.edit",
    }

    def get_queryset(self):
        qs = Person.objects.filter(anonymised_at__isnull=True).select_related(
            "household", "campus"
        ).prefetch_related("tags")
        if self.action == "retrieve":
            qs = qs.prefetch_related("positions", "milestones")
        elif "archived" not in self.request.query_params and self.action in ("list", "export"):
            qs = qs.filter(archived_at__isnull=True)
        return people_visible_to(self.request.user, qs)

    def get_serializer_class(self):
        if self.action in ("list",):
            return PersonListSerializer
        return PersonSerializer

    @extend_schema(request=ArchiveSerializer, responses=PersonSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        person = self.get_object()
        ser = ArchiveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        person.archive(ser.validated_data.get("reason", ""))
        audit.log(AuditLog.Action.UPDATE, person, changes={"archived": True})
        return Response(PersonSerializer(person, context={"request": request}).data)

    @extend_schema(request=None, responses=PersonSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        person = self.get_object()
        person.restore()
        audit.log(AuditLog.Action.UPDATE, person, changes={"archived": False})
        return Response(PersonSerializer(person, context={"request": request}).data)

    @extend_schema(responses={(200, "text/csv"): bytes})
    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        count = qs.count()
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        stamp = timezone.now().strftime("%Y%m%d-%H%M")
        response["Content-Disposition"] = f'attachment; filename="people-{stamp}.csv"'
        writer = csv.writer(response)
        writer.writerow([label for _, label in EXPORT_COLUMNS])
        for person in qs.iterator(chunk_size=500):
            writer.writerow([_csv_safe(getattr(person, f)) for f, _ in EXPORT_COLUMNS])
        audit.log(AuditLog.Action.EXPORT, object_type="people.person",
                  object_repr=f"CSV export of {count} people",
                  changes={"filters": dict(request.query_params), "count": count})
        return response

    @extend_schema(request=BulkTagSerializer, responses={200: dict})
    @action(detail=False, methods=["post"], url_path="bulk-tag")
    def bulk_tag(self, request):
        ser = BulkTagSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        tag = ser.validated_data["tag_id"]
        people = self.get_queryset().filter(pk__in=ser.validated_data["person_ids"])
        n = 0
        for person in people:
            (person.tags.remove if ser.validated_data["remove"] else person.tags.add)(tag)
            n += 1
        audit.log(AuditLog.Action.UPDATE, tag,
                  changes={"bulk": "remove" if ser.validated_data["remove"] else "add", "count": n})
        return Response({"updated": n})

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"])
    def duplicates(self, request):
        """Potential duplicate records (same name + email/phone/dob)."""
        qs = self.get_queryset().filter(archived_at__isnull=True)
        groups = (
            qs.values("first_name", "last_name")
            .annotate(n=Count("id"))
            .filter(n__gt=1)
            .order_by("-n")[:50]
        )
        results = []
        for g in groups:
            matches = qs.filter(first_name__iexact=g["first_name"], last_name__iexact=g["last_name"])
            results.append({
                "name": f"{g['first_name']} {g['last_name']}",
                "people": PersonListSerializer(matches, many=True,
                                               context={"request": request}).data,
            })
        return Response(results)


class HouseholdViewSet(AuditedModelViewSet):
    serializer_class = HouseholdSerializer
    filterset_class = HouseholdFilter
    search_fields = ["name", "postcode", "address_line1", "city"]
    ordering_fields = ["name", "created_at"]
    permission_map = {
        "list": "people.view",
        "retrieve": "people.view",
        "create": "people.create",
        "update": "people.edit",
        "partial_update": "people.edit",
        "destroy": "people.edit",
    }

    def get_queryset(self):
        return Household.objects.select_related("campus").annotate(
            member_count=Count("members", filter=Q(members__anonymised_at__isnull=True))
        )

    def perform_destroy(self, instance):
        # Detach members rather than deleting them
        instance.members.update(household=None, household_role="")
        super().perform_destroy(instance)


class TagViewSet(AuditedModelViewSet):
    serializer_class = TagSerializer
    pagination_class = None
    search_fields = ["name"]
    permission_map = {
        "list": VIEW_PEOPLE,
        "retrieve": VIEW_PEOPLE,
        "create": "people.edit",
        "update": "people.edit",
        "partial_update": "people.edit",
        "destroy": "settings.manage",
    }

    def get_queryset(self):
        return Tag.objects.annotate(
            people_count=Count("people", filter=Q(people__archived_at__isnull=True))
        )


class PositionViewSet(AuditedModelViewSet):
    serializer_class = PositionSerializer
    pagination_class = None
    search_fields = ["name"]
    permission_map = {
        "list": VIEW_PEOPLE,
        "retrieve": VIEW_PEOPLE,
        "create": "settings.manage",
        "update": "settings.manage",
        "partial_update": "settings.manage",
        "destroy": "settings.manage",
    }

    def get_queryset(self):
        return Position.objects.annotate(
            people_count=Count("people", filter=Q(people__archived_at__isnull=True))
        )


class MilestoneViewSet(AuditedModelViewSet):
    serializer_class = MilestoneSerializer
    filterset_fields = ["person", "kind"]
    ordering_fields = ["date"]
    permission_map = {
        "list": "people.view",
        "retrieve": "people.view",
        "create": "people.edit",
        "update": "people.edit",
        "partial_update": "people.edit",
        "destroy": "people.edit",
    }

    def get_queryset(self):
        qs = Milestone.objects.select_related("person").filter(person__anonymised_at__isnull=True)
        since = self.request.query_params.get("since")
        if since:
            qs = qs.filter(date__gte=since)
        return qs
