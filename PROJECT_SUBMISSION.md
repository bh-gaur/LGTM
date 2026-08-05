# ⚡ Project Submission: Unified LGTM Observability Mesh & Polyglot Microservices

This document serves as the master submission dossier for the **Unified LGTM Observability Mesh & Polyglot Microservices** project. It details the complete architecture, data workflow lifecycle, telemetry configurations, multi-cloud IaC setup, and verification benchmarks.

---

## 📖 Table of Contents
1. **Executive Summary**
2. **System Architecture & Data Flows**
3. **Application Component Specifications (7-Service Polyglot Mesh)**
4. **OpenTelemetry Telemetry Pipelines Design**
5. **Infrastructure-as-Code (IaC) & Kubernetes Deployment**
6. **Telemetry Integration Verification Benchmarks**
7. **Production Hardening, Resiliency & CI Validation**
8. **Real-World Troubleshooting Scenarios & Use Cases**

---

## 1. Executive Summary

This project implements a production-grade, distributed microservice grid orchestrated using **Docker Compose** and **Kubernetes (Helm)**, fully instrumented with the **Grafana LGTM (Loki, Grafana, Tempo, Mimir) Stack** and **Grafana Alloy**.

### Key Deliverables Completed:
* **Expanded to 12 Polyglot Services**: Created and wired Node.js Hapi Gateway, Express Auth, Go Prime calculation, Go Database sync, Go Inventory service, Python Analytics, Python Audit, Python Notification, Python Alerting, Python Reporting, and Python database writer services.
* **Unified TraceContext Context Propagation**: Context flows seamlessly across HTTP Rest routes and Kafka messaging boundaries using W3C standards.
* **OpenMetrics Exemplars Integration**: Correlates Mimir metric spikes directly to Tempo trace timelines.
* **Auto-Instrumentation Orders Resolved**: Corrected module initialization ordering to enable comprehensive telemetry hooks for databases, caching, and routers.
* **Dynamic OTel Bootstrapping**: Standardized a unified Python OTel script (`obs.py`) that auto-detects and instruments Flask or FastAPI frameworks at startup.

---

## 2. System Architecture & Data Flows

The system relies on an API Gateway pattern where `node-app` routes external requests downstream to specialized services while logging and exporting telemetry to a centralized collector.

### 📐 Structural Network Diagram

```
                          +-----------------------------------+
                          |      Web Control Center (UI)      |
                          |      http://localhost:8081        |
                          +-----------------+-----------------+
                                            |
                                            v
                           +-----------------------------------+
                           |   Node.js API Gateway (Hapi.js)   | (Port 8081)
                           +----+------------+------------+----+
                                |            |            |
         +----------------------+            |            +-----------------------+
         | JWT Verification                  | HTTP REST (Deep Pipeline)         | Kafka Event
         v                                   v                                    v
+------------------+               +-------------------+                 +------------------+
|   auth-service   | (Port 8082)   | recommendation-srv| (Port 5001)     |    lgtm-kafka    | (Port 9092)
|  (Node Express)  |               |  (Python Flask)   |                 | (Message Broker) |
+------------------+               +---------+---------+                 +--------+---------+
                                             |                                    |
                                             | HTTP REST                          | Event Consumer
                                             v                                    v
+------------------+               +---------+---------+                 +--------+---------+
|    reporting-srv | (Port 5003)   |      go-app       | (Port 8083)     | notification-serv| (Port 8084)
|  (Python Flask)  |               |     (Go Gin)      |                 | (Python FastAPI) |
+------------------+               +---------+---------+                 +--------+---------+
                                             |                                    |
                                             | HTTP REST                          | Event Consumer
                                             v                                    v
+------------------+               +---------+---------+                 +--------+---------+
|  db-sync-service | (Port 8085)   | inventory-service | (Port 8087)     | alerting-service | (Port 8088)
|    (Go Lang)     |               |     (Go Gin)      |                 | (Python FastAPI) |
+------------------+               +---------+---------+                 +--------+---------+
                                             |
                                             | HTTP REST
                                             v
+------------------+               +---------+---------+
|    python-app    | (Port 5000)   | analytics-service | (Port 8086)
|  (Python Flask)  |               | (Python FastAPI)  |
+--------+---------+               +--------+---------+
         |                                   |
         | HTTP REST                         | HTTP REST
         v                                   v
+--------+---------+               +---------+---------+
|  audit-service   | (Port 5002)   |  lgtm-postgres    | (Port 5432)
|  (Python Flask)  |               |   (PostgreSQL)    |
+------------------+               +-------------------+
```

