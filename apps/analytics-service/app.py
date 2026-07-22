import os
import sys
import logging
import psycopg2
from fastapi import FastAPI

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

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8086))
    uvicorn.run(app, host="0.0.0.0", port=port)
