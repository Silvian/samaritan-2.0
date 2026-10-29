from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from apps.core.models import ChurchSettings


class MFASatisfied(BasePermission):
    """
    Block every API endpoint until the user has enrolled in MFA (when the
    church requires it) and changed a temporary password.

    Views opt out with `allow_incomplete_account = True` (e.g. /auth/me, MFA setup).
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return True  # IsAuthenticated handles this
        if getattr(view, "allow_incomplete_account", False):
            return True
        if user.must_change_password:
            raise PermissionDenied(
                detail="You must change your password before continuing.",
                code="password_change_required",
            )
        if not user.mfa_enabled and ChurchSettings.load().require_mfa:
            raise PermissionDenied(
                detail="Two-factor authentication must be set up before continuing.",
                code="mfa_setup_required",
            )
        return True


class RBACPermission(BasePermission):
    """
    Checks `view.permission_map[action]` (or `[method]`) against the user's
    role. A value may be a single code or a tuple of alternatives (any match).
    Views with scoped access (e.g. group leaders) further narrow their queryset.
    """

    message = "You do not have permission to perform this action."

    def _required(self, request, view):
        perm_map = getattr(view, "permission_map", {})
        action = getattr(view, "action", None)
        required = None
        if action and action in perm_map:
            required = perm_map[action]
        elif request.method in perm_map:
            required = perm_map[request.method]
        elif "*" in perm_map:
            required = perm_map["*"]
        if required is None:
            return None
        return (required,) if isinstance(required, str) else tuple(required)

    def has_permission(self, request, view):
        required = self._required(request, view)
        if required is None:
            # Fail closed: an unmapped action is denied.
            return request.user.is_superuser
        return request.user.has_code(*required)


def has_perm(*codes):
    """Factory for function-based views: permission_classes=[has_perm('x.y')]."""

    class _HasPerm(BasePermission):
        def has_permission(self, request, view):
            return bool(request.user and request.user.is_authenticated and request.user.has_code(*codes))

    _HasPerm.__name__ = f"HasPerm_{'_'.join(c.replace('.', '_') for c in codes)}"
    return _HasPerm
