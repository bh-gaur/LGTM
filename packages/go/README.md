# lgtm-obs-go (Go)

Zero-boilerplate, enterprise-grade OpenTelemetry observability library for Go microservices targeting the **Grafana LGTM stack** (Loki, Grafana, Tempo, Mimir).

## Installation

```bash
go get github.com/bh-gaur/LGTM/packages/go
```

## Quick Start (Gin Web Framework)

```go
package main

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	lgtm "github.com/bh-gaur/LGTM/packages/go/lgtmobs"
)

func main() {
	// 1. Initialize OTel Tracing
	shutdown, err := lgtm.Init(lgtm.Config{
		ServiceName:  "inventory-service",
		OTLPEndpoint: "localhost:4318",
	})
	if err != nil {
		panic(err)
	}
	defer shutdown(context.Background())

	// 2. Setup Gin with LGTM Middleware
	r := gin.Default()
	r.Use(lgtm.GinMiddleware("inventory-service"))

	r.GET("/items", func(c *gin.Context) {
		// 3. Create Custom Spans Easily
		ctx, span := lgtm.StartSpan(c.Request.Context(), "QueryInventoryDatabase")
		defer span.End()

		c.JSON(http.StatusOK, gin.H{"items": []string{"laptop", "monitor"}})
	})

	r.Run(":8080")
}
```
