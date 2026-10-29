from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core import mail
from django.db import connection

from apps.core.models import AuditLog
from apps.events.models import Event
from apps.giving.models import Donation, Fund, GiftAidDeclaration
from apps.pastoral.models import CareRecord
from apps.people.models import Person
from apps.privacy.models import Consent, DataRequest

from .conftest import client_for


@pytest.mark.django_db
class TestPeople:
    def test_create_update_and_audit_diff(self, admin):
        res = admin.post("/api/v1/people/", {"first_name": "Ann", "last_name": "Lee",
                                              "email": "ann@example.com", "status": "visitor"},
                         format="json")
        assert res.status_code == 201
        pid = res.data["id"]
        res = admin.patch(f"/api/v1/people/{pid}/", {"status": "member"}, format="json")
        assert res.data["status"] == "member"
        entry = AuditLog.objects.filter(action="update", object_id=pid).first()
        assert entry.changes["status"] == {"from": "visitor", "to": "member"}

    def test_viewing_a_person_is_audited(self, admin, person):
        admin.get(f"/api/v1/people/{person.id}/")
        assert AuditLog.objects.filter(action="view", object_id=str(person.id)).exists()

    def test_sensitive_values_redacted_in_audit(self, admin, person):
        admin.patch(f"/api/v1/people/{person.id}/", {"medical_notes": "Asthma"}, format="json")
        entry = AuditLog.objects.filter(action="update", object_id=str(person.id)).first()
        assert "Asthma" not in str(entry.changes)

    def test_archive_hides_from_list(self, admin, person):
        admin.post(f"/api/v1/people/{person.id}/archive/", {"reason": "Moved"}, format="json")
        ids = [p["id"] for p in admin.get("/api/v1/people/").data["results"]]
        assert str(person.id) not in ids
        ids = [p["id"] for p in admin.get("/api/v1/people/?archived=true").data["results"]]
        assert str(person.id) in ids

    def test_search_and_filters(self, admin, person, child):
        assert admin.get("/api/v1/people/?search=jane").data["count"] == 1
        assert admin.get("/api/v1/people/?age_max=17").data["count"] == 1
        assert admin.get("/api/v1/people/?status=member").data["count"] == 1

    def test_csv_export_neutralises_formulas_and_is_audited(self, admin):
        Person.objects.create(first_name="=HYPERLINK(\"x\")", last_name="Evil")
        res = admin.get("/api/v1/people/export/")
        body = res.content.decode()
        assert "'=HYPERLINK" in body
        assert AuditLog.objects.filter(action="export").exists()

    def test_medical_notes_encrypted_at_rest(self, person):
        with connection.cursor() as cur:
            cur.execute("SELECT medical_notes FROM people_person WHERE id = %s", [person.pk])
            raw = cur.fetchone()[0]
        assert raw.startswith("enc$") and "Penicillin" not in raw
        assert Person.objects.get(pk=person.pk).medical_notes == "Penicillin allergy"

    def test_household_detail_lists_members(self, admin, person, child):
        data = admin.get(f"/api/v1/households/{person.household_id}/").data
        assert {m["full_name"] for m in data["members"]} == {"Jane Smith", "Tom Smith"}


@pytest.mark.django_db
class TestEvents:
    def test_child_check_in_gets_security_code(self, admin, child):
        ev = Event.objects.create(title="Sunday", starts_at="2026-01-04T10:30:00Z")
        res = admin.post(f"/api/v1/events/{ev.id}/check-in/", {"person_id": str(child.id)},
                         format="json")
        assert res.status_code == 200
        code = res.data["security_code"]
        assert len(code) == 4
        bad = admin.post(f"/api/v1/events/{ev.id}/check-out/",
                         {"person_id": str(child.id), "security_code": "ZZZZ"}, format="json")
        assert bad.status_code == 400
        ok = admin.post(f"/api/v1/events/{ev.id}/check-out/",
                        {"person_id": str(child.id), "security_code": code}, format="json")
        assert ok.status_code == 200

    def test_bulk_attendance_and_count(self, admin, person, child):
        ev = Event.objects.create(title="Sunday", starts_at="2026-01-04T10:30:00Z")
        admin.post(f"/api/v1/events/{ev.id}/record-attendance/",
                   {"person_ids": [str(person.id), str(child.id)]}, format="json")
        assert admin.get(f"/api/v1/events/{ev.id}/").data["present_count"] == 2

    def test_duplicate_weekly(self, admin):
        ev = Event.objects.create(title="Sunday", starts_at="2026-01-04T10:30:00Z")
        res = admin.post(f"/api/v1/events/{ev.id}/duplicate/", {"weeks": 3}, format="json")
        assert len(res.data) == 3
        assert Event.objects.count() == 4


