module db-sync-service

go 1.21

require (
	github.com/lib/pq v1.10.9
	go.opentelemetry.io/otel v1.20.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.20.0
	go.opentelemetry.io/otel/sdk v1.20.0
	go.opentelemetry.io/otel/trace v1.20.0
)
