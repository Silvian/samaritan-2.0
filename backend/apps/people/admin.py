from django.contrib import admin

from .models import Household, Milestone, Person, Position, Tag

admin.site.register([Tag, Position, Milestone])


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    search_fields = ["name", "postcode"]


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ["last_name", "first_name", "email", "status", "archived_at"]
    list_filter = ["status"]
    search_fields = ["first_name", "last_name", "email"]
    exclude = ["medical_notes", "confidential_notes"]
