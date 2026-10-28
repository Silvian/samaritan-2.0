from django.contrib.auth import password_validation
from rest_framework import serializers

from apps.core.models import ChurchSettings

from .models import Role, User
from .rbac import ALL_PERMISSIONS


class RoleSerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Role
        fields = ["id", "name", "description", "permissions", "is_system", "user_count",
                  "created_at", "updated_at"]
        read_only_fields = ["id", "is_system", "created_at", "updated_at"]

    def validate_permissions(self, value):
        unknown = set(value) - ALL_PERMISSIONS
        if unknown:
            raise serializers.ValidationError(f"Unknown permissions: {', '.join(sorted(unknown))}")
        request = self.context.get("request")
        if request and not request.user.is_superuser:
            escalation = set(value) - request.user.permission_codes
            if escalation:
                raise serializers.ValidationError(
                    "You cannot grant permissions you do not hold yourself: "
                    + ", ".join(sorted(escalation))
                )
        return sorted(set(value))


class RoleBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "name"]


class MeSerializer(serializers.ModelSerializer):
    role = RoleBriefSerializer(read_only=True)
    permissions = serializers.SerializerMethodField()
    mfa_required = serializers.SerializerMethodField()
    person_id = serializers.UUIDField(source="person.id", read_only=True, default=None)
    full_name = serializers.CharField(read_only=True)
    recovery_codes_remaining = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name", "role", "permissions",
            "is_superuser", "mfa_enabled", "mfa_required", "must_change_password",
            "person_id", "last_login", "recovery_codes_remaining",
        ]
        read_only_fields = ["id", "email", "is_superuser", "mfa_enabled",
                            "must_change_password", "last_login"]

    def get_permissions(self, obj) -> list[str]:
        return sorted(obj.permission_codes)

    def get_mfa_required(self, obj) -> bool:
        return ChurchSettings.load().require_mfa

    def get_recovery_codes_remaining(self, obj) -> int:
        return len(obj.recovery_codes)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)


class MFAVerifySerializer(serializers.Serializer):
    challenge = serializers.CharField()
    code = serializers.CharField(max_length=20)


class MFACodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


class MFADisableSerializer(serializers.Serializer):
    password = serializers.CharField(trim_whitespace=False)
    code = serializers.CharField(max_length=20)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError({"new_password": "Choose a different password."})
        password_validation.validate_password(attrs["new_password"], user)
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False)


class UserSerializer(serializers.ModelSerializer):
    role = RoleBriefSerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(
        source="role", queryset=Role.objects.all(), write_only=True, allow_null=True, required=False
    )
    person_name = serializers.SerializerMethodField()
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name", "role", "role_id", "person",
            "person_name", "is_active", "is_superuser", "mfa_enabled", "last_login", "date_joined",
        ]
        read_only_fields = ["id", "is_superuser", "mfa_enabled", "last_login", "date_joined"]

    def get_person_name(self, obj) -> str | None:
        return obj.person.full_name if obj.person_id else None

    def validate_email(self, value):
        value = value.lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_role_id(self, role):
        request = self.context.get("request")
        if role and request and not request.user.is_superuser:
            escalation = set(role.permissions) - request.user.permission_codes
            if escalation:
                raise serializers.ValidationError(
                    "You cannot assign a role with permissions you do not hold."
                )
        return role

    def validate(self, attrs):
        request = self.context.get("request")
        if self.instance and request and self.instance.pk == request.user.pk:
            if attrs.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "You cannot deactivate yourself."})
            if "role" in attrs and attrs["role"] != self.instance.role:
                raise serializers.ValidationError({"role_id": "You cannot change your own role."})
        return attrs
