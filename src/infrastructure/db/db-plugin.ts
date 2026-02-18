import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createDbClient } from './client.js';
import type { Database } from './client.js';

/**
 * Fastify plugin that manages the Drizzle/postgres.js connection lifecycle.
 *
 * Decorates `fastify.db` for use by query routes.
 * Closes the connection pool on server shutdown.
 */
async function dbPlugin(fastify: FastifyInstance): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL']
    ?? 'postgres://eventpulse:eventpulse_dev@localhost:5432/eventpulse';

  const { sql, db } = createDbClient(databaseUrl);

  fastify.decorate('db', db);

  fastify.addHook('onClose', async () => {
    await sql.end();
    fastify.log.info('Database disconnected');
  });
}

export default fp(dbPlugin, {
  name: 'db',
  fastify: '5.x',
});

/** Extend Fastify's type system so `fastify.db` is available everywhere. */
declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}
