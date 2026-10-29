from django.db.models import Count, Prefetch, Q
from rest_framework.exceptions import PermissionDenied

from apps.core.viewsets import AuditedModelViewSet
from apps.people.scoping import led_group_ids

from .models import Group, GroupMembership, GroupType
from .serializers import GroupMembershipSerializer, GroupSerializer, GroupTypeSerializer

VIEW_GROUPS = ("groups.view", "groups.manage", "groups.lead")


class GroupViewSet(AuditedModelViewSet):
    serializer_class = GroupSerializer
    filterset_fields = ["group_type", "campus", "is_active", "is_open", "is_children",
                        "meeting_day"]
    search_fields = ["name", "description", "location"]
    ordering_fields = ["name", "created_at", "member_count"]
    permission_map = {
        "list": VIEW_GROUPS,
        "retrieve": VIEW_GROUPS,
        "create": "groups.manage",
        "update": ("groups.manage", "groups.lead"),
        "partial_update": ("groups.manage", "groups.lead"),
        "destroy": "groups.manage",
    }

    def get_queryset(self):
        qs = Group.objects.select_related("group_type", "campus").annotate(
            member_count=Count("memberships", distinct=True,
                               filter=Q(memberships__person__anonymised_at__isnull=True))
        ).prefetch_related(
            Prefetch("memberships",
                     queryset=GroupMembership.objects.select_related("person"))
        ).order_by("name")
        user = self.request.user
        if not user.has_code("groups.view", "groups.manage"):
            qs = qs.filter(pk__in=led_group_ids(user))
        return qs


class GroupMembershipViewSet(AuditedModelViewSet):
    serializer_class = GroupMembershipSerializer
    filterset_fields = ["group", "person", "role"]
    search_fields = ["person__first_name", "person__last_name"]
    pagination_class = None
    permission_map = {
        "list": VIEW_GROUPS,
        "retrieve": VIEW_GROUPS,
        "create": ("groups.manage", "groups.lead"),
        "update": ("groups.manage", "groups.lead"),
        "partial_update": ("groups.manage", "groups.lead"),
        "destroy": ("groups.manage", "groups.lead"),
    }

    def get_queryset(self):
        qs = GroupMembership.objects.select_related("person", "group").filter(
            person__anonymised_at__isnull=True
        )
        user = self.request.user
        if not user.has_code("groups.view", "groups.manage"):
            qs = qs.filter(group_id__in=led_group_ids(user))
        return qs

    def _check_scope(self, group):
        user = self.request.user
        if user.has_code("groups.manage"):
            return
        if group.pk not in led_group_ids(user):
            raise PermissionDenied("You can only manage groups you lead.")

    def perform_create(self, serializer):
        self._check_scope(serializer.validated_data["group"])
        super().perform_create(serializer)

    def perform_update(self, serializer):
        self._check_scope(serializer.instance.group)
        if "group" in serializer.validated_data:
            self._check_scope(serializer.validated_data["group"])
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._check_scope(instance.group)
        super().perform_destroy(instance)


class GroupTypeViewSet(AuditedModelViewSet):
    serializer_class = GroupTypeSerializer
    pagination_class = None
    permission_map = {
        "list": VIEW_GROUPS,
        "retrieve": VIEW_GROUPS,
        "create": "settings.manage",
        "update": "settings.manage",
        "partial_update": "settings.manage",
        "destroy": "settings.manage",
    }

    def get_queryset(self):
        return GroupType.objects.annotate(group_count=Count("groups"))
