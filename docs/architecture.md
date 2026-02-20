# EventPulse --- Architecture Document

## Overview

EventPulse is a reliability‑first event ingestion and anomaly detection
platform designed around deterministic durability, asynchronous
processing, and operational isolation.

Primary architectural goals:

-   Reliable event durability.
-   Non‑blocking ingestion.
-   Deterministic crash recovery.
-   Horizontal scalability.
-   Clear separation of responsibilities.

This document focuses strictly on system design and architectural
decisions.

------------------------------------------------------------------------

## System Architecture

High‑level data flow:

Client ↓ Fastify API Service ↓ Redis Streams (Queue) ↓ Worker Service ↓
PostgreSQL (Persistence) ↓ Rule Engine ↓ Notification Pipeline

The API layer is responsible only for validation and enqueueing events.

Durability and analysis occur within the worker service.

------------------------------------------------------------------------

## Core Components

### API Service

Responsibilities:

-   Event ingestion endpoints.
-   Batch ingestion.
-   Rule CRUD endpoints.
-   Metrics and query APIs.
-   WebSocket notification bridge.

Design characteristics:

-   Stateless.
-   Horizontally scalable.
-   No direct database writes.

The API writes events exclusively to Redis Streams.

------------------------------------------------------------------------

### Redis

Redis serves two independent architectural roles.

#### Redis Streams

Used as a durable buffer between ingestion and persistence.

Reasons:

-   Consumer groups.
-   Replay capability.
-   Pending Entries List recovery.
-   Ordered delivery guarantees.

The queue decouples ingestion latency from database performance.

#### Redis Pub/Sub

Used for:

-   Rule hot reload notifications.
-   Anomaly broadcasts.

This enables loose coupling between services.

------------------------------------------------------------------------

### Worker Service

The worker operates as an independent process.

Responsibilities:

-   Stream consumption.
-   Database persistence.
-   Rule evaluation.
-   Anomaly creation.

Crash isolation ensures that heavy workloads or failures do not affect
API responsiveness.

------------------------------------------------------------------------

### PostgreSQL

PostgreSQL acts as the system source of truth.

Primary tables:

-   events
-   anomalies
-   rules

Design choices:

-   JSONB payload storage for schema flexibility.
-   Indexed timestamp filtering for query performance.

Idempotency is enforced using primary key conflict handling.

------------------------------------------------------------------------

## Event Processing Flow

### Ingestion

1.  Client submits HTTP request.
2.  API validates payload.
3.  UUID assigned if missing.
4.  Event added to Redis Stream.

The API returns HTTP 202 Accepted.

------------------------------------------------------------------------

### Persistence

Worker consumes using consumer groups.

Process:

insert → ACK → evaluate rules

ACK occurs only after successful database persistence.

This guarantees durability.

------------------------------------------------------------------------

## ACK Strategy

Chosen order:

insert → XACK → evaluate rules

Rationale:

Rule failures must never block persistence guarantees.

If the worker crashes before ACK:

-   Message remains pending.
-   Automatically recovered during restart.

------------------------------------------------------------------------

## Pending Entry Recovery

Worker startup prioritizes Pending Entries List processing.

This ensures:

-   No message loss.
-   Deterministic recovery.

Redis consumer groups allow replay without duplication risk.

------------------------------------------------------------------------

## Rule Engine Architecture

Rules are stored in PostgreSQL.

Capabilities:

-   Enable/disable dynamically.
-   Hot reload without worker restart.

Reload workflow:

CRUD API → Redis Pub/Sub → Worker Subscriber → Atomic RuleStore Swap.

Evaluation occurs post‑ACK to isolate ingestion reliability from
analysis failures.

------------------------------------------------------------------------

## Notification Pipeline

After anomaly persistence:

Worker publishes anomaly event via Redis Pub/Sub.

API service distributes notifications through:

-   WebSocket connections.
-   Slack webhook integration.
-   Email stub channel.

Channel failures are isolated from anomaly persistence.

------------------------------------------------------------------------

## Clean Architecture Boundaries

Layers:

Domain:

Pure rule logic and entities.

Application:

Use cases and orchestration.

Infrastructure:

Database access, Redis integration, worker processing.

Interfaces:

HTTP APIs and WebSocket server.

Dependencies point inward toward domain logic.

------------------------------------------------------------------------

## Reliability Design Decisions

### Queue Between API and Database

Prevents slow database operations from increasing ingestion latency.

### Worker Isolation

Allows independent scaling and crash containment.

### Post‑ACK Rule Evaluation

Ensures analytics never compromise durability.

------------------------------------------------------------------------

## Scalability Model

API:

Stateless and horizontally scalable.

Worker:

Multiple consumers supported through Redis consumer groups.

Database:

Indexes support query filtering by:

-   event_type
-   source
-   timestamp

------------------------------------------------------------------------

## Failure Handling

Worker crash:

Pending entries replayed automatically.

Rule evaluation failure:

Logged without impacting persistence.

Notification failure:

Channel isolated and retriable.

------------------------------------------------------------------------

## Observability

System visibility provided through:

-   Structured logging.
-   Metrics endpoint aggregation.
-   Event correlation via event_id.

------------------------------------------------------------------------

## Security Considerations

Authentication and RBAC were intentionally excluded as out‑of‑scope for
the case study.

Production systems should introduce API authentication and authorization
controls.

------------------------------------------------------------------------

## Tradeoffs

Local development favors rapid startup using automatic schema creation.

Production deployments should rely on controlled migrations.

Notification configuration stored in YAML simplifies local
experimentation but should move to database storage in future
iterations.

------------------------------------------------------------------------

## Conclusion

EventPulse prioritizes reliability and predictable recovery over maximum
throughput.

The architecture intentionally separates ingestion durability from
analytical workloads to model production‑grade event processing systems.
