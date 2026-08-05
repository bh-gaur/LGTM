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

const path = require('path');
const Hapi = require('@hapi/hapi');
const Inert = require('@hapi/inert');
const Boom = require('@hapi/boom');

const { swaggerDocument, swaggerUiHtml } = require('./swagger');

// ============================================================================
// REDIS CACHE INITIALIZATION
// ============================================================================
const { createClient } = require('redis');
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const redisClient = createClient({ url: `redis://${REDIS_HOST}:6379` });

redisClient.on('error', (err) => {
  logger.warn(`Redis Client Error: ${err.message}`);
});

let isRedisConnected = false;
async function initRedis() {
  try {
    await redisClient.connect();
    logger.info(`Successfully connected to Redis cache at redis://${REDIS_HOST}:6379`);
    isRedisConnected = true;
  } catch (err) {
    logger.warn(`Redis Cache unavailable, proceeding with No-Op cache fallbacks: ${err.message}`);
  }
}
initRedis();

// ============================================================================
// KAFKA PRODUCER INITIALIZATION
// ============================================================================
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://python-app:5000';

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
    logger.warn(`Kafka Producer connection warning: ${err.message}`);
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

const VALID_API_KEY = process.env.API_KEY || 'lgtm-secret-key';
const PORT = process.env.PORT || 8081;

