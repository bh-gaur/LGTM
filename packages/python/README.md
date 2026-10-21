# lgtm-obs (Python)

Zero-boilerplate, enterprise-grade OpenTelemetry observability library for Python microservices targeting the **Grafana LGTM stack** (Loki, Grafana, Tempo, Mimir).

## Installation

```bash
pip install lgtm-obs
# Or with all instrumentations (Flask, FastAPI, PostgreSQL, Kafka):
pip install "lgtm-obs[all]"
```

## Quick Start (Flask)

```python
from flask import Flask
from lgtm_obs import init_observability, get_logger, get_tracer

app = Flask(__name__)

# Single call initializes Traces -> Tempo, Logs -> Loki, Metrics -> Mimir
obs = init_observability(app, service_name="payment-service")
logger = get_logger()
tracer = get_tracer()

@app.route("/pay")
def pay():
    with tracer.start_as_current_span("ProcessPayment") as span:
        logger.info("Executing payment workflow")
        return {"status": "ok"}

if __name__ == "__main__":
    app.run(port=5000)
```

## Quick Start (FastAPI)

```python
from fastapi import FastAPI
from lgtm_obs import init_observability, get_logger

app = FastAPI()
obs = init_observability(app, service_name="order-service")
logger = get_logger()

@app.get("/orders")
def get_orders():
    logger.info("Fetching orders...")
    return [{"order_id": 101, "total": 99.0}]
```

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `OTEL_SERVICE_NAME` | Service identifier tag | `python-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP receiver endpoint | `http://localhost:4318` |
| `ENABLE_OBSERVABILITY` | Master toggle flag | `true` |
