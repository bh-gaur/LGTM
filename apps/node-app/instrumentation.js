const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { SimpleLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
const { logs } = require('@opentelemetry/api-logs');

// 1. Manually configure and register the global LoggerProvider
const loggerProvider = new LoggerProvider({
  processors: [
    new SimpleLogRecordProcessor(new OTLPLogExporter({
      url: 'http://alloy:4318/v1/logs',
    }))
  ]
});
logs.setGlobalLoggerProvider(loggerProvider);

// 2. Initialize NodeSDK
const sdk = new NodeSDK({
  serviceName: 'node-app',
  traceExporter: new OTLPTraceExporter({
    url: 'http://alloy:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://alloy:4318/v1/metrics',
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
