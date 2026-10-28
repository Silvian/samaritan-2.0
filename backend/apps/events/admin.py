from django.contrib import admin

from .models import Attendance, Event

admin.site.register([Event, Attendance])
