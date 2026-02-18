import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

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
});
