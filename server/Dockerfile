# Build Stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy dependencies first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build the server
RUN CGO_ENABLED=0 GOOS=linux go build -o ghostpanel-server main.go

# Runtime Stage
FROM alpine:latest

WORKDIR /app

# Install basic tools
RUN apk --no-cache add ca-certificates

# Copy binary from builder
COPY --from=builder /app/ghostpanel-server .
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/config.json .

# Create directories for persistence
RUN mkdir -p logs output

# Expose ports
EXPOSE 8888 9000

# Run
CMD ["./ghostpanel-server"]
