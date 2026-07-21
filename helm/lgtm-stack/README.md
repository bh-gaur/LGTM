# LGTM Stack Kubernetes Helm Chart

This Helm chart packages and deploys a complete distributed telemetry stack (Grafana, Loki, Tempo, Mimir, Grafana Alloy) alongside a PostgreSQL database infrastructure, a Node.js Express entrypoint service, and a downstream Python Flask processing service on Kubernetes (configured for EKS).

## Chart Components

- **Node.js App (`node-app`):** Gateway API exposing OpenMetrics exemplars on `/metrics` and serving the Glassmorphic 3D Control Center UI.
- **Python App (`python-app`):** Native OpenTelemetry SDK integration for traces, logs, and metrics (with active exemplars) and PostgreSQL database connectivity.
- **PostgreSQL Database (`postgres`):** Stateful relational database providing user directory records and SQL query tracing.
- **Loki:** Log storage database in single-binary mode.
- **Tempo:** Distributed trace storage database in single-binary mode.
- **Mimir:** Scalable metrics storage database in single-binary mode.
- **Grafana Alloy:** Aggregates OTLP telemetry and runs Kubernetes API discovery to scrape annotated metric targets.
- **Grafana:** Preconfigured with Loki, Tempo, and Mimir datasources, enabling seamless logs-to-traces and metrics-to-traces exemplar navigations.

---

## Configuration Options (`values.yaml`)

You can modify several configuration points by overriding values in `values.yaml` or passing them via `--set` arguments:

| Value | Default | Description |
| :--- | :--- | :--- |
| `global.enableObservability` | `true` | Toggle OpenTelemetry tracing, metrics, and OTLP logging globally. |
| `global.storageClass` | `"local-path"` | The Kubernetes `StorageClass` to use for PV claims (e.g., `gp3` for AWS EKS). |
| `nodeApp.image.repository` | `"lgtm-node-app"` | Container image repository for the Node.js service. |
| `pythonApp.image.repository` | `"lgtm-python-app"` | Container image repository for the Python service. |
| `postgres.database` | `"lgtmdb"` | Database name for PostgreSQL. |
| `postgres.user` | `"lgtmuser"` | Username for PostgreSQL authentication. |
| `postgres.password` | `"lgtmpass"` | Password for PostgreSQL authentication. |
| `postgres.persistence.size` | `"1Gi"` | Storage space allocated for PostgreSQL database. |
| `loki.persistence.size` | `"5Gi"` | Storage space allocated for Loki logs. |
| `mimir.persistence.size` | `"5Gi"` | Storage space allocated for Mimir metrics. |
| `tempo.persistence.size` | `"10Gi"` | Storage space allocated for Tempo traces. |

> [!IMPORTANT]
> **Production Storage Sizing Note**:
> When deploying to high-volume production clusters, increase persistent storage sizes accordingly:
> ```bash
> helm install lgtm ./helm/lgtm-stack \
>   --set global.storageClass="gp3" \
>   --set loki.persistence.size="50Gi" \
>   --set mimir.persistence.size="50Gi" \
>   --set tempo.persistence.size="100Gi" \
>   --set postgres.persistence.size="20Gi"
> ```

---

## Deploying to AWS EKS

### Step 1: Push Images to Amazon ECR
Tag and push the custom Node.js and Python application images to your private ECR registry:
```bash
# Log in to ECR
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<region>.amazonaws.com

# Tag and push Node.js application
docker tag lgtm-node-app:latest <aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-node-app:latest
docker push <aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-node-app:latest

# Tag and push Python application
docker tag lgtm-python-app:latest <aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-python-app:latest
docker push <aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-python-app:latest
```

### Step 2: Install the Chart
Install the chart into your cluster, overriding image values:
```bash
helm install lgtm ./helm/lgtm-stack \
  --set global.storageClass="gp3" \
  --set nodeApp.image.repository="<aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-node-app" \
  --set pythonApp.image.repository="<aws_account_id>.dkr.ecr.<region>.amazonaws.com/lgtm-python-app"
```

### Step 3: Verify the Deployment
Ensure that all pods, services, and statefulsets start up correctly:
```bash
kubectl get all -o wide
```
