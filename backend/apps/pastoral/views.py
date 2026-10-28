from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import audit
from apps.core.models import AuditLog
from apps.core.viewsets import AuditedModelViewSet

from .models import CareRecord
from .serializers import CareNoteSerializer, CareRecordListSerializer, CareRecordSerializer


class CareRecordViewSet(AuditedModelViewSet):
    audit_reads = True
    filterset_fields = {
        "person": ["exact"],
        "kind": ["exact"],
        "status": ["exact", "in"],
        "priority": ["exact", "in"],
        "assigned_to": ["exact", "isnull"],
        "follow_up_on": ["lte", "gte"],
    }
    search_fields = ["subject", "person__first_name", "person__last_name"]
    ordering_fields = ["created_at", "follow_up_on", "priority"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_map = {
        "list": "pastoral.view",
        "retrieve": "pastoral.view",
        "create": "pastoral.manage",
        "partial_update": "pastoral.manage",
        "destroy": "pastoral.manage",
        "add_note": "pastoral.manage",
        "mine": "pastoral.view",
    }

    def get_queryset(self):
        qs = CareRecord.objects.select_related("person", "assigned_to", "created_by").filter(
            person__anonymised_at__isnull=True
        )
        user = self.request.user
        if not user.is_authenticated:  # schema generation
            return qs.none()
        if not user.has_code("pastoral.view_confidential"):
            qs = qs.filter(Q(is_confidential=False) | Q(created_by=user) | Q(assigned_to=user))
        if self.action == "retrieve":
            qs = qs.prefetch_related("notes__created_by")
        return qs

    def get_serializer_class(self):
        return CareRecordListSerializer if self.action in ("list", "mine") else CareRecordSerializer

    def perform_update(self, serializer):
        status_value = serializer.validated_data.get("status")
        if status_value == CareRecord.Status.CLOSED and not serializer.instance.closed_at:
            serializer.validated_data["closed_at"] = timezone.now()
        elif status_value and status_value != CareRecord.Status.CLOSED:
            serializer.validated_data["closed_at"] = None
        super().perform_update(serializer)

    @extend_schema(responses=CareRecordListSerializer(many=True))
    @action(detail=False, methods=["get"])
    def mine(self, request):
        qs = self.get_queryset().filter(assigned_to=request.user).exclude(status="closed")
        return Response(CareRecordListSerializer(qs, many=True).data)

    @extend_schema(request=CareNoteSerializer, responses=CareNoteSerializer)
    @action(detail=True, methods=["post"], url_path="notes")
    def add_note(self, request, pk=None):
        record = self.get_object()
        ser = CareNoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        note = ser.save(record=record, created_by=request.user, updated_by=request.user)
        record.save(update_fields=["updated_at"])
        audit.log(AuditLog.Action.CREATE, record, changes={"note_added": str(note.id)})
        return Response(CareNoteSerializer(note).data, status=201)
