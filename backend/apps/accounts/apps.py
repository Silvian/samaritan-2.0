from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"

    def ready(self):
        from django.contrib.auth.models import AnonymousUser

        from . import schema  # noqa: F401  (registers the OpenAPI auth extension)

        # Anonymous users hold no permissions (fail closed, also during schema generation).
        AnonymousUser.has_code = lambda self, *codes: False
        AnonymousUser.permission_codes = frozenset()
        AnonymousUser.person_id = None
