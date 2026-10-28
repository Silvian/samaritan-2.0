import json
from datetime import date, timedelta

from django.db.models import Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.accounts.permissions import MFASatisfied, RBACPermission, has_perm
from apps.core import audit
from apps.core.models import AuditLog, ChurchSettings
from apps.core.utils import years_ago
from apps.core.viewsets import AuditedModelViewSet
from apps.people.models import Person

from .models import Consent, DataRequest
from .serializers import ConsentSerializer, DataRequestSerializer, EraseSerializer
from .services import anonymise_person, export_person_data, financial_hold


class ConsentViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Consent is append-only: record a new entry to change it."""

    serializer_class = ConsentSerializer
    permission_classes = [IsAuthenticated, MFASatisfied, RBACPermission]
    permission_map = {
        "list": ("privacy.view", "people.view"),
        "create": ("privacy.manage", "people.edit"),
        "current": ("privacy.view", "people.view"),
    }
    filterset_fields = ["person", "purpose", "granted"]

    def get_queryset(self):
        return Consent.objects.select_related("person", "recorded_by").filter(
            person__anonymised_at__isnull=True
        )

    def perform_create(self, serializer):
        consent = serializer.save(recorded_by=self.request.user)
        audit.log(AuditLog.Action.CREATE, consent.person,
                  changes={"consent": consent.purpose, "granted": consent.granted,
                           "method": consent.method})

    @extend_schema(responses={200: dict})
    def current(self, request):
        person = get_object_or_404(Person, pk=request.query_params.get("person"))
        state = Consent.current_for(person)
        return Response([
            {
                "purpose": purpose,
                "label": label,
                "granted": state[purpose].granted if state[purpose] else None,
                "recorded_at": state[purpose].recorded_at if state[purpose] else None,
                "method": state[purpose].method if state[purpose] else None,
            }
            for purpose, label in Consent.Purpose.choices
        ])


class DataRequestViewSet(AuditedModelViewSet):
    serializer_class = DataRequestSerializer
    filterset_fields = ["status", "kind", "person"]
    search_fields = ["requester_name", "requester_email"]
    ordering_fields = ["due_on", "received_on", "created_at"]
    permission_map = {
        "list": "privacy.view",
        "retrieve": "privacy.view",
        "create": "privacy.manage",
        "update": "privacy.manage",
        "partial_update": "privacy.manage",
        "destroy": "privacy.manage",
    }

    def get_queryset(self):
        return DataRequest.objects.select_related("person", "handled_by")

    def perform_update(self, serializer):
        extra = {"handled_by": self.request.user}
        if serializer.validated_data.get("status") in ("completed", "rejected") and \
                not serializer.instance.completed_on:
            extra["completed_on"] = timezone.localdate()
        serializer.validated_data.update(extra)
        super().perform_update(serializer)


class SensitiveThrottle(UserRateThrottle):
    scope = "sensitive"


@extend_schema(responses={(200, "application/json"): dict})
@api_view(["GET"])
@permission_classes([IsAuthenticated, MFASatisfied, has_perm("privacy.manage")])
@throttle_classes([SensitiveThrottle])
def export_person(request, pk):
    """Subject access / portability export as a downloadable JSON file."""
    person = get_object_or_404(Person, pk=pk, anonymised_at__isnull=True)
    data = export_person_data(person)
    audit.log(AuditLog.Action.EXPORT, person, changes={"type": "subject_access_export"})
    response = HttpResponse(json.dumps(data, indent=2, default=str),
                            content_type="application/json")
    response["Content-Disposition"] = (
        f'attachment; filename="sar-{person.last_name.lower()}-{date.today():%Y%m%d}.json"'
    )
    return response


@extend_schema(request=EraseSerializer, responses={200: dict})
@api_view(["POST"])
@permission_classes([IsAuthenticated, MFASatisfied, has_perm("privacy.manage")])
@throttle_classes([SensitiveThrottle])
def erase_person(request, pk):
    person = get_object_or_404(Person, pk=pk, anonymised_at__isnull=True)
    ser = EraseSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    expected = f"{person.first_name} {person.last_name}".strip().lower()
    if ser.validated_data["confirm_name"].strip().lower() not in {expected, person.full_name.lower()}:
        return Response({"detail": "The name you typed does not match this person.",
                         "code": "confirmation_mismatch"}, status=status.HTTP_400_BAD_REQUEST)
    hold = financial_hold(person)
    if hold and not ser.validated_data["override_financial_hold"]:
        return Response({
            "detail": "This person has Gift Aid-claimed donations within the financial retention "
                      "period. Their declarations will be kept to meet HMRC requirements; "
                      "confirm to continue.",
            "code": "financial_hold",
        }, status=status.HTTP_409_CONFLICT)
    anonymise_person(person, reason=ser.validated_data["reason"], keep_financial=True)
    req = ser.validated_data.get("data_request")
    if req:
        req.status = DataRequest.Status.COMPLETED
        req.completed_on = timezone.localdate()
        req.handled_by = request.user
        req.resolution = (req.resolution + "\n" if req.resolution else "") + \
            f"Personal data erased on {timezone.localdate():%d %b %Y}."
        req.save()
    return Response({"detail": "Personal data has been erased.", "financial_records_retained": hold})


@extend_schema(responses={200: dict})
@api_view(["GET"])
@permission_classes([IsAuthenticated, MFASatisfied, has_perm("privacy.view", "privacy.manage")])
def privacy_overview(request):
    church = ChurchSettings.load()
    people = Person.objects.active()
    total = people.count()
    coverage = []
    for purpose, label in Consent.Purpose.choices:
        granted_ids = Consent.granted_person_ids(purpose)
        recorded = Consent.objects.filter(purpose=purpose, person__in=people) \
            .values("person").distinct().count()
        granted = people.filter(pk__in=granted_ids).count()
        coverage.append({"purpose": purpose, "label": label, "granted": granted,
                         "recorded": recorded, "total": total})
    today = date.today()
    cutoff = years_ago(church.retention_years_inactive, timezone.now())
    open_requests = DataRequest.objects.exclude(status__in=["completed", "rejected"])
    children = people.filter(date_of_birth__gt=years_ago(18))
    return Response({
        "people_total": total,
        "consent_coverage": coverage,
        "requests": {
            "open": open_requests.count(),
            "overdue": open_requests.filter(due_on__lt=today).count(),
            "due_this_week": open_requests.filter(
                due_on__gte=today, due_on__lte=today + timedelta(days=7)
            ).count(),
            "by_kind": list(DataRequest.objects.values("kind").annotate(n=Count("id"))),
        },
        "retention": {
            "inactive_years": church.retention_years_inactive,
            "due_for_anonymisation": Person.objects.filter(
                anonymised_at__isnull=True, archived_at__lt=cutoff
            ).count(),
            "anonymised_total": Person.objects.filter(anonymised_at__isnull=False).count(),
        },
        "children": {
            "total": children.count(),
            "with_guardian_photo_consent": children.filter(
                consents__purpose="photo", consents__given_by_guardian=True
            ).distinct().count(),
        },
        "sensitive_data": {
            "with_medical_notes": people.exclude(medical_notes="").count(),
        },
        "mfa": {
            "required": church.require_mfa,
        },
        "activity_30d": {
            "exports": AuditLog.objects.filter(
                action="export", timestamp__gte=timezone.now() - timedelta(days=30)
            ).count(),
            "erasures": AuditLog.objects.filter(
                action="erase", timestamp__gte=timezone.now() - timedelta(days=30)
            ).count(),
            "failed_logins": AuditLog.objects.filter(
                action="login_failed", timestamp__gte=timezone.now() - timedelta(days=30)
            ).count(),
        },
        "retention_candidates": list(
            Person.objects.filter(anonymised_at__isnull=True, archived_at__lt=cutoff)
            .order_by("archived_at").values("id", "first_name", "last_name", "archived_at")[:50]
        ),
    })
