# EventPulse — Validation Guide (Sessions 1–3)

Consolidated verification steps for the ingestion pipeline, persistence layer, reliability, and performance.

> **Shell conventions:** Every command is shown in bash first. Where a command is bash-only, a PowerShell (Windows) equivalent follows. Docker and `redis-cli`/`psql` commands work identically on both platforms.
>
> **`jq` is optional.** All `jq` usages include a jq-free alternative. Raw JSON output from `curl` is still valid for manual inspection.

---

## 1. Quickstart

```bash
docker compose up -d --build
docker compose ps
```

Expected: four containers running.

| Container | Role | Status |
|---|---|---|
| `eventpulse-db` | PostgreSQL 16 | Healthy |
| `eventpulse-redis` | Redis 7 | Healthy |
| `eventpulse-app` | Fastify API | Running |
| `eventpulse-worker` | Stream consumer | Running |

---

## 2. Healthcheck

```bash
curl -s http://localhost:3000/api/v1/events/health | jq .
# jq-free: curl -s http://localhost:3000/api/v1/events/health
```

**PowerShell:**
```powershell
Invoke-RestMethod http://localhost:3000/api/v1/events/health
```

Expected:
```json
{ "status": "ok", "redis": "PONG" }
```

---

## 3. Ingestion Validation

### 3a. Single event (happy path)

**Bash:**
```bash
curl -s -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{"event_type":"page_view","source":"web","timestamp":"2026-02-18T12:00:00Z","payload":{"url":"/home"}}' | jq .
# jq-free: remove '| jq .'
```

**PowerShell:**
```powershell
$body = '{"event_type":"page_view","source":"web","timestamp":"2026-02-18T12:00:00Z","payload":{"url":"/home"}}'
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/events" -ContentType "application/json" -Body $body
```

Expected: HTTP `202 Accepted`
```json
{ "status": "accepted", "event_id": "<uuid>" }
```

### 3b. Batch ingestion (5 events)

**Bash:**
```bash
for i in $(seq 1 5); do
  curl -s -X POST http://localhost:3000/api/v1/events \
    -H "Content-Type: application/json" \
    -d "{
      \"event_type\": \"validation_test\",
      \"source\": \"docs\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",
      \"payload\": { \"seq\": $i }
    }" | jq -r '.status + " " + .event_id'
done
# jq-free: remove '| jq -r ...' — raw JSON per line
```

**PowerShell:**
```powershell
1..5 | ForEach-Object {
  $body = @{
    event_type = "validation_test"
    source     = "docs"
    timestamp  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    payload    = @{ seq = $_ }
  } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/events" -ContentType "application/json" -Body $body
  Write-Host "$($r.status) $($r.event_id)"
}
```

Expected: five lines, each `accepted <uuid>`.

### 3c. Negative validation (missing required fields)

**Bash:**
```bash
curl -s -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{"payload":{"url":"/home"}}' | jq .
# jq-free: remove '| jq .'
```

**PowerShell:**
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/events" -ContentType "application/json" -Body '{"payload":{"url":"/home"}}'
# PowerShell will throw on non-2xx — this is expected
```

Expected: HTTP `400 Bad Request` with Zod validation issues listing missing `event_type`, `source`, and `timestamp`.

---

## 4. Redis Verification

Confirm events are present in the stream:

```bash
# Stream length
docker exec eventpulse-redis redis-cli XLEN events_stream

# Last 3 entries
docker exec eventpulse-redis redis-cli XREVRANGE events_stream + - COUNT 3
```

Expected: `XLEN` returns a positive integer. `XREVRANGE` shows entries with `event_type`, `source`, `timestamp`, `payload`, and `metadata` fields.

---

## 5. Persistence Verification (Session 3)

### 5a. Worker logs

```bash
docker logs eventpulse-worker --tail 20
```

Expected log lines: `Consumer started`, `Event persisted` entries with `event_id` values.

### 5b. Postgres query

```bash
docker exec eventpulse-db psql -U eventpulse -c \
  "SELECT event_id, event_type, source, created_at FROM events ORDER BY created_at DESC LIMIT 5;"
```

Expected: rows matching the events ingested above.

### 5c. Idempotency test

Send the same event with an explicit `event_id` twice:

**Bash:**
```bash
EVENT='{"event_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","event_type":"idempotency_test","source":"docs","timestamp":"2026-02-18T12:00:00Z","payload":{}}'

curl -s -X POST http://localhost:3000/api/v1/events -H "Content-Type: application/json" -d "$EVENT" | jq .
# Wait a few seconds for the worker to persist
sleep 3
curl -s -X POST http://localhost:3000/api/v1/events -H "Content-Type: application/json" -d "$EVENT" | jq .
sleep 3
```

**PowerShell:**
```powershell
$evt = '{"event_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","event_type":"idempotency_test","source":"docs","timestamp":"2026-02-18T12:00:00Z","payload":{}}'

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/events" -ContentType "application/json" -Body $evt
Start-Sleep 3
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/events" -ContentType "application/json" -Body $evt
Start-Sleep 3
```

Verify only one row exists:

```bash
docker exec eventpulse-db psql -U eventpulse -c \
  "SELECT COUNT(*) FROM events WHERE event_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';"
```

Expected: `1`. The second insert was silently dropped by `ON CONFLICT DO NOTHING`.

Worker logs should show `Duplicate event skipped` for the second occurrence.

---

## 6. Reliability Verification

Full runbook: [`docs/runbooks/no-event-loss.md`](runbooks/no-event-loss.md)

**What it proves:** When the worker is stopped, events continue to be accepted (HTTP 202) and buffered in the Redis Stream. When the worker restarts, it consumes all buffered events and persists them to Postgres with zero loss.

**Summary of steps:** stop worker → ingest 50 events → verify stream buffering → restart worker → verify 50 rows in Postgres → verify consumer group lag is 0.

**Pass criteria:** all 50 events persisted, sequence numbers 1–50 complete, consumer group lag returns to 0.

---

## 7. Performance Verification

### Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/) (does not require npm).

### Run

```bash
k6 run tests/k6/ingestion_p95_100eps.js
```

### What to look for

| Metric | Threshold | Where to find |
|---|---|---|
| `http_req_duration` p(95) | < 200ms | k6 summary output |
| `http_req_failed` | < 1% | k6 summary output |

The script sends 100 events/second for 60 seconds (6,000 total). If either threshold is breached, k6 exits with a non-zero code and marks the run as `FAIL`.

### Override base URL

```bash
k6 run -e BASE_URL=http://some-other-host:3000 tests/k6/ingestion_p95_100eps.js
```
