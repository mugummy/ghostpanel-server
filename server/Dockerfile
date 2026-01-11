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

# Install basic tools and cross-compiler for Windows (from edge community repo)
RUN apk --no-cache add ca-certificates \
    && apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community mingw-w64-gcc mingw-w64-headers

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
