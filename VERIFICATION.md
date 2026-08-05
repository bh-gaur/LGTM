# LGTM Stack Comprehensive Verification Guide

This guide outlines step-by-step instructions to verify all core components, application logic, telemetry pipelines, and infrastructure modules in the LGTM stack.

---

## 🐳 Step 1: Verify Local Container Status

Ensure all docker services are up, running, and healthy:

```bash
cd z_etc/LGTM/infrastructure/docker-compose
docker compose ps
```

All 20 services should report `Up` or `Up (healthy)`.

---

## 🎨 Step 2: Verify the Neumorphic Dashboard UI

1. Open your web browser and navigate to:
   `http://localhost:8081/ui`
2. **Visual Checklist**:
   - Verify the native **Dark Neumorphism** layout theme. Cards, buttons, and inputs should have soft raise/recess bevel offsets.
   - Verify that the **Three.js WebGL canvas** displays the interactive, rotating 3D infrastructure network topology grid at the top.
   - Hover over cards and click inputs to check beveled shadows.

---

## ⚡ Step 3: Verify API Endpoints & Logic

All API routes require the default API Key header `x-api-key: lgtm-secret-key`. You can test them using `curl`:

### 1. Fibonacci Series Sum Endpoint
Verifies that the route calculates the sum of all elements in the Fibonacci sequence up to N.
```bash
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/4
```
**Expected Output** (Result should be `7` for N=4, indicating $0 + 1 + 1 + 2 + 3 = 7$):
```json
{
  "service": "node-app",
  "result": 7,
  "analysis": {
    "status": "analyzed",
    "value": 7,
    "is_even": false,
    "digits": 1,
    "service": "python-app"
  },
  "cache": "miss"
}
```

### 2. Factorial Endpoint
```bash
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/math/factorial/5
```
**Expected Output**:
```json
{
  "factorial": 120,
  "is_even": true,
  "digits": 3,
  "service": "python-app",
  "cache": "miss"
}
```

### 3. Text Sentiment Analysis Endpoint
```bash
curl -X POST -H "x-api-key: lgtm-secret-key" -H "Content-Type: application/json" \
  -d '{"text": "The LGTM observability system works perfectly!"}' \
  http://localhost:8081/text/analyze
```

### 4. Database User Query Endpoint
```bash
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/user/1
```

### 5. Kafka Event Publisher Endpoint
```bash
curl -X POST -H "x-api-key: lgtm-secret-key" -H "Content-Type: application/json" \
  -d '{"message": "Test event dispatch"}' \
  http://localhost:8081/kafka/publish
```

### 6. 12-Service Nested Downstream Trace Pipeline (Deep Trace)
Verifies synchronous cascade and parallel asynchronous consumption propagation across all 12 microservices.
```bash
curl -H "x-api-key: lgtm-secret-key" http://localhost:8081/calculate/deep/20
```
**Expected Output**:
```json
{
  "factors": [2, 2, 5],
  "result": {
    "analytics": {
      "audit_log": {
        "service": "python-app",
        "status": "completed",
        "sync_audit": {
          "service": "db-sync-service",
          "status": "sync_success",
          "tables_count": 3
        },
        "value": 9
      },
      "service": "analytics-service",
      "tables_count": 3
    },
    "inventory": "checked",
    "quantity": 45,
    "service": "inventory-service"
  },
  "service": "go-app",
  "sum": 9
}
```

---

## 🔍 Step 4: Verify Telemetry Pipelines (Grafana)

Open **Grafana** at `http://localhost:3000` (User: `admin`, Password: `admin`).

### 1. Verify Loki Logs ➔ Tempo Traces
1. Go to **Explore** and select **Loki** as the datasource.
2. Query: `{job="node-app"}`.
3. Find any calculation log line, expand it, and click the blue **"View Trace"** button on the right next to `trace_id`.
4. Verify the trace timeline displays spans crossing from `node-app` to `python-app` database/compute processes.

### 2. Verify Metrics Scrape (Prometheus / Mimir)
1. Go to **Explore** and select **Mimir** / **Prometheus** as the datasource.
2. Query `calculation_requests_total` or `node_task_duration_seconds_bucket`.
3. Enable **Exemplars** in the graph options.
4. Click any exemplar data point (blue diamond) to directly load the corresponding Tempo trace span.

---

## ☸️ Step 5: Verify IaC Configurations (Terragrunt)

Verify that the Terragrunt wrappers load variables and generate provider lockfiles successfully:

```bash
# Enter one of the cloud IaC folders
cd z_etc/LGTM/infrastructure/terraform/aws

# Initialize (requires terragrunt CLI)
terragrunt init

# Validate configuration
terragrunt validate
```
