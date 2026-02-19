import Redis from 'ioredis';
import type { Logger } from 'pino';
import type { Database } from '../db/index.js';
import { findEnabledRules } from '../db/index.js';
import type { RuleStore } from '../../application/rule-store.js';

const CHANNEL = 'rules_changed';

/**
 * Subscribes to the "rules_changed" Pub/Sub channel and reloads enabled
 * rules from Postgres whenever a notification arrives.
 *
 * ioredis requires a dedicated connection for subscriptions — once a client
 * enters subscriber mode it cannot issue regular commands. We create a
 * second Redis client here specifically for this purpose.
 *
 * The reload is async and non-blocking: the consumer loop continues using
 * the last known snapshot while the reload is in progress. Once complete,
 * the new snapshot is swapped in atomically via `store.set()`.
 *
 * Returns a cleanup function that unsubscribes and disconnects the subscriber client.
 */
export async function startRuleSubscriber(
  redisUrl: string,
  db: Database,
  log: Logger,
  store: RuleStore,
  signal: AbortSignal,
): Promise<() => Promise<void>> {
  const sub = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  await sub.connect();
  log.info('Rule subscriber Redis connection established');

  // Guard against concurrent reloads (e.g. rapid CRUD bursts)
  let reloading = false;

  sub.on('message', (channel: string, message: string) => {
    if (channel !== CHANNEL) return;
    if (signal.aborted) return;

    // Fire-and-forget reload; errors are caught inside
    void reloadRules(db, log, store, message, () => reloading, (v) => { reloading = v; });
  });

  await sub.subscribe(CHANNEL);
  log.info({ channel: CHANNEL }, 'Subscribed to rule change notifications');

  // Cleanup function for graceful shutdown
  return async () => {
    await sub.unsubscribe(CHANNEL).catch(() => {});
    await sub.quit().catch(() => {});
    log.info('Rule subscriber disconnected');
  };
}

/**
 * Reloads enabled rules from Postgres and swaps the store snapshot.
 *
 * Exported for unit testing — callers outside this module should use
 * `startRuleSubscriber()` instead.
 */
export async function reloadRules(
  db: Database,
  log: Logger,
  store: RuleStore,
  rawMessage: string,
  getReloading: () => boolean,
  setReloading: (v: boolean) => void,
): Promise<void> {
  if (getReloading()) {
    log.debug('Reload already in progress, skipping');
    return;
  }

  setReloading(true);
  try {
    let parsed: { reason?: string; rule_id?: string } = {};
    try {
      parsed = JSON.parse(rawMessage) as { reason?: string; rule_id?: string };
    } catch {
      // Non-JSON message — still reload, just log without context
    }

    log.info(
      { reason: parsed.reason, rule_id: parsed.rule_id },
      'Rule change detected, reloading rules from database…',
    );

    const rules = await findEnabledRules(db);
    store.set(rules);

    log.info(
      { ruleCount: rules.length, ruleIds: rules.map((r) => r.rule_id) },
      'Rules reloaded successfully',
    );
  } catch (err: unknown) {
    log.error({ err }, 'Failed to reload rules from database');
  } finally {
    setReloading(false);
  }
}
