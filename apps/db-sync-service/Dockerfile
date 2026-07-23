FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY db-sync-service/go.mod ./
RUN go mod download

COPY db-sync-service/main.go ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o db-sync-service .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/db-sync-service .

EXPOSE 8085

CMD ["./db-sync-service"]