@pytest.mark.django_db
class TestGiving:
    def test_gift_aid_eligibility_and_summary(self, admin, person):
        fund = Fund.objects.get(name="General Fund")
        today = date.today()
        Donation.objects.create(person=person, fund=fund, amount=Decimal("100"), date=today)
        Donation.objects.create(fund=fund, amount=Decimal("40"), date=today,
                                eligible_for_gift_aid=False)
        assert Donation.objects.gift_aid_eligible().count() == 0
        GiftAidDeclaration.objects.create(person=person, start_date=today)
        assert Donation.objects.gift_aid_eligible().count() == 1
        data = admin.get(f"/api/v1/donations/summary/?year={today.year}").data
        assert Decimal(data["total"]) == Decimal("140")
        assert Decimal(data["gift_aid"]["reclaimable"]) == Decimal("25.00")

    def test_declaration_backdates_four_years(self, person):
        fund = Fund.objects.get(name="General Fund")
        today = date.today()
        Donation.objects.create(person=person, fund=fund, amount=Decimal("10"),
                                date=today - timedelta(days=365 * 3))
        GiftAidDeclaration.objects.create(person=person, start_date=today)
        assert Donation.objects.gift_aid_eligible().count() == 1

    def test_claimable_includes_totals(self, admin, person):
        fund = Fund.objects.get(name="General Fund")
        today = date.today()
        GiftAidDeclaration.objects.create(person=person, start_date=today)
        Donation.objects.create(person=person, fund=fund, amount=Decimal("100"), date=today)
        Donation.objects.create(person=person, fund=fund, amount=Decimal("20"), date=today)
        data = admin.get("/api/v1/donations/gift-aid-claimable/?page_size=1").data
        assert data["count"] == 2
        assert Decimal(data["total_amount"]) == Decimal("120")
        assert Decimal(data["reclaimable"]) == Decimal("30.00")

    def test_claimed_donation_is_locked(self, admin, person):
        fund = Fund.objects.get(name="General Fund")
        d = Donation.objects.create(person=person, fund=fund, amount=Decimal("10"),
                                    date=date.today(), gift_aid_claimed_at=date.today())
        res = admin.patch(f"/api/v1/donations/{d.id}/", {"amount": "99.00"}, format="json")
        assert res.status_code == 400
        assert admin.delete(f"/api/v1/donations/{d.id}/").status_code == 400


