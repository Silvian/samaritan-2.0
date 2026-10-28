"""
Re-encrypt every encrypted field with the first key in FIELD_ENCRYPTION_KEYS.

Rotation: prepend a new key to FIELD_ENCRYPTION_KEYS (keep the old one after it),
deploy, run this command, then remove the old key.
"""

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.fields import EncryptedTextField


class Command(BaseCommand):
    help = "Re-encrypt all encrypted fields with the current primary key."

    @transaction.atomic
    def handle(self, *args, **options):
        total = 0
        for model in apps.get_models():
            fields = [f.name for f in model._meta.concrete_fields if isinstance(f, EncryptedTextField)]
            if not fields:
                continue
            for obj in model._base_manager.all().iterator():
                # Values are decrypted on load and re-encrypted with the primary key on save.
                model._base_manager.filter(pk=obj.pk).update(**{f: getattr(obj, f) for f in fields})
                total += 1
            self.stdout.write(f"{model._meta.label}: {', '.join(fields)}")
        self.stdout.write(self.style.SUCCESS(f"Re-encrypted {total} rows."))
