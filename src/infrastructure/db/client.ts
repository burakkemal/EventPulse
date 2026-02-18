import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

/**
 * Creates a Drizzle client backed by postgres.js.
 *
 * Returns both the raw `sql` connection (for lifecycle management)
 * and the typed `db` instance (for queries).
 */
export function createDbClient(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    // Keep a small pool for the worker — it's a single process
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(sql, { schema });

  return { sql, db };
}

export type Database = ReturnType<typeof createDbClient>['db'];
