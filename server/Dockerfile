# Build Stage
FROM golang:1.21 AS builder

WORKDIR /app

# Copy dependencies first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build the server (Static build)
RUN CGO_ENABLED=0 GOOS=linux go build -o ghostpanel-server main.go

# Runtime Stage (Switch to Ubuntu for reliable MinGW)
FROM ubuntu:22.04

WORKDIR /app

# Prevent interactive prompts during install
ENV DEBIAN_FRONTEND=noninteractive

# Install MinGW-w64 (Windows Cross Compiler) and essential tools
RUN apt-get update && apt-get install -y \
    mingw-w64 \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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