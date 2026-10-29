import django_filters

from .models import AuditLog


class AuditLogFilter(django_filters.FilterSet):
    since = django_filters.IsoDateTimeFilter(field_name="timestamp", lookup_expr="gte")
    until = django_filters.IsoDateTimeFilter(field_name="timestamp", lookup_expr="lte")

    class Meta:
        model = AuditLog
        fields = ["action", "object_type", "object_id", "actor"]
