const express = require('express');
const http = require('http');
const winston = require('winston');
const Transport = require('winston-transport');
const api = require('@opentelemetry/api');

// Initialize prom-client and Metrics
const client = require('prom-client');
client.register.setContentType(client.Registry.OPENMETRICS_CONTENT_TYPE);

const calculationCounter = new client.Counter({
  name: 'calculation_requests_total',
  help: 'Total number of calculation requests processed by Node.js',
  labelNames: ['number'],
  enableExemplars: true
});

const errorCounter = new client.Counter({
  name: 'error_requests_total',
  help: 'Total number of errored requests in Node.js',
  labelNames: ['route'],
  enableExemplars: true
});

const taskDurationHistogram = new client.Histogram({
  name: 'node_task_duration_seconds',
  help: 'Duration of nested tasks executed in Node.js',
  labelNames: ['task_name', 'status'],
  enableExemplars: true,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

const activeUsersGauge = new client.Gauge({
  name: 'node_active_users',
  help: 'Simulated count of active users on the system'
});

// Helper to get active trace context for exemplars
function getActiveExemplar() {
  const activeSpan = api.trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    if (spanContext && (spanContext.traceFlags & api.TraceFlags.SAMPLED)) {
      return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId
      };
    }
  }
  return undefined;
}

// Custom Winston OTel Log Transport to send logs directly to Grafana Alloy
class OTelLogTransport extends Transport {
  constructor(opts) {
    super(opts);
    console.log('OTelLogTransport constructor called with URL:', opts ? opts.url : 'default');
    this.url = opts.url || 'http://alloy:4318/v1/logs';
  }

  log(info, callback) {
    console.log('OTelLogTransport log called:', info.message);
    setImmediate(() => {
      this.emit('logged', info);
    });

    const activeSpan = api.trace.getActiveSpan();
    let traceId = '';
    let spanId = '';
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      traceId = spanContext.traceId;
      spanId = spanContext.spanId;
    }

    const payload = {
      resourceLogs: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'node-app' } }
          ]
        },
        scopeLogs: [{
          scope: { name: 'winston-otel-transport' },
          logRecords: [{
            timeUnixNano: String(Date.now() * 1000000),
            body: { stringValue: info.message },
            severityText: info.level.toUpperCase(),
            severityNumber: info.level === 'error' ? 17 : 9,
            traceId: traceId,
            spanId: spanId
          }]
        }]
      }]
    };

    const data = JSON.stringify(payload);
    const parsedUrl = new URL(this.url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      if (res.statusCode >= 400) {
        console.error('OTelLogTransport response status:', res.statusCode);
      }
      res.resume();
    });
    
    req.on('error', (err) => {
      console.error('OTelLogTransport error:', err.message);
    });
    req.write(data);
    req.end();

    callback();
  }
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new OTelLogTransport({ url: 'http://alloy:4318/v1/logs' })
  ]
});

const app = express();
const PORT = process.env.PORT || 8081;

// Helper to simulate asynchronous timeout work
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Root / Health route
app.get('/', (req, res) => {
  logger.info('Node.js app received request on root path');
  activeUsersGauge.set(Math.floor(Math.random() * 15) + 30);

  http.get('http://python-app:5000/data', (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      logger.info('Received response from Python service', { python_response_length: data.length });
      try {
        const parsedData = JSON.parse(data);
        res.json({
          message: "Hello from Node.js App!",
          downstream_data: parsedData
        });
      } catch (e) {
        logger.error('Failed to parse Python service response', { error: e.message });
        res.status(500).json({ error: "Failed to parse Python service response" });
      }
    });
  }).on('error', (err) => {
    logger.error('Failed to contact Python service', { error: err.message });
    res.status(500).json({ error: `Failed to contact Python service: ${err.message}` });
  });
});

