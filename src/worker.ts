import Redis from 'ioredis';
import pino from 'pino';
import { createDbClient } from './infrastructure/db/index.js';
import { startConsumer } from './infrastructure/worker/index.js';
import { InMemoryRuleRepository } from './infrastructure/rules/index.js';
import { EventWindow } from './application/rule-engine.js';

/**
 * Standalone worker process that consumes events from Redis Streams
 * and persists them to PostgreSQL.
 *
 * Runs independently of the Fastify HTTP server — can be scaled
 * horizontally by launching multiple instances with different WORKER_ID values.
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

  // Ensure the events table exists (lightweight migration via raw SQL).
  // In production this would be handled by drizzle-kit migrate,
  // but for local dev this guarantees the table is present on first run.
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
  log.info('Database ready');

  // Initialize rule engine with default rules
  const ruleRepo = new InMemoryRuleRepository();
  const rules = ruleRepo.getAll();
  const eventWindow = new EventWindow();
  log.info({ ruleCount: rules.length, ruleIds: rules.map((r) => r.id) }, 'Rules loaded');

  await startConsumer(redis, db, log, ac.signal, rules, eventWindow);
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
