from rest_framework import serializers

from apps.people.models import Person

from .models import Consent, DataRequest


class ConsentSerializer(serializers.ModelSerializer):
    person = serializers.PrimaryKeyRelatedField(queryset=Person.objects.active())
    purpose_display = serializers.CharField(source="get_purpose_display", read_only=True)
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True,
                                             default=None)

    class Meta:
        model = Consent
        fields = ["id", "person", "purpose", "purpose_display", "granted", "method",
                  "method_display", "evidence", "given_by_guardian", "recorded_by_name",
                  "recorded_at"]
        read_only_fields = ["id", "recorded_by_name", "recorded_at"]


class DataRequestSerializer(serializers.ModelSerializer):
    person = serializers.PrimaryKeyRelatedField(queryset=Person.objects.all(), allow_null=True,
                                                required=False)
    person_name = serializers.CharField(source="person.full_name", read_only=True, default=None)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    handled_by_name = serializers.CharField(source="handled_by.full_name", read_only=True,
                                            default=None)

    class Meta:
        model = DataRequest
        fields = ["id", "person", "person_name", "requester_name", "requester_email", "kind",
                  "kind_display", "status", "status_display", "received_on", "due_on",
                  "identity_verified", "description", "resolution", "completed_on",
                  "handled_by", "handled_by_name", "is_overdue", "created_at", "updated_at"]
        read_only_fields = ["id", "due_on", "created_at", "updated_at", "handled_by"]


class EraseSerializer(serializers.Serializer):
    confirm_name = serializers.CharField(help_text="Type the person's full name to confirm")
    reason = serializers.CharField(max_length=500)
    data_request = serializers.PrimaryKeyRelatedField(queryset=DataRequest.objects.all(),
                                                      required=False, allow_null=True)
    override_financial_hold = serializers.BooleanField(default=False)
