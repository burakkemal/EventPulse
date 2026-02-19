import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { rules } from './schema.js';

/** Row shape returned by rule queries. */
export type RuleRow = typeof rules.$inferSelect;

/** Fields accepted when creating a rule (server assigns rule_id + timestamps). */
export interface CreateRuleInput {
  name: string;
  enabled?: boolean;
  severity: string;
  window_seconds: number;
  cooldown_seconds: number;
  condition: Record<string, unknown>;
}

/** Fields accepted for a full PUT update (all required). */
export interface UpdateRuleInput {
  name: string;
  enabled: boolean;
  severity: string;
  window_seconds: number;
  cooldown_seconds: number;
  condition: Record<string, unknown>;
}

/** Fields accepted for a partial PATCH update (all optional). */
export interface PatchRuleInput {
  name?: string;
  enabled?: boolean;
  severity?: string;
  window_seconds?: number;
  cooldown_seconds?: number;
  condition?: Record<string, unknown>;
}

export async function insertRule(db: Database, input: CreateRuleInput): Promise<RuleRow> {
  const ruleId = randomUUID();
  const now = new Date();
  const [row] = await db.insert(rules).values({
    rule_id: ruleId,
    name: input.name,
    enabled: input.enabled ?? true,
    severity: input.severity,
    window_seconds: input.window_seconds,
    cooldown_seconds: input.cooldown_seconds,
    condition: input.condition,
    created_at: now,
    updated_at: now,
  }).returning();

  return row!;
}

export async function findAllRules(db: Database): Promise<RuleRow[]> {
  return db.select().from(rules);
}

export async function findEnabledRules(db: Database): Promise<RuleRow[]> {
  return db.select().from(rules).where(eq(rules.enabled, true));
}

export async function findRuleById(db: Database, ruleId: string): Promise<RuleRow | undefined> {
  const rows = await db.select().from(rules).where(eq(rules.rule_id, ruleId)).limit(1);
  return rows[0];
}

export async function updateRule(
  db: Database,
  ruleId: string,
  input: UpdateRuleInput,
): Promise<RuleRow | undefined> {
  const rows = await db.update(rules).set({
    name: input.name,
    enabled: input.enabled,
    severity: input.severity,
    window_seconds: input.window_seconds,
    cooldown_seconds: input.cooldown_seconds,
    condition: input.condition,
    updated_at: new Date(),
  }).where(eq(rules.rule_id, ruleId)).returning();

  return rows[0];
}

export async function patchRule(
  db: Database,
  ruleId: string,
  input: PatchRuleInput,
): Promise<RuleRow | undefined> {
  const setFields: Record<string, unknown> = { updated_at: new Date() };
  if (input.name !== undefined) setFields['name'] = input.name;
  if (input.enabled !== undefined) setFields['enabled'] = input.enabled;
  if (input.severity !== undefined) setFields['severity'] = input.severity;
  if (input.window_seconds !== undefined) setFields['window_seconds'] = input.window_seconds;
  if (input.cooldown_seconds !== undefined) setFields['cooldown_seconds'] = input.cooldown_seconds;
  if (input.condition !== undefined) setFields['condition'] = input.condition;

  const rows = await db.update(rules).set(setFields).where(eq(rules.rule_id, ruleId)).returning();
  return rows[0];
}

export async function deleteRule(db: Database, ruleId: string): Promise<boolean> {
  const result = await db.delete(rules).where(eq(rules.rule_id, ruleId));
  return result.rowCount !== null && result.rowCount > 0;
}
