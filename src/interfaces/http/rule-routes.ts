import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createRuleSchema,
  updateRuleSchema,
  patchRuleSchema,
} from '../../application/rule-schema.js';
import {
  createRule,
  listRules,
  getRule,
  updateRuleFull,
  patchRulePartial,
  removeRule,
} from '../../application/rule-crud.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rule CRUD routes.
 *
 * POST   /api/v1/rules           — create rule
 * GET    /api/v1/rules           — list all rules
 * GET    /api/v1/rules/:rule_id  — get single rule
 * PUT    /api/v1/rules/:rule_id  — full replace
 * PATCH  /api/v1/rules/:rule_id  — partial update
 * DELETE /api/v1/rules/:rule_id  — delete rule
 */
async function ruleRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/v1/rules ───────────────────────────────────
  fastify.post(
    '/api/v1/rules',
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const parsed = createRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const row = await createRule(fastify.db, {
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        severity: parsed.data.severity,
        window_seconds: parsed.data.window_seconds,
        cooldown_seconds: parsed.data.cooldown_seconds,
        condition: parsed.data.condition as Record<string, unknown>,
      });

      return reply.status(201).send(row);
    },
  );

  // ── GET /api/v1/rules ────────────────────────────────────
  fastify.get(
    '/api/v1/rules',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const rows = await listRules(fastify.db);
      return reply.status(200).send(rows);
    },
  );

  // ── GET /api/v1/rules/:rule_id ───────────────────────────
  fastify.get(
    '/api/v1/rules/:rule_id',
    async (
      request: FastifyRequest<{ Params: { rule_id: string } }>,
      reply: FastifyReply,
    ) => {
      const { rule_id } = request.params;
      if (!UUID_RE.test(rule_id)) {
        return reply.status(400).send({ error: 'rule_id must be a valid UUID' });
      }

      const row = await getRule(fastify.db, rule_id);
      if (row === null) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.status(200).send(row);
    },
  );

  // ── PUT /api/v1/rules/:rule_id ───────────────────────────
  fastify.put(
    '/api/v1/rules/:rule_id',
    async (
      request: FastifyRequest<{ Params: { rule_id: string }; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const { rule_id } = request.params;
      if (!UUID_RE.test(rule_id)) {
        return reply.status(400).send({ error: 'rule_id must be a valid UUID' });
      }

      const parsed = updateRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const row = await updateRuleFull(fastify.db, rule_id, {
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        severity: parsed.data.severity,
        window_seconds: parsed.data.window_seconds,
        cooldown_seconds: parsed.data.cooldown_seconds,
        condition: parsed.data.condition as Record<string, unknown>,
      });

      if (row === null) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.status(200).send(row);
    },
  );

  // ── PATCH /api/v1/rules/:rule_id ─────────────────────────
  fastify.patch(
    '/api/v1/rules/:rule_id',
    async (
      request: FastifyRequest<{ Params: { rule_id: string }; Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const { rule_id } = request.params;
      if (!UUID_RE.test(rule_id)) {
        return reply.status(400).send({ error: 'rule_id must be a valid UUID' });
      }

      const parsed = patchRuleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const patchInput: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) patchInput['name'] = parsed.data.name;
      if (parsed.data.enabled !== undefined) patchInput['enabled'] = parsed.data.enabled;
      if (parsed.data.severity !== undefined) patchInput['severity'] = parsed.data.severity;
      if (parsed.data.window_seconds !== undefined) patchInput['window_seconds'] = parsed.data.window_seconds;
      if (parsed.data.cooldown_seconds !== undefined) patchInput['cooldown_seconds'] = parsed.data.cooldown_seconds;
      if (parsed.data.condition !== undefined) patchInput['condition'] = parsed.data.condition;

      const row = await patchRulePartial(fastify.db, rule_id, patchInput);
      if (row === null) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.status(200).send(row);
    },
  );

  // ── DELETE /api/v1/rules/:rule_id ────────────────────────
  fastify.delete(
    '/api/v1/rules/:rule_id',
    async (
      request: FastifyRequest<{ Params: { rule_id: string } }>,
      reply: FastifyReply,
    ) => {
      const { rule_id } = request.params;
      if (!UUID_RE.test(rule_id)) {
        return reply.status(400).send({ error: 'rule_id must be a valid UUID' });
      }

      const deleted = await removeRule(fastify.db, rule_id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.status(204).send();
    },
  );
}

export default fp(ruleRoutes, {
  name: 'rule-routes',
  dependencies: ['db'],
  fastify: '5.x',
});
