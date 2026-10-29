FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 samaritan

COPY requirements.txt .
RUN pip install -r requirements.txt

# Demo images also need Faker for `seed_demo` (docker-compose.demo.yml sets this).
ARG INSTALL_DEMO=false
RUN if [ "$INSTALL_DEMO" = "true" ]; then pip install Faker==40.44.0; fi

COPY . .
# collectstatic never touches secrets; random throwaway values satisfy the settings checks.
RUN DJANGO_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')" \
    FIELD_ENCRYPTION_KEYS="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" \
    python manage.py collectstatic --noinput \
    && chmod +x docker-entrypoint.sh \
    && mkdir -p /app/demo-secrets && chown samaritan /app/demo-secrets

USER samaritan
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/v1/health/')"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
