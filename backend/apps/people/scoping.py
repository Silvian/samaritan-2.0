"""Row-level scoping: who may see which people."""

LEADER_ROLES = ("leader", "co_leader")


def led_group_ids(user):
    from apps.groups.models import GroupMembership

    if not user.person_id:
        return []
    return list(
        GroupMembership.objects.filter(person_id=user.person_id, role__in=LEADER_ROLES)
        .values_list("group_id", flat=True)
    )


def people_visible_to(user, qs):
    if user.has_code("people.view"):
        return qs
    if user.has_code("groups.lead"):
        return qs.filter(group_memberships__group_id__in=led_group_ids(user)).distinct()
    return qs.none()
