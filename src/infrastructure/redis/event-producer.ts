import type Redis from 'ioredis';
import type { Event } from '../../domain/index.js';

const STREAM_KEY = 'events_stream';

/**
 * Appends a validated event to the Redis Stream.
 *
 * Uses `XADD` with auto-generated stream IDs (`*`).
 * The event is stored as a flat field/value list — Redis Streams
 * require string values, so the payload and metadata objects
 * are JSON-serialized.
 *
 * @returns The stream entry ID assigned by Redis.
 */
export async function enqueueEvent(redis: Redis, event: Event): Promise<string> {
  const entryId = await redis.xadd(
    STREAM_KEY,
    '*',
    'event_id', event.event_id,
    'event_type', event.event_type,
    'source', event.source,
    'timestamp', event.timestamp,
    'payload', JSON.stringify(event.payload),
    'metadata', JSON.stringify(event.metadata),
  );

  return entryId;
}
