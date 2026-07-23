FROM python:3.11-slim

WORKDIR /app

COPY python-app/requirements.txt ./python-app/

RUN pip install --no-cache-dir -r ./python-app/requirements.txt && \
    opentelemetry-bootstrap --action=install

COPY common ./common
COPY python-app/ ./python-app/

WORKDIR /app/python-app

EXPOSE 5000

CMD ["gunicorn", "--workers=4", "--threads=2", "--worker-class=gthread", "--bind=0.0.0.0:5000", "--timeout=120", "app:app"]
