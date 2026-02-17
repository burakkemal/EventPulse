import fp from 'fastify-plugin';
import Redis from 'ioredis';
import type { FastifyInstance } from 'fastify';

/**
 * Fastify plugin that manages the ioredis connection lifecycle.
 *
 * - Connects on server start, disconnects on close.
 * - Decorates `fastify.redis` for use by downstream plugins/routes.
 */
async function redisPlugin(fastify: FastifyInstance): Promise<void> {
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,   // required for streams (no auto-fail)
    enableReadyCheck: true,
    lazyConnect: true,
  });

  await redis.connect();
  fastify.log.info('Redis connected');

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
    fastify.log.info('Redis disconnected');
  });
}

export default fp(redisPlugin, {
  name: 'redis',
  fastify: '5.x',
});

/** Extend Fastify's type system so `fastify.redis` is available everywhere. */
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}
