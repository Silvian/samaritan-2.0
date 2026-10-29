from rest_framework import serializers

from apps.people.models import Person

from .models import Message, MessageRecipient


class AudienceSerializer(serializers.Serializer):
    group_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    tag_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    person_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    statuses = serializers.ListField(
        child=serializers.ChoiceField(choices=Person.Status.choices), required=False, default=list
    )


class MessageSerializer(serializers.ModelSerializer):
    audience = AudienceSerializer()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True,
                                            default=None)

    class Meta:
        model = Message
        fields = ["id", "subject", "body", "channel", "audience", "status", "sent_at",
                  "recipient_count", "skipped_count", "created_by_name", "created_at"]
        read_only_fields = ["id", "status", "sent_at", "recipient_count", "skipped_count",
                            "created_at"]

    def validate_audience(self, value):
        return {k: [str(x) for x in v] for k, v in value.items()}

    def update(self, instance, validated_data):
        if instance.status != Message.Status.DRAFT:
            raise serializers.ValidationError("Sent messages cannot be edited.")
        return super().update(instance, validated_data)


class MessageRecipientSerializer(serializers.ModelSerializer):
    person_name = serializers.CharField(source="person.full_name", read_only=True)

    class Meta:
        model = MessageRecipient
        fields = ["id", "person", "person_name", "email", "status", "error", "created_at"]
