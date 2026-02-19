import type { Database } from '../infrastructure/db/index.js';
import {
  insertRule,
  findAllRules,
  findRuleById,
  updateRule as repoUpdate,
  patchRule as repoPatch,
  deleteRule as repoDelete,
} from '../infrastructure/db/index.js';
import type { RuleRow, CreateRuleInput, UpdateRuleInput, PatchRuleInput } from '../infrastructure/db/index.js';

export type { RuleRow };

/** Create a new rule. Returns the inserted row. */
export async function createRule(db: Database, input: CreateRuleInput): Promise<RuleRow> {
  return insertRule(db, input);
}

/** List all rules (enabled and disabled). */
export async function listRules(db: Database): Promise<RuleRow[]> {
  return findAllRules(db);
}

/** Fetch a single rule by ID. Returns null if not found. */
export async function getRule(db: Database, ruleId: string): Promise<RuleRow | null> {
  const row = await findRuleById(db, ruleId);
  return row ?? null;
}

/** Full replace of a rule. Returns updated row or null if not found. */
export async function updateRuleFull(db: Database, ruleId: string, input: UpdateRuleInput): Promise<RuleRow | null> {
  const row = await repoUpdate(db, ruleId, input);
  return row ?? null;
}

/** Partial update of a rule. Returns updated row or null if not found. */
export async function patchRulePartial(db: Database, ruleId: string, input: PatchRuleInput): Promise<RuleRow | null> {
  const row = await repoPatch(db, ruleId, input);
  return row ?? null;
}

/** Delete a rule. Returns true if deleted, false if not found. */
export async function removeRule(db: Database, ruleId: string): Promise<boolean> {
  return repoDelete(db, ruleId);
}
