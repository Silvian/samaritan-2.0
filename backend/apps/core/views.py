from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MFASatisfied, RBACPermission

from . import audit
from .filters import AuditLogFilter
from .models import AuditLog, Campus, ChurchSettings
from .serializers import (
    AuditLogSerializer,
    CampusSerializer,
    ChurchSettingsSerializer,
    PublicChurchSettingsSerializer,
)
from .viewsets import AuditedModelViewSet


@extend_schema(responses={200: dict})
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    with connection.cursor() as cur:
        cur.execute("SELECT 1")
    return Response({"status": "ok"})


class ChurchSettingsView(APIView):
    permission_classes = [IsAuthenticated, MFASatisfied, RBACPermission]
    permission_map = {"GET": ("settings.manage",), "PATCH": ("settings.manage",)}

    @extend_schema(responses=ChurchSettingsSerializer)
    def get(self, request):
        return Response(ChurchSettingsSerializer(ChurchSettings.load()).data)

    @extend_schema(request=ChurchSettingsSerializer, responses=ChurchSettingsSerializer)
    def patch(self, request):
        obj = ChurchSettings.load()
        before = audit.snapshot(obj)
        ser = ChurchSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        audit.log(AuditLog.Action.UPDATE, obj, changes=audit.diff(before, audit.snapshot(obj)))
        return Response(ser.data)


class PublicSettingsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses=PublicChurchSettingsSerializer)
    def get(self, request):
        return Response(PublicChurchSettingsSerializer(ChurchSettings.load()).data)


class CampusViewSet(AuditedModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    pagination_class = None
    search_fields = ["name"]
    permission_map = {
        "list": ("people.view", "groups.view", "events.view", "groups.lead", "giving.view"),
        "retrieve": ("people.view", "groups.view", "events.view", "groups.lead"),
        "create": "settings.manage",
        "update": "settings.manage",
        "partial_update": "settings.manage",
        "destroy": "settings.manage",
    }


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.select_related("actor")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, MFASatisfied, RBACPermission]
    permission_map = {"list": "audit.view", "retrieve": "audit.view"}
    filterset_class = AuditLogFilter
    search_fields = ["actor_email", "object_repr", "object_type"]
    ordering_fields = ["timestamp"]
