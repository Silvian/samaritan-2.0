from axes.exceptions import AxesBackendPermissionDenied
from axes.handlers.proxy import AxesProxyHandler
from django.conf import settings
from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db.models import Count
from django.middleware.csrf import get_token, rotate_token
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core import audit
from apps.core.models import AuditLog, ChurchSettings
from apps.core.viewsets import AuditedModelViewSet

from . import mfa
from .authentication import clear_auth_cookies, issue_tokens, set_auth_cookies
from .models import Role, User
from .permissions import MFASatisfied
from .rbac import catalogue
from .serializers import (
    LoginSerializer,
    MeSerializer,
    MFACodeSerializer,
    MFADisableSerializer,
    MFAVerifySerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RoleSerializer,
    UserSerializer,
)

GENERIC_LOGIN_ERROR = "Invalid email or password."


def _login_response(request, user, status_code=200):
    access, refresh = issue_tokens(user)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    audit.log(AuditLog.Action.LOGIN, user, actor=user, request=request)
    rotate_token(request._request)  # new CSRF token for the new session
    response = Response({"mfa_required": False, "user": MeSerializer(user).data}, status=status_code)
    set_auth_cookies(response, access, refresh)
    return response


class AuthView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_scope = "auth"


class LoginView(AuthView):
    @extend_schema(request=LoginSerializer, responses={200: dict})
    def post(self, request):
        ser = LoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"].lower()
        django_request = request._request
        # Axes inspects the raw request for the username field
        django_request.POST = django_request.POST.copy()
        django_request.POST["email"] = email
        try:
            user = authenticate(django_request, email=email, password=ser.validated_data["password"])
        except AxesBackendPermissionDenied:
            user = None
        if getattr(django_request, "axes_locked_out", False) or AxesProxyHandler.is_locked(
            django_request, {"email": email}
        ):
            audit.log(AuditLog.Action.LOGIN_FAILED, object_type="accounts.user",
                      object_repr=email, changes={"reason": "locked"}, request=django_request)
            return Response(
                {"detail": "Too many failed sign-in attempts. Try again later or reset your password.",
                 "code": "account_locked"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        if user is None or not user.is_active:
            audit.log(AuditLog.Action.LOGIN_FAILED, object_type="accounts.user",
                      object_repr=email, request=django_request)
            return Response({"detail": GENERIC_LOGIN_ERROR, "code": "invalid_credentials"},
                            status=status.HTTP_400_BAD_REQUEST)

        if user.mfa_enabled:
            return Response({"mfa_required": True, "challenge": mfa.make_challenge(user)})
        return _login_response(request, user)


class MFAVerifyView(AuthView):
    @extend_schema(request=MFAVerifySerializer, responses={200: dict})
    def post(self, request):
        ser = MFAVerifySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = mfa.read_challenge(ser.validated_data["challenge"])
        user = User.objects.filter(pk=data["u"], is_active=True).first() if data else None
        if not user or data.get("tv") != user.token_version or not user.mfa_enabled:
            return Response({"detail": "Your sign-in session expired. Please sign in again.",
                             "code": "challenge_expired"}, status=status.HTTP_400_BAD_REQUEST)
        if mfa.is_locked(user):
            return Response({"detail": "Too many incorrect codes. Try again in 15 minutes.",
                             "code": "mfa_locked"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if not mfa.check_code(user, ser.validated_data["code"]):
            audit.log(AuditLog.Action.LOGIN_FAILED, user, actor=user,
                      changes={"reason": "invalid_mfa_code"}, request=request)
            return Response({"detail": "That code is not valid.", "code": "invalid_code"},
                            status=status.HTTP_400_BAD_REQUEST)
        return _login_response(request, user)


class RefreshView(AuthView):
    @extend_schema(request=None, responses={200: dict})
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not raw:
            return Response({"detail": "Not signed in.", "code": "not_authenticated"},
                            status=status.HTTP_401_UNAUTHORIZED)
        try:
            token = RefreshToken(raw)
            user = User.objects.get(pk=token["user_id"])
            if not user.is_active or token.get("tv") != user.token_version:
                raise TokenError("revoked")
            token.blacklist()
        except (TokenError, User.DoesNotExist, KeyError):
            response = Response({"detail": "Session expired.", "code": "session_expired"},
                                status=status.HTTP_401_UNAUTHORIZED)
            clear_auth_cookies(response)
            return response
        access, refresh = issue_tokens(user)
        response = Response({"detail": "ok"})
        set_auth_cookies(response, access, refresh)
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    allow_incomplete_account = True

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        if request.data.get("everywhere"):
            request.user.revoke_sessions()
            request.user.save(update_fields=["token_version"])
        audit.log(AuditLog.Action.LOGOUT, request.user)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_auth_cookies(response)
        return response


class CSRFView(AuthView):
    """Sets the CSRF cookie. Call once before the first state-changing request."""

    @extend_schema(responses={200: dict})
    def get(self, request):
        get_token(request._request)
        return Response({"detail": "ok"})


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    allow_incomplete_account = True

    @extend_schema(responses=MeSerializer)
    def get(self, request):
        get_token(request._request)
        return Response(MeSerializer(request.user).data)

    @extend_schema(request=MeSerializer, responses=MeSerializer)
    def patch(self, request):
        ser = MeSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]
    allow_incomplete_account = True
    throttle_scope = "sensitive"

    @extend_schema(request=PasswordChangeSerializer, responses={200: dict})
    def post(self, request):
        ser = PasswordChangeSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        user = request.user
        user.set_password(ser.validated_data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.revoke_sessions()  # sign out every other device
        user.save()
        audit.log(AuditLog.Action.PASSWORD, user, changes={"event": "changed"})
        access, refresh = issue_tokens(user)
        response = Response({"detail": "Password changed."})
        set_auth_cookies(response, access, refresh)
        return response


class PasswordResetRequestView(AuthView):
    @extend_schema(request=PasswordResetRequestSerializer, responses={200: dict})
    def post(self, request):
        ser = PasswordResetRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=ser.validated_data["email"], is_active=True).first()
        if user:
            send_password_link(user, purpose="reset")
            audit.log(AuditLog.Action.PASSWORD, user, actor=user,
                      changes={"event": "reset_requested"}, request=request)
        # Never reveal whether an account exists.
        return Response({"detail": "If that email is registered, a reset link has been sent."})


class PasswordResetConfirmView(AuthView):
    @extend_schema(request=PasswordResetConfirmSerializer, responses={200: dict})
    def post(self, request):
        ser = PasswordResetConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            uid = force_str(urlsafe_base64_decode(ser.validated_data["uid"]))
            user = User.objects.get(pk=uid, is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        if not user or not default_token_generator.check_token(user, ser.validated_data["token"]):
            return Response({"detail": "This reset link is invalid or has expired.",
                             "code": "invalid_token"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            password_validation.validate_password(ser.validated_data["new_password"], user)
        except Exception as exc:  # django ValidationError
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc
        user.set_password(ser.validated_data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.revoke_sessions()
        user.save()
        audit.log(AuditLog.Action.PASSWORD, user, actor=user, changes={"event": "reset"},
                  request=request)
        return Response({"detail": "Password updated. You can now sign in."})


def send_password_link(user, purpose="reset"):
    church = ChurchSettings.load()
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    if purpose == "invite":
        subject = f"You've been invited to {church.name}'s Samaritan"
        body = (
            f"Hello {user.first_name or ''},\n\nAn account has been created for you on "
            f"{church.name}'s church management system. Set your password here (valid for 1 hour):"
            f"\n\n{link}\n\nIf you weren't expecting this, you can ignore this email."
        )
    else:
        subject = f"{church.name}: reset your password"
        body = (
            f"Hello {user.first_name or ''},\n\nUse the link below to reset your password. It is "
            f"valid for 1 hour.\n\n{link}\n\nIf you didn't request this, you can ignore this email."
        )
    send_mail(subject, body, None, [user.email])


# ---------------------------------------------------------------------------
# MFA management (current user)
# ---------------------------------------------------------------------------
class MFASetupView(APIView):
    permission_classes = [IsAuthenticated]
    allow_incomplete_account = True
    throttle_scope = "sensitive"

    @extend_schema(request=None, responses={200: dict})
    def post(self, request):
        user = request.user
        if user.mfa_enabled:
            return Response({"detail": "Two-factor authentication is already enabled.",
                             "code": "mfa_already_enabled"}, status=400)
        secret = mfa.new_secret()
        user.mfa_pending_secret = secret
        user.save(update_fields=["mfa_pending_secret"])
        return Response({"secret": secret, "otpauth_uri": mfa.provisioning_uri(user, secret)})


class MFAEnableView(APIView):
    permission_classes = [IsAuthenticated]
    allow_incomplete_account = True
    throttle_scope = "sensitive"

    @extend_schema(request=MFACodeSerializer, responses={200: dict})
    def post(self, request):
        ser = MFACodeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if not user.mfa_pending_secret:
            return Response({"detail": "Start setup first.", "code": "mfa_not_started"}, status=400)
        if mfa.is_locked(user):
            return Response({"detail": "Too many incorrect codes. Try again later.",
                             "code": "mfa_locked"}, status=429)
        if not mfa.check_code(user, ser.validated_data["code"], secret=user.mfa_pending_secret):
            return Response({"detail": "That code is not valid. Check your device's clock.",
                             "code": "invalid_code"}, status=400)
        plain, hashed = mfa.generate_recovery_codes()
        user.mfa_secret = user.mfa_pending_secret
        user.mfa_pending_secret = ""
        user.mfa_enabled = True
        user.recovery_codes = hashed
        user.save()
        audit.log(AuditLog.Action.MFA, user, changes={"event": "enabled"})
        return Response({"recovery_codes": plain})


class MFADisableView(APIView):
    permission_classes = [IsAuthenticated, MFASatisfied]
    throttle_scope = "sensitive"

    @extend_schema(request=MFADisableSerializer, responses={204: None})
    def post(self, request):
        ser = MFADisableSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if ChurchSettings.load().require_mfa:
            return Response({"detail": "Your church requires two-factor authentication.",
                             "code": "mfa_required"}, status=400)
        if not user.check_password(ser.validated_data["password"]) or not mfa.check_code(
            user, ser.validated_data["code"]
        ):
            return Response({"detail": "Password or code is incorrect.", "code": "invalid"},
                            status=400)
        user.mfa_enabled = False
        user.mfa_secret = ""
        user.recovery_codes = []
        user.save()
        audit.log(AuditLog.Action.MFA, user, changes={"event": "disabled"})
        return Response(status=204)


class RecoveryCodesView(APIView):
    permission_classes = [IsAuthenticated, MFASatisfied]
    throttle_scope = "sensitive"

    @extend_schema(request=MFACodeSerializer, responses={200: dict})
    def post(self, request):
        ser = MFACodeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if not user.mfa_enabled or not mfa.check_code(user, ser.validated_data["code"]):
            return Response({"detail": "That code is not valid.", "code": "invalid_code"}, status=400)
        plain, hashed = mfa.generate_recovery_codes()
        user.recovery_codes = hashed
        user.save(update_fields=["recovery_codes"])
        audit.log(AuditLog.Action.MFA, user, changes={"event": "recovery_codes_regenerated"})
        return Response({"recovery_codes": plain})


# ---------------------------------------------------------------------------
# Administration: users & roles
# ---------------------------------------------------------------------------
class UserViewSet(AuditedModelViewSet):
    queryset = User.objects.select_related("role", "person").all()
    serializer_class = UserSerializer
    permission_map = {"*": "users.manage"}
    search_fields = ["email", "first_name", "last_name"]
    filterset_fields = ["is_active", "role", "mfa_enabled"]
    ordering_fields = ["email", "last_login", "date_joined"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, serializer):
        user = serializer.save()
        user.set_unusable_password()
        user.save()
        audit.log(AuditLog.Action.CREATE, user, changes=audit.snapshot(user))
        send_password_link(user, purpose="invite")

    def perform_update(self, serializer):
        before = audit.snapshot(serializer.instance)
        user = serializer.save()
        if before.get("is_active") and not user.is_active:
            # Deactivation: revoke existing sessions immediately.
            user.revoke_sessions()
            user.save(update_fields=["token_version"])
        changes = audit.diff(before, audit.snapshot(user))
        if changes:
            audit.log(AuditLog.Action.UPDATE, user, changes=changes)

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"], url_path="send-invite")
    def send_invite(self, request, pk=None):
        user = self.get_object()
        send_password_link(user, purpose="invite")
        audit.log(AuditLog.Action.PASSWORD, user, changes={"event": "invite_sent"})
        return Response({"detail": f"Invitation sent to {user.email}."})

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"], url_path="reset-mfa")
    def reset_mfa(self, request, pk=None):
        user = self.get_object()
        user.mfa_enabled = False
        user.mfa_secret = ""
        user.mfa_pending_secret = ""
        user.recovery_codes = []
        user.revoke_sessions()
        user.save()
        audit.log(AuditLog.Action.MFA, user, changes={"event": "reset_by_admin"})
        return Response({"detail": "Two-factor authentication reset. The user must enrol again."})

    @extend_schema(request=None, responses={200: dict})
    @action(detail=True, methods=["post"], url_path="revoke-sessions")
    def revoke_sessions(self, request, pk=None):
        user = self.get_object()
        user.revoke_sessions()
        user.save(update_fields=["token_version"])
        audit.log(AuditLog.Action.LOGOUT, user, changes={"event": "sessions_revoked_by_admin"})
        return Response({"detail": "All sessions for this user have been signed out."})


class RoleViewSet(AuditedModelViewSet):
    serializer_class = RoleSerializer
    permission_map = {"*": "users.manage"}
    pagination_class = None
    search_fields = ["name"]

    def get_queryset(self):
        return Role.objects.annotate(user_count=Count("users"))

    def perform_destroy(self, instance):
        if instance.is_system:
            raise serializers.ValidationError("Built-in roles cannot be deleted.")
        if instance.users.exists():
            raise serializers.ValidationError("Reassign this role's users before deleting it.")
        super().perform_destroy(instance)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        # Permission changes take effect immediately on next request (no cached tokens).

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"])
    def catalogue(self, request):
        return Response(catalogue())
