import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eventSchema, eventBatchSchema } from '../../application/index.js';
import { enqueueEvent } from '../../infrastructure/index.js';
import type { Event } from '../../domain/index.js';

/**
 * Registers the event ingestion routes.
 *
 * POST /api/v1/events        — single event ingestion
 * POST /api/v1/events/batch  — batch ingestion (array of events)
 * GET  /api/v1/events/health — Redis connectivity check
 */
async function eventRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * Single event ingestion.
   *
   * Validates → assigns event_id if missing → enqueues → returns 202.
   */
  fastify.post(
    '/api/v1/events',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = eventSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          issues: parsed.error.issues,
        });
      }

      const event: Event = {
        ...parsed.data,
        event_id: parsed.data.event_id ?? randomUUID(),
        payload: parsed.data.payload,
        metadata: parsed.data.metadata,
      };

      // Fire-and-forget: enqueue without awaiting confirmation.
      // Errors are logged but do not block the response.
      enqueueEvent(fastify.redis, event).catch((err: unknown) => {
        fastify.log.error({ err, event_id: event.event_id }, 'Failed to enqueue event');
      });

      return reply.status(202).send({
        status: 'accepted',
        event_id: event.event_id,
      });
    },
  );

  /**
   * Batch event ingestion.
   *
   * Validates the full array up-front. On any validation failure the
   * entire batch is rejected — no partial success semantics (per spec).
   */
  fastify.post(
    '/api/v1/events/batch',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = eventBatchSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          issues: parsed.error.issues,
        });
      }

      const events: Event[] = parsed.data.map((input) => ({
        ...input,
        event_id: input.event_id ?? randomUUID(),
        payload: input.payload,
        metadata: input.metadata,
      }));

      // Enqueue all events concurrently, fire-and-forget.
      const enqueueAll = events.map((event) =>
        enqueueEvent(fastify.redis, event).catch((err: unknown) => {
          fastify.log.error({ err, event_id: event.event_id }, 'Failed to enqueue event');
        }),
      );
      Promise.all(enqueueAll).catch(() => { /* individual errors already logged */ });

      const eventIds = events.map((e) => e.event_id);

      return reply.status(202).send({
        status: 'accepted',
        count: events.length,
        event_ids: eventIds,
      });
    },
  );

  /**
   * Health check — verifies Redis is reachable via PING.
   * Also reports worker status via a Redis key set by the worker process.
   * Worker sets `worker:health` with a TTL; if missing, worker is down.
   */
  fastify.get(
    '/api/v1/events/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pong = await fastify.redis.ping();

        // Read worker health from Redis (set by worker process with TTL)
        let worker: 'ok' | 'degraded' | 'unknown' = 'unknown';
        try {
          const workerHealth = await fastify.redis.get('worker:health');
          if (workerHealth === 'ok') worker = 'ok';
          else if (workerHealth === 'degraded') worker = 'degraded';
          // null = key expired or never set → worker is down/unknown
        } catch {
          // Redis read failed — worker status unknown
        }

        return reply.status(200).send({ status: 'ok', redis: pong, worker });
      } catch (err: unknown) {
        fastify.log.error({ err }, 'Redis health check failed');
        return reply.status(503).send({ status: 'degraded', redis: 'unreachable', worker: 'unknown' });
      }
    },
  );
}

export default fp(eventRoutes, {
  name: 'event-routes',
  dependencies: ['redis'],
  fastify: '5.x',
});
