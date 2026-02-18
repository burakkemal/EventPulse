# AI Interaction Log

## Session 1 — Project Initialization

**Date:** 2026-02-17

### Interaction Context (Provided to AI)

The following context and constraints were explicitly provided to the AI before starting:

- The full EventPulse case study documentation was shared in advance.
- If the AI could not access or recall the case study, it was instructed to stop and ask for it again.
- The task was framed as a **senior-level backend engineering assessment**.
- AI assistance was limited strictly to **project scaffolding and infrastructure setup**.
- The AI was explicitly instructed **not to generate any business logic or domain-specific code**.

**Technical constraints given to the AI:**
- Backend stack: Fastify + TypeScript
- Language: TypeScript (strict mode)
- Database: PostgreSQL
- ORM: Choose either Drizzle or Prisma and justify the choice
- Cache / Queue: Redis using ioredis
- Emphasis on clarity, maintainability, and controlled AI usage

---

### Interaction Summary
Scaffolded the EventPulse project structure from scratch as part of a senior-level technical assessment.
The scope was intentionally limited to infrastructure and tooling initialization, based on the provided case study constraints, with all domain and business logic deferred to later phases.

Generated `package.json`, `tsconfig.json`, `docker-compose.yml`, `.gitignore`, and `.env.example`. Created the four Clean Architecture layers under `src/`.


### Technical Decisions

| Decision | Rationale |
|---|---|
| **Drizzle ORM over Prisma** | SQL-first with zero runtime overhead (no query engine binary). Critical for the p95 < 200ms ingestion target. Full control over connection pooling via the `postgres` (postgres.js) driver. |
| **`postgres` (postgres.js) driver** | Native ESM, supports pipelining, and works seamlessly with Drizzle. Lighter than `pg`. |
| **`zod` for validation** | Case study allows zod or fluent-json-schema. Zod integrates cleanly with TypeScript's type system and can derive Fastify schemas. |
| **ES2022 target + NodeNext modules** | Aligns with ESM-only constraint. ES2022 gives us native `structuredClone`, `Array.at()`, top-level await. |
| **`noUncheckedIndexedAccess: true`** | Strict-mode hardening — forces null checks on array/object index access, preventing silent `undefined` bugs. |
| **Alpine-based Docker images** | Minimal attack surface, smaller pull size for local dev. |
| **Health checks in docker-compose** | Enables proper startup ordering and `depends_on` with `condition: service_healthy` in later phases. |

### AI Limitations/Fixes
None — this was a straightforward scaffolding task with no corrective iterations.

### Validation Method
```bash
# Verify directory structure
find . -not -path './node_modules/*' | sort

# Verify TypeScript config is valid
npx tsc --noEmit  # (after npm install)

# Verify Docker services start
docker compose up -d
docker compose ps   # both should show "healthy"
```

---

## Session 2 — Event Ingestion Pipeline (Queue-only)

**Date:** 2026-02-17

### Interaction Context (Provided to AI)

- Phase 2 of the EventPulse senior backend case study.
- Scope: Ingestion → Validation → Redis Stream. No DB persistence, no rule engine, no consumers.
- AI instructed to implement fire-and-forget enqueue with `202 Accepted` semantics.
- No retries, batching logic, or observability in this phase.

### Interaction Summary

Implemented the minimal event ingestion pipeline across all four Clean Architecture layers:

- **Domain** (`src/domain/event.ts`): `Event`, `EventPayload`, `EventMetadata` types — pure interfaces, no framework coupling.
- **Application** (`src/application/event-schema.ts`): Zod schemas for single-event and batch validation. `event_id` is optional at input.
- **Infrastructure** (`src/infrastructure/redis/`): ioredis plugin with lifecycle management + `enqueueEvent` producer using `XADD` to `events_stream`.
- **HTTP Interface** (`src/interfaces/http/event-routes.ts`): Three endpoints — `POST /api/v1/events`, `POST /api/v1/events/batch`, `GET /api/v1/events/health`.
- **Bootstrap** (`src/index.ts`): Fastify server wiring with ordered plugin registration.

### Technical Decisions

| Decision | Rationale |
|---|---|
| **Fire-and-forget enqueue** | `enqueueEvent` is called without `await` in the handler. Errors are caught and logged but never block the 202 response. This maximizes throughput on the hot path. |
| **`event_id` assigned at ingestion** | UUID generated server-side via `crypto.randomUUID()` if the producer omits it. Guarantees every stream entry is addressable. |
| **Flat Redis Stream fields** | `payload` and `metadata` are JSON-serialized into string fields. Redis Streams require string values; this avoids nested encoding schemes. |
| **`maxRetriesPerRequest: null`** | Required by ioredis for stream operations — prevents auto-fail on individual commands, letting the connection recover transparently. |
| **`lazyConnect: true`** | Explicit `.connect()` call in the plugin gives us a clear startup error surface instead of silent background reconnects. |
| **Batch endpoint rejects atomically** | If any event in the batch fails validation, the entire batch is rejected. No partial-success semantics — keeps the contract simple for Phase 2. |
| **Plugin dependency chain** | `event-routes` declares `dependencies: ['redis']`, enforced by `fastify-plugin`. Guarantees `fastify.redis` exists before any route handler executes. |