---

## 3. Application Component Specifications

Below are details of the 12 microservices comprising the polyglot mesh:

### 1. `node-app` (Node.js Hapi.js Gateway) — Port `8081`
* **Role**: Serves the 3D topology UI dashboard, manages public Swagger docs, and routes REST operations downstream.
* **Integrations**: Redis Client (caching), KafkaJS Producer (event publishing).
* **Metrics**: `calculation_requests_total` (with exemplars), `error_requests_total` (with exemplars), `node_task_duration_seconds` (histogram).

### 2. `auth-service` (Node.js Express) — Port `8082`
* **Role**: Mock JWT authentication check service downstream of `node-app`.
* **Integrations**: Prom-client `/metrics` scraper hook.
* **Telemetry**: Winston logger correlating trace contexts.

### 3. `recommendation-service` (Python / Flask) — Port `5001`
* **Role**: Recommendation backend proxying requests downstream.
* **Integrations**: Dynamically instrumented Flask app with context propagation.

### 4. `go-app` (Go / Gin) — Port `8083`
* **Role**: High-performance mathematical backend that computes prime factorizations.
* **Integrations**: `otelgin` HTTP Router middleware, OTel OTLP HTTP trace exporter.

### 5. `inventory-service` (Go / Gin) — Port `8087`
* **Role**: Go-based warehouse checking service.
* **Integrations**: Propagated HTTP middleware checking logic metrics.

### 6. `analytics-service` (Python / FastAPI) — Port `8086`
* **Role**: Database summary statistics aggregator.
* **Integrations**: Directly queries PostgreSQL records count and displays `/metrics/summary` telemetry.

### 7. `audit-service` (Python / Flask) — Port `5002`
* **Role**: Transaction compliance logger.
* **Integrations**: Cascades execution flow downstream to `python-app` for database storage.

### 8. `python-app` (Python / Flask) — Port `5000`
* **Role**: Heavy numeric computation database writer engine.
* **Integrations**: Alembic migrations, PostgreSQL writing, Kafka publisher.

### 9. `db-sync-service` (Go) — Port `8085`
* **Role**: Audits database schema availability.
* **Integrations**: Triggered synchronously by python-app to perform database health queries.

### 10. `notification-service` (Python / FastAPI) — Port `8084`
* **Role**: Asynchronous consumer processing message alerts sent to Kafka's `task-events` topic.
* **Integrations**: `KafkaConsumer` wrapper extracting W3C `traceparent` headers manually.

### 11. `alerting-service` (Python / FastAPI) — Port `8088`
* **Role**: Async alerting service consuming from Kafka's `task-events` topic in parallel with notification-service.
* **Integrations**: Dynamic consumer groups enabling duplicate event receipt.

### 12. `reporting-service` (Python / Flask) — Port `5003`
* **Role**: Stats reporting backend.
* **Integrations**: PostgreSQL db connector./summary` telemetry.

---

## 4. OpenTelemetry Telemetry Pipelines Design

### 1. Dynamic Framework Instrumentor Bootstrapping (`obs.py`)
To keep imports dry and maintain lightweight Docker sizes, [obs.py](file:///Users/vishnu/learning/b_github/z_etc/LGTM/apps/common/obs.py) dynamically evaluates incoming application classes at startup to instrument the correct framework:

```python
def setup_observability(app):
    """Instruments Flask or FastAPI app dynamically based on type class."""
    if app.__class__.__name__ == "FastAPI":
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        FastAPIInstrumentor().instrument_app(app)
    else:
        from opentelemetry.instrumentation.flask import FlaskInstrumentor
        FlaskInstrumentor().instrument_app(app)
```

### 2. Winston Log Trace Correlation (`observability.js`)
We inject active OTel trace contexts into application stdout logs so that Loki logs can map directly to Tempo traces:

```javascript
const traceFormat = winston.format((info) => {
  const activeSpan = api.trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    if (spanContext && api.trace.isSpanContextValid(spanContext)) {
      info.trace_id = spanContext.traceId;
      info.span_id = spanContext.spanId;
    }
  }
  return info;
});
```

### 3. Kafka Asynchronous Span Linking (`app.py`)
To prevent trace cuts when publishing through Kafka brokers, the subscriber extracts the trace context from raw broker metadata:

```python
# Extract parent context from Kafka message headers
headers_dict = {}
if msg.headers:
    for k, v in msg.headers:
        headers_dict[k] = v.decode('utf-8') if isinstance(v, bytes) else str(v)

