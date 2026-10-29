from rest_framework import serializers

from apps.accounts.models import User
from apps.people.models import Person

from .models import CareNote, CareRecord


class CareNoteSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    class Meta:
        model = CareNote
        fields = ["id", "record", "body", "author", "created_at"]
        read_only_fields = ["id", "record", "author", "created_at"]


class CareRecordListSerializer(serializers.ModelSerializer):
    person_name = serializers.CharField(source="person.full_name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True,
                                             default=None)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True,
                                            default=None)

    class Meta:
        model = CareRecord
        fields = ["id", "person", "person_name", "kind", "kind_display", "subject",
                  "is_confidential", "status", "priority", "occurred_on", "follow_up_on",
                  "assigned_to", "assigned_to_name", "created_by_name", "created_at", "updated_at"]


class CareRecordSerializer(CareRecordListSerializer):
    person = serializers.PrimaryKeyRelatedField(queryset=Person.objects.active())
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), allow_null=True, required=False
    )
    notes = CareNoteSerializer(many=True, read_only=True)

    class Meta(CareRecordListSerializer.Meta):
        fields = CareRecordListSerializer.Meta.fields + ["details", "notes", "closed_at"]
        read_only_fields = ["id", "closed_at", "created_at", "updated_at"]

    def validate_assigned_to(self, user):
        if user and not user.has_code("pastoral.view"):
            raise serializers.ValidationError("This user does not have pastoral care access.")
        return user
