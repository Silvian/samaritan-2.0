from rest_framework import serializers

from apps.core.models import Campus

from .models import Household, Milestone, Person, Position, Tag


class TagSerializer(serializers.ModelSerializer):
    people_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "people_count"]


class PositionSerializer(serializers.ModelSerializer):
    people_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Position
        fields = ["id", "name", "description", "people_count"]


class CampusBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = ["id", "name"]


class PersonBriefSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Person
        fields = ["id", "full_name", "first_name", "last_name", "email", "status"]


class HouseholdBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Household
        fields = ["id", "name"]


class MilestoneSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    person_name = serializers.CharField(source="person.full_name", read_only=True)

    class Meta:
        model = Milestone
        fields = ["id", "person", "person_name", "kind", "kind_display", "date", "place",
                  "officiant", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class PersonListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    age = serializers.IntegerField(read_only=True)
    household = HouseholdBriefSerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    campus = CampusBriefSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Person
        fields = [
            "id", "full_name", "first_name", "last_name", "preferred_name", "email",
            "phone_mobile", "status", "status_display", "age", "date_of_birth", "household",
            "campus", "tags", "city", "postcode", "archived_at", "created_at",
        ]


class PersonSerializer(serializers.ModelSerializer):
    """Full read/write representation. Sensitive fields are permission-gated."""

    full_name = serializers.CharField(read_only=True)
    age = serializers.IntegerField(read_only=True)
    is_child = serializers.BooleanField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    household = HouseholdBriefSerializer(read_only=True)
    household_id = serializers.PrimaryKeyRelatedField(
        source="household", queryset=Household.objects.all(), allow_null=True, required=False,
        write_only=True,
    )
    campus = CampusBriefSerializer(read_only=True)
    campus_id = serializers.PrimaryKeyRelatedField(
        source="campus", queryset=Campus.objects.all(), allow_null=True, required=False,
        write_only=True,
    )
    tags = TagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        source="tags", queryset=Tag.objects.all(), many=True, required=False, write_only=True
    )
    positions = PositionSerializer(many=True, read_only=True)
    position_ids = serializers.PrimaryKeyRelatedField(
        source="positions", queryset=Position.objects.all(), many=True, required=False,
        write_only=True,
    )
    household_members = serializers.SerializerMethodField()
    groups = serializers.SerializerMethodField()
    milestones = MilestoneSerializer(many=True, read_only=True)
    has_user_account = serializers.SerializerMethodField()
    can_view_sensitive = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = [
            "id", "title", "first_name", "preferred_name", "last_name", "full_name", "gender",
            "date_of_birth", "age", "is_child", "marital_status", "anniversary",
            "email", "phone_mobile", "phone_home",
            "address_line1", "address_line2", "city", "region", "postcode", "country",
            "occupation", "employer",
            "household", "household_id", "household_role", "household_members",
            "campus", "campus_id", "status", "status_display", "membership_date",
            "first_visit_date", "how_heard", "tags", "tag_ids", "positions", "position_ids",
            "notes", "medical_notes", "confidential_notes",
            "emergency_contact_name", "emergency_contact_phone",
            "groups", "milestones", "has_user_account", "can_view_sensitive",
            "archived_at", "archive_reason", "date_of_death", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "archived_at", "archive_reason", "created_at", "updated_at"]

    def _can_view_sensitive(self):
        request = self.context.get("request")
        return bool(request and request.user.has_code("people.view_sensitive"))

    def get_can_view_sensitive(self, obj) -> bool:
        return self._can_view_sensitive()

    def get_household_members(self, obj) -> list[dict]:
        if not obj.household_id:
            return []
        members = obj.household.members.exclude(pk=obj.pk).filter(anonymised_at__isnull=True)
        return [
            {"id": str(m.id), "full_name": m.full_name, "household_role": m.household_role,
             "age": m.age, "status": m.status}
            for m in members
        ]

    def get_groups(self, obj) -> list[dict]:
        return [
            {"id": str(m.group_id), "name": m.group.name, "role": m.role,
             "group_type": m.group.group_type.name if m.group.group_type_id else None}
            for m in obj.group_memberships.select_related("group", "group__group_type")
        ]

    def get_has_user_account(self, obj) -> bool:
        return hasattr(obj, "user_account") and obj.user_account is not None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self._can_view_sensitive():
            for field in Person.SENSITIVE_FIELDS:
                data.pop(field, None)
        return data

    def validate(self, attrs):
        if not self._can_view_sensitive():
            for field in Person.SENSITIVE_FIELDS:
                if field in attrs:
                    raise serializers.ValidationError(
                        {field: "You do not have permission to edit sensitive data."}
                    )
        dob = attrs.get("date_of_birth")
        if dob:
            from datetime import date

            if dob > date.today():
                raise serializers.ValidationError({"date_of_birth": "Cannot be in the future."})
        return attrs


class HouseholdSerializer(serializers.ModelSerializer):
    members = serializers.SerializerMethodField()
    member_count = serializers.IntegerField(read_only=True)
    campus_id = serializers.PrimaryKeyRelatedField(
        source="campus", queryset=Campus.objects.all(), allow_null=True, required=False
    )
    campus = CampusBriefSerializer(read_only=True)

    class Meta:
        model = Household
        fields = [
            "id", "name", "phone", "address_line1", "address_line2", "city", "region",
            "postcode", "country", "campus", "campus_id", "members", "member_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_members(self, obj) -> list[dict]:
        return [
            {"id": str(m.id), "full_name": m.full_name, "household_role": m.household_role,
             "age": m.age, "status": m.status, "email": m.email, "phone_mobile": m.phone_mobile}
            for m in obj.members.filter(anonymised_at__isnull=True)
        ]


class BulkTagSerializer(serializers.Serializer):
    person_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=1000)
    tag_id = serializers.PrimaryKeyRelatedField(queryset=Tag.objects.all())
    remove = serializers.BooleanField(default=False)


class ArchiveSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True)
