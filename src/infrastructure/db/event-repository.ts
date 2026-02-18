import type { Database } from './client.js';
import { events } from './schema.js';

/**
 * Inserts an event into PostgreSQL idempotently.
 *
 * Uses ON CONFLICT DO NOTHING on the event_id primary key.
 * Returns true if a row was inserted, false if it was a duplicate.
 */
export async function insertEvent(
  db: Database,
  event: {
    event_id: string;
    event_type: string;
    source: string;
    timestamp: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
): Promise<boolean> {
  const result = await db
    .insert(events)
    .values({
      event_id: event.event_id,
      event_type: event.event_type,
      source: event.source,
      timestamp: new Date(event.timestamp),
      payload: event.payload,
      metadata: event.metadata,
    })
    .onConflictDoNothing({ target: events.event_id });

  return result.rowCount !== null && result.rowCount > 0;
}