parent_context = propagate.extract(headers_dict)

with tracer.start_as_current_span("ProcessNotificationEvent", context=parent_context) as span:
    # Subscriber span is now linked to publisher trace ID
```

---

## 5. Infrastructure-as-Code (IaC) & Deployment

The system is fully portable and can be deployed locally or onto cloud Kubernetes platforms:

### 1. Local Orchestration (Docker Compose)
* Defined under [docker-compose.yml](file:///Users/vishnu/learning/b_github/z_etc/LGTM/infrastructure/docker-compose/docker-compose.yml).
* Deploys all 12 application microservices and the 7 infrastructure resources (`loki`, `mimir`, `tempo`, `alloy`, `grafana`, `postgres`, `kafka`).

### 2. Kubernetes Helm Packaging
* Packaged under `infrastructure/helm/lgtm-stack`.
* Supports persistence values limits configuration for storage engines (Mimir, Loki, Tempo).

### 3. Terraform / Terragrunt Clusters Provisioning
* **AWS Module (`aws/`)**: Provisions EKS cluster node pools inside custom VPC configurations.
* **GCP Module (`gcp/`)**: Regional GKE setups.
* **OCI Module (`oci/`)**: Installs OKE Kubernetes structures on Oracle Cloud Infrastructure.
* **Terragrunt**: Integrates DRY variables inheritance structures globally.

---

## 6. Telemetry Integration Verification Benchmarks

We validated the pipeline end-to-end to verify that traces propagate and correlate successfully:

### Test Case A: Go Multi-Hop Factorization Trace
* **Command**: `curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/primes/840`
* **Tempo Result (Trace ID: `947b81e5150dd81f648c27cb029abae6`)**:
  ```
  [node-app] ProxyPrimeFactorization (Hapi Route)
   ├── [auth-service] POST /verify (Token validation)
   └── [go-app] GET /math/primes/840 (Gin Router)
        └── [go-app] CallPythonAnalyze (Client Outbound Request)
             └── [python-app] POST /analyze (Flask Router)
  ```

### Test Case B: Asynchronous Kafka Trace Linking
* **Command**: `curl -X POST -H "x-api-key: lgtm-secret-key" -d '{"message": "Hello Kafka!"}' http://localhost:8081/kafka/publish`
* **Tempo Result (Trace ID: `a0922c07e1c0f8d841dba401c9308cd2`)**:
  ```
  [node-app] POST /kafka/publish (Hapi Route)
   └── [node-app] send task-events (Kafka Producer Span)
        └── [notification-service] ProcessNotificationEvent (FastAPI Consumer Span)
  ```

### Test Case C: Prometheus Metric-to-Trace Exemplar
* **Command**: `curl -H "Accept: application/openmetrics-text" http://localhost:8081/metrics`
* **Result**:
  ```openmetrics
  calculation_requests_total{number="29"} 1 # {trace_id="32a5b28aa38909c998ec9e13b43c291e",span_id="7aca3666ee5ca60a"} 1 1784738252.243
  ```

### Test Case D: 12-Service Nested Downstream Trace Pipeline (Deep Trace)
* **Command**: `curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/deep/20`
* **Tempo Result (Trace ID: `30ee236c735a34b9e2ae95424baff9b4`)**:
  ```
  [node-app] ProxyDeepOrchestration (Hapi Route)
   ├── [auth-service] POST /verify (Token validation)
   └── [recommendation-service] GET /recommend?num=20 (Flask)
        └── [go-app] GET /math/deep-primes/20 (Gin)
             └── [inventory-service] GET /inventory/check/9 (Gin)
                  └── [analytics-service] POST /analytics/compute-deep (FastAPI)
                       └── [audit-service] POST /audit/log (Flask)
                            └── [python-app] POST /python/finalize-deep (Flask)
                                 ├── [db-sync-service] POST /sync/trigger (ManualSyncTrigger)
                                 ├── [python-app] send task-events (Kafka Producer)
                                 │    ├── [notification-service] ProcessNotificationEvent (Consumer Group 1)
                                 │    └── [alerting-service] ProcessNotificationEvent (Consumer Group 2)
  ```

---
## 7. Production Hardening, Resiliency & CI Validation

