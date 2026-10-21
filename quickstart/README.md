# OpenLGTM: Full-Stack Observability Quickstart

Run a complete, pre-configured **Grafana LGTM stack** (Loki, Grafana, Tempo, Mimir) with an **OpenTelemetry Collector Gateway** and automated 3-way correlation in one command.

## 1. Start the Observability Stack

```bash
docker compose up -d
```

This will spin up:
- **Grafana 12** (`http://localhost:3000`, user/pass: `admin`/`admin`) with pre-provisioned correlation rules.
- **OTel Collector** listening on port `4317` (gRPC) and `4318` (HTTP).
- **Tempo** (`:3200`) for distributed traces.
- **Loki** (`:3100`) for structured logs.
- **Mimir** (`:9009`) for Prometheus time-series metrics.

## 2. Connect Your Application

Install the `lgtm-obs` SDK for your preferred language:

### Python
```bash
pip install lgtm-obs
```
```python
from lgtm_obs import init_observability, get_logger
from flask import Flask

app = Flask(__name__)
init_observability(app, service_name="my-python-api")
logger = get_logger()
```

### Node.js
```bash
npm install lgtm-obs
```
```javascript
const { initObservability, logger } = require('lgtm-obs');

initObservability({ serviceName: 'my-node-api' });
```

### Go
```bash
go get github.com/openlgtm/lgtm-obs-go
```
```go
import lgtm "github.com/openlgtm/lgtm-obs-go/lgtmobs"

shutdown, _ := lgtm.Init(lgtm.Config{ServiceName: "my-go-api"})
defer shutdown(context.Background())
```

## 3. Verify in Grafana

Navigate to `http://localhost:3000`:
- **Explore Traces in Tempo**: Search by service name.
- **Explore Logs in Loki**: Notice the `"View Trace in Tempo"` button automatically rendered on every log line with a `trace_id`.
- **Explore Metrics in Mimir**: Notice the blue diamond exemplars on latency charts linking directly to trace spans.
