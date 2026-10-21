# @bh-gaur/lgtm-obs (Node.js)

Zero-boilerplate, enterprise-grade OpenTelemetry observability library for Node.js microservices targeting the **Grafana LGTM stack** (Loki, Grafana, Tempo, Mimir).

## Installation

```bash
npm install @bh-gaur/lgtm-obs
```

## Quick Start

```javascript
// MUST be the very first import before any other libraries
const { initObservability, logger, api } = require('@bh-gaur/lgtm-obs');

initObservability({
  serviceName: 'gateway-service',
  otlpEndpoint: 'http://localhost:4318'
});

const express = require('express');
const app = express();

app.get('/api/orders', (req, res) => {
  logger.info('Processing order request'); // Automatically embeds active trace_id & span_id
  res.json({ status: 'ok' });
});

app.listen(3000, () => {
  logger.info('Gateway running on port 3000');
});
```

## Trace Exemplars with Prom-client

```javascript
const { client, getActiveExemplar } = require('lgtm-obs');

const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route'],
  enableExemplars: true
});

// Inside your request handler:
requestCounter.inc({
  labels: { route: '/api/orders' },
  value: 1,
  exemplarLabels: getActiveExemplar() // Blue diamond jump in Grafana!
});
```
