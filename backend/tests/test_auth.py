import pyotp
import pytest
from django.conf import settings
from django.core import mail
from rest_framework.test import APIClient

from apps.core.models import AuditLog, ChurchSettings

from .conftest import PASSWORD, make_user, new_password

LOGIN = "/api/v1/auth/login/"


def login(client, email, password=PASSWORD):
    return client.post(LOGIN, {"email": email, "password": password}, format="json")


def csrf_client():
    client = APIClient(enforce_csrf_checks=True)
    client.get("/api/v1/auth/csrf/")
    return client


def csrf_header(client):
    return {"HTTP_X_CSRFTOKEN": client.cookies[settings.CSRF_COOKIE_NAME].value}


@pytest.mark.django_db
class TestLogin:
    def test_success_sets_httponly_cookies(self, admin_user):
        client = csrf_client()
        res = login(client, "ADMIN@test.org")
        assert res.status_code == 200
        assert res.data["user"]["email"] == "admin@test.org"
        access = res.cookies[settings.AUTH_COOKIE_ACCESS]
        refresh = res.cookies[settings.AUTH_COOKIE_REFRESH]
        assert access["httponly"] and refresh["httponly"]
        assert refresh["path"] == settings.AUTH_COOKIE_REFRESH_PATH
        assert "access" not in res.data and "refresh" not in res.data  # tokens never in JS
        assert client.get("/api/v1/auth/me/").status_code == 200
        assert AuditLog.objects.filter(action="login", actor=admin_user).exists()

    def test_wrong_password_is_generic_and_audited(self, admin_user):
        res = login(APIClient(), "admin@test.org", "nope")
        assert res.status_code == 400
        assert res.data["detail"] == "Invalid email or password."
        res2 = login(APIClient(), "nobody@test.org", "nope")
        assert res2.data["detail"] == res.data["detail"]  # no user enumeration
        assert AuditLog.objects.filter(action="login_failed").count() == 2

    def test_lockout_after_repeated_failures(self, admin_user):
        client = APIClient()
        for _ in range(settings.AXES_FAILURE_LIMIT):
            login(client, "admin@test.org", "wrong")
        res = login(client, "admin@test.org")  # correct password, but locked
        assert res.status_code == 429
        assert res.json()["code"] == "account_locked"

    def test_inactive_user_cannot_login(self):
        make_user("Read Only", "gone@test.org", is_active=False)
        assert login(APIClient(), "gone@test.org").status_code == 400

    def test_form_encoded_login_rejected(self, admin_user):
        """JSON-only parsing blocks cross-site form posts (login CSRF)."""
        res = APIClient().post(LOGIN, f"email=admin%40test.org&password={PASSWORD}",
                               content_type="application/x-www-form-urlencoded")
        assert res.status_code == 415


@pytest.mark.django_db
class TestCSRFAndTokens:
    def test_cookie_auth_requires_csrf_on_unsafe_methods(self, admin_user):
        client = csrf_client()
        login(client, "admin@test.org")
        body = {"first_name": "A", "last_name": "B"}
        assert client.post("/api/v1/people/", body, format="json").status_code == 403
        res = client.post("/api/v1/people/", body, format="json", **csrf_header(client))
        assert res.status_code == 201

    def test_refresh_rotates_and_blacklists(self, admin_user):
        client = csrf_client()
        login(client, "admin@test.org")
        old_refresh = client.cookies[settings.AUTH_COOKIE_REFRESH].value
        res = client.post("/api/v1/auth/refresh/")
        assert res.status_code == 200
        assert client.cookies[settings.AUTH_COOKIE_REFRESH].value != old_refresh
        replay = APIClient()
        replay.cookies[settings.AUTH_COOKIE_REFRESH] = old_refresh
        assert replay.post("/api/v1/auth/refresh/").status_code == 401

    def test_logout_everywhere_revokes_access_tokens(self, admin_user):
        a, b = csrf_client(), csrf_client()
        login(a, "admin@test.org")
        login(b, "admin@test.org")
        res = a.post("/api/v1/auth/logout/", {"everywhere": True}, format="json", **csrf_header(a))
        assert res.status_code == 204
        assert b.get("/api/v1/auth/me/").status_code == 401

    def test_password_change_revokes_other_sessions(self, admin_user):
        a, b = csrf_client(), csrf_client()
        login(a, "admin@test.org")
        login(b, "admin@test.org")
        res = a.post("/api/v1/auth/password/change/",
                     {"current_password": PASSWORD, "new_password": new_password()},
                     format="json", **csrf_header(a))
        assert res.status_code == 200
        assert a.get("/api/v1/auth/me/").status_code == 200  # re-issued for this device
        assert b.get("/api/v1/auth/me/").status_code == 401

    def test_weak_password_rejected(self, admin_user):
        client = csrf_client()
        login(client, "admin@test.org")
        res = client.post("/api/v1/auth/password/change/",
                          {"current_password": PASSWORD, "new_password": "password"},
                          format="json", **csrf_header(client))
        assert res.status_code == 400

    def test_password_reset_flow(self, admin_user):
        client = APIClient()
        first, second = new_password(), new_password()
        res = client.post("/api/v1/auth/password/reset/", {"email": "admin@test.org"}, format="json")
        assert res.status_code == 200
        assert len(mail.outbox) == 1
        link = [w for w in mail.outbox[0].body.split() if "reset-password" in w][0]
        uid = link.split("uid=")[1].split("&")[0]
        token = link.split("token=")[1]
        res = client.post("/api/v1/auth/password/reset/confirm/",
                          {"uid": uid, "token": token, "new_password": first},
                          format="json")
        assert res.status_code == 200
        assert login(APIClient(), "admin@test.org", first).status_code == 200
        # token is single-use
        res = client.post("/api/v1/auth/password/reset/confirm/",
                          {"uid": uid, "token": token, "new_password": second},
                          format="json")
        assert res.status_code == 400

    def test_reset_does_not_reveal_unknown_email(self):
        res = APIClient().post("/api/v1/auth/password/reset/", {"email": "x@y.org"}, format="json")
        assert res.status_code == 200
        assert len(mail.outbox) == 0


