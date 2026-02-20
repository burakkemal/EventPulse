#!/usr/bin/env node
/**
 * EventPulse — Seed / Smoke Scenarios (All APIs)
 *
 * Goal: create realistic data quickly for manual review + Swagger demo.
 * - Creates a threshold rule
 * - Ingests single + batch events
 * - Waits for persistence (worker) then queries Events APIs
 * - Triggers an anomaly (threshold breach) and fetches Anomalies API
 * - Fetches Metrics API for the same window
 *
 * No external deps. Uses Node 18+ built-in fetch.
 *
 * Usage:
 *   node scripts/seed_all_apis.mjs
 *
 * Optional env:
 *   EVENTPULSE_BASE_URL=http://localhost:3000
 *   SEED_VERBOSE=1
 */

const BASE_URL = process.env.EVENTPULSE_BASE_URL ?? "http://localhost:3000";
const VERBOSE = process.env.SEED_VERBOSE === "1";

function log(...args) {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function vlog(...args) {
  if (VERBOSE) log(...args);
}

function isoNowPlus(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpJson(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const msg = json ? JSON.stringify(json) : text;
    throw new Error(`${method} ${path} -> ${res.status} ${res.statusText}: ${msg}`);
  }

  return { status: res.status, json };
}

async function waitForEventPersisted(eventId, { tries = 40, delayMs = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const { json } = await httpJson("GET", `/api/v1/events/${eventId}`);
      return json;
    } catch (e) {
      // 404 until worker persists
      await sleep(delayMs);
    }
  }
  throw new Error(`Timed out waiting for event to be persisted: ${eventId}`);
}

async function waitForAnomaly({ ruleId, severity, tries = 60, delayMs = 750 } = {}) {
  const qp = new URLSearchParams();
  qp.set("limit", "50");
  if (ruleId) qp.set("rule_id", ruleId);
  if (severity) qp.set("severity", severity);

  for (let i = 0; i < tries; i++) {
    try {
      const { json } = await httpJson("GET", `/api/v1/anomalies?${qp.toString()}`);
      const rows = json?.data ?? [];
      if (rows.length > 0) return rows[0];
    } catch {
      // ignore transient
    }
    await sleep(delayMs);
  }
  throw new Error(`Timed out waiting for anomalies (rule_id=${ruleId ?? "any"})`);
}

function makeEvent({ event_type, source, timestamp, payload = {}, metadata = {} }) {
  return {
    event_type,
    source,
    timestamp,
    payload,
    metadata,
  };
}