@pytest.mark.django_db
class TestPrivacy:
    def test_consent_ledger_latest_wins(self, admin, person):
        admin.post("/api/v1/consents/", {"person": str(person.id), "purpose": "email",
                                         "granted": True}, format="json")
        admin.post("/api/v1/consents/", {"person": str(person.id), "purpose": "email",
                                         "granted": False}, format="json")
        current = admin.get(f"/api/v1/consents/current/?person={person.id}").data
        email = next(c for c in current if c["purpose"] == "email")
        assert email["granted"] is False
        assert Consent.objects.filter(person=person).count() == 2  # history kept

    def test_messages_only_go_to_consenting_people(self, admin, person):
        other = Person.objects.create(first_name="No", last_name="Consent", email="no@example.com",
                                      status="member")
        Consent.objects.create(person=person, purpose="email", granted=True)
        Consent.objects.create(person=other, purpose="email", granted=False)
        preview = admin.post("/api/v1/messages/preview/", {"statuses": ["member"]}, format="json")
        assert preview.data["sendable"] == 1 and preview.data["no_consent"] == 1
        msg = admin.post("/api/v1/messages/", {"subject": "Hello", "body": "Hi {{first_name}}",
                                                "audience": {"statuses": ["member"]}},
                         format="json").data
        sent = admin.post(f"/api/v1/messages/{msg['id']}/send/").data
        assert sent["recipient_count"] == 1
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["jane@example.com"]
        assert mail.outbox[0].body.startswith("Hi Jane")

    def test_care_records_filter_by_priority_in(self, admin, person):
        CareRecord.objects.create(person=person, subject="A", priority="high")
        CareRecord.objects.create(person=person, subject="B", priority="urgent")
        CareRecord.objects.create(person=person, subject="C", priority="normal")
        res = admin.get("/api/v1/care-records/?priority__in=high,urgent")
        assert sorted(r["subject"] for r in res.data["results"]) == ["A", "B"]

    def test_subject_access_export(self, admin, person):
        CareRecord.objects.create(person=person, subject="Visit", details="Prayed together")
        res = admin.get(f"/api/v1/privacy/people/{person.id}/export/")
        assert res.status_code == 200
        import json

        data = json.loads(res.content)
        assert data["profile"]["email"] == "jane@example.com"
        assert data["pastoral_care"][0]["details"] == "Prayed together"
        assert AuditLog.objects.filter(action="export", object_id=str(person.id)).exists()

    def test_erasure_anonymises(self, admin, person):
        CareRecord.objects.create(person=person, subject="Visit")
        req = DataRequest.objects.create(person=person, requester_name="Jane", kind="erasure")
        bad = admin.post(f"/api/v1/privacy/people/{person.id}/erase/",
                         {"confirm_name": "wrong", "reason": "Request"}, format="json")
        assert bad.status_code == 400
        res = admin.post(f"/api/v1/privacy/people/{person.id}/erase/",
                         {"confirm_name": "Jane Smith", "reason": "Request",
                          "data_request": str(req.id)}, format="json")
        assert res.status_code == 200
        person.refresh_from_db()
        assert person.first_name == "Erased" and person.email == "" and person.medical_notes == ""
        assert person.date_of_birth is None
        assert not CareRecord.objects.filter(person=person).exists()
        assert admin.get(f"/api/v1/people/{person.id}/").status_code == 404
        req.refresh_from_db()
        assert req.status == "completed"
        assert AuditLog.objects.filter(action="erase").exists()

    def test_financial_hold_requires_confirmation(self, admin, person):
        fund = Fund.objects.get(name="General Fund")
        Donation.objects.create(person=person, fund=fund, amount=Decimal("10"), date=date.today(),
                                gift_aid_claimed_at=date.today())
        GiftAidDeclaration.objects.create(person=person, start_date=date.today())
        res = admin.post(f"/api/v1/privacy/people/{person.id}/erase/",
                         {"confirm_name": "Jane Smith", "reason": "Request"}, format="json")
        assert res.status_code == 409
        res = admin.post(f"/api/v1/privacy/people/{person.id}/erase/",
                         {"confirm_name": "Jane Smith", "reason": "Request",
                          "override_financial_hold": True}, format="json")
        assert res.status_code == 200
        assert Donation.objects.filter(person=person).count() == 1  # amounts retained
        assert GiftAidDeclaration.objects.filter(person=person).exists()

    def test_data_request_due_in_one_month(self, admin):
        res = admin.post("/api/v1/data-requests/", {"requester_name": "A", "kind": "access",
                                                    "received_on": "2026-03-01"}, format="json")
        assert res.data["due_on"] == "2026-03-31"

    def test_privacy_overview(self, admin, person):
        data = admin.get("/api/v1/privacy/overview/").data
        assert data["people_total"] == 1

    def test_retention_command(self, person):
        from django.core.management import call_command
        from django.utils import timezone

        person.archived_at = timezone.now() - timedelta(days=365 * 7)
        person.save()
        call_command("apply_retention", verbosity=0)
        person.refresh_from_db()
        assert person.anonymised_at is not None


@pytest.mark.django_db
class TestDashboard:
    def test_sections_follow_permissions(self, admin, roles, person):
        assert {"people", "giving", "pastoral", "privacy"} <= set(admin.get("/api/v1/dashboard/").data)
        finance = client_for(roles["Finance"]).get("/api/v1/dashboard/").data
        assert "giving" in finance and "pastoral" not in finance
        office = client_for(roles["Church Office"]).get("/api/v1/dashboard/").data
        assert "giving" not in office and "people" in office


@pytest.mark.django_db
def test_security_headers(admin):
    res = admin.get("/api/v1/people/")
    assert res["Cache-Control"].startswith("no-store")
    assert res["X-Content-Type-Options"] == "nosniff"
    assert "default-src 'none'" in res["Content-Security-Policy"]