// 2. Calculation route with custom Span and custom Metric Counter
app.get('/calculate/:num', (req, res) => {
  const num = parseInt(req.params.num) || 10;
  logger.info(`Node.js processing Fibonacci calculation for N=${num}`);
  calculationCounter.inc({
    labels: { number: num.toString() },
    value: 1,
    exemplarLabels: getActiveExemplar()
  });
  activeUsersGauge.set(Math.floor(Math.random() * 20) + 40);

  // Create a custom active span to show in Tempo
  const tracer = api.trace.getTracer('node-app-tracer');
  tracer.startActiveSpan('CalculateFibonacci', (span) => {
    try {
      // Fibonacci calculation logic
      let a = 0, b = 1, temp;
      for (let i = 0; i < num; i++) {
        temp = a + b;
        a = b;
        b = temp;
      }
      span.setAttribute('calculation.type', 'fibonacci');
      span.setAttribute('calculation.input', num);
      span.setAttribute('calculation.result', a);

      logger.info(`Fibonacci calculation completed. Result=${a}. Calling Python app downstream to analyze...`);

      // Make downstream POST request to analyze
      const postData = JSON.stringify({ number: a, type: 'fibonacci' });
      const postReq = http.request({
        hostname: 'python-app',
        port: 5000,
        path: '/analyze',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          logger.info('Python analysis completed', { response: body });
          res.json({
            service: 'node-app',
            result: a,
            analysis: JSON.parse(body)
          });
          span.end();
        });
      });

      postReq.on('error', (err) => {
        logger.error('Failed to call python analyze endpoint', { error: err.message });
        span.recordException(err);
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
        res.status(500).json({ error: 'Failed to contact Python analyze service' });
        span.end();
      });

      postReq.write(postData);
      postReq.end();
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
      logger.error('Unexpected calculation error', { error: err.message });
      res.status(500).json({ error: err.message });
      span.end();
    }
  });
});

// 3. Complex Multi-Step Task route (demonstrates nested Spans & Histograms)
app.get('/complex-task', (req, res) => {
  logger.info('Received request for /complex-task endpoint');
  activeUsersGauge.set(Math.floor(Math.random() * 25) + 60);

  const tracer = api.trace.getTracer('node-app-tracer');
  tracer.startActiveSpan('ComplexTaskFlow', async (parentSpan) => {
    try {
      // Step 1: Simulate user preference lookup (child span 1)
      const step1Start = Date.now();
      await tracer.startActiveSpan('FetchUserPreferences', async (childSpan1) => {
        logger.info('Step 1: Simulating database lookup for user preferences');
        await delay(120); // simulate DB latency
        childSpan1.setAttribute('db.system', 'postgresql');
        childSpan1.setAttribute('db.name', 'preferences_db');
        childSpan1.end();
      });
      const step1Duration = (Date.now() - step1Start) / 1000.0;
      taskDurationHistogram.observe({
        labels: { task_name: 'FetchUserPreferences', status: 'success' },
        value: step1Duration,
        exemplarLabels: getActiveExemplar()
      });

      // Step 2: Simulate heavy local computation (child span 2)
      const step2Start = Date.now();
      await tracer.startActiveSpan('ProcessHeavyPayload', async (childSpan2) => {
        logger.info('Step 2: Performing computational analysis on local payload');
        await delay(80); // simulate computational latency
        childSpan2.setAttribute('payload.size_bytes', 4096);
        childSpan2.end();
      });
      const step2Duration = (Date.now() - step2Start) / 1000.0;
      taskDurationHistogram.observe({
        labels: { task_name: 'ProcessHeavyPayload', status: 'success' },
        value: step2Duration,
        exemplarLabels: getActiveExemplar()
      });

      // Step 3: Trigger downstream Flask heavy analysis
      logger.info('Step 3: Forwarding execution payload downstream to python-app');
      const postData = JSON.stringify({ dataset_id: 8899, tasks: ['sentiment', 'summarize'] });
      
      const postReq = http.request({
        hostname: 'python-app',
        port: 5000,
        path: '/heavy-analysis',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          logger.info('Downstream heavy analysis completed successfully', { python_response: body });
          res.json({
            status: 'completed',
            node_steps: {
              step1_db_duration_sec: step1Duration,
              step2_compute_duration_sec: step2Duration
            },
            python_analysis: JSON.parse(body)
          });
          parentSpan.end();
        });
      });

      postReq.on('error', (err) => {
        logger.error('Step 3 Failed: Downstream call error', { error: err.message });
        parentSpan.recordException(err);
        parentSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
        res.status(500).json({ error: 'Downstream heavy-analysis call failed' });
        parentSpan.end();
      });

      postReq.write(postData);
      postReq.end();

    } catch (err) {
      logger.error('Complex task encountered unexpected failure', { error: err.message });
      parentSpan.recordException(err);
      parentSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
      res.status(500).json({ error: err.message });
      parentSpan.end();
    }
  });
});

