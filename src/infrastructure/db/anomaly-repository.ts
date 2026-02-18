import { randomUUID } from 'node:crypto';
import type { Database } from './client.js';
import { anomalies } from './schema.js';

/**
 * Inserts an anomaly into PostgreSQL.
 * Generates a UUID for anomaly_id.
 */
export async function insertAnomaly(
  db: Database,
  anomaly: {
    event_id: string;
    rule_id: string;
    severity: string;
    message: string;
    detected_at: string;
  },
): Promise<string> {
  const anomalyId = randomUUID();
  await db.insert(anomalies).values({
    anomaly_id: anomalyId,
    event_id: anomaly.event_id,
    rule_id: anomaly.rule_id,
    severity: anomaly.severity,
    message: anomaly.message,
    detected_at: new Date(anomaly.detected_at),
  });
  return anomalyId;
}
