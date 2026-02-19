export { events, anomalies, rules } from './schema.js';
export { createDbClient } from './client.js';
export type { Database } from './client.js';
export { insertEvent } from './event-repository.js';
export { insertAnomaly } from './anomaly-repository.js';
export { queryEvents, findEventById } from './event-query-repository.js';
export type { EventQueryFilters } from './event-query-repository.js';
export { queryAnomalies } from './anomaly-query-repository.js';
export type { AnomalyQueryFilters } from './anomaly-query-repository.js';
export {
  insertRule,
  findAllRules,
  findEnabledRules,
  findRuleById,
  updateRule,
  patchRule,
  deleteRule,
} from './rule-repository.js';
export type { RuleRow, CreateRuleInput, UpdateRuleInput, PatchRuleInput } from './rule-repository.js';
export { queryMetrics } from './metrics-repository.js';
export type { MetricsFilters, MetricsBucket } from './metrics-repository.js';
export { default as dbPlugin } from './db-plugin.js';
