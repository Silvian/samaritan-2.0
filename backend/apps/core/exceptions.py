import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Consistent error envelope: {"detail": str, "code": str, "errors": {...}}."""
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(getattr(exc, "message_dict", None) or exc.messages)
    if isinstance(exc, ProtectedError):
        return Response(
            {
                "detail": "This record is in use elsewhere and cannot be deleted.",
                "code": "protected",
            },
            status=status.HTTP_409_CONFLICT,
        )

    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    if isinstance(exc, ValidationError):
        detail = "Please correct the highlighted fields."
        if isinstance(data, list):
            detail = " ".join(str(d) for d in data)
            data = {"non_field_errors": data}
        elif isinstance(data, dict) and set(data) == {"non_field_errors"}:
            detail = " ".join(str(d) for d in data["non_field_errors"])
        response.data = {"detail": detail, "code": "invalid", "errors": data}
    else:
        detail = data.get("detail", "") if isinstance(data, dict) else str(data)
        code = getattr(getattr(exc, "detail", None), "code", None) or getattr(
            exc, "default_code", "error"
        )
        response.data = {"detail": str(detail), "code": str(code)}
    return response
