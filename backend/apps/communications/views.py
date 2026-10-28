from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import audit
from apps.core.models import AuditLog
from apps.core.viewsets import AuditedModelViewSet

from .models import Message
from .serializers import AudienceSerializer, MessageRecipientSerializer, MessageSerializer
from .services import audience_stats, send_message


class MessageViewSet(AuditedModelViewSet):
    serializer_class = MessageSerializer
    filterset_fields = ["status", "channel"]
    search_fields = ["subject"]
    ordering_fields = ["created_at", "sent_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_map = {
        "list": ("comms.view", "comms.send"),
        "retrieve": ("comms.view", "comms.send"),
        "recipients": ("comms.view", "comms.send"),
        "create": "comms.send",
        "partial_update": "comms.send",
        "destroy": "comms.send",
        "preview": "comms.send",
        "send": "comms.send",
    }

    def get_queryset(self):
        return Message.objects.select_related("created_by")

    def perform_destroy(self, instance):
        if instance.status != Message.Status.DRAFT:
            raise serializers.ValidationError("Only drafts can be deleted.")
        super().perform_destroy(instance)

    @extend_schema(request=AudienceSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def preview(self, request):
        ser = AudienceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return Response(audience_stats({k: [str(x) for x in v] for k, v in ser.validated_data.items()}))

    @extend_schema(request=None, responses=MessageSerializer)
    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        message = self.get_object()
        if message.status != Message.Status.DRAFT:
            raise serializers.ValidationError("This message has already been sent.")
        send_message(message)
        audit.log(AuditLog.Action.SEND, message,
                  changes={"sent": message.recipient_count, "skipped": message.skipped_count})
        return Response(MessageSerializer(message).data)

    @extend_schema(responses=MessageRecipientSerializer(many=True))
    @action(detail=True, methods=["get"])
    def recipients(self, request, pk=None):
        message = self.get_object()
        qs = message.recipients.select_related("person")
        return Response(MessageRecipientSerializer(qs, many=True).data)
