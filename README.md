# EventPulse

EventPulse is a real-time event ingestion and anomaly detection platform
developed as part of a senior backend engineering case study.

This README focuses on quick local setup, execution, validation, and
reviewer onboarding.

------------------------------------------------------------------------

# Quick Start (≤5 Commands)

``` bash
git clone https://github.com/burakkemal/EventPulse
cd EventPulse
cp .env.example .env
docker compose up -d --build
curl http://localhost:3000/api/v1/events/health
```

Expected:

``` json
{
  "status": "ok",
  "redis": "PONG",
  "worker": "ok"
}
```

------------------------------------------------------------------------

# Architecture Overview

High-level data flow:

Client → Fastify API → Redis Streams (Queue) → Worker Service →
PostgreSQL (Persistence) → Rule Engine → Notifications (WebSocket /
Slack / Email)

-   API handles ingestion only.
-   Worker performs persistence and rule evaluation.

Architecture details:

``` bash
docs/architecture.md
```

------------------------------------------------------------------------

# Technology Choices

-   **Fastify** --- high throughput HTTP handling with strong TypeScript
    support.
-   **Redis Streams** --- ordered delivery, consumer groups, replay
    capability.
-   **PostgreSQL** --- primary source of truth using JSONB payload
    flexibility.
-   **Worker Separation** --- prevents rule execution or DB latency
    impacting ingestion.
-   **Docker Compose** --- reproducible reviewer environment.

------------------------------------------------------------------------

# Setup Requirements

Install:

-   Docker Desktop
-   Git
-   Node.js 22+ (optional)

Verify:

``` bash
docker --version
docker compose version
```

------------------------------------------------------------------------

# Running the System

``` bash
docker compose up -d --build
```

Verify services:

``` bash
docker compose ps
```

Expected:

-   eventpulse-db healthy
-   eventpulse-redis healthy
-   eventpulse-app running
-   eventpulse-worker running

------------------------------------------------------------------------

# Health Check

``` bash
curl http://localhost:3000/api/v1/events/health
```

------------------------------------------------------------------------

# Running Tests

``` bash
docker exec eventpulse-app npm test
```

Coverage:

``` bash
docker exec eventpulse-app npm run test:coverage
```

Expected:

-   All tests passing
-   Coverage \> 80% (current \~90%+)

------------------------------------------------------------------------

## Seed Data (scripts/)

This repository includes a seed / smoke script exercising all HTTP APIs:

-   Single ingest
-   Batch ingest
-   Event fetch
-   Rule creation
-   Threshold anomaly trigger
-   Metrics query
-   Events listing

Run inside container:

``` bash
docker exec eventpulse-app node scripts/seed_all_apis.mjs
```

------------------------------------------------------------------------

# Event Ingestion Example

``` bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type":"page_view",
    "source":"web",
    "timestamp":"2026-02-20T12:00:00Z",
    "payload":{"url":"/home"},
    "metadata":{}
  }'
```

Response:

``` text
202 Accepted
```

------------------------------------------------------------------------

# Dashboard

Open:

``` text
http://localhost:3000/dashboard
```

Provides:

-   Throughput metrics
-   Event feed
-   Anomaly timeline
-   System health

------------------------------------------------------------------------

## Rule Engine Verification (Quick Test)

To verify end‑to‑end rule evaluation:

``` text
docs/rule-engine-runtime-test.md
```

Follow the guide to validate anomaly triggering within seconds.

------------------------------------------------------------------------

# Notifications

Channels:

-   WebSocket (enabled)
-   Slack (optional webhook)
-   Email (stub)

Configuration:

``` bash
config/notifications.yaml
```

------------------------------------------------------------------------

# Known Limitations

-   Authentication / RBAC not implemented (out of scope).
-   Email notifications are stubbed.
-   Notification config stored in YAML.
-   Automatic table creation used for local development.

Future Improvements:

-   Database-backed configuration
-   Authentication layer
-   Horizontal worker autoscaling

------------------------------------------------------------------------

# AI Tools Used

-   ChatGPT GPT‑5.2 --- architecture discussion and documentation
    refinement.
-   Claude Sonnet --- code generation and debugging.

Detailed audit log:

``` bash
docs/ai-log.md
```

------------------------------------------------------------------------

# Logs

API:

``` bash
docker logs eventpulse-app
```

Worker:

``` bash
docker logs eventpulse-worker
```

------------------------------------------------------------------------

# Stop Services

``` bash
docker compose down
```

Remove volumes:

``` bash
docker compose down -v
```

------------------------------------------------------------------------

# Documentation

Architecture:

``` bash
docs/architecture.md
```

AI Interaction Log:

``` bash
docs/ai-log.md
```

Swagger:

``` bash
docs/swagger.yaml
```

------------------------------------------------------------------------

# License

Case Study Submission.