// 4. Sequential Multi-Step flow (with ID param)
app.get('/multi-step/:id', (req, res) => {
  const id = req.params.id;
  logger.info(`Starting multi-step execution flow for ID=${id}`);

  const tracer = api.trace.getTracer('node-app-tracer');
  tracer.startActiveSpan('MultiStepFlow', async (parentSpan) => {
    parentSpan.setAttribute('flow.id', id);
    try {
      logger.info(`Running stage A for flow ID=${id}`);
      await delay(50);
      
      logger.info(`Running stage B for flow ID=${id}`);
      await delay(50);

      res.json({
        flow_id: id,
        stages: ['stage_A', 'stage_B'],
        status: 'success'
      });
      parentSpan.end();
    } catch (err) {
      parentSpan.recordException(err);
      parentSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
      res.status(500).json({ error: err.message });
      parentSpan.end();
    }
  });
});

// 5. User Database fetch Simulator
app.get('/user/:id', (req, res) => {
  const userId = req.params.id;
  logger.info(`Fetching user details for ID=${userId}`);

  http.get(`http://python-app:5000/db/user/${userId}`, (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      if (response.statusCode === 404) {
        logger.warn(`User with ID=${userId} not found in database`);
        res.status(404).json(JSON.parse(data));
      } else {
        logger.info(`User details fetched successfully for ID=${userId}`);
        res.json(JSON.parse(data));
      }
    });
  }).on('error', (err) => {
    logger.error('Database connection simulated failure', { error: err.message });
    res.status(500).json({ error: 'Database service unavailable' });
  });
});

// 6. Intentional Error Endpoint (Logs ERROR and returns 500)
app.get('/error', (req, res) => {
  logger.error('Triggering simulated internal server error (500)');
  errorCounter.inc({
    labels: { route: '/error' },
    value: 1,
    exemplarLabels: getActiveExemplar()
  });

  // Get active span and set error status
  const activeSpan = api.trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setStatus({
      code: api.SpanStatusCode.ERROR,
      message: 'Simulated 500 Internal Server Error'
    });
    activeSpan.recordException(new Error('Simulated request failure'));
  }

  res.status(500).json({
    status: 'error',
    message: 'Something went wrong (Simulated 500 Error)'
  });
});

const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Node.js Express App API",
    version: "1.0.0",
    description: "API Documentation for Node.js Express App in LGTM Stack"
  },
  paths: {
    "/": {
      get: {
        summary: "Root / Health Check",
        responses: {
          "200": { description: "Success" }
        }
      }
    },
    "/calculate/{num}": {
      get: {
        summary: "Calculate Fibonacci",
        parameters: [
          {
            name: "num",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "Number to calculate Fibonacci for"
          }
        ],
        responses: {
          "200": { description: "Success" }
        }
      }
    },
    "/complex-task": {
      get: {
        summary: "Run Nested Complex Task",
        responses: {
          "200": { description: "Success" }
        }
      }
    },
    "/multi-step/{id}": {
      get: {
        summary: "Run Sequential Steps",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Flow identifier"
          }
        ],
        responses: {
          "200": { description: "Success" }
        }
      }
    },
    "/user/{id}": {
      get: {
        summary: "Simulate User Lookup",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "User ID"
          }
        ],
        responses: {
          "200": { description: "Success" },
          "404": { description: "User Not Found" }
        }
      }
    },
    "/error": {
      get: {
        summary: "Simulate 500 Error",
        responses: {
          "500": { description: "Error" }
        }
      }
    },
    "/metrics": {
      get: {
        summary: "Expose Prometheus Metrics",
        responses: {
          "200": { description: "Success" }
        }
      }
    }
  }
};

app.get('/swagger.json', (req, res) => {
  res.json(swaggerDocument);
});

app.get('/docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Node.js App API Docs</title>
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
      <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-themes@1.4.3/themes/dark.min.css" />
      <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5/favicon-32x32.png" sizes="32x32" />
      <style>
        html { box-sizing: border-box; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #1b1b1b; font-family: sans-serif; }
        .swagger-ui .topbar { background-color: #111111; border-bottom: 2px solid #333333; }
        .swagger-ui .info .title { color: #ffffff !important; }
        .swagger-ui { background-color: #1b1b1b; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            url: "/swagger.json",
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout"
          });
          window.ui = ui;
        };
      </script>
    </body>
    </html>
  `);
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

app.listen(PORT, () => {
  logger.info(`Node.js app listening on port ${PORT}`);
});
