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


### Validation Results (Local) Sessions 2–4 (Local)

- **Ingestion (API)**
  - `POST /api/v1/events` returned `202 Accepted` with generated `event_id`.
  - `GET /api/v1/events/health` returned `{ "status": "ok", "redis": "PONG" }`.

- **Persistence (Worker → Postgres)**
  - Verified events were persisted to Postgres via:
    - `SELECT event_id, event_type, source FROM events ORDER BY created_at DESC LIMIT 5;`

- **Idempotency**
  - Re-sent the same `event_id` twice and confirmed only one row exists:
    - `event_id = aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
    - `COUNT(*) = 1`

- **Reliability (No event loss)**
  - Stopped `eventpulse-worker`, ingested events (all `202`), restarted worker, and confirmed persisted row count matched the ingested count.

- **Performance (k6)**
  - 100 events/sec sustained for 60s (`6000` requests total)
  - `p95 = 2ms` and `http_req_failed = 0.00%`
  - Thresholds satisfied: p95 `< 200ms`, failures `< 1%`.

---

## Session 5 — Rule Engine + Anomaly Detection

**Date:** 2026-02-18

### Interaction Context (Provided to AI)

- Phase 4 of the EventPulse senior backend case study.
- Scope: domain rule types, rule engine, three starter rules, in-memory rule repository, unit tests.
- Rules must be pure, deterministic, unit-testable functions.
- No persistence of anomalies — log only.
- Coverage target: >80%.

### Interaction Summary

Built the anomaly detection layer across domain, application, and infrastructure:

- **Domain types** (`src/domain/rules/types.ts`): `Rule`, `RuleResult`, `RuleContext`, `Anomaly`, `Severity`. Rules are defined as interfaces with a pure `evaluate()` method.
- **Three starter rules** (`src/domain/rules/`):
  - `rate-spike.ts`: Triggers when >N events from the same source within T seconds. Uses context window.
  - `invalid-payload.ts`: Triggers when known event types are missing required payload fields. Configurable field map.
  - `timestamp-drift.ts`: Triggers when event timestamp deviates >N seconds from server time. Injectable clock for testability.
- **Rule engine** (`src/application/rule-engine.ts`): `evaluateEvent()` orchestrator + `EventWindow` sliding window for source-scoped context. Adds event to window after evaluation to prevent double-counting.
- **In-memory rule repository** (`src/infrastructure/rules/in-memory-rule-repo.ts`): Temporary stub with default rule set. Supports runtime add/replace.
- **Worker integration**: `startConsumer()` now accepts rules + window. After persist+ACK, evaluates rules and logs anomalies via `log.warn()` with structured output.
- **Unit tests** (`tests/rules/`): 5 test files, 33 test cases covering all rules, the engine, the window, and the repository. Edge cases include boundary thresholds, unparseable timestamps, null values, custom parameters, and empty contexts.

### Technical Decisions

| Decision | Rationale |
|---|---|
| **Vitest over Jest** | Native ESM support (no `experimental-vm-modules`), TypeScript via esbuild out of the box, same `expect` API. Avoids `ts-jest`/`@swc/jest` transform overhead. |
| **Injectable `nowFn` on timestamp drift** | Makes the rule fully deterministic in tests without mocking `Date.now()` globally. Same pattern used by production-grade rule engines. |
| **`EventWindow` as explicit dependency** | Not hidden inside the engine — passed in by the caller. Makes the window lifetime controllable and testable. |
| **`evaluateEvent` adds to window AFTER evaluation** | Prevents the current event from appearing in its own context (double-counting in rate-spike). |
| **Rules run after persist+ACK** | Rule evaluation never blocks persistence or acknowledgment. If rules throw, the event is already safely in Postgres. |
| **`ConsumerDeps` bundle** | Internal refactor of `processEntry`/`processPending` to take a deps object instead of 5+ positional args. No public API change to `startConsumer()`. |
| **Coverage scoped to rule code** | `vitest.config.ts` targets only `src/domain/rules/**`, `src/application/rule-engine.ts`, and `src/infrastructure/rules/**` — avoids measuring infrastructure code that requires integration tests. |

### Files Added/Modified

| File | Status |
|---|---|
| `src/domain/rules/types.ts` | New |
| `src/domain/rules/rate-spike.ts` | New |
| `src/domain/rules/invalid-payload.ts` | New |
| `src/domain/rules/timestamp-drift.ts` | New |
| `src/domain/rules/index.ts` | New |
| `src/application/rule-engine.ts` | New |
| `src/infrastructure/rules/in-memory-rule-repo.ts` | New |
| `src/infrastructure/rules/index.ts` | New |
| `tests/rules/helpers.ts` | New |
| `tests/rules/rate-spike.test.ts` | New |
| `tests/rules/invalid-payload.test.ts` | New |
| `tests/rules/timestamp-drift.test.ts` | New |
| `tests/rules/rule-engine.test.ts` | New |
| `tests/rules/in-memory-rule-repo.test.ts` | New |
| `vitest.config.ts` | New |
| `src/domain/index.ts` | Modified (added rule exports) |
| `src/application/index.ts` | Modified (added engine exports) |
| `src/infrastructure/index.ts` | Modified (added rule repo export) |
| `src/infrastructure/worker/stream-consumer.ts` | Modified (accepts rules + window, evaluates after persist) |
| `src/worker.ts` | Modified (initializes rule repo + window, passes to consumer) |
| `package.json` | Modified (added vitest, coverage, test scripts) |

### Validation Method
```bash
# After npm install
npm test
# Expected: 33 tests pass across 5 suites

npm run test:coverage
# Expected: >80% coverage on lines, functions, branches, statements
# Scoped to: src/domain/rules/**, src/application/rule-engine.ts, src/infrastructure/rules/**

# Verify anomaly logging in running system
docker compose up -d --build
# Send an event with missing payload fields
curl -s -X POST http://localhost:3000/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"page_view","source":"web","timestamp":"2026-02-18T12:00:00Z","payload":{}}' | jq .
# Check worker logs for "Anomaly detected: [invalid-payload]"
docker logs eventpulse-worker --tail 10
```

### AI Corrections / Fixes

**File:** `src/infrastructure/worker/stream-consumer.ts`

- **Comment-order mismatch:** The `startConsumer` docblock stated "insert → evaluate → ACK" but actual code order is insert → ACK → evaluate. Updated both the `startConsumer` and `processEntry` docblocks to reflect the real order and document the design intent (rules are post-ACK, must never block persistence).
- **Split error handling:** `processEntry` had a single `try/catch` covering both persistence and rule evaluation. A thrown rule would log "Failed to persist event" — a misleading message, since the insert+ACK may have already succeeded. Refactored into two separate error boundaries: persistence failures prevent ACK and skip rules (early return); rule failures are caught independently and logged as "Failed to evaluate rules" with `event_id` and `streamId`. No change to persistence or ACK semantics.

### AI Corrections / Infrastructure Fixes

**Problem:** Tests, `vitest.config.ts`, and `docs/` were invisible inside the app and worker containers because only `./src` was bind-mounted to `/app/src`. Mounting the full repo root (`.:/app`) would shadow the container's `/app/node_modules` with the host directory, losing the Vitest binary and all installed dependencies.

**Fix (3 files, zero application logic changes):**

- **`docker-compose.yml`:** Changed both `app` and `worker` volume mounts from `./src:/app/src:ro` to two entries: `.:/app` (full repo bind mount) + a named volume for `node_modules` (`app_node_modules:/app/node_modules`, `worker_node_modules:/app/node_modules`). Added `app_node_modules` and `worker_node_modules` to the `volumes:` section.
- **`Dockerfile`:** Changed `COPY tsconfig.json` + `COPY src/` to `COPY . .` so all project files (tests, configs, docs) are baked into the image. The `.dockerignore` still excludes `node_modules` and `dist`.

**Why the named volume trick works:** Docker evaluates volume mounts in order. The bind mount `.:/app` overlays the host repo onto `/app`, including an empty (or platform-mismatched) `node_modules/`. The named volume `app_node_modules:/app/node_modules` then masks that specific subdirectory with a persistent Docker volume. On first `docker compose up --build`, Docker populates this volume from the image's `/app/node_modules` (installed during `RUN npm install`). On subsequent runs the volume persists, so deps survive container recreation without re-install.

**Preserved behaviors:** Hot-reload via tsx watch (file changes on host propagate instantly through the bind mount), `npm test` and `npm run test:coverage` now work inside the container, and `node_modules` stays Linux-native regardless of host OS.

**Validation:**
```bash
docker compose up -d --build
docker exec eventpulse-app npm test
docker exec eventpulse-app npm run test:coverage
```

---

## Session 6 — Query API (Read-only Endpoints)

**Date:** 2026-02-18

### Interaction Context (Provided to AI)

- Phase 5 of the EventPulse senior backend case study.
- Scope: read-only query endpoints over existing Postgres data. No mutations, no new ingestion paths.
- Required endpoints: `GET /api/v1/events` (paginated + filtered), `GET /api/v1/events/:event_id` (404 handling), `GET /api/v1/anomalies` (paginated + filtered).
- If anomalies are not persisted yet: create the `anomalies` table, minimal schema, no migrations framework overhaul.
- Clean Architecture: no cross-layer shortcuts.
- Indexed queries: add indexes for all filterable columns.

### Interaction Summary

Built the complete query API layer and wired anomaly persistence into the worker:

- **DB Schema** (`src/infrastructure/db/schema.ts`): Added `anomalies` table (anomaly_id, event_id, rule_id, severity, message, detected_at). Added indexes on both tables for all filterable columns.
- **Anomaly Repository** (`src/infrastructure/db/anomaly-repository.ts`): `insertAnomaly()` — generates UUID, inserts into anomalies table.
- **Event Query Repository** (`src/infrastructure/db/event-query-repository.ts`): `queryEvents()` with dynamic WHERE clauses (event_type, source, from/to date range) + limit/offset pagination. `findEventById()` for single-event lookup.
- **Anomaly Query Repository** (`src/infrastructure/db/anomaly-query-repository.ts`): `queryAnomalies()` with rule_id/severity filters + pagination.
- **DB Fastify Plugin** (`src/infrastructure/db/db-plugin.ts`): Manages Drizzle/postgres.js lifecycle for the HTTP server. Decorates `fastify.db`, closes pool on shutdown. Declared as `name: 'db'` for dependency resolution.
- **Query Use Cases** (`src/application/query-events.ts`, `src/application/query-anomalies.ts`): Thin application-layer functions that sanitize pagination params (clamp limit to 1–100, floor offset to 0) and delegate to repositories. Return `{ data, pagination }` envelopes.
- **Query Routes** (`src/interfaces/http/query-routes.ts`): Three endpoints registered via `fastify-plugin` with `dependencies: ['db']`.
- **Server Wiring** (`src/index.ts`): Registered `dbPlugin` before `queryRoutes` in the plugin chain alongside existing `redisPlugin` and `eventRoutes`.
- **Worker Anomaly Persistence** (`src/infrastructure/worker/stream-consumer.ts`): After rule evaluation, detected anomalies are now persisted to Postgres via `insertAnomaly()`. Persistence is best-effort — failure is logged but never blocks the consumer loop.
- **Worker Table Creation** (`src/worker.ts`): `CREATE TABLE IF NOT EXISTS` block now includes the `anomalies` table and `CREATE INDEX IF NOT EXISTS` for all filterable columns on both tables.

### Technical Decisions

| Decision | Rationale |
|---|---|
| **Separate DB plugin for HTTP server** | The worker manages its own connection via `createDbClient()`. The HTTP server needs a Fastify-managed lifecycle plugin that decorates `fastify.db` and closes the pool on shutdown. Keeps connection ownership clear. |
| **Pagination clamping (1–100)** | Prevents unbounded queries. Default limit of 20, max of 100. Offset floored to 0. Applied in the application layer, not the route handler, so the invariant holds for any future caller. |
| **Dynamic WHERE clause building** | Query repositories build Drizzle `and()` conditions only for provided filters. No filter = no WHERE clause. Avoids N separate query functions for each filter combination. |
| **Best-effort anomaly persistence** | Anomaly insert failures are caught and logged independently per anomaly. A single failed insert doesn't skip remaining anomalies or block the consumer. Consistent with the post-ACK rule evaluation pattern. |
| **Indexes on all filterable columns** | `event_type`, `source`, `timestamp`, `created_at` on events; `rule_id`, `severity`, `detected_at`, `event_id` on anomalies. Covers all query API filter paths. |
| **`dependencies: ['db']` on query routes** | Fastify-plugin dependency declaration ensures `fastify.db` exists before any query route handler executes. Same pattern as `event-routes` depending on `redis`. |

### Files Added/Modified

| File | Status |
|---|---|
| `src/infrastructure/db/schema.ts` | Modified (added anomalies table + indexes) |
| `src/infrastructure/db/anomaly-repository.ts` | New |
| `src/infrastructure/db/event-query-repository.ts` | New |
| `src/infrastructure/db/anomaly-query-repository.ts` | New |
| `src/infrastructure/db/db-plugin.ts` | New |
| `src/infrastructure/db/index.ts` | Modified (added new exports) |
| `src/application/query-events.ts` | New |
| `src/application/query-anomalies.ts` | New |
| `src/application/index.ts` | Modified (added query use case exports) |
| `src/interfaces/http/query-routes.ts` | New |
| `src/interfaces/http/index.ts` | Modified (added queryRoutes export) |
| `src/infrastructure/index.ts` | Modified (added dbPlugin export) |
| `src/index.ts` | Modified (registered dbPlugin + queryRoutes) |
| `src/infrastructure/worker/stream-consumer.ts` | Modified (anomaly persistence via insertAnomaly) |
| `src/worker.ts` | Modified (CREATE TABLE for anomalies + indexes) |

### Validation Method
```bash
docker compose up -d --build

# Verify query endpoints respond
curl -s http://localhost:3000/api/v1/events | jq .
# Expected: { "data": [...], "pagination": { "limit": 20, "offset": 0, "count": N } }

curl -s http://localhost:3000/api/v1/events?event_type=page_view&limit=5 | jq .
# Expected: filtered results with max 5 items

curl -s "http://localhost:3000/api/v1/events/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" | jq .
# Expected: single event or { "error": "Event not found" } with 404

curl -s http://localhost:3000/api/v1/anomalies | jq .
# Expected: { "data": [...], "pagination": { ... } }

curl -s http://localhost:3000/api/v1/anomalies?severity=medium | jq .
# Expected: anomalies filtered by severity

# Verify anomalies are persisted (send event that triggers a rule, then query)
curl -s -X POST http://localhost:3000/api/v1/events \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"page_view","source":"web","timestamp":"2026-02-18T12:00:00Z","payload":{}}' | jq .
# Wait 2-3s for worker to process
sleep 3
curl -s http://localhost:3000/api/v1/anomalies | jq .
# Expected: anomaly with rule_id "invalid-payload" should appear

# Verify directly in Postgres
docker exec eventpulse-db psql -U eventpulse -c "SELECT COUNT(*) FROM anomalies;"
docker exec eventpulse-db psql -U eventpulse -c "\di"  # List indexes
```

### AI Corrections / Fixes

**File:** `src/interfaces/http/query-routes.ts`

Two edge-case bugs were identified in the query route handlers:

- **NaN bypass on `limit`/`offset`:** `Number('abc')` produces `NaN`, and `Math.min(Math.max(NaN, 1), 500)` evaluates to `NaN`, which bypasses the application-layer clamp and breaks Drizzle's `limit()`/`offset()` calls. Added a `safeInt()` helper that returns `undefined` for missing values and `NaN` for non-integer strings. Both `/api/v1/events` and `/api/v1/anomalies` handlers now check for `NaN` and return `400` with a descriptive error before reaching the use case layer.

- **Unvalidated `from`/`to` timestamps:** Invalid ISO strings (e.g., `from=not-a-date`) were passed straight to the query repository, producing invalid SQL `WHERE timestamp >= 'Invalid Date'`. Added `isValidIso()` guard using `Date.parse()` — returns `400` if either value is unparseable. Also rejects `from > to` with a `400` to prevent empty-by-definition queries from reaching the database.

Both fixes are contained in the route handler layer. No changes to the application use cases or query repositories.

---

## Session 7 — Rule Storage + CRUD (P0)

**Date:** 2026-02-19

### Interaction Context (Provided to AI)

- Phase 7 of the EventPulse senior backend case study.
- Scope: DB-backed rule storage, CRUD API, threshold-based aggregation evaluation.
- Rules must come only from Postgres — no in-memory defaults at runtime.
- `InMemoryRuleRepository` retained only for existing unit tests.
- Threshold condition format: `{ type: "threshold", metric: "count", filters, operator, value }`.
- XACK order changed to: DB write → evaluate → anomaly persist → XACK.
- Preserve existing ingestion, persistence, and test behavior.

### Interaction Summary

Built the complete rule management and threshold evaluation system:

- **DB Schema** (`src/infrastructure/db/schema.ts`): Added `rules` table (rule_id UUID PK, name, enabled, severity, window_seconds, cooldown_seconds, condition JSONB, created_at, updated_at). Indexes on `enabled` and `severity`. Existing events and anomalies tables untouched.
- **Rule Repository** (`src/infrastructure/db/rule-repository.ts`): CRUD operations — `insertRule`, `findAllRules`, `findEnabledRules`, `findRuleById`, `updateRule`, `patchRule`, `deleteRule`. Follows existing repository patterns.
- **Zod Validation** (`src/application/rule-schema.ts`): `thresholdConditionSchema` validates type="threshold", metric="count", operators (> >= < <= == !=), finite value, optional event_type/source filters. `createRuleSchema`, `updateRuleSchema`, `patchRuleSchema` for CRUD endpoints. Severity enum: critical | warning | info.
- **CRUD Use Cases** (`src/application/rule-crud.ts`): Thin application-layer functions delegating to repository. `createRule`, `listRules`, `getRule`, `updateRuleFull`, `patchRulePartial`, `removeRule`.
- **Threshold Evaluator** (`src/application/threshold-evaluator.ts`): `ThresholdEvaluator` class with per-rule sliding windows (sorted timestamp arrays, pruned from front) and per-rule cooldown maps. Injectable `nowFn` for deterministic testing. For each event: filter match → window add → prune → count → operator compare → cooldown check → emit anomaly.
- **CRUD Routes** (`src/interfaces/http/rule-routes.ts`): POST (201), GET list, GET by ID, PUT, PATCH, DELETE (204). UUID validation on route params. Zod validation on bodies. 404 on not found. Plugin depends on `['db']`.
- **Worker Integration** (`src/worker.ts`): Removed `InMemoryRuleRepository` and `EventWindow`. Loads enabled rules from Postgres via `findEnabledRules()`. Creates `ThresholdEvaluator`. Passes both to `startConsumer()`. Added `CREATE TABLE IF NOT EXISTS rules` + indexes.
- **Stream Consumer** (`src/infrastructure/worker/stream-consumer.ts`): `ConsumerDeps` now holds `ThresholdEvaluator` + `RuleRow[]` instead of `Rule[]` + `EventWindow`. `startConsumer()` signature updated. `processEntry()` order changed to: insert → evaluate → persist anomaly → XACK. XACK moved to end of pipeline. Rule evaluation errors caught independently — do not prevent XACK.
- **Unit Tests**: `tests/application/rule-crud.test.ts` (11 tests) — CRUD use cases with mocked repository. `tests/application/threshold-evaluator.test.ts` (23 tests) — filter matching, window behavior, all 6 operators, cooldown enforcement, multiple rules, edge cases.

### Technical Decisions

| Decision | Rationale |
|---|---|
| **Separate ThresholdEvaluator vs adapting Rule interface** | DB-backed rules are data-driven (JSON condition), fundamentally different from the existing `Rule` interface which requires an `evaluate()` method. A new evaluator avoids coupling the two paradigms. Existing rules remain untouched. |
| **Per-rule sliding window as `number[]`** | Timestamps stored as epoch ms in sorted arrays. Pruning scans from the front (O(k) where k = expired entries), bounded by window_seconds. Simple, testable, no external dependency. |
| **Per-rule cooldown map** | `Map<rule_id, lastTriggerMs>` prevents rapid-fire anomaly generation. Checked after threshold comparison. Cooldown of 0 means no suppression. |
| **XACK after full pipeline** | Previous order was insert → XACK → evaluate. Now: insert → evaluate → anomaly persist → XACK. If anomaly persist fails mid-pipeline and worker crashes, the event is re-delivered and re-evaluated. Safer for reliability. |
| **Injectable `nowFn` on evaluator** | Same pattern as timestamp-drift rule. Makes window expiry and cooldown logic fully deterministic in tests without mocking globals. |
| **Severity enum: critical/warning/info** | Distinct from domain `Severity` (low/medium/high/critical). The rules table uses its own severity values as specified by the case study. Anomalies table stores severity as varchar(20) so either set works. |
| **Zod at route layer** | Validation happens before the use case layer. Invalid input never reaches the repository. Consistent with existing `eventSchema` pattern. |

### Files Added/Modified

| File | Status |
|---|---|
| `src/infrastructure/db/schema.ts` | Modified (added rules table) |
| `src/infrastructure/db/rule-repository.ts` | New |
| `src/infrastructure/db/index.ts` | Modified (added rule exports) |
| `src/application/rule-schema.ts` | New |
| `src/application/rule-crud.ts` | New |
| `src/application/threshold-evaluator.ts` | New |
| `src/application/index.ts` | Modified (added rule/threshold exports) |
| `src/interfaces/http/rule-routes.ts` | New |
| `src/interfaces/http/index.ts` | Modified (added ruleRoutes export) |
| `src/infrastructure/index.ts` | Modified (added rule repo exports) |
| `src/index.ts` | Modified (registered ruleRoutes) |
| `src/worker.ts` | Modified (DB-backed rules, ThresholdEvaluator, rules CREATE TABLE) |
| `src/infrastructure/worker/stream-consumer.ts` | Modified (ThresholdEvaluator, XACK order) |
| `tests/application/rule-crud.test.ts` | New |
| `tests/application/threshold-evaluator.test.ts` | New |
| `vitest.config.ts` | Modified (added coverage paths) |

### Not Modified
- `src/domain/rules/*` (types.ts, rate-spike.ts, invalid-payload.ts, timestamp-drift.ts)
- `src/application/rule-engine.ts` (EventWindow, evaluateEvent)
- `src/infrastructure/rules/in-memory-rule-repo.ts` (kept for existing tests)
- `tests/rules/*` (all existing tests untouched)
- events table, anomalies table, existing indexes
- Ingestion API routes, query API routes

### Validation Method
```bash
# Rebuild containers
docker compose up -d --build

# Run all tests (existing + new)
docker exec eventpulse-app npm test

# Coverage (should maintain >80%)
docker exec eventpulse-app npm run test:coverage

# Create a rule
curl -s -X POST http://localhost:3000/api/v1/rules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "High error rate",
    "severity": "critical",
    "window_seconds": 60,
    "cooldown_seconds": 300,
    "condition": {
      "type": "threshold",
      "metric": "count",
      "filters": { "event_type": "error", "source": "payment_service" },
      "operator": ">",
      "value": 5
    }
  }' | jq .
# Expected: 201 with rule row including generated rule_id

# List rules
curl -s http://localhost:3000/api/v1/rules | jq .

# Get single rule
curl -s http://localhost:3000/api/v1/rules/<rule_id> | jq .

# Update rule (PUT)
curl -s -X PUT http://localhost:3000/api/v1/rules/<rule_id> \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Updated rule",
    "enabled": true,
    "severity": "warning",
    "window_seconds": 120,
    "cooldown_seconds": 60,
    "condition": {
      "type": "threshold",
      "metric": "count",
      "filters": { "event_type": "error" },
      "operator": ">=",
      "value": 3
    }
  }' | jq .

# Partial update (PATCH)
curl -s -X PATCH http://localhost:3000/api/v1/rules/<rule_id> \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}' | jq .

# Delete rule
curl -s -X DELETE http://localhost:3000/api/v1/rules/<rule_id>
# Expected: 204 No Content

# Trigger threshold rule (restart worker to pick up new rules)
# 1. Create a rule with low threshold
curl -s -X POST http://localhost:3000/api/v1/rules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Error burst",
    "severity": "critical",
    "window_seconds": 60,
    "cooldown_seconds": 0,
    "condition": {
      "type": "threshold",
      "metric": "count",
      "filters": { "event_type": "error" },
      "operator": ">",
      "value": 3
    }
  }' | jq .

# 2. Restart worker to load the new rule
docker restart eventpulse-worker

# 3. Send 4+ matching events
for i in $(seq 1 5); do
  curl -s -X POST http://localhost:3000/api/v1/events \
    -H 'Content-Type: application/json' \
    -d "{\"event_type\":\"error\",\"source\":\"payment_service\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"payload\":{\"code\":500}}"
  sleep 0.5
done

# 4. Check anomalies
sleep 3
curl -s http://localhost:3000/api/v1/anomalies | jq .
# Expected: anomaly with the rule's rule_id should appear

# Verify rules table in Postgres
docker exec eventpulse-db psql -U eventpulse -c "SELECT rule_id, name, enabled, severity FROM rules;"
docker exec eventpulse-db psql -U eventpulse -c "\di"  # Should show idx_rules_enabled, idx_rules_severity
```
