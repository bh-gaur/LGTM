import os
import sys
import json
import logging
import threading
import time
from fastapi import FastAPI
from kafka import KafkaConsumer

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.obs import (
    logger,
    setup_observability,
    trace
)

app = FastAPI()

# Instrument FastAPI with OTel
setup_observability(app)

tracer = trace.get_tracer("notification-service-tracer")

# Health check
@app.get("/health")
def health():
    return {"status": "healthy", "service": "notification-service"}

def start_kafka_consumer():
    kafka_brokers = os.getenv("KAFKA_BROKERS", "kafka:9092")
    
    def consume_loop():
        # Wait for Kafka to boot
        time.sleep(10)
        logger.info(f"Connecting notification-service consumer to brokers: {kafka_brokers}")
        
        while True:
            try:
                consumer = KafkaConsumer(
                    "task-events",
                    bootstrap_servers=kafka_brokers.split(","),
                    group_id="notification-group",
                    auto_offset_reset="latest",
                    value_deserializer=lambda x: json.loads(x.decode("utf-8"))
                )
                logger.info("Notification Kafka Consumer connected successfully.")
                
                from opentelemetry import propagate

                for msg in consumer:
                    event = msg.value
                    logger.info(f"Notification service consumed message: {event}")
                    
                    # Extract trace context from Kafka headers
                    headers_dict = {}
                    if msg.headers:
                        for k, v in msg.headers:
                            try:
                                headers_dict[k] = v.decode('utf-8') if isinstance(v, bytes) else str(v)
                            except Exception:
                                pass
                    
                    parent_context = propagate.extract(headers_dict)
                    
                    # Process inside trace context
                    with tracer.start_as_current_span("ProcessNotificationEvent", context=parent_context) as span:
                        span.set_attribute("notification.event_type", event.get("type", "unknown"))
                        logger.info(f"[NOTIFICATION-DISPATCH] Dispatched simulated notification for task: {event}")
            
            except Exception as e:
                logger.warning(f"Kafka consumer connection retry in 5s: {e}")
                time.sleep(5)
                
    t = threading.Thread(target=consume_loop, daemon=True)
    t.start()

# Start consumer thread on startup
start_kafka_consumer()

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8084))
    uvicorn.run(app, host="0.0.0.0", port=port)
