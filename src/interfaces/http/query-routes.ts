import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listEvents, getEvent } from '../../application/query-events.js';
import { listAnomalies } from '../../application/query-anomalies.js';

/**
 * Parses a querystring value to a positive integer.
 * Returns `undefined` for missing values, `NaN`-safe.
 */
function safeInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n !== Math.floor(n)) return NaN;
  return n;
}

/**
 * Returns true if `value` is a valid ISO-8601 date string.
 */
function isValidIso(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/**
 * Read-only query API routes.
 *
 * GET /api/v1/events         — paginated event list with filters
 * GET /api/v1/events/:id     — single event by ID
 * GET /api/v1/anomalies      — paginated anomaly list with filters
 */
async function queryRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/events
   *
   * Query params: limit, offset, event_type, source, from, to
   */
  fastify.get(
    '/api/v1/events',
    async (
      request: FastifyRequest<{
        Querystring: {
          limit?: string;
          offset?: string;
          event_type?: string;
          source?: string;
          from?: string;
          to?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const q = request.query;

      const limit = safeInt(q.limit);
      const offset = safeInt(q.offset);

      if (limit !== undefined && Number.isNaN(limit)) {
        return reply.status(400).send({ error: 'limit must be an integer' });
      }
      if (offset !== undefined && Number.isNaN(offset)) {
        return reply.status(400).send({ error: 'offset must be an integer' });
      }

      // Validate from/to: must be parseable ISO-8601, and from <= to
      if (q.from !== undefined && !isValidIso(q.from)) {
        return reply.status(400).send({ error: 'from must be a valid ISO-8601 timestamp' });
      }
      if (q.to !== undefined && !isValidIso(q.to)) {
        return reply.status(400).send({ error: 'to must be a valid ISO-8601 timestamp' });
      }
      if (q.from !== undefined && q.to !== undefined && Date.parse(q.from) > Date.parse(q.to)) {
        return reply.status(400).send({ error: 'from must not be after to' });
      }

      const result = await listEvents(fastify.db, {
        limit,
        offset,
        event_type: q.event_type,
        source: q.source,
        from: q.from,
        to: q.to,
      });

      return reply.status(200).send(result);
    },
  );

  /**
   * GET /api/v1/events/:event_id
   */
  fastify.get(
    '/api/v1/events/:event_id',
    async (
      request: FastifyRequest<{ Params: { event_id: string } }>,
      reply: FastifyReply,
    ) => {
      const event = await getEvent(fastify.db, request.params.event_id);

      if (event === null) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      return reply.status(200).send(event);
    },
  );

  /**
   * GET /api/v1/anomalies
   *
   * Query params: limit, offset, rule_id, severity
   */
  fastify.get(
    '/api/v1/anomalies',
    async (
      request: FastifyRequest<{
        Querystring: {
          limit?: string;
          offset?: string;
          rule_id?: string;
          severity?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const q = request.query;

      const limit = safeInt(q.limit);
      const offset = safeInt(q.offset);

      if (limit !== undefined && Number.isNaN(limit)) {
        return reply.status(400).send({ error: 'limit must be an integer' });
      }
      if (offset !== undefined && Number.isNaN(offset)) {
        return reply.status(400).send({ error: 'offset must be an integer' });
      }

      const result = await listAnomalies(fastify.db, {
        limit,
        offset,
        rule_id: q.rule_id,
        severity: q.severity,
      });

      return reply.status(200).send(result);
    },
  );
}

export default fp(queryRoutes, {
  name: 'query-routes',
  dependencies: ['db'],
  fastify: '5.x',
});
