FROM python:3.11-slim AS builder

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY analytics-service/requirements.txt ./analytics-service/

RUN pip install --no-cache-dir -r ./analytics-service/requirements.txt && \
    opentelemetry-bootstrap --action=install

FROM python:3.11-slim AS runner

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY common ./common
COPY analytics-service/ ./analytics-service/

WORKDIR /app/analytics-service

EXPOSE 8086

CMD ["python", "app.py"]

