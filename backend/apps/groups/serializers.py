from rest_framework import serializers

from apps.core.models import Campus
from apps.people.models import Person
from apps.people.serializers import CampusBriefSerializer

from .models import Group, GroupMembership, GroupType


class GroupTypeSerializer(serializers.ModelSerializer):
    group_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = GroupType
        fields = ["id", "name", "description", "color", "group_count"]


class GroupMembershipSerializer(serializers.ModelSerializer):
    person_name = serializers.CharField(source="person.full_name", read_only=True)
    person_email = serializers.CharField(source="person.email", read_only=True)
    person_phone = serializers.CharField(source="person.phone_mobile", read_only=True)
    person = serializers.PrimaryKeyRelatedField(queryset=Person.objects.active())
    group_name = serializers.CharField(source="group.name", read_only=True)

    class Meta:
        model = GroupMembership
        fields = ["id", "group", "group_name", "person", "person_name", "person_email",
                  "person_phone", "role", "joined_on", "created_at"]
        read_only_fields = ["id", "created_at"]
        validators = []

    def validate(self, attrs):
        group = attrs.get("group") or getattr(self.instance, "group", None)
        person = attrs.get("person") or getattr(self.instance, "person", None)
        qs = GroupMembership.objects.filter(group=group, person=person)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({"person": "Already a member of this group."})
        return attrs


class GroupSerializer(serializers.ModelSerializer):
    group_type = GroupTypeSerializer(read_only=True)
    group_type_id = serializers.PrimaryKeyRelatedField(
        source="group_type", queryset=GroupType.objects.all(), allow_null=True, required=False
    )
    campus = CampusBriefSerializer(read_only=True)
    campus_id = serializers.PrimaryKeyRelatedField(
        source="campus", queryset=Campus.objects.all(), allow_null=True, required=False
    )
    member_count = serializers.IntegerField(read_only=True)
    leaders = serializers.SerializerMethodField()
    meeting_day_display = serializers.CharField(source="get_meeting_day_display", read_only=True)
    is_leader = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            "id", "name", "description", "group_type", "group_type_id", "campus", "campus_id",
            "meeting_day", "meeting_day_display", "meeting_time", "frequency", "location",
            "capacity", "is_active", "is_open", "is_children", "member_count", "leaders",
            "is_leader", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_leaders(self, obj) -> list[dict]:
        return [
            {"id": str(m.person_id), "full_name": m.person.full_name}
            for m in obj.memberships.all()
            if m.role in (GroupMembership.Role.LEADER, GroupMembership.Role.CO_LEADER)
        ]

    def get_is_leader(self, obj) -> bool:
        request = self.context.get("request")
        person_id = getattr(getattr(request, "user", None), "person_id", None)
        if not person_id:
            return False
        return any(
            m.person_id == person_id and m.role in ("leader", "co_leader")
            for m in obj.memberships.all()
        )
