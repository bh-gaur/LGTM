"""
lgtm-obs: Production-ready OpenTelemetry instrumentation for Python targeting the Grafana LGTM Stack.
"""

import os
import sys
import logging
from typing import Optional, Any

from opentelemetry import trace, metrics
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.propagate import set_global_textmap, inject, extract

__version__ = "0.1.0"
__all__ = [
    "init_observability",
    "get_tracer",
    "get_meter",
    "get_logger",
    "trace",
    "metrics",
    "inject_context",
    "extract_context",
]

# Ensure global textmap uses standard W3C TraceContext
set_global_textmap(TraceContextTextMapPropagator())

class NoOpCounter:
    def add(self, amount: int, attributes: Optional[dict] = None) -> None:
        pass

class NoOpHistogram:
    def record(self, amount: float, attributes: Optional[dict] = None) -> None:
        pass

class ObservabilityManager:
    def __init__(self, service_name: Optional[str] = None, otlp_endpoint: Optional[str] = None):
        self.service_name = service_name or os.getenv("OTEL_SERVICE_NAME", "python-service")
        self.otlp_endpoint = otlp_endpoint or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
        
        env_flag = os.getenv("ENABLE_OBSERVABILITY", "true").lower()
        self.enabled = env_flag not in ["false", "0", "no", "off", "disable", "disabled"]
        
        self.tracer = None
        self.meter = None
        self.logger = None
        self._initialized = False

    def setup(self, app: Optional[Any] = None) -> "ObservabilityManager":
        if self._initialized:
            return self

        if not self.enabled:
            logging.basicConfig(level=logging.INFO)
            self.logger = logging.getLogger(self.service_name)
            self.tracer = trace.get_tracer(self.service_name)
            self.meter = metrics.get_meter(self.service_name)
            self._initialized = True
            return self

        # Setup Core OTel SDK
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

        resource = Resource.create(attributes={
            "service.name": self.service_name,
            "telemetry.sdk.language": "python",
        })

        # 1. Tracing
        trace_provider = TracerProvider(resource=resource)
        trace_exporter = OTLPSpanExporter(endpoint=f"{self.otlp_endpoint}/v1/traces")
        trace_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
        trace.set_tracer_provider(trace_provider)
        self.tracer = trace.get_tracer(f"{self.service_name}-tracer")

        # 2. Structured Logging to Loki
        logger_provider = LoggerProvider(resource=resource)
        set_logger_provider(logger_provider)
        log_exporter = OTLPLogExporter(endpoint=f"{self.otlp_endpoint}/v1/logs")
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

        logging.getLogger().setLevel(logging.INFO)
        logging_handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
        logging.getLogger().addHandler(logging_handler)

        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(logging.Formatter("%(levelname)s:%(name)s:%(message)s"))
        logging.getLogger().addHandler(console_handler)
        self.logger = logging.getLogger(self.service_name)

        # 3. Metrics with Exemplars to Mimir
        metric_reader = PeriodicExportingMetricReader(
            OTLPMetricExporter(endpoint=f"{self.otlp_endpoint}/v1/metrics"),
            export_interval_millis=10000
        )
        meter_provider = MeterProvider(
            metric_readers=[metric_reader],
            resource=resource,
            exemplar_filter=TraceBasedExemplarFilter()
        )
        metrics.set_meter_provider(meter_provider)
        self.meter = metrics.get_meter(f"{self.service_name}-meter")

        # 4. Optional Web Framework & Database Instrumentation
        if app is not None:
            self.instrument_app(app)

        self._auto_instrument_libraries()
        self._initialized = True
        return self

    def instrument_app(self, app: Any) -> None:
        """Instruments Flask or FastAPI app if installed."""
        app_class = app.__class__.__name__
        try:
            if app_class == "FastAPI":
                from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
                FastAPIInstrumentor().instrument_app(app)
            elif app_class == "Flask":
                from opentelemetry.instrumentation.flask import FlaskInstrumentor
                FlaskInstrumentor().instrument_app(app)
        except Exception as e:
            if self.logger:
                self.logger.warning(f"Could not auto-instrument app {app_class}: {e}")

    def _auto_instrument_libraries(self) -> None:
        """Attempts to auto-instrument Psycopg2 and Kafka if available in environment."""
        try:
            from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor
            Psycopg2Instrumentor().instrument()
        except Exception:
            pass

        try:
            from opentelemetry.instrumentation.kafka import KafkaInstrumentor
            KafkaInstrumentor().instrument()
        except Exception:
            pass

        try:
            from opentelemetry.instrumentation.requests import RequestsInstrumentor
            RequestsInstrumentor().instrument()
        except Exception:
            pass

_global_manager: Optional[ObservabilityManager] = None

def init_observability(app: Optional[Any] = None, service_name: Optional[str] = None, otlp_endpoint: Optional[str] = None) -> ObservabilityManager:
    """Initialize full-stack OpenTelemetry observability for Python applications."""
    global _global_manager
    if _global_manager is None:
        _global_manager = ObservabilityManager(service_name=service_name, otlp_endpoint=otlp_endpoint)
        _global_manager.setup(app)
    elif app is not None:
        _global_manager.instrument_app(app)
    return _global_manager

def get_tracer(name: Optional[str] = None):
    return trace.get_tracer(name or "lgtm-tracer")

def get_meter(name: Optional[str] = None):
    return metrics.get_meter(name or "lgtm-meter")

def get_logger(name: Optional[str] = None) -> logging.Logger:
    if _global_manager and _global_manager.logger:
        return _global_manager.logger
    return logging.getLogger(name or "lgtm-logger")

def inject_context(carrier: dict) -> dict:
    """Injects current W3C TraceContext into dictionary headers (REST or Kafka)."""
    inject(carrier)
    return carrier

def extract_context(carrier: dict):
    """Extracts W3C TraceContext from incoming dictionary headers."""
    return extract(carrier)
