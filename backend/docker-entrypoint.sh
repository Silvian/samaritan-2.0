#!/bin/sh
set -e

if [ "${DEMO_MODE:-false}" = "true" ] && [ -z "${DJANGO_SECRET_KEY:-}" ]; then
  # Demo deployments generate their own secrets on first start and keep them in the
  # demo-secrets volume, so nothing secret is committed to the repository.
  secrets_file=/app/demo-secrets/env
  if [ ! -f "$secrets_file" ]; then
    python - > "$secrets_file" <<'PY'
import secrets
from cryptography.fernet import Fernet
print(f"DJANGO_SECRET_KEY={secrets.token_urlsafe(64)}")
print(f"FIELD_ENCRYPTION_KEYS={Fernet.generate_key().decode()}")
PY
    chmod 600 "$secrets_file"
  fi
  set -a
  . "$secrets_file"
  set +a
fi

python manage.py migrate --noinput
python manage.py bootstrap
if [ "${SEED_DEMO:-false}" = "true" ]; then
  # Demo deployments only (see docker-compose.demo.yml). Seeds once, on an empty database.
  python manage.py seed_demo --if-empty
fi
exec "$@"
