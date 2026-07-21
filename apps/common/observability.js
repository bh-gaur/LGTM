const http = require('http');
const winston = require('winston');
const Transport = require('winston-transport');
const api = require('@opentelemetry/api');
const client = require('prom-client');

// Global Feature Flag to Toggle Observability
const enableObsEnv = (process.env.ENABLE_OBSERVABILITY || 'true').toLowerCase();
const isObservabilityEnabled = !['false', '0', 'no', 'off', 'disable', 'disabled'].includes(enableObsEnv);

if (isObservabilityEnabled) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { BatchLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
  const { logs } = require('@opentelemetry/api-logs');

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://alloy:4318';
  const otlpLogsEndpoint = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || `${otlpEndpoint}/v1/logs`;
  const otlpTracesEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `${otlpEndpoint}/v1/traces`;
  const otlpMetricsEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || `${otlpEndpoint}/v1/metrics`;

  const { W3CTraceContextPropagator } = require('@opentelemetry/core');

  // 1. Configure OpenTelemetry LoggerProvider (Batch processing for high performance)
  const loggerProvider = new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({
        url: otlpLogsEndpoint,
      }))
    ]
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  // 2. Initialize OpenTelemetry NodeSDK
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'node-app',
    textMapPropagator: new W3CTraceContextPropagator(),
    traceExporter: new OTLPTraceExporter({
      url: otlpTracesEndpoint,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: otlpMetricsEndpoint,
      }),
      exportIntervalMillis: 10000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-winston': {
          enabled: true,
          disableLogSending: true,
        },
      }),
    ],
  });

  sdk.start();
  console.log('[*] OpenTelemetry SDK initialized successfully');
} else {
  console.log('[!] Observability is DISABLED via ENABLE_OBSERVABILITY flag');
}

// 3. Configure Prom-client Metrics
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
  if (!isObservabilityEnabled) return undefined;
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

// 4. Custom Winston OTel Log Transport
class OTelLogTransport extends Transport {
  constructor(opts) {
    super(opts);
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://alloy:4318';
    this.url = (opts && opts.url) || process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || `${otlpEndpoint}/v1/logs`;
  }

  log(info, callback) {
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
            { key: 'service.name', value: { stringValue: process.env.OTEL_SERVICE_NAME || 'node-app' } }
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

const transports = [new winston.transports.Console()];
if (isObservabilityEnabled) {
  transports.push(new OTelLogTransport({ url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || 'http://alloy:4318/v1/logs' }));
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports
});

module.exports = {
  api,
  client,
  logger,
  calculationCounter,
  errorCounter,
  taskDurationHistogram,
  activeUsersGauge,
  getActiveExemplar,
  isObservabilityEnabled
};
