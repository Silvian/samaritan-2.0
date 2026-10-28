from rest_framework import serializers

from apps.core.models import Campus
from apps.groups.models import Group
from apps.people.models import Person
from apps.people.serializers import CampusBriefSerializer

from .models import Attendance, Event


class EventSerializer(serializers.ModelSerializer):
    campus = CampusBriefSerializer(read_only=True)
    campus_id = serializers.PrimaryKeyRelatedField(
        source="campus", queryset=Campus.objects.all(), allow_null=True, required=False
    )
    group_id = serializers.PrimaryKeyRelatedField(
        source="group", queryset=Group.objects.all(), allow_null=True, required=False
    )
    group_name = serializers.CharField(source="group.name", read_only=True, default=None)
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    present_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Event
        fields = [
            "id", "title", "description", "kind", "kind_display", "starts_at", "ends_at",
            "location", "campus", "campus_id", "group_id", "group_name", "capacity", "headcount",
            "check_in_enabled", "is_cancelled", "present_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        starts = attrs.get("starts_at") or getattr(self.instance, "starts_at", None)
        ends = attrs.get("ends_at") or getattr(self.instance, "ends_at", None)
        if starts and ends and ends < starts:
            raise serializers.ValidationError({"ends_at": "Must be after the start time."})
        return attrs


class AttendanceSerializer(serializers.ModelSerializer):
    person_name = serializers.CharField(source="person.full_name", read_only=True)
    person_age = serializers.IntegerField(source="person.age", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_starts_at = serializers.DateTimeField(source="event.starts_at", read_only=True)

    class Meta:
        model = Attendance
        fields = ["id", "event", "event_title", "event_starts_at", "person", "person_name",
                  "person_age", "status", "checked_in_at", "checked_out_at", "security_code",
                  "created_at"]
        read_only_fields = fields


class BulkAttendanceSerializer(serializers.Serializer):
    person_ids = serializers.ListField(child=serializers.UUIDField(), max_length=2000)
    status = serializers.ChoiceField(choices=Attendance.Status.choices,
                                     default=Attendance.Status.PRESENT)


class CheckInSerializer(serializers.Serializer):
    person_id = serializers.PrimaryKeyRelatedField(queryset=Person.objects.active())


class DuplicateEventSerializer(serializers.Serializer):
    weeks = serializers.IntegerField(min_value=1, max_value=52)