async function main() {
  log(`\n== EventPulse seed started ==`);
  log(`Base URL: ${BASE_URL}\n`);

  // 0) Health check
  const health = await httpJson("GET", "/api/v1/events/health");
  log(`Health:`, health.json);

  // 1) Create a threshold rule that will fire when >5 errors occur in a 60s window
  //    (shape matches docs/api.md: POST /api/v1/rules)
  const ruleReq = {
    name: "Seed: High error rate (payment_service)",
    severity: "critical",
    window_seconds: 60,
    cooldown_seconds: 0,
    condition: {
      type: "threshold",
      metric: "count",
      filters: { event_type: "error", source: "payment_service" },
      operator: ">",
      value: 5,
    },
  };

  const ruleRes = await httpJson("POST", "/api/v1/rules", ruleReq);
  const rule = ruleRes.json;
  const ruleId = rule.rule_id;
  log(`Created rule: ${ruleId}`);

  // 2) Ingest one "page_view" event (single ingest)
  const singleEventReq = makeEvent({
    event_type: "page_view",
    source: "web-frontend",
    timestamp: isoNowPlus(-5_000),
    payload: { url: "/dashboard" },
    metadata: { trace_id: "seed-trace-1" },
  });

  const ingest1 = await httpJson("POST", "/api/v1/events", singleEventReq);
  const singleEventId = ingest1.json.event_id;
  log(`Ingested single event (202 accepted): ${singleEventId}`);

  // Wait for persistence so GET by id works
  const persistedSingle = await waitForEventPersisted(singleEventId);
  vlog("Persisted single event:", persistedSingle);

  // 3) Ingest a batch of CPU spike events (batch ingest)
  const batchReq = [
    makeEvent({
      event_type: "cpu_spike",
      source: "prod-web-01",
      timestamp: isoNowPlus(-4_000),
      payload: { cpu_percent: 95 },
    }),
    makeEvent({
      event_type: "cpu_spike",
      source: "prod-web-02",
      timestamp: isoNowPlus(-3_500),
      payload: { cpu_percent: 88 },
    }),
    makeEvent({
      event_type: "cpu_spike",
      source: "prod-web-03",
      timestamp: isoNowPlus(-3_000),
      payload: { cpu_percent: 91 },
    }),
  ];

  const ingestBatch = await httpJson("POST", "/api/v1/events/batch", batchReq);
  const batchIds = ingestBatch.json.event_ids;
  log(`Ingested batch (${batchIds.length} events):`, batchIds.join(", "));

  // Wait for the first batch event to be persisted (to prove the worker path)
  await waitForEventPersisted(batchIds[0]);

  // 4) Trigger anomaly: ingest 6 error events within the rule window
  //    These should match the rule's filters: event_type=error, source=payment_service
  const errorBatch = Array.from({ length: 6 }).map((_, i) =>
    makeEvent({
      event_type: "error",
      source: "payment_service",
      timestamp: isoNowPlus(-(2_000 - i * 100)),
      payload: { code: "PAYMENT_FAILED", attempt: i + 1 },
      metadata: { trace_id: `seed-err-${i + 1}` },
    }),
  );

  const ingestErrors = await httpJson("POST", "/api/v1/events/batch", errorBatch);
  const errorIds = ingestErrors.json.event_ids;
  log(`Ingested error batch to trigger anomaly (${errorIds.length} events).`);

  // Ensure at least the last error event is persisted before checking anomalies
  await waitForEventPersisted(errorIds[errorIds.length - 1]);

  // 5) Query list events (filtered) to demonstrate GET /api/v1/events
  const listQ = new URLSearchParams();
  listQ.set("limit", "10");
  listQ.set("event_type", "error");
  listQ.set("source", "payment_service");
  const eventsList = await httpJson("GET", `/api/v1/events?${listQ.toString()}`);
  log(`Listed persisted events (filtered error/payment_service): count=${eventsList.json.pagination.count}`);

  // 6) Fetch metrics for same source/event_type in a short window
  const metricsQ = new URLSearchParams();
  metricsQ.set("window_seconds", "300");
  metricsQ.set("group_by", "source");
  metricsQ.set("event_type", "error");
  const metrics = await httpJson("GET", `/api/v1/metrics?${metricsQ.toString()}`);
  log(`Metrics (error grouped by source, window_seconds=${metrics.json.window_seconds}):`, metrics.json.metrics);

  // 7) Wait for anomaly to appear and fetch it (GET /api/v1/anomalies)
  const anomaly = await waitForAnomaly({ ruleId, severity: "critical" });
  log(`Anomaly detected (rule_id=${anomaly.rule_id}, severity=${anomaly.severity}):`);
  log(`- anomaly_id: ${anomaly.anomaly_id}`);
  log(`- event_id:   ${anomaly.event_id}`);
  log(`- detected_at:${anomaly.detected_at}`);
  log(`- message:    ${anomaly.message}`);

  // 8) GET /api/v1/rules + GET /api/v1/rules/:rule_id sanity
  const rules = await httpJson("GET", "/api/v1/rules");
  log(`Rules total: ${Array.isArray(rules.json) ? rules.json.length : "?"}`);

  const ruleById = await httpJson("GET", `/api/v1/rules/${ruleId}`);
  vlog("Rule by id:", ruleById.json);

  log(`\n== Seed complete ==`);
  log(`Try in Swagger UI:`);
  log(`- GET  /api/v1/events?event_type=error&source=payment_service`);
  log(`- GET  /api/v1/anomalies?rule_id=${ruleId}`);
  log(`- GET  /api/v1/metrics?window_seconds=300&group_by=source&event_type=error\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("\nSeed failed:", err?.message ?? err);
  process.exit(1);
});
