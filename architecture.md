# Architecture Guide — LGTM Telemetry Stack & Microservice Mesh

This document details the high-performance design, event-driven pipelines, and distributed telemetry correlation architecture of our application.

---

## 🗺️ System Topology

```mermaid
graph TD
    %% User/Client layer
    User["Browser Client / Web UI (Neumorphic Dashboard)"] -->|HTTP / X-API-Key Auth| NodeApp[Node.js Gateway :8081]
    
    %% Gateway and Application Microservices
    subgraph Microservice Mesh
        NodeApp -->|Check Cache| Redis[(Redis Cache :6379)]
        NodeApp -->|JWT Verify| AuthService[auth-service :8082]
        NodeApp -->|Deep Trace Trigger| Rec[recommendation-service :5001]
        Rec -->|HTTP Downstream| GoApp[go-app :8083]
        GoApp -->|HTTP Downstream| Inv[inventory-service :8087]
        Inv -->|HTTP Downstream| Analytics[analytics-service :8086]
        Analytics -->|HTTP Downstream| Audit[audit-service :5002]
        Audit -->|HTTP Downstream| PyApp[python-app :5000]
        PyApp -->|HTTP Downstream| DbSync[db-sync-service :8085]
        
        PyApp -.->|Async Publish event| Kafka[Apache Kafka :9092]
        Kafka -->|Consume task-events| NotifService[notification-service :8084]
        Kafka -->|Consume task-events| AlertService[alerting-service :8088]
        
        ReportService[reporting-service :5003] -.->|Diagnostics| Postgres[(PostgreSQL DB :5432)]
    end

    %% Telemetry Collection Layer
    subgraph Grafana Telemetry Agent
        Alloy[Grafana Alloy :12345]
        NodeApp -->|OTLP| Alloy
        AuthService -->|OTLP| Alloy
        Rec -->|OTLP| Alloy
        GoApp -->|OTLP| Alloy
        Inv -->|OTLP| Alloy
        Analytics -->|OTLP| Alloy
        Audit -->|OTLP| Alloy
        PyApp -->|OTLP| Alloy
        DbSync -->|OTLP| Alloy
        NotifService -->|OTLP| Alloy
        AlertService -->|OTLP| Alloy
        ReportService -->|OTLP| Alloy
    end

    %% Storage Backends
    subgraph LGTM Observability Stack
        Mimir[(Grafana Mimir :9009)]
        Loki[(Grafana Loki :3100)]
        Tempo[(Grafana Tempo :3200)]
        
        Alloy -->|OTLP Remote Write Metrics| Mimir
        Alloy -->|OTLP Push Logs| Loki
        Alloy -->|OTLP gRPC Spans| Tempo
    end

    %% Visualization Layer
    Grafana[Grafana Dashboard :3000] -->|Metrics & Exemplars| Mimir
    Grafana -->|Log Queries| Loki
    Grafana -->|Trace Timeline| Tempo
    Grafana -.->|Alert Rules| Mimir

    %% Color Styling
    style NodeApp fill:#5b9dfa,stroke:#3b82f6,stroke-width:2px,color:#fff
    style AuthService fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff
    style Rec fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff
    style GoApp fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    style Inv fill:#059669,stroke:#047857,stroke-width:2px,color:#fff
    style Analytics fill:#84cc16,stroke:#4d7c0f,stroke-width:2px,color:#fff
    style Audit fill:#a3e635,stroke:#4d7c0f,stroke-width:2px,color:#fff
    style PyApp fill:#34d399,stroke:#10b981,stroke-width:2px,color:#fff
    style DbSync fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#fff
    style NotifService fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff
    style AlertService fill:#d97706,stroke:#b45309,stroke-width:2px,color:#fff
    style ReportService fill:#64748b,stroke:#475569,stroke-width:2px,color:#fff
    style Redis fill:#ef4444,stroke:#dc2626,stroke-width:2px,color:#fff
    style Kafka fill:#f97316,stroke:#ea580c,stroke-width:2px,color:#fff
    style Postgres fill:#38bdf8,stroke:#0ea5e9,stroke-width:2px,color:#fff
    style Alloy fill:#a78bfa,stroke:#8b5cf6,stroke-width:2px,color:#fff
    style Mimir fill:#eab308,stroke:#ca8a04,stroke-width:2px,color:#fff
    style Loki fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#fff
    style Tempo fill:#f43f5e,stroke:#e11d48,stroke-width:2px,color:#fff
    style Grafana fill:#f97316,stroke:#ea580c,stroke-width:2px,color:#fff
```

---

## 🔄 End-to-End Request Data Lifecycle

### Scenario A: Cached Math Calculation Request
1. **User Request**: User requests a Factorial or Fibonacci calculation on the dashboard UI.
2. **Auth Verification**: The global interceptor attaches `X-API-Key: lgtm-secret-key` to the request headers. Node.js gateway validates the key using `apiKeyAuth` middleware.
3. **Redis Cache Check**: Node.js generates a unique cache key (`fact:n` or `fib:n`) and checks Redis.
   - **Cache Hit**: Returns calculation results instantly ($<2ms$), bypassing downstream services.
   - **Cache Miss**: Continues routing execution to calculate factors, calls Python for downstream analysis, caches the response payload in Redis (5-minute TTL), and returns.

