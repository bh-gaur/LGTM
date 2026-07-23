import os
import logging

# Global Feature Flag to Toggle Observability
enable_obs_env = os.getenv("ENABLE_OBSERVABILITY", "true").lower()
is_obs_enabled = enable_obs_env not in ["false", "0", "no", "off", "disable", "disabled"]

service_name = os.getenv("OTEL_SERVICE_NAME", "python-app")

if is_obs_enabled:
    from opentelemetry import trace, metrics
    from opentelemetry._logs import set_logger_provider
    from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
    from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
    from opentelemetry.sdk.resources import Resource

    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.sdk.metrics._internal.exemplar import TraceBasedExemplarFilter
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
    from opentelemetry.propagate import set_global_textmap

    set_global_textmap(TraceContextTextMapPropagator())

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://alloy:4318")
    resource = Resource.create(attributes={"service.name": service_name})

    # 1. Configure manual OTel tracer provider
    trace_provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(trace_provider)
    trace_exporter = OTLPSpanExporter(endpoint=f"{otlp_endpoint}/v1/traces")
    trace_provider.add_span_processor(BatchSpanProcessor(trace_exporter))

    # 2. Configure manual OTel logger provider
    logger_provider = LoggerProvider(resource=resource)
    set_logger_provider(logger_provider)
    log_exporter = OTLPLogExporter(endpoint=f"{otlp_endpoint}/v1/logs")
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

    logging.getLogger().setLevel(logging.INFO)
    logging_handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
    logging.getLogger().addHandler(logging_handler)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter('%(levelname)s:%(name)s:%(message)s')
    console_handler.setFormatter(console_formatter)
    logging.getLogger().addHandler(console_handler)

    logger = logging.getLogger(service_name)

    # 3. Configure manual OTel meter provider
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=f"{otlp_endpoint}/v1/metrics"),
        export_interval_millis=10000
    )
    meter_provider = MeterProvider(
        metric_readers=[metric_reader],
        resource=resource,
        exemplar_filter=TraceBasedExemplarFilter()
    )
    metrics.set_meter_provider(meter_provider)

    meter = metrics.get_meter(f"{service_name}-meter")
    analysis_counter = meter.create_counter(
        name="python_analysis_ops_total",
        description="Total number of analysis operations executed in Python"
    )
    task_duration_histogram = meter.create_histogram(
        name="python_task_duration_seconds",
        description="Duration of python analysis tasks",
        unit="s"
    )
    processed_items_counter = meter.create_counter(
        name="python_processed_items_total",
        description="Total number of data items processed in Python"
    )

    def setup_observability(app):
        """Instruments Flask or FastAPI app, Psycopg2 database, and Kafka messaging with OpenTelemetry."""
        if app.__class__.__name__ == "FastAPI":
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            FastAPIInstrumentor().instrument_app(app)
        else:
            from opentelemetry.instrumentation.flask import FlaskInstrumentor
            FlaskInstrumentor().instrument_app(app)
        try:
            from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor
            Psycopg2Instrumentor().instrument()
        except Exception as e:
            logger.warning(f"Psycopg2Instrumentor warning: {e}")
        try:
            from opentelemetry.instrumentation.kafka import KafkaInstrumentor
            KafkaInstrumentor().instrument()
        except Exception as e:
            logger.warning(f"KafkaInstrumentor warning: {e}")

else:
    print(f"[!] Observability is DISABLED for {service_name} via ENABLE_OBSERVABILITY flag")

    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(service_name)

    class NoOpCounter:
        def add(self, amount, attributes=None):
            pass

    class NoOpHistogram:
        def record(self, amount, attributes=None):
            pass

    analysis_counter = NoOpCounter()
    task_duration_histogram = NoOpHistogram()
    processed_items_counter = NoOpCounter()

    def setup_observability(app: Flask):
        """No-Op setup when observability is disabled."""
        pass
