# LGTM Application Suite: API & Metrics Guide

This document describes all API endpoints, background services, and metric-to-trace mapping configurations for the expanded LGTM microservice architecture.

---

## 🗺️ 1. API Endpoints Catalog

### Node.js Gateway Services (`node-app` on Port `8081`)

| Endpoint | Method | Description | Distributed Trace Flow | Generated Metrics |
| :--- | :--- | :--- | :--- | :--- |
| `/calculate/:num` | `GET` | Computes Fibonacci sum; stores results in Redis. | `node-app` ➔ `auth-service` ➔ `python-app` | `calculation_requests_total`, `node_active_users` |
| `/calculate/primes/:num` | `GET` | Computes prime factorization of a number. | `node-app` ➔ `auth-service` ➔ `go-app` ➔ `python-app` | `calculation_requests_total` |
| `/system/summary` | `GET` | Fetches consolidated DB table stats. | `node-app` ➔ `analytics-service` | N/A (Gateway Proxy) |
| `/complex-task` | `GET` | Sequential multi-step flow with database simulators. | `node-app` ➔ `python-app` | `node_task_duration_seconds` (Histogram), `node_active_users` |
| `/multi-step/:id` | `GET` | Basic sequential timer stages check. | `node-app` (Internal Auto-Instrumented Spans) | N/A |
| `/user/:id` | `GET` | Fetches user details; caches records in Redis. | `node-app` ➔ `python-app` (Flask DB API) | `node_active_users` (on cache hit) |
| `/kafka/publish` | `POST` | Publishes event payloads to the Kafka broker. | `node-app` ➔ Kafka Message ➔ `notification-service` | N/A |
| `/error` | `GET` | Intentional 500 error route for telemetry testing. | `node-app` (Root Error Span) | `error_requests_total` |

---

### Internal Service Endpoints

| Service | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **`auth-service`** (Node.js) | `/verify` | `POST` | Validates authentication tokens dynamically. |
| **`go-app`** (Go / Gin) | `/math/primes/:num` | `GET` | Computes factors and sends summary to `python-app`. |
| **`python-app`** (Flask) | `/analyze` | `POST` | Analyzes Fibonacci / Prime numerical traits. |
| | `/db/user/:user_id` | `GET` | Resolves user profiles from PostgreSQL catalog. |
| | `/text/analyze` | `POST` | Runs mock text sentiment analysis. |
| **`analytics-service`** (FastAPI)| `/metrics/summary` | `GET` | Serves PostgreSQL system statistics. |

---

## 📊 2. Metrics & Exemplars Reference

Use the following metric names in Grafana Explore (Mimir/Prometheus datasource) to query stats and click blue Exemplar diamonds to jump directly to traces:

| Metric Name | Type | Description | Labels | Exemplars Enabled? |
| :--- | :--- | :--- | :--- | :---: |
| **`calculation_requests_total`** | Counter | Count of math calculation requests processed. | `number` | **Yes** |
| **`error_requests_total`** | Counter | Count of errored requests in the API Gateway. | `route` | **Yes** |
| **`node_task_duration_seconds`** | Histogram | Durations of nested database and computation steps. | `task_name`, `status` | **Yes** |
| **`node_active_users`** | Gauge | Simulated concurrency load indicator. | N/A | No |

---

## 🧪 3. Command Examples to Generate Traces

Use the following commands to generate traces that you can follow from **Metrics ➔ Traces** or **Logs ➔ Traces**:

### Case A: Trigger Calculation Counter & Exemplar
```bash
# Every unique value will cause a cache miss and record a new trace ID on the metric
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/31
```

### Case B: Trigger Task Duration Histogram & Exemplar
```bash
# Triggers database lookup simulators and heavy computation traces
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/complex-task
```

### Case C: Trigger Error Counter & Exemplar
```bash
# Simulates a system failure, registering a span status error code
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/error
```

### Case D: Trigger User Profile Database Spans
```bash
# Triggers SQL queries in python-app linked to the node-app gateway parent span
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/user/1
```

### Case E: Trigger Asynchronous Kafka Spans
```bash
# Publishes an alert event that propagates asynchronously through the broker to the consumer
curl -X POST -H "x-api-key: lgtm-secret-key" -H "Content-Type: application/json" \
  -d '{"message": "Verify distributed trace linkage"}' \
  http://localhost:8081/kafka/publish
```
