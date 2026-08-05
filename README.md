# ⚡ LGTM Observability Mesh & Polyglot Microservices Architecture

A production-ready microservice demonstration of the **Grafana LGTM (Loki, Grafana, Tempo, Mimir) Stack** combined with **Grafana Alloy** telemetry collector, **PostgreSQL** database infrastructure, and a **12-microservice polyglot application mesh** written in Node.js, Python, and Go.

Includes an interactive **Glassmorphic Web UI Dashboard** with a **3D WebGL Topology Diagram**, OpenTelemetry distributed tracing, metrics-to-traces exemplars, OTLP log correlation, and a zero-overhead **`ENABLE_OBSERVABILITY` feature flag**.

---

## 📐 Architecture & Data Flow Workflow

### System Architecture Topology

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
+------------------+               +---------+---------+                 +------------------+
                                             |                                    |
                                             | HTTP REST                          | Event Consumer
                                             v                                    v
+------------------+               +---------+---------+                 +--------+---------+
|  db-sync-service | (Port 8085)   | inventory-service | (Port 8087)     | alerting-service | (Port 8088)
|    (Go Lang)     |               |     (Go Gin)      |                 | (Python FastAPI) |
+------------------+               +---------+---------+                 +------------------+
                                             |
                                             | HTTP REST
                                             v
+------------------+               +---------+---------+
|    python-app    | (Port 5000)   | analytics-service | (Port 8086)
|  (Python Flask)  |               | (Python FastAPI)  |
+--------+---------+               +---------+---------+
         |                                   |
         | HTTP REST                         | HTTP REST
         v                                   v
+--------+---------+               +---------+---------+
|  audit-service   | (Port 5002)   |  lgtm-postgres    | (Port 5432)
|  (Python Flask)  |               |   (PostgreSQL)    |
+------------------+               +-------------------+
```

### Telemetry Pipeline & Data Flow Workflow

```mermaid
graph TD
    subgraph Application Mesh (12 Services)
        UI[Web UI / Client] -->|HTTP Gateway Requests| Node[Node.js Gateway :8081]
        Node -->|JWT Verify| Auth[Auth Service :8082]
        Node -->|Deep Trace Trigger| Rec[Recommendation Service :5001]
        Rec -->|HTTP Downstream| Go[Go App :8083]
        Go -->|HTTP Downstream| Inv[Inventory Service :8087]
        Inv -->|HTTP Downstream| Analytics[Analytics Service :8086]
        Analytics -->|HTTP Downstream| Audit[Audit Service :5002]
        Audit -->|HTTP Downstream| Py[Python Service :5000]
        Py -->|HTTP Downstream| Sync[db-sync-service :8085]
        
        Py -.-->|Event Publish| Kafka[Kafka Broker :9092]
        Kafka -.-->|Consumer Group 1| Notif[Notification Service :8084]
        Kafka -.-->|Consumer Group 2| Alert[Alerting Service :8088]
        
        Report[Reporting Service :5003] -.->|Diagnostics| Postgres[(Postgres :5432)]
    end

    subgraph Observability Pipeline (LGTM Stack)
        Node -->|OTLP Traces/Metrics/Logs| Alloy[Grafana Alloy :4317 / :4318]
        Auth -->|OTLP| Alloy
        Rec -->|OTLP| Alloy
        Go -->|OTLP| Alloy
        Inv -->|OTLP| Alloy
        Analytics -->|OTLP| Alloy
        Audit -->|OTLP| Alloy
        Py -->|OTLP| Alloy
        Sync -->|OTLP| Alloy
        Notif -->|OTLP| Alloy
        Alert -->|OTLP| Alloy
        Report -->|OTLP| Alloy
        
        Alloy -->|Spanmetrics| Mimir[(Grafana Mimir :9009)]
        Alloy -->|Logs| Loki[(Grafana Loki :3100)]
        Alloy -->|Traces| Tempo[(Grafana Tempo :4317 / :4318)]
        
        Grafana[Grafana :3000] -->|Metrics| Mimir
        Grafana -->|Logs| Loki
        Grafana -->|Traces & Service Graphs| Tempo
    end
