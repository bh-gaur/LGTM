import os
import time
import logging
from flask import Flask, jsonify, request

from opentelemetry import trace, metrics
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource

from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.instrumentation.flask import FlaskInstrumentor

# Define shared resource attributes
resource = Resource.create(attributes={"service.name": "python-app"})

# 1. Configure manual OTel tracer provider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

trace_provider = TracerProvider(resource=resource)
trace.set_tracer_provider(trace_provider)
trace_exporter = OTLPSpanExporter(endpoint="http://alloy:4318/v1/traces")
trace_provider.add_span_processor(BatchSpanProcessor(trace_exporter))

# 2. Configure manual OTel logger provider for reliable log exporting to Loki via Alloy
logger_provider = LoggerProvider(resource=resource)
set_logger_provider(logger_provider)
log_exporter = OTLPLogExporter(endpoint="http://alloy:4318/v1/logs")
logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

# Explicitly set root logger level to INFO
logging.getLogger().setLevel(logging.INFO)

# Attach OTel logging handler to root logger
logging_handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
logging.getLogger().addHandler(logging_handler)

# Configure console logging manually (basicConfig does nothing if handlers are already present)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_formatter = logging.Formatter('%(levelname)s:%(name)s:%(message)s')
console_handler.setFormatter(console_formatter)
logging.getLogger().addHandler(console_handler)

logger = logging.getLogger("python-app")

# Note: We intentionally DO NOT call LoggingInstrumentor().instrument() here.
# This prevents OpenTelemetry from writing duplicate/redundant 'trace_id' and 'span_id'
# keys into the log attributes, keeping only the clean, standard OTLP envelope traceid.

# 3. Configure manual OTel meter provider to force rapid 10s metric flushes with TraceBasedExemplarFilter
from opentelemetry.sdk.metrics._internal.exemplar import TraceBasedExemplarFilter

metric_reader = PeriodicExportingMetricReader(
    OTLPMetricExporter(endpoint="http://alloy:4318/v1/metrics"),
    export_interval_millis=10000
)
meter_provider = MeterProvider(
    metric_readers=[metric_reader],
    resource=resource,
    exemplar_filter=TraceBasedExemplarFilter()
)
metrics.set_meter_provider(meter_provider)

meter = metrics.get_meter("python-app-meter")
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

app = Flask(__name__)

# Instrument Flask
FlaskInstrumentor().instrument_app(app)

@app.route("/")
def index():
    logger.info("Python application index route triggered.")
    return jsonify({"message": "Hello from Python App!"})

# Base /data route
@app.route("/data")
def data():
    logger.info("Python application /data route processing a request.")
    calculation = sum(range(1, 10001))
    logger.info(f"Python application calculation completed: {calculation}")
    return jsonify({
        "status": "success",
        "calculation_result": calculation,
        "service": "python-app"
    })

# Analyze POST route with custom counter metric
@app.route("/analyze", methods=["POST"])
def analyze():
    logger.info("Python application /analyze route triggered (POST).")
    req_data = request.get_json() or {}
    number = req_data.get("number", 0)
    calc_type = req_data.get("type", "unknown")
    
    # Increment custom metric counter
    analysis_counter.add(1, {"calculation_type": calc_type})
    logger.info(f"Analyzing calculation value: {number} from type: {calc_type}")

    # Simulate some analysis properties
    is_even = (number % 2 == 0)
    length = len(str(number))
    
    logger.info(f"Analysis result: is_even={is_even}, length={length}")
    
    return jsonify({
        "status": "analyzed",
        "value": number,
        "is_even": is_even,
        "digits": length,
        "service": "python-app"
    })

# Heavy Downstream Analysis simulation (demonstrates nested Spans & Histograms)
@app.route("/heavy-analysis", methods=["POST"])
def heavy_analysis():
    logger.info("Python application /heavy-analysis route triggered (POST).")
    req_data = request.get_json() or {}
    dataset_id = req_data.get("dataset_id", 0)
    tasks = req_data.get("tasks", [])

    tracer = trace.get_tracer("python-app-tracer")
    start_time = time.time()
    
    # Create custom inner span
    with tracer.start_as_current_span("HeavyAnalysisCompute") as span:
        logger.info(f"Starting analysis compute for dataset ID: {dataset_id}")
        span.set_attribute("analysis.dataset_id", dataset_id)
        span.set_attribute("analysis.tasks_count", len(tasks))
        
        # Simulate processing duration
        time.sleep(0.15) 
        
        # Increment metric counters
        processed_items_counter.add(10, {"status": "success", "type": "dataset_records"})
        logger.info(f"Finished analysis compute for dataset ID: {dataset_id}")

    duration = time.time() - start_time
    task_duration_histogram.record(duration, {"task_type": "dataset_processing"})
    
    return jsonify({
        "status": "success",
        "dataset_id": dataset_id,
        "computed_tasks": tasks,
        "compute_duration_sec": duration,
        "service": "python-app"
    })

