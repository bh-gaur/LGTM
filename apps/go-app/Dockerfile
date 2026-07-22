FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go-app/go.mod ./
RUN go mod download

COPY go-app/main.go ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o go-app .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/go-app .

EXPOSE 8083

CMD ["./go-app"]
