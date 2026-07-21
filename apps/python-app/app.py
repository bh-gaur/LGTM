import os
import sys
import time
import random
from flask import Flask, jsonify, request
import psycopg2
from psycopg2 import pool
from opentelemetry import trace, metrics

# Add parent directory to sys.path to resolve common.obs
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.obs import (
    logger,
    analysis_counter,
    task_duration_histogram,
    processed_items_counter,
    setup_observability
)
from swagger import SWAGGER_DOCUMENT, SWAGGER_UI_HTML

# Track application start time for uptime diagnostics
PROCESS_START_TIME = time.time()

# PostgreSQL Database Configuration
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.environ.get("POSTGRES_PORT", 5432))
POSTGRES_DB = os.environ.get("POSTGRES_DB", "lgtmdb")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "lgtmuser")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "lgtmpass")

db_pool = None

def init_db():
    """Initializes PostgreSQL connection pool and seeds users table."""
    global db_pool
    try:
        db_pool = psycopg2.pool.SimpleConnectionPool(
            1, 10,
            host=POSTGRES_HOST,
            port=POSTGRES_PORT,
            dbname=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD
        )
        conn = db_pool.getconn()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT PRIMARY KEY,
                    name VARCHAR(100),
                    email VARCHAR(100),
                    role VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("""
                INSERT INTO users (id, name, email, role)
                VALUES 
                    (42, 'Alice Smith', 'alice@lgtm.local', 'editor'),
                    (108, 'Bob Jones', 'bob@lgtm.local', 'viewer'),
                    (200, 'Charlie Dev', 'charlie@lgtm.local', 'admin')
                ON CONFLICT (id) DO NOTHING;
            """)
            conn.commit()
        db_pool.putconn(conn)
        logger.info("Successfully connected to PostgreSQL database and initialized users table.")
    except Exception as e:
        logger.warning(f"PostgreSQL connection / initialization warning: {e}")

# ============================================================================
# INITIALIZATION & CONFIGURATION
# ============================================================================

app = Flask(__name__)

# Instrument Flask with OpenTelemetry
setup_observability(app)

tracer = trace.get_tracer("python-app-tracer")

# Initialize database pool
init_db()

# ============================================================================
# APPLICATION ROUTES
# ============================================================================

@app.route("/")
def index():
    """Root / Health Check endpoint."""
    logger.info("Python application index route triggered.")
    return jsonify({"message": "Hello from Python App!"})


