# EventPulse

EventPulse is a real-time event ingestion and anomaly detection platform
developed as part of a senior backend engineering case study.

This README focuses on quick local setup, execution, validation, and
reviewer onboarding.

------------------------------------------------------------------------

# Quick Start (≤5 Commands)

git clone https://github.com/burakkemal/EventPulse cd EventPulse cp
.env.example .env docker compose up -d –build curl
http://localhost:3000/api/v1/events/health

Expected:

{ “status”: “ok”, “redis”: “PONG”, “worker”: “ok” }

------------------------------------------------------------------------

# Architecture Overview

High-level data flow:

Client ↓ Fastify API ↓ Redis Streams (Queue) ↓ Worker Service ↓
PostgreSQL (Persistence) ↓ Rule Engine ↓ Notifications (WebSocket /
Slack / Email)

API handles ingestion only.

Worker performs persistence and rule evaluation.

Architecture details:

docs/architecture.md

------------------------------------------------------------------------

# Technology Choices

Fastify: Chosen for high throughput and low overhead HTTP handling with
strong TypeScript support.

Redis Streams: Used for ordered delivery, consumer groups, replay
capability, and crash recovery.

PostgreSQL: Primary source of truth with strong consistency guarantees
and JSONB payload flexibility.

Worker Separation: Prevents database latency or rule execution delays
from impacting API ingestion latency.

Docker Compose: Provides reproducible local environments for reviewers.

------------------------------------------------------------------------

# Setup Requirements

Install:

-   Docker Desktop
-   Node.js 22+ (optional)
-   Git

Verify:

docker –version docker compose version

------------------------------------------------------------------------

Running the System

docker compose up -d –build

Verify services:

docker compose ps

Expected:

eventpulse-db healthy eventpulse-redis healthy eventpulse-app running
eventpulse-worker running

------------------------------------------------------------------------

# Health Check

curl http://localhost:3000/api/v1/events/health

------------------------------------------------------------------------

# Running Tests

docker exec eventpulse-app npm test

Coverage:

docker exec eventpulse-app npm run test:coverage

Expected:

All tests passing Coverage >80%

(Current ~90%+)

------------------------------------------------------------------------
### Seed data (scripts/)

This repo includes a single seed / smoke script that exercises **all** HTTP APIs:
- Single event ingest (`POST /api/v1/events`)
- Batch ingest (`POST /api/v1/events/batch`)
- Fetch persisted event (`GET /api/v1/events/:event_id`) — waits for worker persistence
- Create rule (`POST /api/v1/rules`)
- Trigger anomaly (threshold breach) + query anomalies (`GET /api/v1/anomalies`)
- Query metrics (`GET /api/v1/metrics`)
- List events (`GET /api/v1/events`)
- List rules (`GET /api/v1/rules`)

**Run (inside Docker container):**
---bash
docker exec eventpulse-app node scripts/seed_all_apis.mjs

# Event Ingestion Example

curl -X POST http://localhost:3000/api/v1/events -H “Content-Type:
application/json” -d ‘{ “event_type”:“page_view”, “source”:“web”,
“timestamp”:“2026-02-20T12:00:00Z”, “payload”:{“url”:“/home”},
“metadata”:{} }’

Response:

202 Accepted

------------------------------------------------------------------------

Dashboard

http://localhost:3000/dashboard

Provides:

-   Throughput metrics
-   Event feed
-   Anomaly timeline
-   System health

------------------------------------------------------------------------

# Notifications

Channels:

-   WebSocket (enabled)
-   Slack (optional webhook)
-   Email (stub implementation)

Configuration:

config/notifications.yaml

------------------------------------------------------------------------

# Known Limitations

-   Authentication and RBAC are not implemented (out of scope).
-   Email notification channel is a stub implementation.
-   Notification configuration stored in YAML instead of database.
-   Automatic table creation used for local development instead of
    production migrations.

# Future Improvements:

-   Database-backed configuration.
-   Authentication layer.
-   Horizontal worker autoscaling.

------------------------------------------------------------------------

# AI Tools Used

ChatGPT GPT-5.2: Architecture discussion, documentation refinement,
debugging assistance.

Claude 4.6 Sonnet: Code generation, debugging, and implementation
assistance.

Detailed audit log:

docs/ai-log.md

------------------------------------------------------------------------

# Logs

API:

docker logs eventpulse-app

Worker:

docker logs eventpulse-worker

------------------------------------------------------------------------

# Stop Services

docker compose down

Remove volumes:

docker compose down -v

------------------------------------------------------------------------

# Documentation

Architecture:

docs/architecture.md

AI Interaction Log:

docs/ai-log.md

Swagger : 
Interactive API specification is available via docs/swagger.yaml.

------------------------------------------------------------------------

# License

Case Study Submission.
