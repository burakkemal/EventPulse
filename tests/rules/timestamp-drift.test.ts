import { describe, it, expect } from 'vitest';
import { createTimestampDriftRule } from '../../src/domain/rules/timestamp-drift.js';
import type { RuleContext } from '../../src/domain/rules/types.js';
import { makeEvent, FIXED_NOW } from './helpers.js';

describe('Timestamp Drift Rule', () => {
  // Fixed clock for deterministic tests
  const rule = createTimestampDriftRule(300, () => FIXED_NOW); // 5 min threshold
  const emptyContext: RuleContext = { recentEventsBySource: [] };

  it('should pass timestamp within threshold', () => {
    // 60 seconds in the past — well within 300s
    const ts = new Date(FIXED_NOW - 60_000).toISOString();
    const event = makeEvent({ timestamp: ts });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(false);
  });

  it('should trigger timestamp far in the past', () => {
    // 10 minutes ago = 600s, exceeds 300s
    const ts = new Date(FIXED_NOW - 600_000).toISOString();
    const event = makeEvent({ timestamp: ts });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.message).toContain('past');
      expect(result.anomaly.severity).toBe('low');
    }
  });

  it('should trigger timestamp far in the future', () => {
    // 10 minutes ahead = 600s
    const ts = new Date(FIXED_NOW + 600_000).toISOString();
    const event = makeEvent({ timestamp: ts });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.message).toContain('future');
    }
  });

  it('should trigger on unparseable timestamp', () => {
    const event = makeEvent({ timestamp: 'not-a-date' });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.message).toContain('Unparseable');
    }
  });

  it('should pass timestamp exactly at threshold boundary', () => {
    // Exactly 300s drift — not > 300s
    const ts = new Date(FIXED_NOW - 300_000).toISOString();
    const event = makeEvent({ timestamp: ts });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(false);
  });

  it('should trigger just past threshold boundary', () => {
    // 301s drift — just over 300s
    const ts = new Date(FIXED_NOW - 301_000).toISOString();
    const event = makeEvent({ timestamp: ts });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
  });

  it('should respect custom threshold', () => {
    const strictRule = createTimestampDriftRule(10, () => FIXED_NOW); // 10s threshold
    const ts = new Date(FIXED_NOW - 15_000).toISOString(); // 15s drift
    const event = makeEvent({ timestamp: ts });
    const result = strictRule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
  });

  it('should pass with exact current time', () => {
    const ts = new Date(FIXED_NOW).toISOString();
    const event = makeEvent({ timestamp: ts });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(false);
  });
});
