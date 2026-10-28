"""
Encrypted model fields.

Special-category personal data (health, pastoral/religious notes) is
encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256). Keys come from
`settings.FIELD_ENCRYPTION_KEYS`; the first key encrypts, all keys can
decrypt, so keys can be rotated with `manage.py rotate_encryption_keys`.
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models

PREFIX = "enc$"


@lru_cache(maxsize=1)
def _fernet_for(keys: tuple[str, ...]) -> MultiFernet:
    if not keys:
        raise ImproperlyConfigured("FIELD_ENCRYPTION_KEYS is not configured")
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])


def get_fernet() -> MultiFernet:
    return _fernet_for(tuple(settings.FIELD_ENCRYPTION_KEYS))


def encrypt_str(value: str) -> str:
    return PREFIX + get_fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_str(value: str) -> str:
    if not value.startswith(PREFIX):
        # Legacy / plaintext value (e.g. imported before encryption was enabled)
        return value
    try:
        return get_fernet().decrypt(value[len(PREFIX):].encode("ascii")).decode("utf-8")
    except InvalidToken as exc:  # pragma: no cover - indicates key misconfiguration
        raise ImproperlyConfigured("Unable to decrypt field: check FIELD_ENCRYPTION_KEYS") from exc


class EncryptedTextField(models.TextField):
    """TextField transparently encrypted in the database. Not searchable."""

    description = "Text encrypted at rest"

    def from_db_value(self, value, expression, connection):
        if value is None or value == "":
            return value
        return decrypt_str(value)

    def to_python(self, value):
        if isinstance(value, str) and value.startswith(PREFIX):
            return decrypt_str(value)
        return value

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == "":
            return value
        return encrypt_str(str(value))
