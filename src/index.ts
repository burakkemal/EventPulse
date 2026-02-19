import Fastify from 'fastify';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

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
  // Dashboard — Serve React SPA static assets
  // --------------------------------------------------

  const DIST_DIR = resolve(process.cwd(), 'public', 'dist');

  const MIME: Record<string, string> = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.map':  'application/json',
  };

  /**
   * Serve built frontend assets from public/dist/.
   * GET /dashboard       → index.html (SPA entry)
   * GET /dashboard/assets/* → JS/CSS bundles
   */
  fastify.get('/dashboard', (_req, reply) => {
    try {
      const html = readFileSync(resolve(DIST_DIR, 'index.html'), 'utf-8');
      return reply.type('text/html').send(html);
    } catch {
      fastify.log.warn('Dashboard build not found at public/dist/index.html');
      return reply.status(404).send({ error: 'Dashboard not found — run: npm run build:frontend' });
    }
  });

  fastify.get('/dashboard/*', (req, reply) => {
    const urlPath = (req.url.replace('/dashboard/', '') || '').split('?')[0] ?? '';
    const filePath = join(DIST_DIR, urlPath);

    // Security: reject path traversal
    if (!filePath.startsWith(DIST_DIR)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    try {
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        // SPA fallback: serve index.html for non-file routes
        const html = readFileSync(resolve(DIST_DIR, 'index.html'), 'utf-8');
        return reply.type('text/html').send(html);
      }
      const ext = extname(filePath);
      const mime = MIME[ext] ?? 'application/octet-stream';
      const content = readFileSync(filePath);
      return reply.type(mime).send(content);
    } catch {
      return reply.status(404).send({ error: 'Not found' });
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
