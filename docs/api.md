# EventPulse API Reference

> **Generated from source code.** Every endpoint, field, status code, and example below is derived directly from the Fastify route handlers, Zod schemas, and Drizzle ORM schema in this repository. Nothing is invented.

---

## Table of Contents

- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Conventions](#conventions)
- [Events](#events)
  - [POST /api/v1/events](#post-apiv1events)
  - [POST /api/v1/events/batch](#post-apiv1eventsbatch)
  - [GET /api/v1/events](#get-apiv1events)
  - [GET /api/v1/events/health](#get-apiv1eventshealth)
  - [GET /api/v1/events/:event_id](#get-apiv1eventsevent_id)
- [Anomalies](#anomalies)
  - [GET /api/v1/anomalies](#get-apiv1anomalies)
- [Rules](#rules)
  - [POST /api/v1/rules](#post-apiv1rules)
  - [GET /api/v1/rules](#get-apiv1rules)
  - [GET /api/v1/rules/:rule_id](#get-apiv1rulesrule_id)
  - [PUT /api/v1/rules/:rule_id](#put-apiv1rulesrule_id)
  - [PATCH /api/v1/rules/:rule_id](#patch-apiv1rulesrule_id)
  - [DELETE /api/v1/rules/:rule_id](#delete-apiv1rulesrule_id)
- [Metrics](#metrics)
  - [GET /api/v1/metrics](#get-apiv1metrics)
- [Dashboard](#dashboard)
- [WebSocket](#websocket)
- [Data Models](#data-models)
- [Error Response Formats](#error-response-formats)
- [Unknowns and Unspecified Behaviors](#unknowns-and-unspecified-behaviors)

---

## Overview

EventPulse is a real-time event ingestion and anomaly detection backend. Events are submitted via HTTP, enqueued to Redis Streams, persisted to PostgreSQL by a background worker, and evaluated against threshold and statistical rules. Detected anomalies are broadcast over WebSocket.

**Framework:** Fastify 5.x
**Validation:** Zod (all request bodies)
**Database:** PostgreSQL via Drizzle ORM

---

## Base URL

```
http://localhost:3000
```

Configurable via `HOST` (default `0.0.0.0`) and `PORT` (default `3000`) environment variables.

---

## Authentication

No authentication is implemented. All endpoints are publicly accessible.

---

## Conventions

- All timestamps are **ISO-8601** strings with timezone (e.g. `2026-02-20T12:00:00.000Z`).
- `event_id` and `rule_id` are UUIDs (v4, lowercase hyphenated).
- `payload` and `metadata` are open-ended JSON objects (`Record<string, unknown>`).
- **Pagination:** `count` in the pagination envelope reflects the number of rows returned in the current response, **not** the total matching row count in the database.
- Event ingestion endpoints use **fire-and-forget** enqueue semantics: a `202 Accepted` means the event was accepted for processing, not that it was persisted.
- Route registration order note: `GET /api/v1/events/health` (static) takes precedence over `GET /api/v1/events/:event_id` (parameterized) — calling `GET /api/v1/events/health` always reaches the health handler.

---

## Events

### POST /api/v1/events

Ingest a single event. The event is validated, assigned a server-generated `event_id` if not supplied, enqueued to Redis Streams (fire-and-forget), and acknowledged immediately with `202 Accepted`.

**Method:** `POST`
**Path:** `/api/v1/events`
**Content-Type:** `application/json`

#### Request Body

All fields validated by `eventSchema` (Zod).

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `event_id` | string (UUID) | No | Must be a valid UUID v4 if supplied | Assigned by server via `crypto.randomUUID()` if omitted |
| `event_type` | string | **Yes** | min length 1, max length 255 | Event category (e.g. `"page_view"`, `"error"`) |
| `source` | string | **Yes** | min length 1, max length 255 | Originating system or service |
| `timestamp` | string | **Yes** | Valid ISO-8601 datetime | Event occurrence time |
| `payload` | object | No | Any JSON object | Event-specific data; defaults to `{}` |
| `metadata` | object | No | Any JSON object | Routing / tracing context; defaults to `{}` |

#### Example Request

```json
{
  "event_type": "page_view",
  "source": "web-frontend",
  "timestamp": "2026-02-20T12:00:00.000Z",
  "payload": {
    "url": "/dashboard",
    "user_agent": "Mozilla/5.0"
  },
  "metadata": {
    "trace_id": "abc-123"
  }
}
```

#### Responses

**202 Accepted** — Event accepted and enqueued.

```json
{
  "status": "accepted",
  "event_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | Always `"accepted"` |
| `event_id` | string (UUID) | The assigned or echoed event ID |

**400 Bad Request** — Validation failed.

```json
{
  "error": "Validation failed",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["event_type"],
      "message": "Required"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `error` | string | Always `"Validation failed"` |
| `issues` | ZodIssue[] | Array of Zod validation issue objects |

---

### POST /api/v1/events/batch

Ingest multiple events in one request. The entire batch is validated atomically — if any event fails validation, the whole batch is rejected (no partial success). All events are enqueued concurrently, fire-and-forget.

**Method:** `POST`
**Path:** `/api/v1/events/batch`
**Content-Type:** `application/json`

#### Request Body

An array of event objects, each conforming to the same schema as `POST /api/v1/events`.

| Constraint | Value |
|---|---|
| Minimum items | 1 (enforced by Zod schema) |
| Maximum items | **Not enforced in schema or code** (see [Unknowns](#unknowns-and-unspecified-behaviors)) |
| Per-item fields | Same as single event — `event_id` optional, all others same constraints |

#### Example Request

```json
[
  {
    "event_type": "cpu_spike",
    "source": "prod-web-01",
    "timestamp": "2026-02-20T12:00:00.000Z",
    "payload": { "cpu_percent": 95 }
  },
  {
    "event_type": "cpu_spike",
    "source": "prod-web-02",
    "timestamp": "2026-02-20T12:00:01.000Z",
    "payload": { "cpu_percent": 88 }
  }
]
```

#### Responses

**202 Accepted** — All events accepted and enqueued.

```json
{
  "status": "accepted",
  "count": 2,
  "event_ids": [
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002"
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | Always `"accepted"` |
| `count` | number (integer) | Number of events in the batch |
| `event_ids` | string[] | Assigned or echoed UUIDs in the same order as the input array |

**400 Bad Request** — Validation failed (entire batch rejected).

```json
{
  "error": "Validation failed",
  "issues": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "array",
      "path": [],
      "message": "Batch must contain at least one event"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `error` | string | Always `"Validation failed"` |
| `issues` | ZodIssue[] | Zod validation issue objects; `path` may include array indices for per-item errors |

---

### GET /api/v1/events

Return a paginated, filtered list of persisted events from PostgreSQL.

**Method:** `GET`
**Path:** `/api/v1/events`

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `limit` | integer | No | Must be a valid integer; clamped to [1, 500] | Max results per page. Default: `50` |
| `offset` | integer | No | Must be a valid integer; floored to 0 | Row offset for pagination. Default: `0` |
| `event_type` | string | No | — | Filter by exact `event_type` value |
| `source` | string | No | — | Filter by exact `source` value |
| `from` | string | No | Valid ISO-8601; must be ≤ `to` if both provided | Lower bound on `timestamp` (inclusive) |
| `to` | string | No | Valid ISO-8601; must be ≥ `from` if both provided | Upper bound on `timestamp` (inclusive) |

#### Example Request

```
GET /api/v1/events?event_type=cpu_spike&limit=10&from=2026-02-20T00:00:00Z
```

#### Responses

**200 OK**

```json
{
  "data": [
    {
      "event_id": "550e8400-e29b-41d4-a716-446655440000",
      "event_type": "cpu_spike",
      "source": "prod-web-01",
      "timestamp": "2026-02-20T12:00:00.000Z",
      "payload": { "cpu_percent": 95 },
      "metadata": {},
      "created_at": "2026-02-20T12:00:00.123Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "count": 1
  }
}
```

| Field | Type | Description |
|---|---|---|
| `data` | EventRecord[] | Array of event rows from the database |
| `pagination.limit` | integer | Effective limit applied (after clamping) |
| `pagination.offset` | integer | Effective offset applied |
| `pagination.count` | integer | Number of rows returned in this response (not total DB count) |

**400 Bad Request** — Invalid query parameter.

```json
{ "error": "limit must be an integer" }
```

Possible error strings:
- `"limit must be an integer"`
- `"offset must be an integer"`
- `"from must be a valid ISO-8601 timestamp"`
- `"to must be a valid ISO-8601 timestamp"`
- `"from must not be after to"`

---

### GET /api/v1/events/health

Check service health. Pings Redis and reads the worker heartbeat key (`worker:health`) set by the background worker process with a 120-second TTL.

**Method:** `GET`
**Path:** `/api/v1/events/health`

> **Route priority:** This static path takes precedence over `GET /api/v1/events/:event_id` in Fastify's router.

#### Responses

**200 OK** — Redis is reachable.

```json
{
  "status": "ok",
  "redis": "PONG",
  "worker": "ok"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | Always `"ok"` on 200 |
| `redis` | string | Redis `PING` response — always `"PONG"` on success |
| `worker` | `"ok"` \| `"degraded"` \| `"unknown"` | Worker health: `"ok"` / `"degraded"` from Redis key; `"unknown"` if key is absent or Redis read fails |

**503 Service Unavailable** — Redis is unreachable.

```json
{
  "status": "degraded",
  "redis": "unreachable",
  "worker": "unknown"
}
```

---

### GET /api/v1/events/:event_id

Retrieve a single event by its UUID.

**Method:** `GET`
**Path:** `/api/v1/events/:event_id`

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `event_id` | string (UUID) | The event's UUID |

> **Note:** No UUID format validation is performed on `:event_id` in the handler. Non-UUID strings are passed to the database query and will return 404.

#### Example Request

```
GET /api/v1/events/550e8400-e29b-41d4-a716-446655440000
```

#### Responses

**200 OK**

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "cpu_spike",
  "source": "prod-web-01",
  "timestamp": "2026-02-20T12:00:00.000Z",
  "payload": { "cpu_percent": 95 },
  "metadata": {},
  "created_at": "2026-02-20T12:00:00.123Z"
}
```

**404 Not Found**

```json
{ "error": "Event not found" }
```

---

## Anomalies

### GET /api/v1/anomalies

Return a paginated, filtered list of detected anomalies from PostgreSQL.

**Method:** `GET`
**Path:** `/api/v1/anomalies`

#### Query Parameters

| Parameter | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `limit` | integer | No | Valid integer; clamped to [1, 500] | Max results per page. Default: `50` |
| `offset` | integer | No | Valid integer; floored to 0 | Row offset for pagination. Default: `0` |
| `rule_id` | string | No | — | Filter by exact `rule_id` value |
| `severity` | string | No | — | Filter by exact `severity` value (e.g. `"critical"`, `"warning"`, `"info"`) |

#### Example Request

```
GET /api/v1/anomalies?severity=warning&limit=20
```

#### Responses

**200 OK**

```json
{
  "data": [
    {
      "anomaly_id": "661e8400-e29b-41d4-a716-446655440000",
      "event_id": "550e8400-e29b-41d4-a716-446655440000",
      "rule_id": "zscore-count-spike",
      "severity": "warning",
      "message": "Z-score spike detected: z=2.24, current=30, mean=3, stddev=0.89, bucketSeconds=10, bucketStart=2026-02-20T00:15:00.000Z",
      "detected_at": "2026-02-20T00:15:05.123Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "count": 1
  }
}
```

| Field | Type | Description |
|---|---|---|
| `data` | AnomalyRecord[] | Array of anomaly rows from the database |
| `pagination.limit` | integer | Effective limit applied |
| `pagination.offset` | integer | Effective offset applied |
| `pagination.count` | integer | Number of rows returned in this response |

**400 Bad Request**

```json
{ "error": "limit must be an integer" }
```

Possible error strings:
- `"limit must be an integer"`
- `"offset must be an integer"`

---

## Rules

Rules define threshold conditions evaluated against incoming events. They are stored in PostgreSQL, loaded by the worker on startup, and hot-reloaded via Redis Pub/Sub when created, updated, or deleted.

### POST /api/v1/rules

Create a new threshold rule.

**Method:** `POST`
**Path:** `/api/v1/rules`
**Content-Type:** `application/json`

#### Request Body

Validated by `createRuleSchema` (Zod).

| Field | Type | Required | Constraints | Default | Description |
|---|---|---|---|---|---|
| `name` | string | **Yes** | min length 1, max length 255 | — | Human-readable rule name |
| `enabled` | boolean | No | — | `true` | Whether the rule is active |
| `severity` | string | **Yes** | `"critical"` \| `"warning"` \| `"info"` | — | Anomaly severity when triggered |
| `window_seconds` | integer | **Yes** | min 1 | — | Sliding evaluation window in seconds |
| `cooldown_seconds` | integer | No | min 0 | `0` | Minimum seconds between consecutive anomalies from this rule |
| `condition` | object | **Yes** | See ThresholdCondition | — | Threshold condition definition |

**ThresholdCondition fields:**

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `type` | string | **Yes** | Must be `"threshold"` | Condition type literal |
| `metric` | string | **Yes** | Must be `"count"` | Metric to evaluate |
| `operator` | string | **Yes** | `">"` \| `">="` \| `"<"` \| `"<="` \| `"=="` \| `"!="` | Comparison operator |
| `value` | number | **Yes** | Must be finite | Threshold value |
| `filters` | object | No | See below | Optional event filters |

**ThresholdCondition.filters fields:**

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `event_type` | string | No | min length 1 | Filter to events with this `event_type` |
| `source` | string | No | min length 1 | Filter to events with this `source` |

#### Example Request

```json
{
  "name": "High error rate",
  "severity": "critical",
  "window_seconds": 60,
  "cooldown_seconds": 300,
  "condition": {
    "type": "threshold",
    "metric": "count",
    "filters": {
      "event_type": "error",
      "source": "payment_service"
    },
    "operator": ">",
    "value": 5
  }
}
```

#### Responses

**201 Created** — Returns the full rule row.

```json
{
  "rule_id": "772e8400-e29b-41d4-a716-446655440000",
  "name": "High error rate",
  "enabled": true,
  "severity": "critical",
  "window_seconds": 60,
  "cooldown_seconds": 300,
  "condition": {
    "type": "threshold",
    "metric": "count",
    "filters": {
      "event_type": "error",
      "source": "payment_service"
    },
    "operator": ">",
    "value": 5
  },
  "created_at": "2026-02-20T12:00:00.000Z",
  "updated_at": "2026-02-20T12:00:00.000Z"
}
```

**400 Bad Request** — Validation failed. Error uses `ZodError.flatten()` format.

```json
{
  "error": {
    "formErrors": [],
    "fieldErrors": {
      "severity": ["Invalid enum value. Expected 'critical' | 'warning' | 'info', received 'high'"],
      "window_seconds": ["Expected integer, received float"]
    }
  }
}
```

---

### GET /api/v1/rules

List all rules (both enabled and disabled).

**Method:** `GET`
**Path:** `/api/v1/rules`

#### Responses

**200 OK** — Returns an array of all rule rows. Empty array if no rules exist.

```json
[
  {
    "rule_id": "772e8400-e29b-41d4-a716-446655440000",
    "name": "High error rate",
    "enabled": true,
    "severity": "critical",
    "window_seconds": 60,
    "cooldown_seconds": 300,
    "condition": {
      "type": "threshold",
      "metric": "count",
      "filters": { "event_type": "error", "source": "payment_service" },
      "operator": ">",
      "value": 5
    },
    "created_at": "2026-02-20T12:00:00.000Z",
    "updated_at": "2026-02-20T12:00:00.000Z"
  }
]
```

---

### GET /api/v1/rules/:rule_id

Retrieve a single rule by its UUID.

**Method:** `GET`
**Path:** `/api/v1/rules/:rule_id`

#### Path Parameters

| Parameter | Type | Constraints | Description |
|---|---|---|---|
| `rule_id` | string | Must be a valid UUID (regex-validated in handler) | The rule's UUID |

#### Responses

**200 OK** — Full rule row (same shape as the `POST` 201 response).

**400 Bad Request**

```json
{ "error": "rule_id must be a valid UUID" }
```

**404 Not Found**

```json
{ "error": "Rule not found" }
```

---

### PUT /api/v1/rules/:rule_id

Fully replace an existing rule. All fields are required (no defaults applied on update).

**Method:** `PUT`
**Path:** `/api/v1/rules/:rule_id`
**Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Constraints | Description |
|---|---|---|---|
| `rule_id` | string | Must be a valid UUID | The rule's UUID |

#### Request Body

Validated by `updateRuleSchema` (Zod). Same fields as `POST /api/v1/rules` with one difference: `enabled` and `cooldown_seconds` have **no defaults** and are required.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | **Yes** | min 1, max 255 |
| `enabled` | boolean | **Yes** | — |
| `severity` | string | **Yes** | `"critical"` \| `"warning"` \| `"info"` |
| `window_seconds` | integer | **Yes** | min 1 |
| `cooldown_seconds` | integer | **Yes** | min 0 |
| `condition` | ThresholdCondition | **Yes** | Same as create |

#### Responses

**200 OK** — Returns the updated rule row.

**400 Bad Request**

```json
{ "error": "rule_id must be a valid UUID" }
```
or (Zod flatten format on body validation failure):
```json
{
  "error": {
    "formErrors": [],
    "fieldErrors": { "name": ["Required"] }
  }
}
```

**404 Not Found**

```json
{ "error": "Rule not found" }
```

---

### PATCH /api/v1/rules/:rule_id

Partially update an existing rule. All fields are optional, but at least one must be provided.

**Method:** `PATCH`
**Path:** `/api/v1/rules/:rule_id`
**Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Constraints | Description |
|---|---|---|---|
| `rule_id` | string | Must be a valid UUID | The rule's UUID |

#### Request Body

Validated by `patchRuleSchema` (Zod). All fields optional. At least one field must be present (enforced by Zod `.refine()`).

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | No | min 1, max 255 |
| `enabled` | boolean | No | — |
| `severity` | string | No | `"critical"` \| `"warning"` \| `"info"` |
| `window_seconds` | integer | No | min 1 |
| `cooldown_seconds` | integer | No | min 0 |
| `condition` | ThresholdCondition | No | Same structure as create |

#### Example Request

```json
{ "enabled": false }
```

#### Responses

**200 OK** — Returns the updated rule row.

**400 Bad Request** — Empty body `{}` triggers the refine error:

```json
{
  "error": {
    "formErrors": ["At least one field must be provided"],
    "fieldErrors": {}
  }
}
```

Also `{ "error": "rule_id must be a valid UUID" }` for invalid UUID in path.

**404 Not Found**

```json
{ "error": "Rule not found" }
```

---

### DELETE /api/v1/rules/:rule_id

Delete a rule permanently.

**Method:** `DELETE`
**Path:** `/api/v1/rules/:rule_id`

#### Path Parameters

| Parameter | Type | Constraints | Description |
|---|---|---|---|
| `rule_id` | string | Must be a valid UUID | The rule's UUID |

#### Responses

**204 No Content** — Rule deleted. No response body.

**400 Bad Request**

```json
{ "error": "rule_id must be a valid UUID" }
```

**404 Not Found**

```json
{ "error": "Rule not found" }
```

---

## Metrics

### GET /api/v1/metrics

Return event counts and per-second rates grouped by `event_type` or `source` within a sliding time window. Queries only the `events` table.

**Method:** `GET`
**Path:** `/api/v1/metrics`

#### Query Parameters

| Parameter | Type | Required | Constraints | Default | Description |
|---|---|---|---|---|---|
| `window_seconds` | integer | No | Must be integer in [10, 3600] | `60` | Time window size in seconds (window end = server `now()`) |
| `group_by` | string | No | `"event_type"` \| `"source"` | `"event_type"` | Column to group counts by |
| `event_type` | string | No | — | — | Pre-filter: only count events with this `event_type` |
| `source` | string | No | — | — | Pre-filter: only count events with this `source` |

#### Example Request

```
GET /api/v1/metrics?window_seconds=300&group_by=source&event_type=error
```

#### Responses

**200 OK**

```json
{
  "window_seconds": 300,
  "group_by": "source",
  "from": "2026-02-20T11:55:00.000Z",
  "to": "2026-02-20T12:00:00.000Z",
  "metrics": [
    {
      "key": "payment_service",
      "count": 42,
      "rate_per_sec": 0.14
    },
    {
      "key": "auth_service",
      "count": 7,
      "rate_per_sec": 0.0233
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `window_seconds` | integer | Effective window size used |
| `group_by` | string | Effective group-by column used |
| `from` | string (ISO-8601) | Window start timestamp |
| `to` | string (ISO-8601) | Window end timestamp (server `now()` at query time) |
| `metrics` | MetricsBucket[] | One entry per distinct group value |
| `metrics[].key` | string | The group-by value (e.g. source name or event type) |
| `metrics[].count` | integer | Total event count in the window |
| `metrics[].rate_per_sec` | number | `count / window_seconds`, rounded to 4 decimal places |

**400 Bad Request** — Invalid query parameter.

```json
{ "error": "window_seconds must be an integer" }
```

Possible error strings:
- `"window_seconds must be an integer"` — non-integer value supplied
- `"window_seconds must be between 10 and 3600"` — value out of allowed range
- `"group_by must be one of: event_type, source"` — unrecognized group_by value

---

## Dashboard

The server serves a pre-built React SPA from `public/dist/`. These are static file-serving routes, not JSON API endpoints.

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard` | Returns `public/dist/index.html` (React app entry point) |
| `GET` | `/dashboard/*` | Returns bundled static assets (JS, CSS, images) with correct MIME types; falls back to `index.html` for unknown paths (SPA routing) |

**404** is returned from `GET /dashboard` if the frontend has not been built (`npm run build:frontend`).

---

## WebSocket

### Upgrade Path: `GET /ws` → WebSocket

The server upgrades HTTP connections to WebSocket on the `/ws` path. This is handled by a custom RFC 6455 implementation (no `ws` npm package).

**Upgrade URL:** `ws://localhost:3000/ws`

#### Protocol Details

- **Heartbeat:** Server sends a PING frame every 30 seconds. Clients must respond with a PONG frame within 30 seconds or they are disconnected.
- **Client-to-server messages:** The server does not process text or binary frames from clients. PING frames from the client are echoed as PONG frames. CLOSE frames are echoed and the connection is torn down gracefully.
- **Server-to-client messages:** The server broadcasts anomaly notifications to **all connected clients** when anomalies are detected.

#### Server-to-Client Message Format

When an anomaly is detected and published by the worker, the server broadcasts a JSON text frame to all connected WebSocket clients:

```json
{
  "type": "anomaly",
  "severity": "warning",
  "message": "Z-score spike detected: z=2.24, current=30, mean=3, stddev=0.89, bucketSeconds=10, bucketStart=2026-02-20T00:15:00.000Z",
  "detected_at": "2026-02-20T00:15:05.123Z",
  "anomaly_id": "661e8400-e29b-41d4-a716-446655440000",
  "rule_id": "zscore-count-spike"
}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | Always `"anomaly"` |
| `severity` | string | Anomaly severity (`"critical"`, `"warning"`, `"info"`) |
| `message` | string | Human-readable description of the anomaly |
| `detected_at` | string (ISO-8601) | Timestamp when the anomaly was detected |
| `anomaly_id` | string (UUID) | The anomaly's database ID |
| `rule_id` | string | The rule or profile that triggered the anomaly |

---

## Data Models

### EventRecord

Fields returned by `GET /api/v1/events` and `GET /api/v1/events/:event_id` (DB row shape from Drizzle).

| Field | Type | Description |
|---|---|---|
| `event_id` | string (UUID) | Primary key |
| `event_type` | string | Event category |
| `source` | string | Originating system |
| `timestamp` | string (ISO-8601) | Event occurrence time (timestamptz) |
| `payload` | object | Event-specific data (JSONB) |
| `metadata` | object | Routing / tracing context (JSONB) |
| `created_at` | string (ISO-8601) | Row insertion time (timestamptz) |

### AnomalyRecord

Fields returned by `GET /api/v1/anomalies`.

| Field | Type | Description |
|---|---|---|
| `anomaly_id` | string (UUID) | Primary key |
| `event_id` | string (UUID) | Triggering event ID (not a FK constraint) |
| `rule_id` | string | Rule or profile identifier that fired |
| `severity` | string | `"critical"` \| `"warning"` \| `"info"` (threshold) or other string (statistical) |
| `message` | string | Human-readable anomaly description (max 1024 chars) |
| `detected_at` | string (ISO-8601) | When the anomaly was detected (timestamptz) |

### RuleRecord

Fields returned by all Rule endpoints.

| Field | Type | Description |
|---|---|---|
| `rule_id` | string (UUID) | Primary key (server-generated) |
| `name` | string | Human-readable rule name |
| `enabled` | boolean | Whether the rule is active |
| `severity` | string | `"critical"` \| `"warning"` \| `"info"` |
| `window_seconds` | integer | Sliding evaluation window in seconds |
| `cooldown_seconds` | integer | Min seconds between anomaly firings |
| `condition` | object | ThresholdCondition object (JSONB) |
| `created_at` | string (ISO-8601) | Creation timestamp |
| `updated_at` | string (ISO-8601) | Last update timestamp |

### ThresholdCondition

Stored as JSONB in the `rules.condition` column.

| Field | Type | Description |
|---|---|---|
| `type` | string | Always `"threshold"` |
| `metric` | string | Always `"count"` |
| `operator` | string | `">"` \| `">="` \| `"<"` \| `"<="` \| `"=="` \| `"!="` |
| `value` | number | Threshold comparison value |
| `filters` | object | Optional; may contain `event_type` (string) and/or `source` (string) |

### MetricsBucket

One entry in the `metrics` array of `GET /api/v1/metrics`.

| Field | Type | Description |
|---|---|---|
| `key` | string | The group-by column value |
| `count` | integer | Total event count in the window |
| `rate_per_sec` | number | `count / window_seconds` (4 decimal places) |

### Pagination Envelope

Common pagination wrapper used by `GET /api/v1/events` and `GET /api/v1/anomalies`.

| Field | Type | Description |
|---|---|---|
| `data` | array | Array of records |
| `pagination.limit` | integer | Effective limit applied |
| `pagination.offset` | integer | Effective offset applied |
| `pagination.count` | integer | **Number of records in `data`** — not the total matching DB count |

---

## Error Response Formats

Two distinct error formats are used, depending on the endpoint:

### Format A — Simple string error (query/path validation)

Used by: `GET /api/v1/events`, `GET /api/v1/anomalies`, `GET /api/v1/metrics`, `GET|PUT|PATCH|DELETE /api/v1/rules/:rule_id` (UUID check)

```json
{ "error": "<human-readable message>" }
```

### Format B — Zod issues array (event body validation)

Used by: `POST /api/v1/events`, `POST /api/v1/events/batch`

```json
{
  "error": "Validation failed",
  "issues": [ /* ZodIssue[] */ ]
}
```

### Format C — Zod flattened error (rule body validation)

Used by: `POST /api/v1/rules`, `PUT /api/v1/rules/:rule_id`, `PATCH /api/v1/rules/:rule_id`

```json
{
  "error": {
    "formErrors": [ /* top-level error strings */ ],
    "fieldErrors": {
      "fieldName": [ /* per-field error strings */ ]
    }
  }
}
```

---

## Unknowns and Unspecified Behaviors

| Item | Status | Notes |
|---|---|---|
| `POST /api/v1/events/batch` — maximum batch size | **Not enforced in code** | Zod schema uses `.min(1)` but no `.max()`. No upper bound is validated. |
| `GET /api/v1/events/:event_id` — UUID format enforcement | **Not enforced** | The handler passes any string to the DB query. Non-UUID values return 404. |
| `GET /api/v1/events` and `GET /api/v1/anomalies` — `pagination.count` | **Is the result count, not total** | `count = data.length`. There is no `total` field giving the full matching row count. |
| DB column types for `timestamp`/`created_at`/`detected_at`/`updated_at` | Drizzle returns JavaScript `Date` objects which Fastify serializes to ISO-8601 strings in JSON. The exact format is timezone-aware (`timestamptz`). | |
| `severity` field on `AnomalyRecord` | Stored as `varchar(20)`. For threshold rules the values are `"critical"`, `"warning"`, `"info"`. Statistical evaluator uses the same severity enum. Other values are technically storable but not produced by current code. | |
| Hot-reload propagation delay | After a rule CRUD operation, the worker receives a Pub/Sub notification and reloads rules from DB. The propagation delay is not quantified in code. | |
| Worker `LOG_LEVEL: debug` | When `LOG_LEVEL=debug` is set on the worker service, per-profile statistical evaluation traces are emitted at debug level via Pino. These are internal logs, not API responses. | |
