import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getMetrics, resolveWindow, resolveGroupBy } from '../../application/metrics.js';

/**
 * Metrics API route.
 *
 * GET /api/v1/metrics — grouped event counts and rates within a time window.
 */
async function metricsRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.get(
    '/api/v1/metrics',
    async (
      request: FastifyRequest<{
        Querystring: {
          window_seconds?: string;
          group_by?: string;
          event_type?: string;
          source?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const q = request.query;

      // --- Validate window_seconds ---
      let windowParam: number | undefined;
      if (q.window_seconds !== undefined) {
        const n = Number(q.window_seconds);
        if (!Number.isFinite(n) || n !== Math.floor(n)) {
          return reply.status(400).send({ error: 'window_seconds must be an integer' });
        }
        if (n < 10 || n > 3600) {
          return reply.status(400).send({ error: 'window_seconds must be between 10 and 3600' });
        }
        windowParam = n;
      }

      // --- Validate group_by ---
      if (q.group_by !== undefined && resolveGroupBy(q.group_by) === null) {
        return reply
          .status(400)
          .send({ error: 'group_by must be one of: event_type, source' });
      }

      fastify.log.debug(
        { window_seconds: windowParam ?? 60, group_by: q.group_by ?? 'event_type' },
        'Metrics endpoint hit',
      );

      const result = await getMetrics(fastify.db, {
        window_seconds: windowParam,
        group_by: q.group_by,
        event_type: q.event_type,
        source: q.source,
      });

      return reply.status(200).send(result);
    },
  );
}

export default fp(metricsRoutes, {
  name: 'metrics-routes',
  dependencies: ['db'],
  fastify: '5.x',
});
