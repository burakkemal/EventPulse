import { z } from 'zod';

/**
 * Zod schema for the threshold condition JSONB field.
 *
 * Only the "threshold" type with "count" metric is supported in P0.
 * Operators: > >= < <= == !=
 */
export const thresholdConditionSchema = z.object({
  type: z.literal('threshold'),
  metric: z.literal('count'),
  filters: z.object({
    event_type: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
  }).optional().default({}),
  operator: z.enum(['>', '>=', '<', '<=', '==', '!=']),
  value: z.number().finite(),
});

export type ThresholdCondition = z.infer<typeof thresholdConditionSchema>;

/** Rule severity enum — distinct from domain Severity (low/medium/high/critical). */
const ruleSeverityEnum = z.enum(['critical', 'warning', 'info']);

export type RuleSeverity = z.infer<typeof ruleSeverityEnum>;

/**
 * Schema for POST /api/v1/rules (create).
 * All fields required except `enabled` (defaults true).
 */
export const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  enabled: z.boolean().optional().default(true),
  severity: ruleSeverityEnum,
  window_seconds: z.number().int().min(1),
  cooldown_seconds: z.number().int().min(0).optional().default(0),
  condition: thresholdConditionSchema,
});

export type CreateRuleInput = z.infer<typeof createRuleSchema>;

/**
 * Schema for PUT /api/v1/rules/:rule_id (full replace).
 * All fields required.
 */
export const updateRuleSchema = z.object({
  name: z.string().min(1).max(255),
  enabled: z.boolean(),
  severity: ruleSeverityEnum,
  window_seconds: z.number().int().min(1),
  cooldown_seconds: z.number().int().min(0),
  condition: thresholdConditionSchema,
});

export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

/**
 * Schema for PATCH /api/v1/rules/:rule_id (partial update).
 * All fields optional.
 */
export const patchRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  severity: ruleSeverityEnum.optional(),
  window_seconds: z.number().int().min(1).optional(),
  cooldown_seconds: z.number().int().min(0).optional(),
  condition: thresholdConditionSchema.optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

export type PatchRuleInput = z.infer<typeof patchRuleSchema>;