### Scenario B: Kafka DLQ Event Queue Routing
1. **Event Broadcast**: Node.js gateway publishes task payloads asynchronously to the Kafka topic `task-events`.
2. **Background Consumption**: The Python consumer fetches the record, extracts the propagated OTel tracing headers, and attempts writing to PostgreSQL.
3. **Write Failures & Retries**: On database failure, the consumer attempts writes up to 3 times (1-second delay between tries).
4. **Dead-Letter Queue (DLQ) Redirect**: If all 3 attempts fail, the consumer serializes the payload with error details and publishes it to the `task-events-dlq` topic.

### Scenario C: 12-Service Nested Downstream Trace Pipeline
1. **Trigger**: User calls `/calculate/deep/{num}`.
2. **Auth Verification**: Gateway delegates token checking to `auth-service`.
3. **Downstream Cascade**: Gateway calls `recommendation-service` -> `go-app` -> `inventory-service` -> `analytics-service` -> `audit-service` -> `python-app` -> `db-sync-service` sequentially, propagating OTel headers.
4. **Asynchronous Dispatch**: `python-app` publishes a finalized payload to `task-events`.
5. **Parallel Consumption**: Both `notification-service` and `alerting-service` independently consume the event to process alerts, registering separate spans linked under the root trace ID.

---

## 📦 Component Breakdown

### 1. Application Layer
* **Node.js Gateway (`apps/node-app`)**: Hapi.js-based portal. Serves the Three.js 3D WebGL topology dashboard and proxies compute, search, and message actions downstream. Hardened with API key authentication request extension.
* **Python Analytics (`apps/python-app`)**: Flask-based heavy numeric computation engine, running multi-threaded Gunicorn workers. Leverages Alembic migration scripts for database setups. Also acts as the deep pipeline finalize handler.
* **`auth-service` (`apps/auth-service`)**: Node.js microservice validating API signatures and token payloads.
* **`recommendation-service` (`apps/python-app` run as role)**: Python Flask recommendation backend.
* **`go-app` (`apps/go-app`)**: High-performance Go microservice calculating prime factorizations.
* **`inventory-service` (`apps/go-app` run as role)**: Go warehouse warehouse calculation service.
* **`analytics-service` (`apps/analytics-service`)**: Python FastAPI database stats analytics service.
* **`audit-service` (`apps/python-app` run as role)**: Python Flask compliance auditor.
* **`notification-service` (`apps/notification-service`)**: Python FastAPI async SMS notifier service.
* **`alerting-service` (`apps/notification-service` run as role)**: Python FastAPI async Pager notifier service.
* **`reporting-service` (`apps/python-app` run as role)**: Python Flask stats reporter.
* **`db-sync-service` (`apps/db-sync-service`)**: Go background agent auditing PG tables structures.
* **Shared SDKs (`apps/common`)**: Shared OpenTelemetry hooks (`observability.js`, `obs.py`) loaded dynamically based on the global `ENABLE_OBSERVABILITY` flag.

### 2. Infrastructure Layer
* **Apache Kafka (`kafka`)**: Runs in modern KRaft mode (no Zookeeper metadata cluster required) as a lightweight, single-process message broker.
* **Redis Cache (`redis`)**: Cache database layer storing pre-calculated responses.
* **PostgreSQL (`postgres`)**: Database persistence engine storing seeded user metadata and Kafka event audit logs.

### 3. Observability & Telemetry Engines
* **Grafana Alloy**: The central collector agent. It scrapes local Prometheus metrics, collects OTLP signals, filters/formats them, and dispatches them to their respective storage.
* **Grafana Mimir**: High-performance, scalable time-series database storing Prometheus metrics.
* **Grafana Loki**: Log aggregation engine indexing system outputs, Gunicorn worker stdout, and application trace context.
* **Grafana Tempo**: Distributed trace visualization engine correlating metrics and log timestamps with system trace spans.
* **Grafana**: Graphical user interface visualization portal querying all backends.

### 4. Infrastructure-as-Code (IaC) Layer
* **AWS Module (`infrastructure/terraform/aws`)**: Provisions a complete VPC topology, routing resources, NAT gateways, and an EKS Kubernetes cluster (`v1.30`) with managed auto-scaling worker node groups.
* **GCP Module (`infrastructure/terraform/gcp`)**: Provisions an auto-scaled regional Google Kubernetes Engine (GKE) cluster in a custom VPC with Cloud NAT configurations for secure container downloads.
* **OCI Module (`infrastructure/terraform/oci`)**: Provisions a Virtual Cloud Network (VCN), OKE Kubernetes cluster, and flexible auto-scaling node pools using VM.Standard.E4.Flex shapes.
* **Terragrunt Wrapper (`infrastructure/terraform/terragrunt.hcl`)**: Manages cloud environments dynamically, generating local/remote state directories and centralized provider configurations DRY-ly across subfolders.

---

## 🔗 Distributed Tracing Context Propagation

The system propagates W3C Trace Context headers across HTTP and Kafka messaging barriers:

```
W3C Header Format: traceparent: 00-[32-hex-trace-id]-[16-hex-parent-span-id]-[2-hex-flags]
Example:           traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

All microservices leverage global OpenTelemetry context textmap propagators (`W3CTraceContextPropagator`) to serialize and deserialize these headers:
1. **HTTP Proxying**: Headers are automatically injected by Node.js `undici`/`http` auto-instrumentations and extracted by Gin/FastAPI/Flask middlewares.
2. **Kafka Messaging**: Node.js `kafkajs` auto-instrumentation injects trace parents into message headers during production. On the receiving end, the Python Kafka consumer manually extracts the context dictionary and passes it to `tracer.start_as_current_span(context=parent_context)`, linking publisher and subscriber spans into a single continuous trace representation.