### AI Limitations/Fixes

- npm registry was blocked in the sandbox environment, so `tsc --noEmit` could not be executed for automated type-checking. All code was manually reviewed for type correctness against the strict tsconfig from Phase 1.

### Validation Method
```bash
# After npm install, verify types compile
npx tsc --noEmit

# Start infrastructure
docker compose up -d

# Start the server
npm run dev

# Single event ingestion
curl -s -X POST http://localhost:3000/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"page_view","source":"web","timestamp":"2026-02-17T12:00:00Z","payload":{"url":"/home"}}' | jq .
# Expected: { "status": "accepted", "event_id": "<uuid>" }

# Health check
curl -s http://localhost:3000/api/v1/events/health | jq .
# Expected: { "status": "ok", "redis": "PONG" }

# Verify event landed in the stream
docker exec eventpulse-redis redis-cli XRANGE events_stream - +
```

---

## Session 3 — Docker App Service Fix

**Date:** 2026-02-17

### Interaction Context (Provided to AI)

- `docker compose up` started only `postgres` and `redis` — the Fastify app was not running.
- AI instructed to fix Docker configuration only — no application logic changes.
- Local development setup; no production optimizations.

### Root Cause

The `docker-compose.yml` from Phase 1 defined only `postgres` and `redis` services. There was no `app` service and no `Dockerfile` to build the Node.js application. Docker had nothing to build or start for EventPulse itself.

### Changes Made

| File | Change |
|---|---|
| **`Dockerfile`** (new) | Multi-step build: copies `package.json` first for layer caching, installs deps, copies source, runs `npm run dev` (tsx watch) for hot-reload. Based on `node:22-alpine`. |
| **`.dockerignore`** (new) | Excludes `node_modules`, `dist`, `.env`, `*.log` from the build context. |
| **`docker-compose.yml`** (modified) | Added `app` service: builds from `Dockerfile`, exposes port 3000, sets `REDIS_URL` and `DATABASE_URL` using Docker service names (`redis`, `postgres`) instead of `localhost`, waits for both dependencies via `condition: service_healthy`, bind-mounts `./src` read-only for hot-reload. |
| **`.env.example`** (modified) | Added comments clarifying `localhost` vs Docker service name hostnames. |

### Key Detail — Docker DNS

Inside the Docker network, containers reach each other by **service name** (e.g., `redis://redis:6379`), not `localhost`. The `app` service environment variables override the `.env.example` defaults with the correct internal hostnames.

### Validation Method
```bash
docker compose up -d
docker compose ps
# Expected: all three services (eventpulse-db, eventpulse-redis, eventpulse-app) healthy/running

curl -s http://localhost:3000/api/v1/events/health | jq .
# Expected: { "status": "ok", "redis": "PONG" }
```

---

## Session 4 — Redis Stream Consumer + Postgres Persistence

**Date:** 2026-02-18

### Interaction Context (Provided to AI)

- Phase 3: consume events from `events_stream` and persist to PostgreSQL.
- Strict scope: XREADGROUP consumer → Drizzle insert → XACK.
- Idempotent writes via `ON CONFLICT DO NOTHING` on `event_id` PK.
- No rule engine, no dashboard, no advanced retry policies.

### Interaction Summary

Built the persistence layer as a standalone worker process, separate from the HTTP server:

- **DB Schema** (`src/infrastructure/db/schema.ts`): Drizzle schema for `events` table — `event_id` (UUID) as PK, `event_type`, `source`, `timestamp`, `payload` (JSONB), `metadata` (JSONB), `created_at`.
- **DB Client** (`src/infrastructure/db/client.ts`): Factory that returns both the raw `postgres.js` connection and typed Drizzle instance.
- **Event Repository** (`src/infrastructure/db/event-repository.ts`): `insertEvent()` with `onConflictDoNothing` for idempotent inserts. Returns boolean indicating whether a row was actually inserted.
- **Stream Consumer** (`src/infrastructure/worker/stream-consumer.ts`): XREADGROUP-based consumer loop with pending entry recovery, per-entry ACK-after-write semantics.
- **Worker Bootstrap** (`src/worker.ts`): Standalone process with Redis + Postgres connections, `CREATE TABLE IF NOT EXISTS` for local dev auto-migration, and graceful SIGINT/SIGTERM shutdown.
- **Drizzle Config** (`drizzle.config.ts`): Points drizzle-kit at the schema for `generate`/`migrate` commands.

### Technical Decisions

