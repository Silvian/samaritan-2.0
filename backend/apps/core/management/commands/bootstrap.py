"""Idempotent first-run setup: roles, lookups and (optionally) the first administrator."""

import os

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Role, User
from apps.accounts.rbac import DEFAULT_ROLES
from apps.core.models import ChurchSettings
from apps.giving.models import Fund
from apps.groups.models import GroupType
from apps.people.models import Position

GROUP_TYPES = [
    ("Small Group", "Home groups / life groups", "indigo"),
    ("Ministry Team", "Serving teams: worship, welcome, AV, children's ministry", "emerald"),
    ("Class", "Courses such as Alpha, membership or baptism classes", "amber"),
    ("Youth & Children", "Sunday school, youth group", "rose"),
    ("Prayer", "Prayer meetings and chains", "sky"),
]
FUNDS = [
    ("General Fund", "Day-to-day running costs", False),
    ("Building Fund", "Building maintenance and projects", True),
    ("Missions", "Mission partners and outreach", True),
    ("Benevolence", "Hardship support for people in need", True),
]
POSITIONS = ["Pastor", "Elder", "Deacon", "Treasurer", "Secretary", "Worship Leader",
             "Safeguarding Lead", "Youth Leader"]


class Command(BaseCommand):
    help = "Create default roles and lookups. Set ADMIN_EMAIL/ADMIN_PASSWORD to create an admin."

    @transaction.atomic
    def handle(self, *args, **options):
        ChurchSettings.load()
        for name, spec in DEFAULT_ROLES.items():
            role, created = Role.objects.get_or_create(
                name=name, defaults={"description": spec["description"], "is_system": True}
            )
            if created or role.is_system:
                role.permissions = spec["permissions"]
                role.description = spec["description"]
                role.is_system = True
                role.save()
        for name, desc, color in GROUP_TYPES:
            GroupType.objects.get_or_create(name=name, defaults={"description": desc, "color": color})
        for name, desc, restricted in FUNDS:
            Fund.objects.get_or_create(name=name, defaults={"description": desc,
                                                            "is_restricted": restricted})
        for name in POSITIONS:
            Position.objects.get_or_create(name=name)

        email = os.environ.get("ADMIN_EMAIL")
        password = os.environ.get("ADMIN_PASSWORD")
        if email and password and not User.objects.filter(email__iexact=email).exists():
            User.objects.create_superuser(
                email=email, password=password, first_name="Admin",
                role=Role.objects.get(name="Administrator"), must_change_password=True,
            )
            self.stdout.write(self.style.SUCCESS(f"Created administrator {email}"))
        self.stdout.write(self.style.SUCCESS("Bootstrap complete."))
