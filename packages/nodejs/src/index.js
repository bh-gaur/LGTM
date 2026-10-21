const http = require('http');
const winston = require('winston');
const Transport = require('winston-transport');
const api = require('@opentelemetry/api');
const client = require('prom-client');

const enableObsEnv = (process.env.ENABLE_OBSERVABILITY || 'true').toLowerCase();
const isObservabilityEnabled = !['false', '0', 'no', 'off', 'disable', 'disabled'].includes(enableObsEnv);

let sdkInstance = null;
let loggerInstance = null;

// Helper to get active trace context for Prometheus Exemplars
function getActiveExemplar() {
  if (!isObservabilityEnabled) return undefined;
  const activeSpan = api.trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    if (spanContext && (spanContext.traceFlags & api.TraceFlags.SAMPLED)) {
      return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
      };
    }
  }
  return undefined;
}

// Custom Winston OTel Log Transport targeting Loki
class OTelLogTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    const otlpEndpoint = opts.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
    this.url = opts.url || process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || `${otlpEndpoint}/v1/logs`;
    this.serviceName = opts.serviceName || process.env.OTEL_SERVICE_NAME || 'node-service';
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

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
            { key: 'service.name', value: { stringValue: this.serviceName } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } }
          ]
        },
        scopeLogs: [{
          scope: { name: 'lgtm-winston-transport' },
          logRecords: [{
            timeUnixNano: String(Date.now() * 1000000),
            body: { stringValue: typeof info.message === 'string' ? info.message : JSON.stringify(info.message) },
            severityText: (info.level || 'info').toUpperCase(),
            severityNumber: info.level === 'error' ? 17 : (info.level === 'warn' ? 13 : 9),
            traceId: traceId,
            spanId: spanId
          }]
        }]
      }]
    };

    const data = JSON.stringify(payload);
    try {
      const parsedUrl = new URL(this.url);
      const req = http.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        res.resume();
      });
      req.on('error', () => {});
      req.write(data);
      req.end();
    } catch (e) {}

    callback();
  }
}

function initObservability(options = {}) {
  const serviceName = options.serviceName || process.env.OTEL_SERVICE_NAME || 'node-service';
  const otlpEndpoint = options.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

  if (isObservabilityEnabled && !sdkInstance) {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
    const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
    const { W3CTraceContextPropagator } = require('@opentelemetry/core');

    sdkInstance = new NodeSDK({
      serviceName,
      textMapPropagator: new W3CTraceContextPropagator(),
      traceExporter: new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${otlpEndpoint}/v1/metrics`,
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

    sdkInstance.start();
  }

  // Configure Winston Logger with Trace Correlation
  const winstonFormatWithTrace = winston.format((info) => {
    const span = api.trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      if (spanContext && api.trace.isSpanContextValid(spanContext)) {
        info.trace_id = spanContext.traceId;
        info.span_id = spanContext.spanId;
      }
    }
    return info;
  });

  const transports = [new winston.transports.Console()];
  if (isObservabilityEnabled) {
    transports.push(new OTelLogTransport({ otlpEndpoint, serviceName }));
  }

  loggerInstance = winston.createLogger({
    level: options.logLevel || 'info',
    format: winston.format.combine(
      winstonFormatWithTrace(),
      winston.format.json()
    ),
    transports
  });

  client.register.setContentType(client.Registry.OPENMETRICS_CONTENT_TYPE);

  return {
    api,
    client,
    logger: loggerInstance,
    getActiveExemplar,
    sdk: sdkInstance,
  };
}

module.exports = {
  initObservability,
  api,
  client,
  getActiveExemplar,
  get logger() {
    return loggerInstance || winston;
  }
};