# Intentionally failing endpoint with nested spans and recorded exceptions
@app.route("/faulty-endpoint")
def faulty_endpoint():
    logger.info("Python application /faulty-endpoint triggered.")
    
    tracer = trace.get_tracer("python-app-tracer")
    with tracer.start_as_current_span("DatabaseWrite") as span:
        span.set_attribute("db.operation", "INSERT")
        span.set_attribute("db.table", "users_table")
        
        # Simulate db operation
        time.sleep(0.05)
        
        # Simulate database deadlock / write crash
        err = RuntimeError("Simulated Database Transaction Lock Timeout")
        logger.error(f"Database write crash: {str(err)}")
        
        # Mark span with error status and record exception
        span.set_status(trace.StatusCode.ERROR, str(err))
        span.record_exception(err)
        
    return jsonify({
        "status": "error",
        "error_type": "database_error",
        "message": str(err)
    }), 500

# Database user lookup simulation route (sets trace error if invalid)
@app.route("/db/user/<user_id>")
def db_user(user_id):
    logger.info(f"Simulating database query for user_id: {user_id}")
    
    if user_id.isdigit():
        return jsonify({
            "id": int(user_id),
            "name": f"Mock User {user_id}",
            "email": f"user{user_id}@example.local",
            "role": "editor" if int(user_id) % 2 == 0 else "viewer"
        })
    else:
        logger.warning(f"Database lookup failed. Invalid non-numeric user_id format: '{user_id}'")
        
        current_span = trace.get_current_span()
        if current_span:
            current_span.set_status(trace.StatusCode.ERROR, f"Invalid non-numeric user ID: {user_id}")
            current_span.record_exception(ValueError(f"Invalid non-numeric user ID format: {user_id}"))
            
        return jsonify({
            "status": "error",
            "message": f"User ID must be an integer. Received: '{user_id}'"
        }), 404

swagger_document = {
    "openapi": "3.0.0",
    "info": {
        "title": "Python Flask App API",
        "version": "1.0.0",
        "description": "API Documentation for Python Flask App in LGTM Stack"
    },
    "paths": {
        "/": {
            "get": {
                "summary": "Root / Index",
                "responses": {
                    "200": { "description": "Success" }
                }
            }
        },
        "/data": {
            "get": {
                "summary": "Retrieve Sum Calculation",
                "responses": {
                    "200": { "description": "Success" }
                }
            }
        },
        "/analyze": {
            "post": {
                "summary": "Analyze Number Properties",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "number": { "type": "integer" },
                                    "type": { "type": "string" }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": { "description": "Success" }
                }
            }
        },
        "/heavy-analysis": {
            "post": {
                "summary": "Heavy Compute Simulation",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "dataset_id": { "type": "integer" },
                                    "tasks": { "type": "array", "items": { "type": "string" } }
                                }
                            }
                        }
                    }
                },
                "responses": {
                    "200": { "description": "Success" }
                }
            }
        },
        "/faulty-endpoint": {
            "get": {
                "summary": "Faulty Database write simulation",
                "responses": {
                    "500": { "description": "Internal Server Error" }
                }
            }
        },
        "/db/user/{user_id}": {
            "get": {
                "summary": "Query user details",
                "parameters": [
                    {
                        "name": "user_id",
                        "in": "path",
                        "required": True,
                        "schema": { "type": "string" },
                        "description": "The user ID to fetch"
                    }
                ],
                "responses": {
                    "200": { "description": "Success" },
                    "404": { "description": "User Not Found" }
                }
            }
        }
    }
}

@app.route("/swagger.json")
def swagger_json():
    return jsonify(swagger_document)

@app.route("/docs")
def docs():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Python App API Docs</title>
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
    """

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