```

---


---

## 🌟 Key Capabilities & Features

- **End-to-End Distributed Tracing**: Native OpenTelemetry W3C tracecontext header propagation across Node.js, Python, and PostgreSQL (`db.system = postgresql`).
- **OpenMetrics Exemplars & RED Spanmetrics**: Connects Prometheus metric spikes directly to trace IDs in Tempo using `otelcol.connector.spanmetrics` in Alloy.
- **OTLP Ingestion Logging**: Ingests Winston (Node.js) and Python logging directly into Loki via OTLP HTTP streams.
- **Glassmorphic 3D Web Control Center**: Interactive dashboard featuring Orbit Three.js WebGL 3D mesh node graph, 1-click test action chips, and real-time response telemetry.
- **Global `ENABLE_OBSERVABILITY` Feature Flag**: Toggle telemetry globally via env var (`ENABLE_OBSERVABILITY=true` / `false`) with built-in zero-overhead No-Op fallbacks.

---

## 🌐 Local Service Endpoints

When running locally via Docker Compose, access the following endpoints:

| Service | Host Port | URL / Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Web Control Center UI** | `8081` | [http://localhost:8081](http://localhost:8081) | Interactive Glassmorphic 3D Control Dashboard |
| **Grafana Dashboard** | `3000` | [http://localhost:3000](http://localhost:3000) | Observability UI (Login: `admin` / `admin`) |
| **Node.js API Docs** | `8081` | [http://localhost:8081/docs](http://localhost:8081/docs) | Swagger OpenAPI UI |
| **Python App Docs** | `5000` | [http://localhost:5000/docs](http://localhost:5000/docs) | Swagger OpenAPI UI |
| **Prometheus Metrics** | `8081` | [http://localhost:8081/metrics](http://localhost:8081/metrics) | Node.js OpenMetrics endpoint with exemplars |
| **Grafana Alloy UI** | `12345` | [http://localhost:12345](http://localhost:12345) | Collector status & component topology |
| **Auth Service API** | `8082` | `http://localhost:8082` | Node.js authentication middleware service |
| **Recommendation Engine** | `5001` | `http://localhost:5001` | Python Flask recommendation backend service |
| **Go calculation App** | `8083` | `http://localhost:8083` | Go prime factorization backend service |
| **Inventory Service** | `8087` | `http://localhost:8087` | Go prime warehouse calculation service |
| **Analytics Engine** | `8086` | `http://localhost:8086` | Python FastAPI system statistics aggregator |
| **Audit Compliance API** | `5002` | `http://localhost:5002` | Python Flask transaction audit compliance service |
| **Notification API** | `8084` | `http://localhost:8084` | Python FastAPI async SMS notifier service |
| **Alerting API** | `8088` | `http://localhost:8088` | Python FastAPI async Pager notifier service |
| **Reporting API** | `5003` | `http://localhost:5003` | Python Flask stats reporting service |
| **Database Auditor** | `8085` | `http://localhost:8085` | Go relational database auditing service |


---

## 🚀 Quick Start Guide (Docker Compose)

### 1. Build and Launch Infrastructure
Launch the full microservice mesh, database, and LGTM telemetry stack:

```bash
# Navigate to Docker Compose orchestration directory
cd infrastructure/docker-compose

# Start full stack in detached mode
docker compose up --build -d
```

### 2. Run with Observability Disabled (Optional)
To test application performance without telemetry overhead:

```bash
# Navigate to Docker Compose orchestration directory
cd infrastructure/docker-compose

# Run with Observability DISABLED
ENABLE_OBSERVABILITY=false docker compose up -d
```

### 3. Generate Telemetry Signals & Test API Routes

Open `http://localhost:8081` in your browser to use the 1-click control center, or run cURL commands:

```bash
# 1. Fibonacci & Downstream Python Analysis Pipeline (Auth Checked)
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/15

# 2. Go Prime Factorization Proxy Endpoint
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/primes/840

# 3. PostgreSQL System Summary statistics
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/system/summary

# 4. Text Sentiment & Statistics Analysis (Auto-Instrumented)
curl -H "x-api-key: lgtm-secret-key" -X POST http://localhost:8081/text/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"Awesome speed and fantastic distributed tracing performance!"}'

# 5. PostgreSQL Database Query (Cached in Redis)
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/user/42

# 6. Publish event payload to Kafka Broker
curl -H "x-api-key: lgtm-secret-key" -X POST http://localhost:8081/kafka/publish \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Kafka!"}'

# 7. Fault Injection (500 Error Tracing)
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/error

# 8. 12-Service Nested Downstream Trace Pipeline (Deep Trace)
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/deep/20
```

