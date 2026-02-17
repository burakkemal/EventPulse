/**
 * Core domain types for the EventPulse event model.
 *
 * These types define the canonical shape of an event as it flows
 * through the system. They carry no framework dependencies.
 */

/** Free-form key/value payload attached to every event. */
export type EventPayload = Record<string, unknown>;

/** Optional metadata for routing, tracing, or enrichment. */
export type EventMetadata = Record<string, unknown>;

/**
 * Canonical Event entity.
 *
 * `event_id` is assigned at ingestion time if the producer does not
 * supply one — guaranteeing every enqueued event is addressable.
 */
export interface Event {
  readonly event_id: string;
  readonly event_type: string;
  readonly source: string;
  readonly timestamp: string; // ISO-8601
  readonly payload: EventPayload;
  readonly metadata: EventMetadata;
}
