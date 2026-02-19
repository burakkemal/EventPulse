import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  redisPlugin,
  dbPlugin,
} from './infrastructure/index.js';

import {
  eventRoutes,
  queryRoutes,
  ruleRoutes,
  metricsRoutes,
} from './interfaces/http/index.js';

import { loadNotificationConfig } from './infrastructure/notifications/index.js';
import { createNotificationDispatcher } from './infrastructure/notifications/dispatcher.js';
import { startAnomalySubscriber } from './infrastructure/redis/anomaly-subscriber.js';
import { WebSocketServer } from './interfaces/ws/websocket-server.js';

/**
 * Bootstrap Fastify server.
 *
 * Order:
 * 1) Infrastructure plugins
 * 2) HTTP routes
 * 3) Register shutdown hooks
 * 4) listen()
 * 5) Notification infra bootstrap
 */
async function main(): Promise<void> {

  const fastify = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // --------------------------------------------------
  // Infrastructure
  // --------------------------------------------------

  await fastify.register(redisPlugin);
  await fastify.register(dbPlugin);

  // --------------------------------------------------
  // Demo Dashboard Route
  // --------------------------------------------------

  fastify.get('/dashboard', (_req, reply) => {
    try {
      const html = readFileSync(
        resolve(process.cwd(), 'public', 'dashboard.html'),
        'utf-8',
      );

      return reply
        .type('text/html')
        .send(html);

    } catch {
      return reply
        .status(404)
        .send({ error: 'Dashboard not found' });
    }
  });

  // --------------------------------------------------
  // HTTP Interface
  // --------------------------------------------------

  await fastify.register(eventRoutes);
  await fastify.register(queryRoutes);
  await fastify.register(ruleRoutes);
  await fastify.register(metricsRoutes);

  // --------------------------------------------------
  // Notification infra placeholders
  // --------------------------------------------------

  let wsServer: WebSocketServer | null = null;

  let cleanupSubscriber:
    null | (() => Promise<void>) = null;

  /**
   * IMPORTANT:
   * onClose MUST be registered BEFORE listen()
   */
  fastify.addHook('onClose', async () => {

    if (wsServer) {
      wsServer.close();
    }

    if (cleanupSubscriber) {
      await cleanupSubscriber();
    }

  });

  // --------------------------------------------------
  // Start Server
  // --------------------------------------------------

  const host = process.env['HOST'] ?? '0.0.0.0';
  const port = Number(process.env['PORT'] ?? 3000);

  await fastify.listen({
    host,
    port,
  });

  // --------------------------------------------------
  // Notification Channels (after listen)
  // --------------------------------------------------

  const notifConfig = loadNotificationConfig();

  fastify.log.info(
    { notifConfig },
    'Notification config loaded',
  );

  // ---- WebSocket (P0) ----

  if (notifConfig.websocket.enabled) {

    wsServer = new WebSocketServer(
      fastify.log,
    );

    wsServer.attach(
      fastify.server,
    );
  }

  // ---- Dispatcher ----

  const dispatch =
    createNotificationDispatcher(
      notifConfig,
      fastify.log,
      wsServer,
    );

  // ---- Redis Subscriber ----

  const redisUrl =
    process.env['REDIS_URL']
    ?? 'redis://localhost:6379';

  cleanupSubscriber =
    await startAnomalySubscriber(
      redisUrl,
      fastify.log,
      dispatch,
    );

}

main().catch((err: unknown) => {

  console.error(
    'Fatal: failed to start server',
    err,
  );

  process.exit(1);

});
