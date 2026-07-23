package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
	"go.opentelemetry.io/otel/trace"
)

var tracer trace.Tracer

func initTracer() (*sdktrace.TracerProvider, error) {
	otlpEndpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if otlpEndpoint == "" {
		otlpEndpoint = "alloy:4318"
	}

	exporter, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpoint(otlpEndpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	res, err := resource.New(context.Background(),
		resource.WithAttributes(
			semconv.ServiceNameKey.String("db-sync-service"),
		),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	tracer = otel.Tracer("db-sync-service-tracer")
	return tp, nil
}

func startSyncLoop(db *sql.DB) {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			ctx, span := tracer.Start(context.Background(), "DatabaseSyncAuditRun")
			log.Println("[DB-SYNC] Initiating background database integrity audit...")

			// Query pg_tables to check table presence safely
			var count int
			err := db.QueryRowContext(ctx, "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';").Scan(&count)
			if err != nil {
				span.RecordError(err)
				span.SetStatus(1, err.Error())
				log.Printf("[DB-SYNC] Audit execution error: %v", err)
			} else {
				span.SetAttributes(
					semconv.DBSystemKey.String("postgresql"),
				)
				log.Printf("[DB-SYNC] Audit complete. Found %d public schema tables inside target catalog.", count)
			}
			span.End()
		}
	}()
}

func main() {
	tp, err := initTracer()
	if err != nil {
		log.Fatalf("failed to initialize tracer: %v", err)
	}
	defer func() {
		if err := tp.Shutdown(context.Background()); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
	}()

	// Connect to Postgres
	pgHost := os.Getenv("POSTGRES_HOST")
	if pgHost == "" {
		pgHost = "postgres"
	}
	pgPort := os.Getenv("POSTGRES_PORT")
	if pgPort == "" {
		pgPort = "5432"
	}
	pgDB := os.Getenv("POSTGRES_DB")
	if pgDB == "" {
		pgDB = "lgtmdb"
	}
	pgUser := os.Getenv("POSTGRES_USER")
	if pgUser == "" {
		pgUser = "lgtmuser"
	}
	pgPass := os.Getenv("POSTGRES_PASSWORD")
	if pgPass == "" {
		pgPass = "lgtmpass"
	}

	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		pgHost, pgPort, pgUser, pgPass, pgDB)

	var db *sql.DB
	// Retry database connection
	for i := 0; i < 10; i++ {
		db, err = sql.Open("postgres", dsn)
		if err == nil {
			err = db.Ping()
			if err == nil {
				log.Println("[DB-SYNC] Connected to PostgreSQL database catalog successfully.")
				break
			}
		}
		log.Printf("[DB-SYNC] Waiting for PostgreSQL database container... retry %d", i+1)
		time.Sleep(3 * time.Second)
	}

	if err != nil {
		log.Fatalf("[DB-SYNC] Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Start database sync loop in the background
	startSyncLoop(db)

	// Keep service alive by serving a health status endpoint
	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"healthy","service":"db-sync-service"}`)
	})
	log.Printf("[DB-SYNC] Web health server starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
