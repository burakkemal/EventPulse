import type { Event } from '../../src/domain/index.js';

let counter = 0;

/**
 * Factory for creating test events with sensible defaults.
 * Override any field via the partial parameter.
 */
export function makeEvent(overrides: Partial<Event> = {}): Event {
  counter++;
  return {
    event_id: overrides.event_id ?? `test-${counter}`,
    event_type: overrides.event_type ?? 'page_view',
    source: overrides.source ?? 'web',
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    payload: overrides.payload ?? { url: '/home' },
    metadata: overrides.metadata ?? {},
  };
}

/** Fixed "now" for deterministic timestamp drift tests. */
export const FIXED_NOW = new Date('2026-02-18T12:00:00Z').getTime();
