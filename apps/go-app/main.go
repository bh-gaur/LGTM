package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
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
		otlpEndpoint = "alloy:4318" // Fallback to Alloy OTLP HTTP
	}

	// Create OTLP HTTP trace exporter
	exporter, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpoint(otlpEndpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		return nil, err
	}

	// Create resource attributes
	res, err := resource.New(context.Background(),
		resource.WithAttributes(
			semconv.ServiceNameKey.String("go-app"),
		),
	)
	if err != nil {
		return nil, err
	}

	// Create tracer provider
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

	tracer = otel.Tracer("go-app-tracer")
	return tp, nil
}

// primeFactors returns the prime factors of a number
func primeFactors(n int) []int {
	factors := []int{}
	// Print number of 2s that divide n
	for n%2 == 0 {
		factors = append(factors, 2)
		n = n / 2
	}
	// n must be odd at this point. So we can skip one element
	for i := 3; i*i <= n; i = i + 2 {
		for n%i == 0 {
			factors = append(factors, i)
			n = n / i
		}
	}
	// This condition is to handle the case when n is a prime number greater than 2
	if n > 2 {
		factors = append(factors, n)
	}
	return factors
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

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(otelgin.Middleware("go-app"))

	// Health Check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "go-app",
		})
	})

	// Prime Factorization Endpoint
	r.GET("/math/primes/:num", func(c *gin.Context) {
		ctx := c.Request.Context()
		numStr := c.Param("num")
		num, err := strconv.Atoi(numStr)
		if err != nil || num <= 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid positive integer greater than 1"})
			return
		}

		// Heavy factorization computation span
		var factors []int
		_, span := tracer.Start(ctx, "PrimeFactorizationCompute")
		factors = primeFactors(num)
		span.SetAttributes(
			semconv.DBSystemKey.String("math"),
		)
		span.End()

		log.Printf("Factorization completed for N=%d: %v. Calling python-app downstream...", num, factors)

		// Call Python backend downstream
		pythonURL := os.Getenv("PYTHON_SERVICE_URL")
		if pythonURL == "" {
			pythonURL = "http://python-app:5000"
		}

		// Calculate sum of prime factors to audit
		sumFactors := 0
		for _, f := range factors {
			sumFactors += f
		}

		// Call python-app POST /analyze
		requestPayload := map[string]interface{}{
			"number": sumFactors,
			"type":   "prime_factors_sum",
		}
		jsonBytes, _ := json.Marshal(requestPayload)

		// Create trace context-propagated HTTP client call
		clientCtx, clientSpan := tracer.Start(ctx, "CallPythonAnalyze")
		defer clientSpan.End()

		req, err := http.NewRequestWithContext(clientCtx, "POST", fmt.Sprintf("%s/analyze", pythonURL), bytes.NewBuffer(jsonBytes))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			// Inject trace headers into client request
			otel.GetTextMapPropagator().Inject(clientCtx, propagation.HeaderCarrier(req.Header))

			client := &http.Client{Timeout: 5 * time.Second}
			resp, err := client.Do(req)
			if err == nil {
				defer resp.Body.Close()
				var analysisResult map[string]interface{}
				json.NewDecoder(resp.Body).Decode(&analysisResult)

				c.JSON(http.StatusOK, gin.H{
					"service":  "go-app",
					"input":    num,
					"factors":  factors,
					"analysis": analysisResult,
				})
				return
			}
		}

		// Downstream call failed fallback
		c.JSON(http.StatusOK, gin.H{
			"service": "go-app",
			"input":   num,
			"factors": factors,
			"error":   "Failed to contact downstream Python analyzer",
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}
	log.Printf("Go application starting on port %s", port)
	r.Run(":" + port)
}
