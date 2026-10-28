from django.urls import path

from .views import summary

urlpatterns = [path("dashboard/", summary, name="dashboard")]
