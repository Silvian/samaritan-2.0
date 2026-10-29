from django.http import JsonResponse


def lockout_response(request, credentials=None, *args, **kwargs):
    return JsonResponse(
        {
            "detail": "Too many failed sign-in attempts. Try again later or reset your password.",
            "code": "account_locked",
        },
        status=429,
    )
