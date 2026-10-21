# 📦 LGTM Observability Packages Usage Guide

Zero-boilerplate, production-ready OpenTelemetry observability SDKs for **Python**, **Node.js**, and **Go** targeting the **Grafana LGTM stack** (Loki, Grafana, Tempo, Mimir).

These libraries standardize:
* 🌐 **Distributed Tracing**: Automatic W3C `traceparent` context propagation across HTTP REST routes and Kafka message queues.
* 📊 **Metrics with Exemplars**: Links Prometheus/Mimir metric spikes directly to Tempo trace timelines.
* 📜 **Correlated Logging**: Automatically embeds active `trace_id` and `span_id` in logs sent to Grafana Loki.
* ⚡ **Feature Flag Support**: Zero-overhead disabling via `ENABLE_OBSERVABILITY=false`.

---

## 🚀 1. Quickstart: Start the LGTM Observability Stack

Before instrumenting your applications, start the pre-configured local LGTM stack:

```bash
cd quickstart
docker compose up -d
```

| Service | URL / Port | Purpose |
| :--- | :--- | :--- |
| **Grafana** | `http://localhost:3000` *(admin/admin)* | Dashboards, traces, logs, alerts |
| **OTel Collector / Alloy** | `http://localhost:4318` (HTTP), `:4317` (gRPC) | Ingests OTLP traces, metrics, logs |
| **Prometheus / Mimir** | `http://localhost:9009` | High-availability metrics store |
| **Loki** | `http://localhost:3100` | High-performance log aggregation |
| **Tempo** | `http://localhost:3200` | Distributed tracing backend |

---

## 🐍 2. Python Package: `lgtm-obs`

### Installation

From PyPI:
```bash
pip install lgtm-obs

# Or install with all framework auto-instrumentations:
pip install "lgtm-obs[all]"
```

Or install directly from GitHub (no PyPI needed):
```bash
pip install git+https://github.com/bh-gaur/LGTM.git#subdirectory=packages/python
```

### Usage with Flask

```python
from flask import Flask
from lgtm_obs import init_observability, get_logger, get_tracer

app = Flask(__name__)

# Single initialization initializes Traces -> Tempo, Logs -> Loki, Metrics -> Mimir
obs = init_observability(app, service_name="order-service")
logger = get_logger()
tracer = get_tracer()

@app.route("/orders", methods=["POST"])
def create_order():
    # Logs automatically contain active trace_id & span_id
    logger.info("Received new order request")
    
    # Custom span
    with tracer.start_as_current_span("ProcessPayment") as span:
        span.set_attribute("order.amount", 99.95)
        logger.info("Payment processed successfully")

    return {"status": "created", "order_id": 1042}

if __name__ == "__main__":
    app.run(port=5000)
```

### Usage with FastAPI

```python
from fastapi import FastAPI
from lgtm_obs import init_observability, get_logger

app = FastAPI()
obs = init_observability(app, service_name="inventory-service")
logger = get_logger()

@app.get("/items/{item_id}")
async def get_item(item_id: int):
    logger.info(f"Looking up item: {item_id}")
    return {"item_id": item_id, "in_stock": True}
```

### Configuration Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `OTEL_SERVICE_NAME` | `python-service` | Service name displayed in Grafana Tempo/Mimir |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OpenTelemetry collector endpoint |
| `ENABLE_OBSERVABILITY` | `true` | Set to `false` to disable telemetry with zero overhead |

---

## 🟩 3. Node.js Package: `@bh-gaur/lgtm-obs`

### Installation

From npm:
```bash
npm install @bh-gaur/lgtm-obs
```

Or install directly from GitHub:
```bash
npm install github:bh-gaur/LGTM#subdirectory:packages/nodejs
```

### Quick Start with Express

> ⚠️ **Important**: `initObservability` MUST be called before requiring Express or other libraries so that auto-instrumentation monkey-patches can hook into HTTP routers.

```javascript
// MUST be the very first line of your application entry point:
const { initObservability, logger, client, getActiveExemplar } = require('@bh-gaur/lgtm-obs');

initObservability({
  serviceName: 'gateway-service',
  otlpEndpoint: 'http://localhost:4318'
});

const express = require('express');
const app = express();

// Custom metric with OpenMetrics Exemplars
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'method', 'status'],
  enableExemplars: true
});

app.get('/api/users', (req, res) => {
  // 1. Logs automatically output trace_id & span_id to Loki
  logger.info('Handling user request', { userId: req.query.id });

  // 2. Increment metric and attach active trace as an Exemplar
  httpRequestsTotal.inc({
    labels: { route: '/api/users', method: 'GET', status: '200' },
    value: 1,
    exemplarLabels: getActiveExemplar() // Clickable blue dot in Grafana!
  });

  res.json({ users: [{ id: 1, name: 'Alice' }] });
});

app.listen(3000, () => {
  logger.info('Server running on port 3000');
});
```

### Propagating TraceContext Downstream (HTTP)

```javascript
const axios = require('axios');
const { api } = require('@bh-gaur/lgtm-obs');

async function callDownstreamService() {
  const headers = {};
  // Injects W3C traceparent headers into outgoing request
  api.propagation.inject(api.context.active(), headers);

  return axios.get('http://backend-service:5000/data', { headers });
}
```

---

## 🐹 4. Go Package: `github.com/bh-gaur/LGTM/packages/go`

### Installation

```bash
go get github.com/bh-gaur/LGTM/packages/go
```

### Quick Start with Gin

```go
package main

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	lgtm "github.com/bh-gaur/LGTM/packages/go/lgtmobs"
)

func main() {
	// 1. Initialize OpenTelemetry Tracing
	shutdown, err := lgtm.Init(lgtm.Config{
		ServiceName:  "compute-service",
		OTLPEndpoint: "localhost:4318",
	})
	if err != nil {
		panic(err)
	}
	defer shutdown(context.Background())

	// 2. Setup Gin with LGTM Middleware
	r := gin.Default()
	r.Use(lgtm.GinMiddleware("compute-service"))

	r.GET("/compute", func(c *gin.Context) {
		// 3. Create a custom child span
		ctx, span := lgtm.StartSpan(c.Request.Context(), "CalculateHeavyTask")
		defer span.End()

		// 4. Inject trace context into an outgoing HTTP request
		req, _ := http.NewRequestWithContext(ctx, "GET", "http://analytics-service:8086/stats", nil)
		lgtm.InjectHTTP(ctx, req)

		c.JSON(http.StatusOK, gin.H{"result": 42})
	})

	r.Run(":8083")
}
```

---

## 🔍 5. Verifying Your Telemetry in Grafana

Once your applications are running with the packages:

1. Open Grafana at **`http://localhost:3000`**.
2. **Explore Traces (Tempo)**:
   * Go to **Explore** $\rightarrow$ Select **Tempo** datasource.
   * Search by `ServiceName` (e.g. `order-service`, `gateway-service`, `compute-service`).
   * Click any trace to view the end-to-end waterfall timeline across microservices.
3. **Explore Logs (Loki)**:
   * Go to **Explore** $\rightarrow$ Select **Loki** datasource.
   * Run query: `{service_name="order-service"}`.
   * Notice that every log line includes `trace_id` and `span_id`. Click the trace ID button on any log line to jump straight to Tempo!
4. **Explore Metrics & Exemplars (Mimir)**:
   * Go to **Explore** $\rightarrow$ Select **Mimir** datasource.
   * Query: `rate(http_requests_total[1m])`.
   * Enable **Exemplars** toggle in Grafana query options. Click any blue diamond exemplar dot on the metric graph to jump directly to the specific trace that caused the latency or error spike!
