#!/usr/bin/env python3
import time
import json
import urllib.request
import urllib.error
import secrets

# Base URL of the Grafana Alloy OTLP HTTP receiver
OTLP_HTTP_BASE = "http://localhost:4318"

def generate_ids():
    """Generate OTel compliant hex string IDs."""
    trace_id = secrets.token_hex(16)  # 32 hex characters
    span_id = secrets.token_hex(8)    # 16 hex characters
    return trace_id, span_id

def send_payload(endpoint, payload):
    url = f"{OTLP_HTTP_BASE}{endpoint}"
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as res:
            return res.read().decode('utf-8'), res.status
    except urllib.error.HTTPError as e:
        print(f"[-] HTTP Error {e.code} for {endpoint}: {e.reason}")
        print(e.read().decode('utf-8'))
        raise
    except Exception as e:
        print(f"[-] Connection failed to {url}: {e}")
        raise

def send_trace(trace_id, span_id, timestamp_ns):
    print(f"[*] Sending trace: trace_id={trace_id}, span_id={span_id}")
    
    payload = {
        "resourceSpans": [{
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"stringValue": "lgtm-verification-service"}},
                    {"key": "service.version", "value": {"stringValue": "1.0.0"}},
                    {"key": "host.name", "value": {"stringValue": "localhost"}}
                ]
            },
            "scopeSpans": [{
                "scope": {"name": "verification-script", "version": "1.0"},
                "spans": [{
                    "traceId": trace_id,
                    "spanId": span_id,
                    "name": "VerifyLgtmStack",
                    "kind": 1,  # SPAN_KIND_INTERNAL
                    "startTimeUnixNano": str(timestamp_ns - 100000000), # 100ms ago
                    "endTimeUnixNano": str(timestamp_ns),
                    "attributes": [
                        {"key": "verification.status", "value": {"stringValue": "SUCCESS"}},
                        {"key": "step.count", "value": {"intValue": 3}}
                    ],
                    "status": {"code": 1}  # STATUS_CODE_OK
                }]
            }]
        }]
    }
    
    send_payload("/v1/traces", payload)

def send_log(trace_id, span_id, timestamp_ns):
    log_msg = f"LGTM Stack verification execution run. Trace correlated successfully! trace_id={trace_id}"
    print(f"[*] Sending log: '{log_msg}'")
    
    payload = {
        "resourceLogs": [{
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"stringValue": "lgtm-verification-service"}},
                    {"key": "host.name", "value": {"stringValue": "localhost"}}
                ]
            },
            "scopeLogs": [{
                "scope": {"name": "verification-script", "version": "1.0"},
                "logRecords": [{
                    "timeUnixNano": str(timestamp_ns),
                    "body": {"stringValue": log_msg},
                    "severityText": "INFO",
                    "severityNumber": 9,
                    "traceId": trace_id,
                    "spanId": span_id
                }]
            }]
        }]
    }
    
    send_payload("/v1/logs", payload)

def send_metrics(timestamp_ns, trace_id, span_id):
    print("[*] Sending metrics...")
    
    payload = {
        "resourceMetrics": [{
            "resource": {
                "attributes": [
                    {"key": "service.name", "value": {"stringValue": "lgtm-verification-service"}},
                    {"key": "host.name", "value": {"stringValue": "localhost"}}
                ]
            },
            "scopeMetrics": [{
                "scope": {"name": "verification-script", "version": "1.0"},
                "metrics": [
                    {
                        "name": "lgtm_verification_runs",
                        "description": "Total count of verification script runs",
                        "unit": "1",
                        "sum": {
                            "dataPoints": [{
                                "startTimeUnixNano": str(timestamp_ns - 1000000000),
                                "timeUnixNano": str(timestamp_ns),
                                "asInt": "1",
                                "exemplars": [{
                                    "timeUnixNano": str(timestamp_ns),
                                    "asDouble": 1.0,
                                    "traceId": trace_id,
                                    "spanId": span_id
                                }]
                            }],
                            "aggregationTemporality": 2,
                            "isMonotonic": True
                        }
                    },
                    {
                        "name": "lgtm_verification_cpu_gauge",
                        "description": "Simulated gauge metric",
                        "unit": "%",
                        "gauge": {
                            "dataPoints": [{
                                "timeUnixNano": str(timestamp_ns),
                                "asDouble": 42.5
                            }]
                        }
                    }
                ]
            }]
        }]
    }
    
    send_payload("/v1/metrics", payload)

def main():
    print("[+] Starting LGTM stack telemetry generator...")
    try:
        trace_id, span_id = generate_ids()
        timestamp_ns = int(time.time() * 1e9)
        
        # 1. Send trace
        send_trace(trace_id, span_id, timestamp_ns)
        # 2. Send correlated log
        send_log(trace_id, span_id, timestamp_ns)
        # 3. Send metrics
        send_metrics(timestamp_ns, trace_id, span_id)
        
        print("[+] Telemetry generated and sent successfully!")
        print(f"[+] View details in Grafana (http://localhost:3000):")
        print(f"    - Loki Search query: {{service_name=\"lgtm-verification-service\"}}")
        print(f"    - Prometheus Query: lgtm_verification_runs_total or lgtm_verification_cpu_gauge")
        print(f"    - Tempo Trace ID lookup: {trace_id}")
    except Exception as e:
        print(f"[-] Failed to send telemetry: {e}")
        print("[-] Ensure the LGTM Docker Compose stack is running (`docker compose up -d`).")

if __name__ == "__main__":
    main()
