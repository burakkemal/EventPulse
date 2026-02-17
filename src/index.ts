import Fastify from 'fastify';
import { redisPlugin } from './infrastructure/index.js';
import { eventRoutes } from './interfaces/http/index.js';

/**
 * Bootstrap the Fastify server.
 *
 * Plugin registration order matters:
 *   1. Infrastructure (Redis) — so downstream plugins can depend on it.
 *   2. HTTP routes — decorated with `dependencies: ['redis']`.
 */
async function main(): Promise<void> {
  const fastify = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // --- Infrastructure ---
  await fastify.register(redisPlugin);

  // --- HTTP Interface ---
  await fastify.register(eventRoutes);

  // --- Start ---
  const host = process.env['HOST'] ?? '0.0.0.0';
  const port = Number(process.env['PORT'] ?? 3000);

  await fastify.listen({ host, port });
}

main().catch((err: unknown) => {
  console.error('Fatal: failed to start server', err);
  process.exit(1);
});
