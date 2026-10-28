"""Audit logging helpers (GDPR Art. 5(2) accountability / Art. 30 records)."""

import datetime
import decimal
import hashlib
import hmac
import logging
import uuid

from django.conf import settings
from django.db import models

from .middleware import client_ip, get_current_request
from .models import AuditLog

logger = logging.getLogger("samaritan.audit")

REDACTED = "[redacted]"
SECRET_FIELDS = {"password", "mfa_secret", "recovery_codes"}


def _json_safe(value):
    if isinstance(value, (datetime.date, datetime.datetime, datetime.time)):
        return value.isoformat()
    if isinstance(value, (uuid.UUID, decimal.Decimal)):
        return str(value)
    if isinstance(value, models.Model):
        return str(value.pk)
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    return value


def _fingerprint(value) -> str:
    digest = hmac.new(settings.SECRET_KEY.encode(), str(value).encode(), hashlib.sha256)
    return f"{REDACTED}#{digest.hexdigest()[:8]}"


def snapshot(instance: models.Model) -> dict:
    """Concrete field values for diffing. Encrypted & secret values are redacted."""
    from .fields import EncryptedTextField

    data = {}
    for field in instance._meta.concrete_fields:
        if field.name in {"created_at", "updated_at", "updated_by", "created_by"}:
            continue
        value = getattr(instance, field.attname, None)
        if field.name in SECRET_FIELDS or isinstance(field, EncryptedTextField):
            # Never store secrets or special-category content in the audit trail; a keyed
            # fingerprint lets us record *that* the value changed without revealing it.
            value = _fingerprint(value) if value else ""
        data[field.name] = _json_safe(value)
    return data


def diff(before: dict, after: dict) -> dict:
    changes = {}
    for key in set(before) | set(after):
        if before.get(key) != after.get(key):
            changes[key] = {"from": before.get(key), "to": after.get(key)}
    return changes


def log(action, obj=None, *, actor=None, changes=None, object_type=None, object_id=None,
        object_repr=None, request=None):
    request = request or get_current_request()
    if actor is None and request is not None:
        user = getattr(request, "user", None)
        actor = user if (user is not None and user.is_authenticated) else None
    if obj is not None:
        object_type = object_type or f"{obj._meta.app_label}.{obj._meta.model_name}"
        object_id = object_id or str(obj.pk)
        object_repr = object_repr if object_repr is not None else str(obj)[:255]
    try:
        return AuditLog.objects.create(
            actor=actor,
            actor_email=getattr(actor, "email", "") or "",
            action=action,
            object_type=object_type or "",
            object_id=object_id or "",
            object_repr=(object_repr or "")[:255],
            changes=changes or {},
            ip_address=client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:300] if request else ""),
        )
    except Exception:  # pragma: no cover - audit must never break the request
        logger.exception("Failed to write audit log entry")
        return None
