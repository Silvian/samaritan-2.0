from rest_framework import serializers

from .models import AuditLog, Campus, ChurchSettings


class ChurchSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChurchSettings
        exclude = ["id"]
        read_only_fields = ["updated_at"]


class PublicChurchSettingsSerializer(serializers.ModelSerializer):
    """Branding only - safe to show on the login page."""

    class Meta:
        model = ChurchSettings
        fields = ["name", "primary_color", "privacy_notice_url", "currency"]


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = ["id", "name", "address", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "timestamp", "actor", "actor_email", "action", "object_type",
            "object_id", "object_repr", "changes", "ip_address", "user_agent",
        ]
