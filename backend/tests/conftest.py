import secrets
from datetime import date, timedelta

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.authentication import issue_tokens
from apps.accounts.models import Role, User
from apps.core.models import ChurchSettings
from apps.groups.models import Group, GroupMembership
from apps.people.models import Household, Person


def new_password() -> str:
    """Random password that satisfies the validators (generated per run, never committed)."""
    return f"Tst-{secrets.token_urlsafe(12)}-9"


PASSWORD = new_password()


@pytest.fixture(autouse=True)
def _bootstrap(db):
    call_command("bootstrap", verbosity=0)
    s = ChurchSettings.load()
    s.require_mfa = False
    s.save()


@pytest.fixture
def anon():
    return APIClient(enforce_csrf_checks=True)


def make_user(role_name, email=None, **extra):
    if role_name:
        extra["role"] = Role.objects.get(name=role_name)
    email = email or f"{(role_name or 'norole').lower().replace(' ', '')}@test.org"
    return User.objects.create_user(email=email, password=PASSWORD, **extra)


def client_for(user):
    """Bearer-token client (no CSRF needed) for permission tests."""
    client = APIClient()
    access, _ = issue_tokens(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


@pytest.fixture
def admin_user():
    return make_user("Administrator", "admin@test.org")


@pytest.fixture
def admin(admin_user):
    return client_for(admin_user)


@pytest.fixture
def roles():
    return {name: make_user(name) for name in
            ["Pastor", "Church Office", "Finance", "Group Leader", "Read Only"]}


@pytest.fixture
def person(db):
    hh = Household.objects.create(name="Smith household", postcode="BS1 1AA")
    return Person.objects.create(
        first_name="Jane", last_name="Smith", email="jane@example.com", household=hh,
        status="member", date_of_birth=date(1985, 5, 17), medical_notes="Penicillin allergy",
    )


@pytest.fixture
def child(person):
    return Person.objects.create(
        first_name="Tom", last_name="Smith", household=person.household, household_role="child",
        date_of_birth=date.today() - timedelta(days=365 * 7), status="regular",
    )


@pytest.fixture
def group_with_leader(roles, person):
    leader_user = roles["Group Leader"]
    leader_person = Person.objects.create(first_name="Lee", last_name="Leader", status="member")
    leader_user.person = leader_person
    leader_user.save()
    group = Group.objects.create(name="Tuesday Group")
    GroupMembership.objects.create(group=group, person=leader_person, role="leader")
    GroupMembership.objects.create(group=group, person=person, role="member")
    return group
