import os
import sys
import logging
import psycopg2
from fastapi import FastAPI, Request

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.obs import (
    logger,
    setup_observability,
    trace
)

app = FastAPI()

# Instrument FastAPI with OTel
setup_observability(app)

tracer = trace.get_tracer("analytics-service-tracer")

# PostgreSQL credentials
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", 5432))
POSTGRES_DB = os.environ.get("POSTGRES_DB", "lgtmdb")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "lgtmuser")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "lgtmpass")

# Health check
@app.get("/health")
def health():
    return {"status": "healthy", "service": "analytics-service"}

@app.get("/metrics/summary")
def get_metrics_summary():
    logger.info("Analytics metrics summary requested.")
    
    # Query Database inside an active tracing span
    with tracer.start_as_current_span("QueryDatabaseStats") as span:
        try:
            conn = psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                database=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                connect_timeout=5
            )
            cursor = conn.cursor()
            
            # Check public schemas
            cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")
            tables_count = cursor.fetchone()[0]
            
            cursor.close()
            conn.close()
            
            span.set_attribute("db.tables_count", tables_count)
            logger.info(f"Database statistics checked. Public tables count: {tables_count}")
            
            return {
                "service": "analytics-service",
                "tables_count": tables_count,
                "status": "success"
            }
        except Exception as e:
            span.record_exception(e)
            logger.error(f"Error querying database stats: {e}")
            return {
                "service": "analytics-service",
                "tables_count": 0,
                "status": "error",
                "message": str(e)
            }

@app.post("/analytics/compute-deep")
async def compute_deep(req: Request):
    req_data = await req.json() or {}
    sum_val = req_data.get("sum", 0)
    logger.info(f"[ANALYTICS-SERVICE] Running deep compute for sum={sum_val}")
    
    import urllib.request
    import json
    from opentelemetry import propagate
    
    with tracer.start_as_current_span("QueryAnalyticsDeep") as span:
        try:
            conn = psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                database=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                connect_timeout=5
            )
            cursor = conn.cursor()
            cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")
            count = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            span.set_attribute("db.tables_count", count)
        except Exception as e:
            logger.warning(f"DB check failed in compute_deep: {e}")
            count = 0

    # Propagate context and call audit-service
    headers = {}
    propagate.inject(headers)
    
    payload = {
        "number": sum_val,
        "tables_count": count
    }
    
    req_out = urllib.request.Request(
        "http://audit-service:5002/audit/log",
        data=json.dumps(payload).encode("utf-8"),
        headers={**headers, "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req_out) as response:
            res_data = json.loads(response.read().decode())
    except Exception as err:
        logger.warning(f"Call to audit-service failed: {err}")
        res_data = {"status": "error", "message": str(err)}
        
    return {
        "service": "analytics-service",
        "tables_count": count,
        "audit_log": res_data
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8086))
    uvicorn.run(app, host="0.0.0.0", port=port)
