import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { Database } from '../db/index.js';
import type { Rule } from '../../domain/rules/index.js';
import type { EventWindow } from '../../application/rule-engine.js';
import { insertEvent, insertAnomaly } from '../db/index.js';
import { evaluateEvent } from '../../application/rule-engine.js';

const STREAM_KEY = 'events_stream';
const GROUP_NAME = 'event_persister';
const CONSUMER_NAME = process.env['WORKER_ID'] ?? 'worker-1';

// How long to block waiting for new messages (ms)
const BLOCK_MS = 5000;
// Max messages to read per iteration
const BATCH_SIZE = 100;

/**
 * Ensures the consumer group exists on the stream.
 *
 * Start ID "$" = only deliver messages arriving after group creation.
 * We do NOT use "0" here — that would replay the entire stream history
 * on first boot, which is not desired for this pipeline.
 *
 * Crash recovery is handled separately via processPending(), which
 * uses XREADGROUP with cursor "0" to re-read this consumer's own
 * pending entries list (PEL) — that is the correct recovery path.
 *
 * Note: cross-consumer reclaim (XAUTOCLAIM for entries stuck in
 * another consumer's PEL) is deferred to the retry/DLQ phase.
 *
 * Uses MKSTREAM so the stream is created if it doesn't exist yet.
 * Ignores BUSYGROUP errors (group already exists).
 */
async function ensureConsumerGroup(redis: Redis, log: Logger): Promise<void> {
  try {
    // "$" = new messages only; historical replay is intentionally skipped
    await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM');
    log.info({ group: GROUP_NAME, stream: STREAM_KEY }, 'Consumer group created (from $)');
  } catch (err: unknown) {
    // BUSYGROUP = group already exists, safe to ignore
    if (err instanceof Error && err.message.includes('BUSYGROUP')) {
      log.debug({ group: GROUP_NAME }, 'Consumer group already exists');
      return;
    }
    throw err;
  }
}

/**
 * Parses a raw Redis Stream entry into a typed event object.
 * Stream entries arrive as flat [field, value, field, value, ...] arrays.
 */
function parseStreamEntry(fields: string[]): {
  event_id: string;
  event_type: string;
  source: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
} {
  const map = new Map<string, string>();
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];
    if (key !== undefined && value !== undefined) {
      map.set(key, value);
    }
  }

  return {
    event_id: map.get('event_id') ?? '',
    event_type: map.get('event_type') ?? '',
    source: map.get('source') ?? '',
    timestamp: map.get('timestamp') ?? '',
    payload: JSON.parse(map.get('payload') ?? '{}') as Record<string, unknown>,
    metadata: JSON.parse(map.get('metadata') ?? '{}') as Record<string, unknown>,
  };
}

/** Dependencies bundled for internal functions. */
interface ConsumerDeps {
  redis: Redis;
  db: Database;
  log: Logger;
  rules: readonly Rule[];
  window: EventWindow;
}

/**
 * Main consumer loop.
 *
 * 1. XREADGROUP with BLOCK — waits for new messages on the stream.
 * 2. For each message: parse → insert into Postgres (idempotent) → XACK.
 * 3. After successful persist+ACK, evaluate rules → log anomalies.
 *
 * Rule evaluation is intentionally post-ACK: rules must never block
 * persistence or cause re-delivery. A rule failure is logged but
 * the event is already safely committed and acknowledged.
 *
 * On insert failure the message is NOT acknowledged, so Redis will
 * re-deliver it on the next read cycle (pending entries list).
 *
 * The loop runs until `signal` is aborted (graceful shutdown).
 */
