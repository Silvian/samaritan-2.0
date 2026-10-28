import pytest

from apps.accounts.models import Role
from apps.pastoral.models import CareRecord
from apps.people.models import Person

from .conftest import client_for, make_user


@pytest.mark.django_db
class TestRBAC:
    def test_unauthenticated_is_401(self, anon):
        assert anon.get("/api/v1/people/").status_code == 401

    def test_user_without_role_sees_nothing(self, person):
        c = client_for(make_user(None, "nobody@test.org"))
        assert c.get("/api/v1/people/").status_code == 403
        assert c.get(f"/api/v1/people/{person.id}/").status_code == 403

    def test_read_only_cannot_write(self, roles, person):
        c = client_for(roles["Read Only"])
        assert c.get("/api/v1/people/").status_code == 200
        assert c.post("/api/v1/people/", {"first_name": "X", "last_name": "Y"},
                      format="json").status_code == 403
        assert c.patch(f"/api/v1/people/{person.id}/", {"first_name": "Z"},
                       format="json").status_code == 403

    def test_finance_cannot_see_pastoral_care(self, roles, person):
        CareRecord.objects.create(person=person, subject="Visit", details="private")
        c = client_for(roles["Finance"])
        assert c.get("/api/v1/care-records/").status_code == 403
        assert c.get("/api/v1/donations/").status_code == 200

    def test_office_cannot_see_giving(self, roles):
        c = client_for(roles["Church Office"])
        assert c.get("/api/v1/donations/").status_code == 403
        assert c.get("/api/v1/donations/summary/").status_code == 403

    def test_sensitive_fields_hidden_without_permission(self, roles, person):
        office = client_for(roles["Church Office"])
        data = office.get(f"/api/v1/people/{person.id}/").data
        assert "medical_notes" not in data
        assert data["can_view_sensitive"] is False
        res = office.patch(f"/api/v1/people/{person.id}/", {"medical_notes": "x"}, format="json")
        assert res.status_code == 400
        pastor = client_for(roles["Pastor"])
        assert pastor.get(f"/api/v1/people/{person.id}/").data["medical_notes"] == "Penicillin allergy"

    def test_group_leader_only_sees_own_group(self, roles, group_with_leader, person):
        outsider = Person.objects.create(first_name="Out", last_name="Sider")
        c = client_for(roles["Group Leader"])
        ids = {p["id"] for p in c.get("/api/v1/people/").data["results"]}
        assert str(person.id) in ids
        assert str(outsider.id) not in ids
        assert c.get(f"/api/v1/people/{outsider.id}/").status_code == 404
        groups = c.get("/api/v1/groups/").data["results"]
        assert [g["name"] for g in groups] == ["Tuesday Group"]
        assert c.post("/api/v1/people/", {"first_name": "N", "last_name": "P"},
                      format="json").status_code == 403

    def test_group_leader_cannot_add_to_other_groups(self, roles, group_with_leader, person):
        from apps.groups.models import Group

        other = Group.objects.create(name="Other")
        c = client_for(roles["Group Leader"])
        res = c.post("/api/v1/group-memberships/", {"group": str(other.id), "person": str(person.id)},
                     format="json")
        assert res.status_code == 403

    def test_confidential_care_records(self, roles, person):
        pastor = roles["Pastor"]
        assistant_role = Role.objects.create(name="Care Team",
                                             permissions=["pastoral.view", "pastoral.manage"])
        assistant = make_user(None, "care@test.org", role=assistant_role)
        CareRecord.objects.create(person=person, subject="Open", created_by=pastor)
        CareRecord.objects.create(person=person, subject="Secret", is_confidential=True,
                                  created_by=pastor)
        subjects = [r["subject"] for r in client_for(assistant).get("/api/v1/care-records/").data["results"]]
        assert subjects == ["Open"]
        subjects = [r["subject"] for r in client_for(pastor).get("/api/v1/care-records/").data["results"]]
        assert set(subjects) == {"Open", "Secret"}

    def test_role_privilege_escalation_blocked(self):
        limited = Role.objects.create(name="User Admin", permissions=["users.manage", "people.view"])
        c = client_for(make_user(None, "ua@test.org", role=limited))
        res = c.post("/api/v1/roles/", {"name": "Sneaky", "permissions": ["giving.view"]},
                     format="json")
        assert res.status_code == 400
        admin_role = Role.objects.get(name="Administrator")
        res = c.post("/api/v1/users/", {"email": "new@test.org", "role_id": str(admin_role.id)},
                     format="json")
        assert res.status_code == 400

    def test_cannot_deactivate_self(self, admin_user, admin):
        res = admin.patch(f"/api/v1/users/{admin_user.id}/", {"is_active": False}, format="json")
        assert res.status_code == 400

    def test_system_role_cannot_be_deleted(self, admin):
        role = Role.objects.get(name="Pastor")
        assert admin.delete(f"/api/v1/roles/{role.id}/").status_code == 400

    def test_deactivated_user_tokens_stop_working(self, admin, roles):
        office = roles["Church Office"]
        c = client_for(office)
        assert c.get("/api/v1/people/").status_code == 200
        admin.patch(f"/api/v1/users/{office.id}/", {"is_active": False}, format="json")
        assert c.get("/api/v1/people/").status_code == 401

    def test_audit_log_requires_permission(self, roles, admin):
        assert client_for(roles["Pastor"]).get("/api/v1/audit-log/").status_code == 403
        assert admin.get("/api/v1/audit-log/").status_code == 200

    def test_audit_log_is_append_only(self, admin):
        assert admin.delete("/api/v1/audit-log/1/").status_code in (403, 405)
