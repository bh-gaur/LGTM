FROM python:3.11-slim

WORKDIR /app

COPY analytics-service/requirements.txt ./analytics-service/

RUN pip install --no-cache-dir -r ./analytics-service/requirements.txt && \
    opentelemetry-bootstrap --action=install

COPY common ./common
COPY analytics-service/ ./analytics-service/

WORKDIR /app/analytics-service

EXPOSE 8086

CMD ["python", "app.py"]
