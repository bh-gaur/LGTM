# 🗺️ Microservices Architecture & Endpoint Flow Diagram

This document contains a comprehensive **Mermaid.js** diagram representing the request lifecycle, container ports, message queues, database connections, and the updated **OpenTelemetry Collector** telemetry ingestion flow.

You can import this directly into any markdown viewer, GitHub, or [Mermaid Live Editor](https://mermaid.live).

---

## 🎨 System Flow Diagram (Mermaid.js)

```mermaid
graph TD
    %% ------------------------------------------------------------------------
    %% 1. CLIENT / USER LAYER
    %% ------------------------------------------------------------------------
    Client["🌐 Browser Client / Web UI"] -->|"HTTP / X-API-Key: lgtm-secret-key"| GatewayNode["🔒 Node.js Gateway (node-app :8081)"]

    %% ------------------------------------------------------------------------
    %% 2. MICROSERVICE MESH & DATABASES
    %% ------------------------------------------------------------------------
    subgraph Mesh ["Microservices Mesh & Infrastructure"]
        GatewayNode -->|"1. Check Cache"| Redis[("⚡ Redis Cache (lgtm-redis :6379)")]
        GatewayNode -->|"2. Verify Token"| AuthService["🔑 auth-service :8082 (/api/auth/verify)"]
        
        %% Deep compute downstream flow
        GatewayNode -->|"3. Deep Pipeline"| RecService["🤖 recommendation-service :5001 (/recommend)"]
        RecService -->|"HTTP Downstream"| GoApp["🐹 go-app :8083 (/calculate/prime)"]
        GoApp -->|"HTTP Downstream"| InvService["📦 inventory-service :8087 (/inventory/status)"]
        InvService -->|"HTTP Downstream"| AnalyticsService["📈 analytics-service :8086 (/analytics/stats)"]
        AnalyticsService -->|"HTTP Downstream"| AuditService["📝 audit-service :5002 (/audit/log)"]
        AuditService -->|"HTTP Downstream"| PyApp["🐍 python-app :5000 (/compute)"]
        PyApp -->|"HTTP Downstream"| DbSync["🔄 db-sync-service :8085 (/db/sync)"]
        
        %% Database Interactions
        PyApp -->|"Write Stats"| Postgres[("🐘 PostgreSQL DB (lgtm-postgres :5432)")]
        DbSync -->|"Check Schemas"| Postgres
        
        %% Event Driven Async Pipeline
        PyApp -.->|"Publish Event (topic: task-events)"| Kafka["🚇 Apache Kafka :9092 (KRaft Mode)"]
        Kafka -->|"Async Consume"| NotifService["🔔 notification-service :8084"]
        Kafka -->|"Async Consume"| AlertService["🚨 alerting-service :8088"]
        
        %% Diagnostics
        ReportService["📊 reporting-service :5003 (/report)"] -.->|"Read Stats"| Postgres
    end

    %% ------------------------------------------------------------------------
    %% 3. TELEMETRY INGESTION PIPELINE (OTel Collector)
    %% ------------------------------------------------------------------------
    subgraph Telemetry ["Telemetry Collection & Storage"]
        Collector["⚙️ OpenTelemetry Collector (otel-collector :4317/:4318)"]
        
        %% Applications pushing telemetry
        GatewayNode -.->|"OTLP Logs, Traces, Metrics"| Collector
        AuthService -.->|"OTLP"| Collector
        RecService -.->|"OTLP"| Collector
        GoApp -.->|"OTLP"| Collector
        InvService -.->|"OTLP"| Collector
        AnalyticsService -.->|"OTLP"| Collector
        AuditService -.->|"OTLP"| Collector
        PyApp -.->|"OTLP"| Collector
        DbSync -.->|"OTLP"| Collector
        NotifService -.->|"OTLP"| Collector
        AlertService -.->|"OTLP"| Collector
        ReportService -.->|"OTLP"| Collector
        
        %% Collector pushing to Backends
        Collector -->|"Metrics: OTLP HTTP"| Mimir[("🟡 Grafana Mimir :9009")]
        Collector -->|"Logs: OTLP HTTP"| Loki[("🔵 Grafana Loki :3100")]
        Collector -->|"Traces: OTLP gRPC"| Tempo[("🔴 Grafana Tempo :3200")]
    end

    %% ------------------------------------------------------------------------
    %% 4. VISUALIZATION LAYER
    %% ------------------------------------------------------------------------
    subgraph UI ["Visualization Dashboard"]
        Grafana["📈 Grafana UI :3000"]
        Grafana -->|"Query Metrics"| Mimir
        Grafana -->|"Query Logs"| Loki
        Grafana -->|"Query Traces"| Tempo
    end

    %% ------------------------------------------------------------------------
    %% NODE STYLING & COLORS
    %% ------------------------------------------------------------------------
    style GatewayNode fill:#5b9dfa,stroke:#3b82f6,stroke-width:2px,color:#fff
    style AuthService fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff
    style RecService fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff
    style GoApp fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    style InvService fill:#059669,stroke:#047857,stroke-width:2px,color:#fff
    style AnalyticsService fill:#84cc16,stroke:#4d7c0f,stroke-width:2px,color:#fff
    style AuditService fill:#a3e635,stroke:#4d7c0f,stroke-width:2px,color:#fff
    style PyApp fill:#34d399,stroke:#10b981,stroke-width:2px,color:#fff
    style DbSync fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#fff
    style NotifService fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff
    style AlertService fill:#d97706,stroke:#b45309,stroke-width:2px,color:#fff
    style ReportService fill:#64748b,stroke:#475569,stroke-width:2px,color:#fff
    style Redis fill:#ef4444,stroke:#dc2626,stroke-width:2px,color:#fff
    style Kafka fill:#f97316,stroke:#ea580c,stroke-width:2px,color:#fff
    style Postgres fill:#38bdf8,stroke:#0ea5e9,stroke-width:2px,color:#fff
    style Collector fill:#a78bfa,stroke:#8b5cf6,stroke-width:2px,color:#fff
    style Mimir fill:#eab308,stroke:#ca8a04,stroke-width:2px,color:#fff
    style Loki fill:#06b6d4,stroke:#0891b2,stroke-width:2px,color:#fff
    style Tempo fill:#f43f5e,stroke:#e11d48,stroke-width:2px,color:#fff
    style Grafana fill:#f97316,stroke:#ea580c,stroke-width:2px,color:#fff
```

---

## 🔗 Endpoint Reference Table

| Service | Port | Endpoint | Description |
|---|---|---|---|
| **`node-app`** | `8081` | `/` | Web UI / Dashboard (served statically) |
| | | `/calculate/deep/{num}` | Triggers the 12-service downstream cascading trace |
| | | `/calculate/factorial/{num}` | Computes factorial (checks Redis cache first) |
| | | `/calculate/fibonacci/{num}` | Computes fibonacci (checks Redis cache first) |
| **`auth-service`** | `8082` | `/api/auth/verify` | Validates authentication tokens & headers |
| **`recommendation-service`** | `5001` | `/recommend` | Resolves recommendation scores & downstream requests |
| **`go-app`** | `8083` | `/calculate/prime` | Resolves prime number factorizations |
| **`inventory-service`** | `8087` | `/inventory/status` | Resolves inventory availability metrics |
| **`analytics-service`** | `8086` | `/analytics/stats` | Aggregates analytical computing data |
| **`audit-service`** | `5002` | `/audit/log` | Records analytical computations for auditing |
| **`python-app`** | `5000` | `/compute` | Finalizes heavy math computation & publishes Kafka events |
| **`db-sync-service`** | `8085` | `/db/sync` | Verifies and synchronizes schema metadata |
| **`reporting-service`** | `5003` | `/report` | Generates summary stats reports |
