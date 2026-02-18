# AI Test Log

## 2026-02-18 — k6 ingestion load test

**File:** `tests/k6/ingestion_p95_100eps.js`

**Purpose:** Validate `POST /api/v1/events` meets p95 < 200ms at 100 events/second sustained for 60 seconds. Asserts < 1% HTTP failure rate.

**Run:** `k6 run tests/k6/ingestion_p95_100eps.js`

**Note:** AI-generated, manually reviewed, no application logic changes.

---

## 2026-02-18 — No event loss runbook

**File:** `docs/runbooks/no-event-loss.md`

**Purpose:** Validate reliability NFR — events buffered in Redis Stream during worker downtime are persisted to Postgres upon recovery. Tests 50-event ingestion with worker stopped, then verifies full recovery.

**Run:** Follow steps manually per runbook.

**Note:** AI-generated, manually reviewed, no application logic changes.

---

## 2026-02-18 — Runbook corrections (no-event-loss.md)

**File:** `docs/runbooks/no-event-loss.md`

**Changes:** Added pre-step 1a to verify/create consumer group before stopping worker. Parameterized group name (`event_persister`) and stream key (`events_stream`) in a constants table at the top with source file references. Added Windows PowerShell equivalent for the 50-event ingestion loop. Marked `jq` as optional with jq-free alternatives. Added consumer group existence to pass/fail criteria.

**Note:** AI-generated, manually reviewed, no application logic changes.

---

## 2026-02-18 — Consolidated validation guide

**File:** `docs/validation.md`

**Purpose:** Single-document verification guide covering all Sessions 1–3 deliverables: quickstart, healthcheck, ingestion (happy path + negative), Redis stream verification, Postgres persistence, idempotency, reliability (references `docs/runbooks/no-event-loss.md`), and k6 performance testing (`tests/k6/ingestion_p95_100eps.js`).

**Includes bash and PowerShell alternatives** for all platform-specific commands. `jq` marked optional throughout.

**Note:** AI-generated, manually reviewed, no application logic changes.

---

## Cumulative asset index

All test and validation artifacts created/updated with AI assistance across Sessions 1–3:

| File | Session | Purpose |
|---|---|---|
| `tests/k6/ingestion_p95_100eps.js` | 2 | k6 load test — p95 < 200ms @ 100 eps for 60s |
| `docs/runbooks/no-event-loss.md` | 3 | Reliability NFR runbook — event buffering and recovery |
| `docs/validation.md` | 1–3 | Consolidated validation guide for all phases |

**Runbook corrections applied:** consumer group pre-step (1a), constants table with source references, PowerShell ingestion loop, jq-free alternatives, updated pass/fail criteria.

**All assets:** AI-generated, manually reviewed, no application logic changes.


## Manual Test Execution — Sessions 2–4 (Local)

**Date:** 2026-02-18

### Scope
Executed the AI-generated validation assets locally to satisfy NFR checks (reliability + latency). No application code changes.

### Results

- **Idempotency (Postgres `ON CONFLICT DO NOTHING`)**
  - Sent the same `event_id` twice:
    - `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
  - Verified:
    - `SELECT COUNT(*) FROM events WHERE event_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';` returned **1**.

- **Reliability: No event loss under worker downtime**
  - Stopped worker: `docker stop eventpulse-worker`
  - Ingested 5 events with `event_type=resilience_test` while worker was down (all returned **202 Accepted**)
  - Restarted worker: `docker start eventpulse-worker`
  - Verified:
    - `SELECT COUNT(*) FROM events WHERE event_type='resilience_test';` returned **5**.

- **Latency p95 under 100 events/sec (k6)**
  - Command: `k6 run tests/k6/ingestion_p95_100eps.js`
  - Result:
    - `http_req_duration p(95)=2ms` (threshold: `<200ms`) ✅
    - `http_req_failed=0.00%` (threshold: `<1%`) ✅
    - Total requests: **6000** (100 rps for 60s)

### Notes
- k6 was installed locally (Windows) and executed from the repository root.
- Validation assets were generated with AI assistance but reviewed manually before execution.

