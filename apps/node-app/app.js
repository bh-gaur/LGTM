const path = require('path');
const express = require('express');
const {
  api,
  client,
  logger,
  calculationCounter,
  errorCounter,
  taskDurationHistogram,
  activeUsersGauge,
  getActiveExemplar
} = require('../common/observability');

const { swaggerDocument, swaggerUiHtml } = require('./swagger');

const app = express();
app.use(express.json());

// Serve static web frontend UI from public/ directory
app.use(express.static(path.join(__dirname, 'public')));

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');

let kafkaProducer = null;

async function initKafkaProducer() {
  try {
    const { Kafka } = require('kafkajs');
    const kafka = new Kafka({
      clientId: 'node-app-producer',
      brokers: KAFKA_BROKERS,
      retry: { retries: 5 }
    });
    kafkaProducer = kafka.producer();
    await kafkaProducer.connect();
    logger.info(`Successfully connected Kafka Producer to brokers: ${KAFKA_BROKERS.join(',')}`);
  } catch (err) {
    logger.warning(`Kafka Producer connection warning: ${err.message}`);
  }
}
initKafkaProducer();

// ============================================================================
// HELPERS
// ============================================================================

/** Async delay helper for simulating task latency */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * High-concurrency HTTP helper with automatic W3C Trace Context propagation
 * to ensure distributed tracing across microservices (Node.js -> Python).
 */
async function fetchJson(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  api.propagation.inject(api.context.active(), headers);

  const fetchOptions = {
    keepalive: true,
    ...options,
    headers
  };
  const response = await fetch(url, fetchOptions);
  let data;
  try {
    data = await response.json();
  } catch (err) {
    const text = await response.text().catch(() => '');
    data = { error: text || `HTTP ${response.status} ${response.statusText}` };
  }
  return { status: response.status, data };
}

// ============================================================================
// APPLICATION ROUTES
// ============================================================================

/**
 * 1. Root / UI Dashboard Route
 */
app.get('/ui', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * 2. Fibonacci Calculation Route
 * - Demonstrates custom OpenTelemetry Spans & Exemplar Metric Counters
 * - Forwards calculation result to Python service for downstream analysis
 */
app.get('/calculate/:num', async (req, res) => {
  const num = parseInt(req.params.num, 10) || 10;
  logger.info(`Node.js processing Fibonacci calculation for N=${num}`);

  calculationCounter.inc({
    labels: { number: num.toString() },
    value: 1,
    exemplarLabels: getActiveExemplar()
  });
  activeUsersGauge.set(Math.floor(Math.random() * 20) + 40);

  const tracer = api.trace.getTracer('node-app-tracer');

  await tracer.startActiveSpan('CalculateFibonacci', async (span) => {
    try {
      let a = 0, b = 1;
      for (let i = 0; i < num; i++) {
        const temp = a + b;
        a = b;
        b = temp;
      }

      span.setAttribute('calculation.type', 'fibonacci');
      span.setAttribute('calculation.input', num);
      span.setAttribute('calculation.result', a);

      logger.info(`Fibonacci calculation completed. Result=${a}. Calling Python app downstream...`);

      const { data: analysisData } = await fetchJson(`${PYTHON_SERVICE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: a, type: 'fibonacci' })
      });

      logger.info('Python analysis completed', { response: analysisData });

      res.json({
        service: 'node-app',
        result: a,
        analysis: analysisData
      });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
      logger.error('Failed during calculation or downstream call', { error: err.message });
      res.status(500).json({ error: err.message });
    } finally {
      span.end();
    }
  });
});

/**
 * 3. Prime Factorization Proxy Route -> Python
 */
app.get('/math/prime-factors/:n', async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n <= 0) {
    logger.warn(`Invalid prime factors N value: ${req.params.n}`);
    return res.status(400).json({ error: 'Parameter N must be a valid positive integer' });
  }
  logger.info(`Proxying prime factorization request for N=${n} to Python backend`);
  try {
    const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/math/prime-factors/${n}`);
    res.status(status).json(data);
  } catch (err) {
    logger.error('Failed to proxy prime factorization request', { error: err.message });
    res.status(500).json({ error: 'Failed to contact Python backend' });
  }
});

/**
 * 3b. Factorial Calculation Proxy Route -> Python
 */
app.get('/math/factorial/:n', async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n <= 0) {
    logger.warn(`Invalid factorial N value: ${req.params.n}`);
    return res.status(400).json({ error: 'Parameter N must be a valid positive integer' });
  }
  logger.info(`Proxying factorial request for N=${n} to Python backend`);
  try {
    const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/math/factorial/${n}`);
    res.status(status).json(data);
  } catch (err) {
    logger.error('Failed to proxy factorial request', { error: err.message });
    res.status(500).json({ error: 'Failed to contact Python backend' });
  }
});

/**
 * 4. Text Sentiment Analysis Proxy Route -> Python
 */
app.post('/text/analyze', async (req, res) => {
  logger.info('Proxying text sentiment analysis request to Python backend');
  try {
    const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/text/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.status(status).json(data);
  } catch (err) {
    logger.error('Failed to proxy text analysis request', { error: err.message });
    res.status(500).json({ error: 'Failed to contact Python backend' });
  }
});

/**
 * 5. Data Array Aggregation Proxy Route -> Python
 */
app.post('/data/aggregate', async (req, res) => {
  logger.info('Proxying data aggregation request to Python backend');
  try {
    const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/data/aggregate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.status(status).json(data);
  } catch (err) {
    logger.error('Failed to proxy data aggregation request', { error: err.message });
    res.status(500).json({ error: 'Failed to contact Python backend' });
  }
});

/**
 * 6. System Status Diagnostics Proxy Route -> Python
 */
app.get('/system/status', async (req, res) => {
  logger.info('Proxying system status request to Python backend');
  try {
    const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/system/status`);
    res.status(status).json(data);
  } catch (err) {
    logger.error('Failed to proxy system status request', { error: err.message });
    res.status(500).json({ error: 'Failed to contact Python backend' });
  }
});

