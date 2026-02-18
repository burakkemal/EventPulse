import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for the `events` table.
 *
 * `event_id` is the natural primary key — assigned at ingestion time.
 * Using it as PK gives us idempotent inserts via ON CONFLICT DO NOTHING
 * without needing a separate uniqueness constraint.
 */
export const events = pgTable('events', {
  event_id: uuid('event_id').primaryKey(),
  event_type: varchar('event_type', { length: 255 }).notNull(),
  source: varchar('source', { length: 255 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_events_event_type').on(table.event_type),
  index('idx_events_source').on(table.source),
  index('idx_events_timestamp').on(table.timestamp),
  index('idx_events_created_at').on(table.created_at),
]);

/**
 * Drizzle schema for the `anomalies` table.
 *
 * Stores anomalies detected by the rule engine.
 * `anomaly_id` is a server-generated UUID.
 * `event_id` references the triggering event (not an FK constraint —
 * we don't want anomaly inserts to fail if event cleanup runs first).
 */
export const anomalies = pgTable('anomalies', {
  anomaly_id: uuid('anomaly_id').primaryKey(),
  event_id: uuid('event_id').notNull(),
  rule_id: varchar('rule_id', { length: 255 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  message: varchar('message', { length: 1024 }).notNull(),
  detected_at: timestamp('detected_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_anomalies_rule_id').on(table.rule_id),
  index('idx_anomalies_severity').on(table.severity),
  index('idx_anomalies_detected_at').on(table.detected_at),
  index('idx_anomalies_event_id').on(table.event_id),
]);
