from django.contrib import admin

from .models import AuditLog, Campus, ChurchSettings


@admin.register(ChurchSettings)
class ChurchSettingsAdmin(admin.ModelAdmin):
    pass


@admin.register(Campus)
class CampusAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["timestamp", "actor_email", "action", "object_type", "object_repr", "ip_address"]
    list_filter = ["action", "object_type"]
    search_fields = ["actor_email", "object_repr"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