const init = async () => {
  const server = Hapi.server({
    port: PORT,
    host: '0.0.0.0'
  });

  await server.register(Inert);

  // ============================================================================
  // API KEY AUTHENTICATION EXTENSION
  // ============================================================================
  server.ext('onPreHandler', (request, h) => {
    // Check if the route has explicit skipAuth configured
    if (request.route.settings.plugins.skipAuth) {
      return h.continue;
    }
    const path = request.path;
    // Exclude UI, Swagger docs, metrics and health checks from authentication
    if (path === '/ui' || path === '/' || path.startsWith('/swagger') || path.startsWith('/docs') || path === '/metrics') {
      return h.continue;
    }
    const rawApiKey = request.headers['x-api-key'] || request.query.api_key;
    // Support comma-separated duplicates gracefully (e.g. from load balancers or gateways)
    const apiKey = typeof rawApiKey === 'string' ? rawApiKey.split(',')[0].trim() : undefined;

    if (!apiKey || apiKey !== VALID_API_KEY) {
      logger.warn(`Unauthorized access attempt to: ${path}`);
      throw Boom.unauthorized('Unauthorized: Invalid or missing X-API-Key header.');
    }
    return h.continue;
  });

  // ============================================================================
  // APPLICATION ROUTES
  // ============================================================================

  /**
   * 1. Root / UI Dashboard Route
   */
  server.route({
    method: 'GET',
    path: '/ui',
    options: {
      plugins: { skipAuth: true }
    },
    handler: (request, h) => {
      return h.file(path.join(__dirname, 'public', 'index.html'))
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
  });

  /**
   * 2. Fibonacci Calculation Route
   * - Demonstrates custom OpenTelemetry Spans & Exemplar Metric Counters
   * - Forwards calculation result to Python service for downstream analysis
   */
  server.route({
    method: 'GET',
    path: '/calculate/{num}',
    handler: async (request, h) => {
      const num = parseInt(request.params.num, 10);
      if (isNaN(num) || num < 0 || num > 1000) {
        logger.warn(`Invalid Fibonacci N value requested: ${request.params.num}`);
        throw Boom.badRequest('Parameter num must be a valid non-negative integer between 0 and 1000');
      }
      logger.info(`Node.js processing Fibonacci calculation for N=${num}`);

      const cacheKey = `fib:${num}`;
      if (isRedisConnected) {
        try {
          const cachedVal = await redisClient.get(cacheKey);
          if (cachedVal) {
            logger.info(`Redis cache hit for Fibonacci N=${num}`);
            return JSON.parse(cachedVal);
          }
        } catch (cacheErr) {
          logger.warn(`Redis read error: ${cacheErr.message}`);
        }
      }

      calculationCounter.inc({
        labels: { number: num.toString() },
        value: 1,
        exemplarLabels: getActiveExemplar()
      });
      activeUsersGauge.set(Math.floor(Math.random() * 20) + 40);

      const tracer = api.trace.getTracer('node-app-tracer');

      return await tracer.startActiveSpan('CalculateFibonacci', async (span) => {
        try {
          // 1. Verify token with auth-service downstream
          const { status: authStatus, data: authData } = await fetchJson('http://auth-service:8082/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'lgtm-secret-token' })
          });

          if (authStatus !== 200 || !authData.verified) {
            logger.warn('Auth-service verification failed.');
            span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'Authentication verification failed' });
            throw Boom.unauthorized('Auth-service verification failed');
          }

          let a = 0, b = 1;
          let sum = 0;
          for (let i = 0; i <= num; i++) {
            sum += a;
            const temp = a + b;
            a = b;
            b = temp;
          }

          span.setAttribute('calculation.type', 'fibonacci');
          span.setAttribute('calculation.input', num);
          span.setAttribute('calculation.result', sum);

          logger.info(`Fibonacci calculation completed. Sum of series up to N=${num} is ${sum}. Calling Python app downstream...`);

          const { data: analysisData } = await fetchJson(`${PYTHON_SERVICE_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: sum, type: 'fibonacci' })
          });

          logger.info('Python analysis completed', { response: analysisData });

          const responsePayload = {
            service: 'node-app',
            result: sum,
            analysis: analysisData,
            cache: 'miss'
          };

          if (isRedisConnected) {
            try {
              await redisClient.set(cacheKey, JSON.stringify({ ...responsePayload, cache: 'hit' }), {
                EX: 300
              });
            } catch (cacheWriteErr) {
              logger.warn(`Redis write error: ${cacheWriteErr.message}`);
            }
          }

          return responsePayload;
        } catch (err) {
          span.recordException(err);
          span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
          logger.error('Failed during calculation or downstream call', { error: err.stack || err.message });
          if (Boom.isBoom(err)) {
            throw err;
          }
          throw Boom.internal(err.message);
        } finally {
          span.end();
        }
      });
    }
  });

  /**
   * 3. Prime Factorization Proxy Route -> Python
   */
  server.route({
    method: 'GET',
    path: '/math/prime-factors/{n}',
    handler: async (request, h) => {
      const n = parseInt(request.params.n, 10);
      if (isNaN(n) || n <= 0) {
        logger.warn(`Invalid prime factors N value: ${request.params.n}`);
        throw Boom.badRequest('Parameter N must be a valid positive integer');
      }
      logger.info(`Proxying prime factorization request for N=${n} to Python backend`);
      try {
        const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/math/prime-factors/${n}`);
        return h.response(data).code(status);
      } catch (err) {
        logger.error('Failed to proxy prime factorization request', { error: err.message });
        throw Boom.internal('Failed to contact Python backend');
      }
    }
  });

  /**
   * 3b. Factorial Calculation Proxy Route -> Python
   */
  server.route({
    method: 'GET',
    path: '/math/factorial/{n}',
    handler: async (request, h) => {
      const n = parseInt(request.params.n, 10);
      if (isNaN(n) || n <= 0) {
        logger.warn(`Invalid factorial N value: ${request.params.n}`);
        throw Boom.badRequest('Parameter N must be a valid positive integer');
      }

      const cacheKey = `fact:${n}`;
      if (isRedisConnected) {
        try {
          const cachedVal = await redisClient.get(cacheKey);
          if (cachedVal) {
            logger.info(`Redis cache hit for Factorial N=${n}`);
            return JSON.parse(cachedVal);
          }
        } catch (cacheErr) {
          logger.warn(`Redis read error: ${cacheErr.message}`);
        }
      }

      logger.info(`Proxying factorial request for N=${n} to Python backend`);
      try {
        const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/math/factorial/${n}`);
        if (status === 200 && isRedisConnected) {
          try {
            await redisClient.set(cacheKey, JSON.stringify({ ...data, cache: 'hit' }), {
              EX: 300
            });
          } catch (cacheWriteErr) {
            logger.warn(`Redis write error: ${cacheWriteErr.message}`);
          }
        }
        return h.response({ ...data, cache: 'miss' }).code(status);
      } catch (err) {
        logger.error('Failed to proxy factorial request', { error: err.message });
        throw Boom.internal('Failed to contact Python backend');
      }
    }
  });

  /**
   * 4. Text Sentiment Analysis Proxy Route -> Python
   */
  server.route({
    method: 'POST',
    path: '/text/analyze',
    handler: async (request, h) => {
      logger.info('Proxying text sentiment analysis request to Python backend');
      try {
        const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/text/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.payload)
        });
        return h.response(data).code(status);
      } catch (err) {
        logger.error('Failed to proxy text analysis request', { error: err.message });
        throw Boom.internal('Failed to contact Python backend');
      }
    }
  });

  /**
   * 5. Data Array Aggregation Proxy Route -> Python
   */
  server.route({
    method: 'POST',
    path: '/data/aggregate',
    handler: async (request, h) => {
      logger.info('Proxying data aggregation request to Python backend');
      try {
        const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/data/aggregate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.payload)
        });
        return h.response(data).code(status);
      } catch (err) {
        logger.error('Failed to proxy data aggregation request', { error: err.message });
        throw Boom.internal('Failed to contact Python backend');
      }
    }
  });

  /**
   * 6. System Status Diagnostics Proxy Route -> Python
   */
  server.route({
    method: 'GET',
    path: '/system/status',
    handler: async (request, h) => {
      logger.info('Proxying system status request to Python backend');
      try {
        const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/system/status`);
        return h.response(data).code(status);
      } catch (err) {
        logger.error('Failed to proxy system status request', { error: err.message });
        throw Boom.internal('Failed to contact Python backend');
      }
    }
  });

  /**
   * 7. Complex Multi-Step Task Route
   */
  server.route({
    method: 'GET',
    path: '/complex-task',
    handler: async (request, h) => {
      logger.info('Received request for /complex-task endpoint');
      activeUsersGauge.set(Math.floor(Math.random() * 25) + 60);

      const tracer = api.trace.getTracer('node-app-tracer');

      return await tracer.startActiveSpan('ComplexTaskFlow', async (parentSpan) => {
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

          return {
            status: 'completed',
            node_steps: {
              step1_db_duration_sec: step1Duration,
              step2_compute_duration_sec: step2Duration
            },
            python_analysis: pythonAnalysis
          };
        } catch (err) {
          logger.error('Complex task encountered unexpected failure', { error: err.message });
          parentSpan.recordException(err);
          parentSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
          throw Boom.internal(err.message);
        } finally {
          parentSpan.end();
        }
      });
    }
  });

  /**
   * 8. Sequential Multi-Step Flow
   */
  server.route({
    method: 'GET',
    path: '/multi-step/{id}',
    handler: async (request, h) => {
      const id = request.params.id;
      logger.info(`Starting multi-step execution flow for ID=${id}`);

      const tracer = api.trace.getTracer('node-app-tracer');

      return await tracer.startActiveSpan('MultiStepFlow', async (parentSpan) => {
        parentSpan.setAttribute('flow.id', id);
        try {
          logger.info(`Running stage A for flow ID=${id}`);
          await delay(50);

          logger.info(`Running stage B for flow ID=${id}`);
          await delay(50);

          return {
            flow_id: id,
            stages: ['stage_A', 'stage_B'],
            status: 'success'
          };
        } catch (err) {
          parentSpan.recordException(err);
          parentSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
          throw Boom.internal(err.message);
        } finally {
          parentSpan.end();
        }
      });
    }
  });

  /**
   * 9. User Database Lookup Simulator
   */
  server.route({
    method: 'GET',
    path: '/user/{id}',
    handler: async (request, h) => {
      const userId = parseInt(request.params.id, 10);
      if (isNaN(userId)) {
        logger.warn(`Invalid user ID query parameter value: ${request.params.id}`);
        throw Boom.badRequest('User ID must be a valid integer');
      }

      const cacheKey = `user:${userId}`;
      if (isRedisConnected) {
        try {
          const cachedVal = await redisClient.get(cacheKey);
          if (cachedVal) {
            logger.info(`Redis cache hit for user ID=${userId}`);
            return JSON.parse(cachedVal);
          }
        } catch (cacheErr) {
          logger.warn(`Redis read error: ${cacheErr.message}`);
        }
      }

      logger.info(`Fetching user details for ID=${userId}`);

      try {
        const { status, data } = await fetchJson(`${PYTHON_SERVICE_URL}/db/user/${userId}`);
        if (status === 404) {
          logger.warn(`User with ID=${userId} not found in database`);
          return h.response(data).code(404);
        }
        logger.info(`User details fetched successfully for ID=${userId}`);
        
        if (status === 200 && isRedisConnected) {
          try {
            await redisClient.set(cacheKey, JSON.stringify({ ...data, cache: 'hit' }), {
              EX: 300
            });
          } catch (cacheWriteErr) {
            logger.warn(`Redis write error: ${cacheWriteErr.message}`);
          }
        }
        return h.response({ ...data, cache: 'miss' }).code(status);
      } catch (err) {
        logger.error('Database connection simulated failure', { error: err.message });
        throw Boom.serverUnavailable('Database service unavailable');
      }
    }
  });

  /**
   * 9b. Publish Asynchronous Task Event to Kafka Broker
   */
  server.route({
    method: 'POST',
    path: '/kafka/publish',
    handler: async (request, h) => {
      const payload = request.payload || {};
      const topic = payload.topic || 'task-events';
      const messageText = payload.message || 'Sample event payload from Node.js Gateway';

      logger.info(`Publishing event to Kafka topic '${topic}'`);

      if (!kafkaProducer) {
        throw Boom.serverUnavailable('Kafka Producer is not connected to broker');
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
        return {
          status: 'published',
          topic,
          event: record,
          brokers: KAFKA_BROKERS
        };
      } catch (err) {
        logger.error('Failed to publish event to Kafka', { error: err.message });
        throw Boom.internal(err.message);
      }
    }
  });

  /**
   * 9c. Go Prime Factorization Proxy Route -> Go Gin Service
   */
  server.route({
    method: 'GET',
    path: '/calculate/primes/{num}',
    handler: async (request, h) => {
      const num = parseInt(request.params.num, 10);
      if (isNaN(num) || num <= 1) {
        throw Boom.badRequest('Parameter num must be a positive integer greater than 1');
      }

      const tracer = api.trace.getTracer('node-app-tracer');
      return await tracer.startActiveSpan('ProxyPrimeFactorization', async (span) => {
        span.setAttribute('calculation.type', 'prime_factors');
        span.setAttribute('calculation.input', num);

        try {
          // 1. Verify token with auth-service downstream
          const { status: authStatus, data: authData } = await fetchJson('http://auth-service:8082/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'lgtm-secret-token' })
          });

          if (authStatus !== 200 || !authData.verified) {
            logger.warn('Auth-service verification failed.');
            span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'Authentication verification failed' });
            throw Boom.unauthorized('Auth-service verification failed');
          }

          logger.info(`Proxying prime factorization request for N=${num} to Go backend`);
          const { status, data } = await fetchJson(`http://go-app:8083/math/primes/${num}`);
          
          span.setAttribute('calculation.result', JSON.stringify(data.factors || []));
          return h.response(data).code(status);
        } catch (err) {
          span.recordException(err);
          span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
          logger.error('Failed to proxy prime factorization request to Go', { error: err.message });
          if (Boom.isBoom(err)) {
            throw err;
          }
          throw Boom.internal('Failed to contact Go backend');
        } finally {
          span.end();
        }
      });
    }
  });

  /**
   * 9e. Deep Orchestration Proxy Route -> Recommendation Python Service
   */
  server.route({
    method: 'GET',
    path: '/calculate/deep/{num}',
    handler: async (request, h) => {
      const num = parseInt(request.params.num, 10);
      if (isNaN(num) || num <= 1) {
        throw Boom.badRequest('Parameter num must be a positive integer greater than 1');
      }

      const tracer = api.trace.getTracer('node-app-tracer');
      return await tracer.startActiveSpan('ProxyDeepOrchestration', async (span) => {
        span.setAttribute('calculation.type', 'deep_pipeline');
        span.setAttribute('calculation.input', num);

        try {
          // 1. Verify token with auth-service downstream
          const { status: authStatus, data: authData } = await fetchJson('http://auth-service:8082/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'lgtm-secret-token' })
          });

          if (authStatus !== 200 || !authData.verified) {
            logger.warn('Auth-service verification failed.');
            span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'Authentication verification failed' });
            throw Boom.unauthorized('Auth-service verification failed');
          }

          logger.info(`Orchestrating deep pipeline calculation for N=${num}`);
          const { status, data } = await fetchJson(`http://recommendation-service:5001/recommend?num=${num}`);
          
          span.setAttribute('calculation.result', JSON.stringify(data));
          return h.response(data).code(status);
        } catch (err) {
          span.recordException(err);
          span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
          logger.error('Failed deep pipeline orchestration', { error: err.message });
          if (Boom.isBoom(err)) {
            throw err;
          }
          throw Boom.internal('Failed to orchestrate deep pipeline');
        } finally {
          span.end();
        }
      });
    }
  });

  /**
   * 9d. Analytics Statistics Aggregator Route -> Python FastAPI
   */
  server.route({
    method: 'GET',
    path: '/system/summary',
    handler: async (request, h) => {
      logger.info('System summary statistics requested from analytics-service');
      try {
        const { status, data } = await fetchJson('http://analytics-service:8086/metrics/summary');
        return h.response(data).code(status);
      } catch (err) {
        logger.error('Failed to fetch system summary statistics', { error: err.message });
        throw Boom.internal('Failed to contact Analytics backend');
      }
    }
  });

  /**
   * 10. Intentional Error Route
   */
  server.route({
    method: 'GET',
    path: '/error',
    handler: (request, h) => {
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

      throw Boom.internal('Something went wrong (Simulated 500 Error)');
    }
  });

  // ============================================================================
  // DOCUMENTATION & METRICS ENDPOINTS
  // ============================================================================

  server.route({
    method: 'GET',
    path: '/swagger.json',
    options: {
      plugins: { skipAuth: true }
    },
    handler: (request, h) => {
      return swaggerDocument;
    }
  });

  server.route({
    method: 'GET',
    path: '/docs',
    options: {
      plugins: { skipAuth: true }
    },
    handler: (request, h) => {
      return h.response(swaggerUiHtml).type('text/html');
    }
  });

  server.route({
    method: 'GET',
    path: '/metrics',
    options: {
      plugins: { skipAuth: true }
    },
    handler: async (request, h) => {
      try {
        const metrics = await client.register.metrics();
        return h.response(metrics).type(client.register.contentType);
      } catch (err) {
        throw Boom.internal(err);
      }
    }
  });

  // Serve static assets from public/ directory as a fallback catch-all
  server.route({
    method: 'GET',
    path: '/{param*}',
    options: {
      plugins: { skipAuth: true }
    },
    handler: {
      directory: {
        path: path.join(__dirname, 'public'),
        index: false
      }
    }
  });

  await server.start();
  logger.info(`Node.js app (Hapi) listening on port ${PORT}`);
};

process.on('unhandledRejection', (err) => {
  console.error(err);
  process.exit(1);
});

init();
