import Redis from 'ioredis';
import pino from 'pino';
import { createDbClient, findEnabledRules } from './infrastructure/db/index.js';
import { startConsumer } from './infrastructure/worker/index.js';
import { ThresholdEvaluator } from './application/threshold-evaluator.js';

/**
 * Standalone worker process that consumes events from Redis Streams
 * and persists them to PostgreSQL.
 *
 * Runs independently of the Fastify HTTP server — can be scaled
 * horizontally by launching multiple instances with different WORKER_ID values.
 *
 * Rules are loaded exclusively from the Postgres `rules` table.
 * No in-memory defaults or hardcoded rule fallbacks.
 */
const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const databaseUrl = process.env['DATABASE_URL'] ?? 'postgres://eventpulse:eventpulse_dev@localhost:5432/eventpulse';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
});

const { sql, db } = createDbClient(databaseUrl);

// Abort controller for graceful shutdown
const ac = new AbortController();

async function main(): Promise<void> {
  await redis.connect();
  log.info('Redis connected');

  // Ensure tables exist (lightweight migration via raw SQL).
  // In production this would be handled by drizzle-kit migrate,
  // but for local dev this guarantees tables are present on first run.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS events (
      event_id     UUID PRIMARY KEY,
      event_type   VARCHAR(255) NOT NULL,
      source       VARCHAR(255) NOT NULL,
      timestamp    TIMESTAMPTZ  NOT NULL,
      payload      JSONB        NOT NULL DEFAULT '{}',
      metadata     JSONB        NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS anomalies (
      anomaly_id   UUID PRIMARY KEY,
      event_id     UUID NOT NULL,
      rule_id      VARCHAR(255) NOT NULL,
      severity     VARCHAR(20)  NOT NULL,
      message      VARCHAR(1024) NOT NULL,
      detected_at  TIMESTAMPTZ  NOT NULL
    )
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS rules (
      rule_id          UUID PRIMARY KEY,
      name             VARCHAR(255) NOT NULL,
      enabled          BOOLEAN      NOT NULL DEFAULT true,
      severity         VARCHAR(20)  NOT NULL,
      window_seconds   INTEGER      NOT NULL,
      cooldown_seconds INTEGER      NOT NULL DEFAULT 0,
      condition        JSONB        NOT NULL,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  // Create indexes if they don't already exist
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_events_source ON events (source)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_anomalies_rule_id ON anomalies (rule_id)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON anomalies (severity)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_anomalies_detected_at ON anomalies (detected_at)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies (event_id)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules (enabled)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_rules_severity ON rules (severity)`);

  log.info('Database ready (events + anomalies + rules tables)');

  // Load enabled rules from Postgres — no in-memory defaults.
  // Rules must be created via the CRUD API before the worker will evaluate them.
  const dbRules = await findEnabledRules(db);
  const evaluator = new ThresholdEvaluator();
  log.info(
    { ruleCount: dbRules.length, ruleIds: dbRules.map((r) => r.rule_id) },
    'Rules loaded from database',
  );

  await startConsumer(redis, db, log, ac.signal, evaluator, dbRules);
}

// Graceful shutdown on SIGINT / SIGTERM
function shutdown(): void {
  log.info('Shutting down worker...');
  ac.abort();

  // Give in-flight operations a moment, then force exit
  setTimeout(async () => {
    await redis.quit().catch(() => {});
    await sql.end().catch(() => {});
    process.exit(0);
  }, 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err: unknown) => {
  log.fatal({ err }, 'Worker crashed');
  process.exit(1);
});