Several architectures were configured to ensure system reliability:
1. **Alembic DB Migrations**: DB schemas are programmatically created on startup.
2. **Kafka DLQ redirect**: The Python consumer writes failed events to a Dead-Letter Queue after 3 failed attempts.
3. **Redis Cache Bypass & Hit Handling**: Direct caching intercepts redundant DB queries.
4. **GitHub Actions Workflow validation**: [ci.yml](file:///Users/vishnu/learning/b_github/z_etc/LGTM/.github/workflows/ci.yml) validates Syntax Checks on all Node.js, Go, and Python services on push/pull requests.

---

## 8. Real-World Troubleshooting Scenarios & Use Cases

This section outlines how engineers, SREs, and developers leverage this telemetry mesh to diagnose and fix performance degradation or errors in production:

### 🚀 Use Case 1: Latency Bottleneck Investigation (Go vs. Python)
* **Problem**: Users notice that calculating prime factorizations of very large numbers feels slow.
* **Troubleshooting Steps**:
  1. **Identify the Spike**: SREs check the Grafana dashboard and spot a rise in `node_task_duration_seconds_bucket` latency.
  2. **Isolate the Request**: Clicking a blue **exemplar** on the graph loads the specific Tempo trace.
  3. **Examine Span Spans**:
     - `go-app`'s internal span `PrimeFactorizationCompute` took **`0.82ms`** (proving Go calculations are extremely fast).
     - The outbound client request span `CallPythonAnalyze` took **`195ms`** (network transit to `python-app`).
     - The server span `POST /analyze` under `python-app` took **`189ms`**.
  4. **Root Cause**: The bottleneck is downstream inside the Python app analysis code, not the Go math computation. No developer time is wasted trying to optimize the Go factor math.

---

### 🚨 Use Case 2: Zero-Log-Search Error Diagnostics
* **Problem**: Node.js Gateway throws a spike of `500 Internal Server Error` responses.
* **Troubleshooting Steps**:
  1. **Spot the Failure**: Open Mimir, find the `error_requests_total` metric spike, click on the **exemplar** to load the trace.
  2. **Pinpoint the Error Span**: Tempo highlights the failed span in red, showing `status.code = ERROR` and `exception.message = "Database connection timeout"`.
  3. **Logs-to-Traces Hop**: On the failed span, click **"User Logs"** to view matching logs inside Loki. Loki displays the specific traceback showing that PostgreSQL connection pools were exhausted.
  4. **Resolution**: The engineering team scales up the PostgreSQL connection pool limit without having to dig through massive text log files.

---

### 📬 Use Case 3: Asynchronous Message Queue Audit
* **Problem**: A critical business event notification was not delivered to a client.
* **Troubleshooting Steps**:
  1. **Search by payload**: Developers search Loki for the message context (e.g., event ID `"evt_1784736849748"`).
  2. **Inspect the Publisher**: The log shows the publisher span in `node-app` with `trace_id = a0922c07e1c0...`.
  3. **Trace Broker Hop**: Opening the trace ID inside Tempo reveals:
     - `send task-events` span from `node-app` (Message successfully published to Kafka).
     - `ProcessNotificationEvent` span from `notification-service` is missing or ended in error status.
  4. **Resolution**: SREs identify that the FastAPI event consumer was down or rejected the message format, pointing them directly to the consumer parsing bug.

---

### 💾 Use Case 4: Cache Hit Validation & Overhead Audit
* **Problem**: Database administrators report high PostgreSQL read CPU limits usage.
* **Troubleshooting Steps**:
  1. **Compare Requests**: Query `/user/42` twice in sequence.
  2. **Inspect Trace 1 (Cold Cache)**:
     - Tempo shows the Hapi server span `/user/{id}` query.
     - Spans reveal a Redis `GET` client call (Cache Miss), followed by an outbound HTTP call to `python-app:5000/db/user/42` which executes SQL queries, followed by a Redis `SET`.
  3. **Inspect Trace 2 (Hot Cache)**:
     - Tempo shows the server span `/user/{id}` query, containing a single Redis `GET` span taking **`1.4ms`** and returning instantly. No database calls or downstream HTTP queries were made.
  4. **Resolution**: Validates that cache eviction and Redis caching TTL are correctly configured and working, preventing database load.

---

## 🔮 9. Future / Post-Project Roadmap

As a next-step enhancement for the observability pipeline, the team has scheduled the following task:
* **OTLP Collector Migration**: After this project, the telemetry ingestion infrastructure will migrate from **Grafana Alloy** to the standard upstream CNCF **OpenTelemetry (OTLP) Collector** to utilize open standard processing pipelines.
