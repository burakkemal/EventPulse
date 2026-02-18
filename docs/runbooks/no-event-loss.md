# Runbook: No Event Loss Under Worker Downtime

**NFR:** "No event loss — if the processing pipeline is down, events must be buffered and processed when it recovers."

**Constants used in this runbook:**

| Name | Value | Defined in |
|------|-------|------------|
| Stream key | `events_stream` | `src/infrastructure/redis/event-producer.ts` |
| Consumer group | `event_persister` | `src/infrastructure/worker/stream-consumer.ts` |
| Consumer name | `worker-1` (default) | `WORKER_ID` env var |

> **Note on `jq`:** Commands below use `jq` for readable JSON output. If `jq` is not installed, each command includes a jq-free alternative. All alternatives use only `curl` flags or built-in shell tools.

---

## 1. Preconditions

All four services must be running before starting the test:

```bash
docker compose up -d --build
docker compose ps
```

Expected containers:

| Container            | Role           | Status  |
|----------------------|----------------|---------|
| `eventpulse-db`      | PostgreSQL 16  | Healthy |
| `eventpulse-redis`   | Redis 7        | Healthy |
| `eventpulse-app`     | Fastify API    | Running |
| `eventpulse-worker`  | Stream consumer| Running |

Confirm the API is reachable and Redis is connected:

```bash
curl -s http://localhost:3000/api/v1/events/health | jq .
# jq-free: curl -s http://localhost:3000/api/v1/events/health
# Expected: { "status": "ok", "redis": "PONG" }
```

Record the current event count in Postgres (baseline):

```bash
docker exec eventpulse-db psql -U eventpulse -c "SELECT COUNT(*) FROM events;"
```

### 1a. Ensure consumer group exists before stopping worker

The worker creates the consumer group on startup. Before stopping it, confirm
the group is present so that events ingested during downtime are visible to
the group once the worker restarts.

```bash
docker exec eventpulse-redis redis-cli XINFO GROUPS events_stream
```

You should see a group named `event_persister` in the output. If it does **not** exist
(e.g., on a completely fresh environment where the worker has never run), create it manually:

```bash
docker exec eventpulse-redis redis-cli \
  XGROUP CREATE events_stream event_persister '$' MKSTREAM
```

This ensures the group's last-delivered-ID is set so that all events
enqueued while the worker is down will be delivered when it restarts.

---

## 2. Simulate Worker Downtime

### 2a. Stop the worker

```bash
docker stop eventpulse-worker
```

Verify it is stopped:

```bash
docker compose ps
# eventpulse-worker should show "Exited" or not appear in running list
```

### 2b. Ingest 50 events while worker is down

**Bash (Linux / macOS):**

```bash
for i in $(seq 1 50); do
  curl -s -X POST http://localhost:3000/api/v1/events \
    -H 'Content-Type: application/json' \
    -d "{
      \"event_type\": \"resilience_test\",
      \"source\": \"runbook\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",
      \"payload\": { \"seq\": $i }
    }" | jq -r '.status + " " + .event_id'
done
# jq-free: replace '| jq -r ...' with nothing — raw JSON is still readable
```

**PowerShell (Windows):**

```powershell
1..50 | ForEach-Object {
  $body = @{
    event_type = "resilience_test"
    source     = "runbook"
    timestamp  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    payload    = @{ seq = $_ }
  } | ConvertTo-Json -Compress

  $resp = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/events" `
    -ContentType "application/json" -Body $body
  Write-Host "$($resp.status) $($resp.event_id)"
}
```

Every request must return `accepted` with a UUID. If any request returns a non-202 status, the ingestion path has a defect — stop and investigate.

### 2c. Verify events are buffered in Redis

```bash
docker exec eventpulse-redis redis-cli XLEN events_stream
```

The stream length should have increased by at least 50 entries (it may be higher if prior unacknowledged entries exist).

To inspect the last few entries:

```bash
docker exec eventpulse-redis redis-cli XREVRANGE events_stream + - COUNT 5
```

Confirm `event_type` = `resilience_test` and sequential `seq` values are present.

---

## 3. Recover and Verify Persistence

### 3a. Restart the worker

```bash
docker start eventpulse-worker
```

Wait a few seconds for the consumer to process the backlog, then check logs:

```bash
docker logs eventpulse-worker --tail 30
```

Expected log entries:

- `Consumer group already exists` — group was created before the test.
- `Recovered pending entries` (if any were mid-flight before stop).
- Multiple `Event persisted` lines with `event_type: resilience_test`.

### 3b. Verify rows in Postgres

```bash
docker exec eventpulse-db psql -U eventpulse -c \
  "SELECT COUNT(*) FROM events WHERE event_type = 'resilience_test';"
```

Expected: `50`.

To verify ordering and completeness:

```bash
docker exec eventpulse-db psql -U eventpulse -c \
  "SELECT event_id, (payload->>'seq')::int AS seq
   FROM events
   WHERE event_type = 'resilience_test'
   ORDER BY seq;"
```

All 50 sequence numbers (1–50) must be present.

### 3c. Verify stream was acknowledged

```bash
docker exec eventpulse-redis redis-cli XINFO GROUPS events_stream
```

The `lag` field for the `event_persister` group should be `0` (no unprocessed entries).

---

## 4. Pass / Fail Criteria

| Criterion | Pass | Fail |
|-----------|------|------|
| Consumer group `event_persister` exists before stopping worker | Yes | Group missing — test invalid |
| All 50 ingestion requests returned `202 Accepted` | Yes | Any non-202 response |
| Redis stream length increased by 50 during worker downtime | Yes | Stream length did not increase |
| Worker logs show 50 `Event persisted` entries after restart | Yes | Missing entries or errors |
| Postgres contains exactly 50 `resilience_test` rows | Yes | Count != 50 |
| Sequence numbers 1–50 all present in Postgres | Yes | Any gaps |
| Consumer group lag returns to 0 | Yes | Lag > 0 after processing window |

**Overall:** PASS only if all criteria are met.

---

## 5. Troubleshooting

### Service status

```bash
docker compose ps
docker compose logs app --tail 20
docker compose logs worker --tail 20
```

### Redis diagnostics

```bash
# Stream length
docker exec eventpulse-redis redis-cli XLEN events_stream

# Consumer group info (lag, consumers, pending count)
docker exec eventpulse-redis redis-cli XINFO GROUPS events_stream

# Pending entries for a specific consumer
docker exec eventpulse-redis redis-cli XPENDING events_stream event_persister - + 10

# Last 5 stream entries
docker exec eventpulse-redis redis-cli XREVRANGE events_stream + - COUNT 5
```

### Postgres diagnostics

```bash
# Total event count
docker exec eventpulse-db psql -U eventpulse -c "SELECT COUNT(*) FROM events;"

# Recent inserts
docker exec eventpulse-db psql -U eventpulse -c \
  "SELECT event_id, event_type, created_at FROM events ORDER BY created_at DESC LIMIT 10;"

# Check for table existence
docker exec eventpulse-db psql -U eventpulse -c "\dt events"
```

### Common failure modes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `202` but stream length unchanged | Redis connection failure in app | Check `docker logs eventpulse-app` for `Failed to enqueue` errors |
| Worker starts but no events consumed | Consumer group didn't exist before downtime, or was recreated with `$` after events were buffered | Run step 1a manually, then restart worker |
| Postgres count < 50 | Worker crashed mid-batch | Restart worker — PEL recovery will retry unacknowledged entries |
| Duplicate rows impossible | `ON CONFLICT DO NOTHING` on `event_id` | By design — duplicates are silently dropped |
