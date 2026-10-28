import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.core.fields import EncryptedTextField

from .rbac import ALL_PERMISSIONS


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=list, blank=True)
    is_system = models.BooleanField(default=False, help_text="Seeded role; cannot be deleted")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def clean_permissions(self):
        return sorted(set(self.permissions) & ALL_PERMISSIONS)

    def save(self, *args, **kwargs):
        self.permissions = self.clean_permissions()
        super().save(*args, **kwargs)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra["is_staff"] = True
        extra["is_superuser"] = True
        return self._create_user(email, password, **extra)

    def get_by_natural_key(self, username):
        return self.get(**{f"{self.model.USERNAME_FIELD}__iexact": username})


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    role = models.ForeignKey(
        Role, null=True, blank=True, on_delete=models.PROTECT, related_name="users"
    )
    person = models.OneToOneField(
        "people.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="user_account",
        help_text="The member record for this user (used for group-leader scoping).",
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False, help_text="Can access the break-glass Django admin")
    date_joined = models.DateTimeField(default=timezone.now)

    # Session invalidation: bump to revoke every token issued to this user.
    token_version = models.PositiveIntegerField(default=0)
    must_change_password = models.BooleanField(default=False)
    password_changed_at = models.DateTimeField(null=True, blank=True)

    # Two-factor authentication (TOTP, RFC 6238)
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = EncryptedTextField(blank=True, default="")
    mfa_pending_secret = EncryptedTextField(blank=True, default="")
    mfa_last_used_step = models.BigIntegerField(null=True, blank=True)
    mfa_failures = models.PositiveSmallIntegerField(default=0)
    mfa_locked_until = models.DateTimeField(null=True, blank=True)
    recovery_codes = models.JSONField(default=list, blank=True)  # hashed

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        self.email = (self.email or "").lower()
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email

    # --- RBAC -----------------------------------------------------------
    @property
    def permission_codes(self) -> set[str]:
        if not hasattr(self, "_perm_cache"):
            if not self.is_active:
                self._perm_cache = set()
            elif self.is_superuser:
                self._perm_cache = set(ALL_PERMISSIONS)
            elif self.role_id:
                self._perm_cache = set(self.role.permissions) & ALL_PERMISSIONS
            else:
                self._perm_cache = set()
        return self._perm_cache

    def has_code(self, *codes: str) -> bool:
        """True if the user holds ANY of the given permission codes."""
        return bool(self.permission_codes & set(codes))

    def revoke_sessions(self):
        self.token_version += 1
