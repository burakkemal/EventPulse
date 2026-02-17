import { z } from 'zod';

/**
 * Zod schema for validating a single inbound event.
 *
 * - `event_id` is optional at ingestion; assigned by the handler if absent.
 * - `timestamp` must be a valid ISO-8601 string.
 * - `payload` and `metadata` are open-ended objects to support
 *   heterogeneous event types without schema-per-type overhead.
 */
export const eventSchema = z.object({
  event_id: z.string().uuid().optional(),
  event_type: z.string().min(1).max(255),
  source: z.string().min(1).max(255),
  timestamp: z.string().datetime({ message: 'Must be a valid ISO-8601 datetime' }),
  payload: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** Inferred type representing a validated-but-incomplete event (no guaranteed id). */
export type EventInput = z.infer<typeof eventSchema>;

/**
 * Validates a batch of raw event bodies.
 * Returns a discriminated result so the caller decides how to surface errors.
 */
export const eventBatchSchema = z.array(eventSchema).min(1, 'Batch must contain at least one event');