@pytest.mark.django_db
class TestMFA:
    def _enrol(self, user):
        client = csrf_client()
        login(client, user.email)
        setup = client.post("/api/v1/auth/mfa/setup/", **csrf_header(client))
        secret = setup.data["secret"]
        res = client.post("/api/v1/auth/mfa/enable/", {"code": pyotp.TOTP(secret).now()},
                          format="json", **csrf_header(client))
        assert res.status_code == 200
        assert len(res.data["recovery_codes"]) == 10
        return secret, res.data["recovery_codes"]

    def test_enforced_mfa_blocks_api_until_enrolled(self, admin_user):
        s = ChurchSettings.load()
        s.require_mfa = True
        s.save()
        client = csrf_client()
        login(client, "admin@test.org")
        res = client.get("/api/v1/people/")
        assert res.status_code == 403
        assert res.data["code"] == "mfa_setup_required"
        assert client.get("/api/v1/auth/me/").status_code == 200
        self._enrol(admin_user)
        client2 = csrf_client()
        res = login(client2, "admin@test.org")
        assert res.data["mfa_required"] is True

    def test_two_step_login_and_replay_protection(self, admin_user):
        secret, _ = self._enrol(admin_user)
        client = csrf_client()
        res = login(client, "admin@test.org")
        assert res.data["mfa_required"] is True
        assert settings.AUTH_COOKIE_ACCESS not in res.cookies  # no session before 2nd factor
        challenge = res.data["challenge"]
        bad = client.post("/api/v1/auth/mfa/verify/", {"challenge": challenge, "code": "000000"},
                          format="json")
        assert bad.status_code == 400
        code = pyotp.TOTP(secret).now()
        # the enrolment already used the current time-step, so the same code is a replay
        res = client.post("/api/v1/auth/mfa/verify/", {"challenge": challenge, "code": code},
                          format="json")
        assert res.status_code == 400

    def test_recovery_code_works_once(self, admin_user):
        _, codes = self._enrol(admin_user)
        client = csrf_client()
        challenge = login(client, "admin@test.org").data["challenge"]
        res = client.post("/api/v1/auth/mfa/verify/", {"challenge": challenge, "code": codes[0]},
                          format="json")
        assert res.status_code == 200
        client2 = csrf_client()
        challenge = login(client2, "admin@test.org").data["challenge"]
        res = client2.post("/api/v1/auth/mfa/verify/", {"challenge": challenge, "code": codes[0]},
                           format="json")
        assert res.status_code == 400

    def test_tampered_challenge_rejected(self, admin_user):
        self._enrol(admin_user)
        res = APIClient().post("/api/v1/auth/mfa/verify/",
                               {"challenge": "forged:token", "code": "123456"}, format="json")
        assert res.status_code == 400
        assert res.data["code"] == "challenge_expired"

    def test_mfa_secret_encrypted_at_rest(self, admin_user):
        self._enrol(admin_user)
        from django.db import connection

        with connection.cursor() as cur:
            cur.execute("SELECT mfa_secret FROM accounts_user WHERE id = %s", [admin_user.pk])
            raw = cur.fetchone()[0]
        assert raw.startswith("enc$")
