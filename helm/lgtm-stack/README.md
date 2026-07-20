# LGTM Stack Kubernetes Helm Chart

This Helm chart packages and deploys a complete distributed telemetry stack (Grafana, Loki, Tempo, Mimir, Grafana Alloy) alongside a Node.js Express entrypoint service and a downstream Python Flask processing service on Kubernetes (configured for EKS).

## Chart Components

- **Node.js App (`node-app`):** Stateful metrics emitter exposing OpenMetrics exemplars on `/metrics` and auto-instrumented tracing.
- **Python App (`python-app`):** Native OpenTelemetry SDK integration for traces, logs, and metrics (with active exemplars).
- **Loki:** Log storage database in monolithic/single-binary mode.
- **Tempo:** Distributed trace storage database in monolithic/single-binary mode.
- **Mimir:** Scalable metrics storage database in monolithic/single-binary mode.
- **Grafana Alloy:** Aggregates OTLP telemetry and runs Kubernetes API discovery to scrape annotated metric targets (like `node-app`).
- **Grafana:** Preconfigured with Loki, Tempo, and Mimir datasources, enabling seamless logs-to-traces and metrics-to-traces exemplar navigations.

---

## Configuration Options (`values.yaml`)

You can modify several configuration points by overriding values in `values.yaml` or passing them via `--set` arguments:

| Value | Default | Description |
| :--- | :--- | :--- |
| `global.storageClass` | `""` | The Kubernetes `StorageClass` to use for PV claims (e.g., `gp3` for EKS). |
| `nodeApp.image.repository` | `"lgtm-node-app"` | Container image repository for the Node.js service. |
| `nodeApp.image.tag` | `"latest"` | Image tag for the Node.js service. |
| `pythonApp.image.repository` | `"lgtm-python-app"` | Container image repository for the Python service. |
| `pythonApp.image.tag` | `"latest"` | Image tag for the Python service. |
| `grafana.service.type` | `"LoadBalancer"` | Type of Service to expose Grafana (e.g., `LoadBalancer` or `NodePort`). |
| `loki.persistence.size` | `"10Gi"` | Storage space allocated for Loki logs. |
| `mimir.persistence.size` | `"10Gi"` | Storage space allocated for Mimir metrics. |
| `tempo.persistence.size` | `"10Gi"` | Storage space allocated for Tempo traces. |

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
Install the chart into your cluster, overriding the image values to point to your ECR repositories:
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

---

## Local Validation

If you want to validate or test the templates locally without executing them against a Kubernetes cluster, run:

```bash
# Lint chart structures
helm lint ./helm/lgtm-stack

# Render YAML files dry-run
helm template lgtm ./helm/lgtm-stack
```

## If running on Killercoda

```bash
kubectl create secret docker-registry dockerhub-secret \
  --docker-server=https://docker.io \
  --docker-username=<docker-username> \
  --docker-password=<docker-token> \
  --docker-email=<docker-email> 

helm install lgtm ./helm/lgtm-stack \
  --set global.storageClass="local-path" \
  --set nodeApp.image.repository="<docker-username>/lgtm-node-app" \
  --set pythonApp.image.repository="<docker-username>/lgtm-python-app"
```

### For port exposing

```
change service type to node port and update node ports in killercoda ui to access grafana , node-app, python-app

```