---

## ☸️ Kubernetes Deployment (Helm)

The stack is packaged as a production Helm chart under `infrastructure/helm/lgtm-stack/`.

```bash
# Lint Helm chart templates
helm lint ./infrastructure/helm/lgtm-stack

# Install onto Kubernetes / EKS
helm install lgtm ./infrastructure/helm/lgtm-stack \
  --set global.enableObservability=true \
  --set global.storageClass="gp3"
```

> [!IMPORTANT]
> **Production Storage Configuration Note**:
> For production environments with high throughput, increase the persistent volume sizes for stateful components (Loki, Mimir, Tempo, and PostgreSQL) via `--set` flags or in `values.yaml`:
> ```bash
> helm install lgtm ./infrastructure/helm/lgtm-stack \
>   --set global.storageClass="gp3" \
>   --set loki.persistence.size="50Gi" \
>   --set mimir.persistence.size="50Gi" \
>   --set tempo.persistence.size="100Gi" \
>   --set postgres.persistence.size="20Gi"
> ```

Refer to [helm/lgtm-stack/README.md](file:///Users/vishnu/learning/b_github/z_etc/LGTM/infrastructure/helm/lgtm-stack/README.md) for more details.

---

## 🛡️ Production Hardening Features

The system incorporates several architectural patterns to handle scale, failures, and updates:

1. **Alembic Database Migrations**: Relational table creation (`users`, `kafka_events`) is isolated from direct query code and managed programmatically on startup via Python Alembic migration scripts under `apps/python-app/migrations/`.
2. **Kafka DLQ & Consumer Retries**: The Python consumer tries to save events to PostgreSQL up to 3 times with a 1s delay on failures. If transient database issues persist, the message is routed to the Dead-Letter Queue (DLQ) topic `task-events-dlq` for manual processing.
3. **Alloy Health Probes**: Grafana Alloy processes are configured with automatic liveness and readiness health checks pointing to `/-/ready` on port `12345`.
4. **Provisioned Grafana Alert Rules**: Alert thresholds (e.g., traffic error rate > 10% on `calculation_requests_total`) are pre-configured and provisioned in Grafana on startup.
5. **Redis Cache Layer**: Intercepts expensive mathematical computing (`/calculate/:num`, `/math/factorial/:n`) and relational directory lookups (`/user/:id`) to serve repeat traffic instantly, dropping retrieval response times to `<2ms`.
6. **Alloy JSON Log Labeling**: Extracts internal JSON logging fields (`latency_ms`, `http_status`, `level`) using a `loki.process` processor inside Grafana Alloy, auto-generating fast-queryable Loki tags.
7. **Gateway Authentication**: Secures the API surface with a Hapi `onPreHandler` request extension check looking for the HTTP header `X-API-Key: lgtm-secret-key`.
8. **Automated CI Validation**: Runs validation pipelines via GitHub Actions (`ci.yml`) on every push to execute Helm linting, Node.js syntax scans, and Python code styling checks.
9. **Hapi.js API Gateway**: The main gateway was migrated from Express to Hapi.js to benefit from configuration-centric routing, a robust request lifecycle, and structured error handling.

### Why Hapi.js over Express?

Migrating the API Gateway to Hapi provides the following architectural advantages:
- **Configuration-Centric Design**: Express routing relies on sequential middleware (`app.use()`), which is prone to ordering bugs. Hapi defines routes, authorization policies, and validation schemas explicitly as configuration objects.
- **Improved Request Lifecycle**: Hapi has a formalized request lifecycle. In Express, the API authentication check required manual, brittle path string matching to exclude public routes. Hapi handles this natively using route-level options (`plugins: { skipAuth: true }`).
- **Standardized Error Handling**: Unhandled exceptions in Express can crash the server unless wrapped in `try/catch`. Hapi integrates natively with `@hapi/boom` to return standardized HTTP-friendly JSON errors and gracefully intercepts uncaught exceptions to return a 500 error, ensuring gateway process stability.
- **Robust First-Party Plugins**: Unlike Express, which relies on a mix of third-party community packages for common utilities (like static file serving), Hapi utilizes core-maintained plugins (like `@hapi/inert` and `@hapi/boom`) for enterprise-grade reliability and security.

---

## ⚙️ Environment Variables & ConfigMap Reference

| Variable Name | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `8081` (Node) / `5000` (Py) | Hapi.js / Flask HTTP listening port. |
| `ENABLE_OBSERVABILITY` | `true` | Set to `false` to disable telemetry globally without code breaks. |
| `PYTHON_SERVICE_URL` | `http://python-app:5000` | Gateway URL for Node.js -> Python downstream communication. |
| `POSTGRES_HOST` | `postgres` | Hostname of the PostgreSQL database instance. |
| `POSTGRES_PORT` | `5432` | Port for PostgreSQL connections. |
| `POSTGRES_DB` | `lgtmdb` | Database name for PostgreSQL (`.Values.postgres.database`). |
| `POSTGRES_USER` | `lgtmuser` | Username for PostgreSQL (`.Values.postgres.user`). |
| `POSTGRES_PASSWORD` | `lgtmpass` | Password for PostgreSQL (`.Values.postgres.password`). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://alloy:4318` | Base OTLP HTTP collector endpoint. |
| `MIMIR_OTLP_ENDPOINT` | `http://mimir:9009/otlp` | OTLP HTTP push URL for Grafana Mimir metrics. |
| `LOKI_PUSH_URL` | `http://loki:3100/loki/api/v1/push` | Push URL for Grafana Loki log ingestion. |
| `TEMPO_OTLP_ENDPOINT` | `tempo:4317` | OTLP gRPC endpoint for Grafana Tempo traces. |

## 🛠️ Cloud Infrastructure Provisioning (Terraform & Terragrunt)

The project includes structured Terraform modules and **Terragrunt** wrapper configurations to automatically provision standard, production-ready Kubernetes clusters on **AWS (EKS)**, **GCP (GKE)**, and **OCI (OKE)**.

### Terragrunt Orchestration (Recommended)
If you have Terragrunt installed, you can manage backend state and provider files DRY-ly, or deploy/destroy all clusters concurrently:
1. **Concurrently plan all environments**:
   ```bash
   cd infrastructure/terraform
   terragrunt run-all plan
   ```
2. **Concurrently deploy all environments**:
   ```bash
   terragrunt run-all apply
   ```

### Standard Terraform Provisioning
If you prefer standard Terraform, navigate directly to the specific cloud subdirectory:

### AWS (EKS) Provisioning
1. **Initialize and validate configurations**:
   ```bash
   cd infrastructure/terraform/aws
   terraform init
   terraform validate
   ```
2. **Apply execution plan**:
   ```bash
   terraform apply -auto-approve
   ```
3. **Configure local kubeconfig context**:
   - Run the command emitted in the `kubeconfig_command` output parameter.

### GCP (GKE) Provisioning
1. **Initialize and validate**:
   ```bash
   cd infrastructure/terraform/gcp
   terraform init
   terraform validate
   ```
2. **Apply plan**:
   ```bash
   terraform apply -var="gcp_project_id=YOUR_PROJECT_ID" -auto-approve
   ```

### OCI (OKE) Provisioning
1. **Initialize and validate**:
   ```bash
   cd infrastructure/terraform/oci
   terraform init
   terraform validate
   ```
2. **Apply plan**:
   ```bash
   terraform apply -var="tenancy_ocid=..." -var="user_ocid=..." -var="fingerprint=..." -var="private_key_path=..." -var="compartment_ocid=..." -auto-approve
   ```

After provisioning, deploy the stack using the Helm charts:
```bash
helm install lgtm ./infrastructure/helm/lgtm-stack
```

---

## 🔍 Grafana Telemetry Correlation Workflow

1. **Logs ➔ Traces**: Open Grafana Explore (`http://localhost:3000`), choose **Loki**, query `{job="node-app"}` or `{job="python-app"}`. Expand any log record and click **"View Trace"** next to `trace_id` to view the distributed timeline in Tempo.
2. **Traces ➔ Logs**: On any span timeline in Tempo, click **"Logs for this span"** to automatically jump to Loki logs filtered by matching span timestamps and service labels.
3. **Metrics ➔ Traces (Exemplars)**: Select **Mimir / Prometheus** in Grafana Explore, enable **Exemplars**, and query `node_task_duration_seconds_bucket`. Click any blue exemplar data point to hop straight into its Tempo trace timeline.
