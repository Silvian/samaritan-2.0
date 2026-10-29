from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import MFASatisfied, RBACPermission
from apps.core import audit
from apps.core.models import AuditLog
from apps.core.viewsets import AuditedModelViewSet
from apps.people.models import Person
from apps.people.scoping import led_group_ids, people_visible_to

from .models import Attendance, Event
from .serializers import (
    AttendanceSerializer,
    BulkAttendanceSerializer,
    CheckInSerializer,
    DuplicateEventSerializer,
    EventSerializer,
)

VIEW_EVENTS = ("events.view", "events.manage", "groups.lead")


class EventViewSet(AuditedModelViewSet):
    serializer_class = EventSerializer
    filterset_fields = {
        "kind": ["exact", "in"],
        "campus": ["exact"],
        "group": ["exact"],
        "is_cancelled": ["exact"],
        "starts_at": ["gte", "lte", "date"],
    }
    search_fields = ["title", "location", "description"]
    ordering_fields = ["starts_at", "title"]
    permission_map = {
        "list": VIEW_EVENTS,
        "retrieve": VIEW_EVENTS,
        "create": "events.manage",
        "update": "events.manage",
        "partial_update": ("events.manage", "attendance.record"),
        "destroy": "events.manage",
        "duplicate": "events.manage",
        "attendance": ("attendance.record", "events.view", "events.manage"),
        "record_attendance": "attendance.record",
        "check_in": "attendance.record",
        "check_out": "attendance.record",
        "roster": "attendance.record",
    }

    def get_queryset(self):
        qs = Event.objects.select_related("campus", "group").annotate(
            present_count=Count("attendance", filter=Q(attendance__status="present"))
        )
        user = self.request.user
        if not user.has_code("events.view", "events.manage"):
            qs = qs.filter(group_id__in=led_group_ids(user))
        return qs

    def perform_update(self, serializer):
        user = self.request.user
        if not user.has_code("events.manage"):
            # Attendance recorders may only update the headcount.
            if set(serializer.validated_data) - {"headcount"}:
                raise PermissionDenied("You can only update the headcount for this event.")
        super().perform_update(serializer)

    def _check_recordable(self, event):
        user = self.request.user
        if not user.has_code("events.manage", "events.view") and event.group_id not in led_group_ids(user):
            raise PermissionDenied("You can only record attendance for your own groups.")
        if event.is_cancelled:
            raise ValidationError("This event has been cancelled.")

    @extend_schema(request=DuplicateEventSerializer, responses=EventSerializer(many=True))
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Repeat this event weekly for N weeks."""
        event = self.get_object()
        ser = DuplicateEventSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        created = []
        for i in range(1, ser.validated_data["weeks"] + 1):
            delta = timedelta(weeks=i)
            copy = Event.objects.create(
                title=event.title, description=event.description, kind=event.kind,
                starts_at=event.starts_at + delta,
                ends_at=event.ends_at + delta if event.ends_at else None,
                location=event.location, campus=event.campus, group=event.group,
                capacity=event.capacity, check_in_enabled=event.check_in_enabled,
                created_by=request.user, updated_by=request.user,
            )
            created.append(copy)
        audit.log(AuditLog.Action.CREATE, event, changes={"duplicated_weeks": len(created)})
        return Response(EventSerializer(created, many=True).data, status=201)

    @extend_schema(responses=AttendanceSerializer(many=True))
    @action(detail=True, methods=["get"])
    def attendance(self, request, pk=None):
        event = self.get_object()
        qs = event.attendance.select_related("person", "event").filter(
            person__anonymised_at__isnull=True
        )
        return Response(AttendanceSerializer(qs, many=True).data)

    @extend_schema(responses={200: dict})
    @action(detail=True, methods=["get"])
    def roster(self, request, pk=None):
        """People expected at this event (group members, or search results) with status."""
        event = self.get_object()
        self._check_recordable(event)
        if event.group_id:
            people = Person.objects.active().filter(group_memberships__group_id=event.group_id)
        else:
            q = request.query_params.get("q", "").strip()
            people = people_visible_to(request.user, Person.objects.active())
            if q:
                people = people.filter(
                    Q(first_name__icontains=q) | Q(last_name__icontains=q)
                    | Q(preferred_name__icontains=q) | Q(household__name__icontains=q)
                )
            else:
                people = people.filter(attendance__event=event)
        people = people.select_related("household").distinct()[:200]
        existing = {a.person_id: a for a in event.attendance.all()}
        data = []
        for p in people:
            a = existing.get(p.id)
            data.append({
                "person_id": str(p.id), "full_name": p.full_name, "age": p.age,
                "household": p.household.name if p.household_id else None,
                "is_child": p.is_child,
                "status": a.status if a else None,
                "checked_in_at": a.checked_in_at if a else None,
                "checked_out_at": a.checked_out_at if a else None,
                "security_code": a.security_code if a else "",
            })
        return Response(data)

    @extend_schema(request=BulkAttendanceSerializer, responses={200: dict})
    @action(detail=True, methods=["post"], url_path="record-attendance")
    def record_attendance(self, request, pk=None):
        event = self.get_object()
        self._check_recordable(event)
        ser = BulkAttendanceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        people = people_visible_to(request.user, Person.objects.active()).filter(
            pk__in=ser.validated_data["person_ids"]
        )
        status_value = ser.validated_data["status"]
        now = timezone.now()
        n = 0
        for person in people:
            Attendance.objects.update_or_create(
                event=event, person=person,
                defaults={
                    "status": status_value,
                    "recorded_by": request.user,
                    "checked_in_at": now if status_value == "present" else None,
                },
            )
            n += 1
        audit.log(AuditLog.Action.UPDATE, event, changes={"attendance": status_value, "count": n})
        return Response({"updated": n})

    @extend_schema(request=CheckInSerializer, responses=AttendanceSerializer)
    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request, pk=None):
        event = self.get_object()
        self._check_recordable(event)
        if not event.check_in_enabled:
            raise ValidationError("Check-in is not enabled for this event.")
        ser = CheckInSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        person = ser.validated_data["person_id"]
        if not people_visible_to(request.user, Person.objects.filter(pk=person.pk)).exists():
            raise PermissionDenied("You cannot check in this person.")
        attendance, _ = Attendance.objects.get_or_create(event=event, person=person)
        attendance.status = Attendance.Status.PRESENT
        attendance.checked_in_at = timezone.now()
        attendance.checked_out_at = None
        attendance.recorded_by = request.user
        if person.is_child and not attendance.security_code:
            attendance.security_code = Attendance.new_security_code()
        attendance.save()
        return Response(AttendanceSerializer(attendance).data)

    @extend_schema(request=CheckInSerializer, responses=AttendanceSerializer)
    @action(detail=True, methods=["post"], url_path="check-out")
    def check_out(self, request, pk=None):
        event = self.get_object()
        self._check_recordable(event)
        ser = CheckInSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        attendance = event.attendance.filter(person=ser.validated_data["person_id"]).first()
        if not attendance:
            raise ValidationError("This person is not checked in.")
        code = (request.data.get("security_code") or "").upper()
        if attendance.security_code and code != attendance.security_code:
            raise ValidationError({"security_code": "Security code does not match."})
        attendance.checked_out_at = timezone.now()
        attendance.save(update_fields=["checked_out_at", "updated_at"])
        return Response(AttendanceSerializer(attendance).data)


class AttendanceViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Attendance history (e.g. for a person's profile)."""

    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, MFASatisfied, RBACPermission]
    permission_map = {"list": ("events.view", "events.manage")}
    filterset_fields = ["person", "event", "status"]
    ordering_fields = ["event__starts_at"]
    ordering = ["-event__starts_at"]

    def get_queryset(self):
        return Attendance.objects.select_related("person", "event").filter(
            person__anonymised_at__isnull=True
        )
