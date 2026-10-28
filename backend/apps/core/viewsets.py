from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import MFASatisfied, RBACPermission

from . import audit
from .models import AuditLog


class AuditedModelViewSet(viewsets.ModelViewSet):
    """
    ModelViewSet with RBAC, created_by/updated_by stamping and an audit trail
    for every write (and, optionally, reads of personal data).
    """

    permission_classes = [IsAuthenticated, MFASatisfied, RBACPermission]
    permission_map: dict = {}
    audit_reads = False  # set True for models holding personal data
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def _has_stamp(self, model, name):
        return any(f.name == name for f in model._meta.get_fields())

    def perform_create(self, serializer):
        model = serializer.Meta.model
        extra = {}
        if self._has_stamp(model, "created_by"):
            extra["created_by"] = self.request.user
            extra["updated_by"] = self.request.user
        instance = serializer.save(**extra)
        audit.log(AuditLog.Action.CREATE, instance, changes=audit.snapshot(instance))

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        extra = {}
        if self._has_stamp(serializer.Meta.model, "updated_by"):
            extra["updated_by"] = self.request.user
        instance = serializer.save(**extra)
        changes = audit.diff(before, audit.snapshot(instance))
        if changes:
            audit.log(AuditLog.Action.UPDATE, instance, changes=changes)

    def perform_destroy(self, instance):
        audit.log(AuditLog.Action.DELETE, instance, changes=audit.snapshot(instance))
        instance.delete()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if self.audit_reads:
            audit.log(AuditLog.Action.VIEW, instance)
        return Response(self.get_serializer(instance).data)


class AuditedReadOnlyViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, MFASatisfied, RBACPermission]
    permission_map: dict = {}