export async function startConsumer(
  redis: Redis,
  db: Database,
  log: Logger,
  signal: AbortSignal,
  rules: readonly Rule[] = [],
  window?: EventWindow,
): Promise<void> {
  // Import EventWindow lazily to avoid circular deps in tests
  const { EventWindow: EW } = await import('../../application/rule-engine.js');
  const deps: ConsumerDeps = {
    redis,
    db,
    log,
    rules,
    window: window ?? new EW(),
  };

  await ensureConsumerGroup(redis, log);

  log.info(
    { consumer: CONSUMER_NAME, group: GROUP_NAME, stream: STREAM_KEY, ruleCount: rules.length },
    'Consumer started',
  );

  // First, claim any pending messages from previous crashes
  await processPending(deps);

  while (!signal.aborted) {
    try {
      const response = await redis.xreadgroup(
        'GROUP', GROUP_NAME, CONSUMER_NAME,
        'COUNT', BATCH_SIZE,
        'BLOCK', BLOCK_MS,
        'STREAMS', STREAM_KEY,
        '>',  // only new, undelivered messages
      );

      // null = timeout with no new messages
      if (response === null) continue;

      for (const [, entries] of response) {
        for (const [streamId, fields] of entries) {
          await processEntry(deps, streamId, fields);
        }
      }
    } catch (err: unknown) {
      if (signal.aborted) break;
      log.error({ err }, 'Consumer loop error — retrying in 1s');
      await sleep(1000);
    }
  }

  log.info('Consumer stopped');
}

/**
 * Processes pending (previously delivered but unacknowledged) entries.
 * This handles recovery after a crash or restart.
 */
async function processPending(deps: ConsumerDeps): Promise<void> {
  deps.log.info('Checking for pending entries...');

  // Read pending entries (delivered but not ACKed)
  const response = await deps.redis.xreadgroup(
    'GROUP', GROUP_NAME, CONSUMER_NAME,
    'COUNT', BATCH_SIZE,
    'STREAMS', STREAM_KEY,
    '0',  // '0' = re-read pending entries for this consumer
  );

  if (response === null) return;

  let count = 0;
  for (const [, entries] of response) {
    for (const [streamId, fields] of entries) {
      if (fields.length === 0) continue; // already acked, skip nil entries
      await processEntry(deps, streamId, fields);
      count++;
    }
  }

  if (count > 0) {
    deps.log.info({ count }, 'Recovered pending entries');
  }
}

/**
 * Processes a single stream entry: parse → insert → ACK → evaluate rules.
 *
 * Persistence and rule evaluation have separate error boundaries.
 * A rule failure must never masquerade as a persistence failure or
 * prevent acknowledgment.
 */
async function processEntry(
  deps: ConsumerDeps,
  streamId: string,
  fields: string[],
): Promise<void> {
  const event = parseStreamEntry(fields);

  // --- Persistence boundary: insert + ACK ---
  try {
    const inserted = await insertEvent(deps.db, event);

    // ACK only after successful write (or confirmed duplicate)
    await deps.redis.xack(STREAM_KEY, GROUP_NAME, streamId);

    if (inserted) {
      deps.log.debug({ event_id: event.event_id, streamId }, 'Event persisted');
    } else {
      deps.log.debug({ event_id: event.event_id, streamId }, 'Duplicate event skipped');
    }
  } catch (err: unknown) {
    // Do NOT ack — message stays in pending list for redelivery
    deps.log.error({ err, event_id: event.event_id, streamId }, 'Failed to persist event');
    return; // Skip rule evaluation — event was not committed
  }

  // --- Rule evaluation boundary (post-ACK, never blocks persistence) ---
  if (deps.rules.length > 0) {
    try {
      const { anomalies } = evaluateEvent(event, deps.rules, deps.window);
      for (const anomaly of anomalies) {
        deps.log.warn(
          { anomaly },
          `Anomaly detected: [${anomaly.rule_id}] ${anomaly.message}`,
        );

        // Persist anomaly to Postgres (best-effort, failure only logged)
        try {
          await insertAnomaly(deps.db, {
            event_id: anomaly.event_id,
            rule_id: anomaly.rule_id,
            severity: anomaly.severity,
            message: anomaly.message,
            detected_at: anomaly.detected_at,
          });
        } catch (persistErr: unknown) {
          deps.log.error(
            { err: persistErr, anomaly_rule_id: anomaly.rule_id, event_id: event.event_id },
            'Failed to persist anomaly',
          );
        }
      }
    } catch (err: unknown) {
      deps.log.error({ err, event_id: event.event_id, streamId }, 'Failed to evaluate rules');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