@app.route("/data")
def data():
    """Simple calculation endpoint called downstream by Node.js app."""
    logger.info("Python application /data route processing a request.")
    calculation = sum(range(1, 10001))
    logger.info(f"Python application calculation completed: {calculation}")
    return jsonify({
        "status": "success",
        "calculation_result": calculation,
        "service": "python-app"
    })


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Analyzes calculation properties received from downstream.
    Increments `python_analysis_ops_total` Prometheus counter.
    """
    logger.info("Python application /analyze route triggered (POST).")
    req_data = request.get_json() or {}
    number = req_data.get("number", 0)
    calc_type = req_data.get("type", "unknown")
    
    analysis_counter.add(1, {"calculation_type": calc_type})
    logger.info(f"Analyzing calculation value: {number} from type: {calc_type}")

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


@app.route("/heavy-analysis", methods=["POST"])
def heavy_analysis():
    """
    Simulates heavy compute tasks.
    Creates a custom inner span (`HeavyAnalysisCompute`) and records duration histogram.
    """
    logger.info("Python application /heavy-analysis route triggered (POST).")
    req_data = request.get_json() or {}
    dataset_id = req_data.get("dataset_id", 0)
    tasks = req_data.get("tasks", [])

    start_time = time.time()
    
    with tracer.start_as_current_span("HeavyAnalysisCompute") as span:
        logger.info(f"Starting analysis compute for dataset ID: {dataset_id}")
        span.set_attribute("analysis.dataset_id", dataset_id)
        span.set_attribute("analysis.tasks_count", len(tasks))
        
        time.sleep(0.15)
        
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


@app.route("/math/prime-factors/<int:n>")
def prime_factors(n):
    """
    Computes prime factorization of integer n.
    Captures custom span attributes `math.input` and `math.factors`.
    """
    logger.info(f"Computing prime factors for N={n}")
    
    with tracer.start_as_current_span("PrimeFactorization") as span:
        span.set_attribute("math.input", n)
        
        factors = []
        d = 2
        temp_n = n
        while temp_n >= 2:
            while temp_n % d == 0:
                factors.append(d)
                temp_n //= d
            d += 1
            if d * d > temp_n:
                if temp_n > 1:
                    factors.append(temp_n)
                break
                
        span.set_attribute("math.factors_count", len(factors))
        span.set_attribute("math.is_prime", len(factors) == 1)
        
        logger.info(f"Prime factorization for N={n} completed: {factors}")
        
    return jsonify({
        "status": "success",
        "number": n,
        "factors": factors,
        "is_prime": len(factors) == 1,
        "service": "python-app"
    })


@app.route("/text/analyze", methods=["POST"])
def text_analyze():
    """
    Performs text sentiment & statistics analysis.
    Records duration histogram and increments processed items counter.
    """
    logger.info("Python application /text/analyze triggered (POST).")
    req_data = request.get_json() or {}
    text = req_data.get("text", "")
    
    start_time = time.time()
    
    with tracer.start_as_current_span("TextSentimentAnalysis") as span:
        span.set_attribute("text.length", len(text))
        
        words = text.split()
        word_count = len(words)
        span.set_attribute("text.word_count", word_count)
        
        pos_words = {"good", "great", "awesome", "excellent", "happy", "love", "fast", "amazing", "success", "healthy"}
        neg_words = {"bad", "poor", "slow", "error", "fail", "terrible", "crash", "wrong", "hate", "fault"}
        
        score = 0
        for w in words:
            w_clean = w.lower().strip(".,!?")
            if w_clean in pos_words:
                score += 1
            elif w_clean in neg_words:
                score -= 1
                
        sentiment = "positive" if score > 0 else ("negative" if score < 0 else "neutral")
        span.set_attribute("text.sentiment", sentiment)
        span.set_attribute("text.sentiment_score", score)
        
        processed_items_counter.add(word_count, {"status": "analyzed", "type": "words"})
        logger.info(f"Text analysis completed. Words={word_count}, Sentiment={sentiment}")

    duration = time.time() - start_time
    task_duration_histogram.record(duration, {"task_type": "text_analysis"})
    
    return jsonify({
        "status": "success",
        "text_length": len(text),
        "word_count": word_count,
        "sentiment": sentiment,
        "sentiment_score": score,
        "service": "python-app"
    })


@app.route("/data/aggregate", methods=["POST"])
def data_aggregate():
    """
    Performs statistical aggregation (sum, mean, min, max) on input array.
    """
    logger.info("Python application /data/aggregate triggered (POST).")
    req_data = request.get_json() or {}
    values = req_data.get("values", [])
    
    if not isinstance(values, list) or len(values) == 0:
        return jsonify({"status": "error", "message": "Field 'values' must be a non-empty array of numbers"}), 400
        
    nums = [float(x) for x in values if isinstance(x, (int, float))]
    if not nums:
        return jsonify({"status": "error", "message": "No valid numeric values provided"}), 400

    total = sum(nums)
    avg = total / len(nums)
    minimum = min(nums)
    maximum = max(nums)

    analysis_counter.add(1, {"calculation_type": "data_aggregate"})
    logger.info(f"Data aggregation completed for {len(nums)} items. Mean={avg:.2f}")

    return jsonify({
        "status": "success",
        "count": len(nums),
        "sum": total,
        "mean": round(avg, 2),
        "min": minimum,
        "max": maximum,
        "service": "python-app"
    })


@app.route("/system/status")
def system_status():
    """
    Returns simulated system diagnostics (CPU, Memory, Disk, Status).
    """
    logger.info("Python application /system/status triggered.")
    
    cpu_usage = round(random.uniform(15.0, 75.0), 1)
    memory_usage = round(random.uniform(40.0, 85.0), 1)
    
    return jsonify({
        "status": "healthy",
        "service": "python-app",
        "cpu_usage_pct": cpu_usage,
        "memory_usage_pct": memory_usage,
        "active_threads": random.randint(4, 16),
        "uptime_seconds": round(time.time() - PROCESS_START_TIME, 1)
    })


@app.route("/faulty-endpoint")
def faulty_endpoint():
    """
    Simulates a database failure (500 Internal Server Error).
    Records exception and marks span status as ERROR for debugging in Tempo/Loki.
    """
    logger.info("Python application /faulty-endpoint triggered.")
    
    with tracer.start_as_current_span("DatabaseWrite") as span:
        span.set_attribute("db.system", "postgresql")
        span.set_attribute("db.operation", "INSERT")
        span.set_attribute("db.table", "users_table")
        
        time.sleep(0.05)
        
        err = RuntimeError("Simulated Database Transaction Lock Timeout")
        logger.error(f"Database write crash: {str(err)}")
        
        span.set_status(trace.StatusCode.ERROR, str(err))
        span.record_exception(err)
        
    return jsonify({
        "status": "error",
        "error_type": "database_error",
        "message": str(err)
    }), 500


@app.route("/db/user/<user_id>")
def db_user(user_id):
    """
    Queries user details from PostgreSQL database (or falls back to mock user).
    """
    logger.info(f"Querying database for user_id: {user_id}")
    
    if not user_id.isdigit():
        logger.warning(f"Database lookup failed. Invalid non-numeric user_id format: '{user_id}'")
        current_span = trace.get_current_span()
        if current_span:
            current_span.set_status(trace.StatusCode.ERROR, f"Invalid non-numeric user ID: {user_id}")
            current_span.record_exception(ValueError(f"Invalid non-numeric user ID format: {user_id}"))
        return jsonify({
            "status": "error",
            "message": f"User ID must be an integer. Received: '{user_id}'"
        }), 404

    uid = int(user_id)
    if db_pool:
        conn = None
        try:
            conn = db_pool.getconn()
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, email, role, created_at FROM users WHERE id = %s;", (uid,))
                row = cur.fetchone()
                if row:
                    return jsonify({
                        "id": row[0],
                        "name": row[1],
                        "email": row[2],
                        "role": row[3],
                        "created_at": str(row[4]),
                        "database": "postgresql"
                    })
        except Exception as err:
            logger.error(f"PostgreSQL query error: {err}")
        finally:
            if conn:
                db_pool.putconn(conn)

    return jsonify({
        "id": uid,
        "name": f"Mock User {uid}",
        "email": f"user{uid}@example.local",
        "role": "editor" if uid % 2 == 0 else "viewer",
        "database": "mock_fallback"
    })

# ============================================================================
# DOCUMENTATION ENDPOINTS
# ============================================================================

@app.route("/swagger.json")
def swagger_json():
    return jsonify(SWAGGER_DOCUMENT)


@app.route("/docs")
def docs():
    return SWAGGER_UI_HTML

# ============================================================================
# SERVER INITIALIZATION
# ============================================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