| Decision | Rationale |
|---|---|
| **Separate worker process** | Decouples ingestion throughput from persistence latency. HTTP server and worker can be scaled independently. Worker crashes don't affect API availability. |
| **ACK-after-write** | Stream entry is only acknowledged after the Postgres insert succeeds (or confirms duplicate). On failure, the entry stays in the pending entries list (PEL) and is reprocessed on next startup via `XREADGROUP ... 0`. |
| **Pending entry recovery** | On startup, the consumer reads its own PEL (`0` cursor) before switching to `>` for new messages. Handles crash recovery without data loss. |
| **`CREATE TABLE IF NOT EXISTS` in worker** | Pragmatic choice for local dev — ensures the table exists on first `docker compose up` without requiring a separate migration step. Production would use `drizzle-kit migrate`. |
| **`event_id` as natural PK** | Eliminates the need for a synthetic PK + uniqueness constraint. `ON CONFLICT DO NOTHING` on the PK gives us idempotency with zero extra indexes. |
| **Shared Dockerfile, different CMD** | Worker reuses the same Docker image as the app. `docker-compose.yml` overrides `command` to run `npm run dev:worker`. Single image to build, two processes to run. |
| **`BLOCK 5000` on XREADGROUP** | Blocks for 5s waiting for new messages, then loops. Balances responsiveness (sub-5s latency) against CPU idle cost. |

### Files Added/Modified

| File | Status |
|---|---|
| `src/infrastructure/db/schema.ts` | New |
| `src/infrastructure/db/client.ts` | New |
| `src/infrastructure/db/event-repository.ts` | New |
| `src/infrastructure/db/index.ts` | New |
| `src/infrastructure/worker/stream-consumer.ts` | New |
| `src/infrastructure/worker/index.ts` | New |
| `src/worker.ts` | New |
| `drizzle.config.ts` | New |
| `src/infrastructure/index.ts` | Modified (added db + worker exports) |
| `package.json` | Modified (added `dev:worker`, `start:worker` scripts) |
| `docker-compose.yml` | Modified (added `worker` service) |

### Validation Method
```bash
docker compose up -d --build
docker compose ps
# Expected: 4 services running (db, redis, app, worker)

# Ingest an event
curl -s -X POST http://localhost:3000/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"page_view","source":"web","timestamp":"2026-02-18T12:00:00Z","payload":{"url":"/home"}}' | jq .

# Check worker logs for "Event persisted"
docker logs eventpulse-worker --tail 20

# Verify row landed in Postgres
docker exec eventpulse-db psql -U eventpulse -c "SELECT event_id, event_type, source FROM events;"

# Idempotency test: re-send same event_id — should log "Duplicate event skipped"
```
### AI Corrections & Human Oversight -> ## Session 4

The AI-generated implementation was reviewed and adjusted to align with
production-oriented reliability guarantees and strict phase boundaries.

Key human decisions:

- **Consumer group lifecycle clarity**  
  The AI did not explicitly document how the Redis consumer group is created.
  I ensured the worker bootstraps the consumer group on startup (`XGROUP CREATE … MKSTREAM`)
  and documented this behavior to avoid first-run failures.

- **Consumer group start cursor (`0` → `$`)**  
  The AI initially created the consumer group with a start ID of `0`, which forces
  the group to read the entire historical stream on first initialization. While
  useful for deliberate backfill scenarios, this is not a safe default for local
  development or incremental rollouts.  
  I changed the start cursor to `$` so the group begins from new messages only,
  while still preserving crash recovery via pending-entry handling
  (`XREADGROUP … 0` for recovery, then `>` for live traffic).

- **Migration discipline**  
  The AI added `CREATE TABLE IF NOT EXISTS` inside the worker.
  I accepted this strictly for local development convenience, but clarified that
  production environments must use explicit Drizzle migrations instead of implicit
  schema creation at runtime.

- **Pending entry recovery scope**  
  The AI recovered only the worker’s own Pending Entries List (PEL).
  I documented that cross-consumer reclamation (`XAUTOCLAIM`) is intentionally
  deferred to the retry/DLQ phase to keep Phase 3 focused on persistence.

- **Scope enforcement**  
  I explicitly rejected any expansion into rule engine logic, dashboards,
  or advanced retry orchestration to maintain strict adherence to the phase plan.

These corrections ensure deterministic startup behavior, predictable recovery
semantics, and alignment with the incremental system design strategy.

---

### Post-session corrections

**File:** `src/infrastructure/worker/stream-consumer.ts`

- `XGROUP CREATE` start cursor changed from `"0"` to `"$"` — prevents unintended full-stream historical replay on first boot.
- Crash recovery is unaffected: `processPending()` still uses `XREADGROUP ... 0` to drain this consumer's pending entries list (PEL).
- `"$"` controls the group's initial delivery offset; `"0"` in `XREADGROUP` controls per-consumer PEL replay. These are independent mechanisms.
- Cross-consumer reclaim (`XAUTOCLAIM`) remains deferred to the retry/DLQ phase.
- Classification: safety fix, not a functional change.
