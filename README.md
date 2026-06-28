# LGTM Telemetry Stack & Microservices

This repository contains a containerized demonstration of the **LGTM (Loki, Grafana, Tempo, Mimir)** telemetry stack integrated with a Node.js and Python microservice architecture. It demonstrates clean logs-to-traces correlations, metrics-to-traces exemplars, and dark-themed Swagger API interactive documentations.

---

## Repository Structure

- `apps/node-app/`: Node.js Express application (entrypoint API). Exposes OpenAPI docs on `/docs` and custom OpenMetrics exemplars on `/metrics` via `prom-client`.
- `apps/python-app/`: Python Flask service (downstream API). Exposes OpenAPI docs on `/docs` and uses the native OpenTelemetry SDK to write metrics and traces.
- `alloy/`: Scraper configuration for Grafana Alloy telemetry agent.
- `grafana/`: Data sources provisioning definitions linking Loki, Tempo, and Mimir.
- `loki/`, `tempo/`, `mimir/`: Monolithic configuration files for logging, tracing, and metric backends.
- `helm/lgtm-stack/`: Unified Kubernetes Helm chart for EKS deployments.

---

## Service Endpoints (Local Stack)

When running locally, you can access the following services:

| Service | Port | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Grafana** | `3000` | [http://localhost:3000](http://localhost:3000) | Main UI (Anonymous Admin enabled) |
| **Node.js App** | `8081` | [http://localhost:8081](http://localhost:8081) | Entrypoint Express application |
| **Node.js App Docs** | `8081` | [http://localhost:8081/docs](http://localhost:8081/docs) | Dark-themed API documentation |
| **Python App** | `5000` | [http://localhost:5000](http://localhost:5000) | Downstream Flask database/compute service |
| **Python App Docs** | `5000` | [http://localhost:5000/docs](http://localhost:5000/docs) | Dark-themed API documentation |
| **Grafana Alloy** | `12345` | [http://localhost:12345](http://localhost:12345) | Scraper agent dashboard and internal metrics |

---

## Local Setup (Docker Compose)

### 1. Build and Start the Stack
Run Docker Compose from the root directory to rebuild and launch all services:
```bash
docker compose up --build -d
```

### 2. Generate Telemetry Data
Trigger trace and metrics generating routes on the apps:
```bash
# 1. Trigger parent-child distributed trace across Node.js & Python
curl http://localhost:8081/complex-task

# 2. Trigger numerical calculation metrics
curl http://localhost:8081/calculate/12

# 3. Trigger database error and spans
curl http://localhost:8081/user/invalid-format
```

### 3. Verify Telemetry Correlations in Grafana

- **Logs to Traces:** Go to Grafana Loki explore, query `{job="node-app"}` or `{job="python-app"}`, expand any log, and click **"View Trace"** next to the trace ID to load its distributed timeline in Tempo.
- **Traces to Logs:** Click **"Logs for this span"** on any span in Tempo to automatically open Loki logs filtered by matching job labels.
- **Metrics to Traces (Exemplars):** Choose Prometheus (Mimir) in Grafana Explore. Check the **Exemplars** toggle and query `node_task_duration_seconds_bucket` or `python_task_duration_seconds_bucket`. Click on any blue/green exemplar data point to hop directly to its trace in Tempo.

---

## Kubernetes & EKS Deployment (Helm)

We have packaged the entire LGTM stack and applications in a unified Helm chart under `helm/lgtm-stack/`.

### Deployment Steps:
1. Push application images to ECR (AWS Elastic Container Registry).
2. Install the Helm chart, overriding ECR image paths and specifying the cluster storage class:
   ```bash
   helm install lgtm ./helm/lgtm-stack \
     --set global.storageClass="gp3" \
     --set nodeApp.image.repository="<aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-node-app" \
     --set pythonApp.image.repository="<aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-python-app"
   ```

Refer to [helm/lgtm-stack/README.md](file:///home/bhola/Antigravity/LGTM/helm/lgtm-stack/README.md) for more details.