/**
 * 7. Complex Multi-Step Task Route
 */
app.get('/complex-task', async (req, res) => {
  logger.info('Received request for /complex-task endpoint');
  activeUsersGauge.set(Math.floor(Math.random() * 25) + 60);

  const tracer = api.trace.getTracer('node-app-tracer');

  await tracer.startActiveSpan('ComplexTaskFlow', async (parentSpan) => {
    try {
      const step1Start = Date.now();
      await tracer.startActiveSpan('FetchUserPreferences', async (childSpan1) => {
        logger.info('Step 1: Simulating database lookup for user preferences');
        await delay(120);
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

      const step2Start = Date.now();
      await tracer.startActiveSpan('ProcessHeavyPayload', async (childSpan2) => {
        logger.info('Step 2: Performing computational analysis on local payload');
        await delay(80);
        childSpan2.setAttribute('payload.size_bytes', 4096);
        childSpan2.end();
      });
      const step2Duration = (Date.now() - step2Start) / 1000.0;
      taskDurationHistogram.observe({
        labels: { task_name: 'ProcessHeavyPayload', status: 'success' },
        value: step2Duration,
        exemplarLabels: getActiveExemplar()
      });

      logger.info('Step 3: Forwarding execution payload downstream to python-app');
      const { data: pythonAnalysis } = await fetchJson(`${PYTHON_SERVICE_URL}/heavy-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: 8899, tasks: ['sentiment', 'summarize'] })
      });

      logger.info('Downstream heavy analysis completed successfully', { python_analysis: pythonAnalysis });

      res.json({
        status: 'completed',
        node_steps: {
          step1_db_duration_sec: step1Duration,
          step2_compute_duration_sec: step2Duration
        },
        python_analysis: pythonAnalysis
      });
    } catch (err) {
      logger.error('Complex task encountered unexpected failure', { error: err.message });
      parentSpan.recordException(err);
      parentSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
      res.status(500).json({ error: err.message });
    } finally {
      parentSpan.end();
    }
  });
});

/**
 * 8. Sequential Multi-Step Flow
 */
app.get('/multi-step/:id', async (req, res) => {
  const id = req.params.id;
  logger.info(`Starting multi-step execution flow for ID=${id}`);

  const tracer = api.trace.getTracer('node-app-tracer');

  await tracer.startActiveSpan('MultiStepFlow', async (parentSpan) => {
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
    } catch (err) {
      parentSpan.recordException(err);
      parentSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
      res.status(500).json({ error: err.message });
    } finally {
      parentSpan.end();
    }
  });
});

/**
 * 9. User Database Lookup Simulator
 */
app.get('/user/:id', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    logger.warn(`Invalid user ID query parameter value: ${req.params.id}`);
    return res.status(400).json({ error: 'User ID must be a valid integer' });
  }
  logger.info(`Fetching user details for ID=${userId}`);

  try {
    const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/db/user/${userId}`);
    if (status === 404) {
      logger.warn(`User with ID=${userId} not found in database`);
      return res.status(404).json(data);
    }
    logger.info(`User details fetched successfully for ID=${userId}`);
    res.json(data);
  } catch (err) {
    logger.error('Database connection simulated failure', { error: err.message });
    res.status(500).json({ error: 'Database service unavailable' });
  }
});

/**
 * 9b. Publish Asynchronous Task Event to Kafka Broker
 */
app.post('/kafka/publish', async (req, res) => {
  const payload = req.body || {};
  const topic = payload.topic || 'task-events';
  const messageText = payload.message || 'Sample event payload from Node.js Gateway';

  logger.info(`Publishing event to Kafka topic '${topic}'`);

  if (!kafkaProducer) {
    return res.status(503).json({
      status: 'error',
      message: 'Kafka Producer is not connected to broker'
    });
  }

  try {
    const record = {
      event_id: `evt_${Date.now()}`,
      payload: messageText,
      timestamp: new Date().toISOString(),
      source: 'node-app'
    };

    await kafkaProducer.send({
      topic,
      messages: [
        {
          key: record.event_id,
          value: JSON.stringify(record)
        }
      ]
    });

    logger.info(`Event published to Kafka topic '${topic}' successfully.`);
    res.json({
      status: 'published',
      topic,
      event: record,
      brokers: KAFKA_BROKERS
    });
  } catch (err) {
    logger.error('Failed to publish event to Kafka', { error: err.message });
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * 10. Intentional Error Route
 */
app.get('/error', (req, res) => {
  logger.error('Triggering simulated internal server error (500)');

  errorCounter.inc({
    labels: { route: '/error' },
    value: 1,
    exemplarLabels: getActiveExemplar()
  });

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

// ============================================================================
// DOCUMENTATION & METRICS ENDPOINTS
// ============================================================================

app.get('/swagger.json', (req, res) => {
  res.json(swaggerDocument);
});

app.get('/docs', (req, res) => {
  res.send(swaggerUiHtml);
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

app.listen(PORT, () => {
  logger.info(`Node.js app listening on port ${PORT}`);
});
