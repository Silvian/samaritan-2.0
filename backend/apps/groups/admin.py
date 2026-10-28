from django.contrib import admin

from .models import Group, GroupMembership, GroupType

admin.site.register([Group, GroupMembership, GroupType])
