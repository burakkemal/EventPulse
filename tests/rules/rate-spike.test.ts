import { describe, it, expect } from 'vitest';
import { createRateSpikeRule } from '../../src/domain/rules/rate-spike.js';
import type { RuleContext } from '../../src/domain/rules/types.js';
import { makeEvent } from './helpers.js';

describe('Rate Spike Rule', () => {
  const rule = createRateSpikeRule(3, 60); // threshold: >3 events in 60s

  function contextWithCount(count: number, source = 'web'): RuleContext {
    const now = new Date();
    const events = Array.from({ length: count }, (_, i) =>
      makeEvent({
        source,
        timestamp: new Date(now.getTime() - (count - i) * 1000).toISOString(),
      }),
    );
    return { recentEventsBySource: events };
  }

  it('should not trigger when under threshold', () => {
    const event = makeEvent({ source: 'web' });
    const context = contextWithCount(2); // 2 in context + 1 current = 3, not > 3
    const result = rule.evaluate(event, context);
    expect(result.triggered).toBe(false);
    expect(result.rule_id).toBe('rate-spike');
  });

  it('should trigger when over threshold', () => {
    const event = makeEvent({ source: 'web' });
    const context = contextWithCount(3); // 3 in context + 1 current = 4 > 3
    const result = rule.evaluate(event, context);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.severity).toBe('high');
      expect(result.anomaly.message).toContain('Rate spike');
      expect(result.anomaly.message).toContain('web');
    }
  });

  it('should not count events outside the time window', () => {
    const now = new Date();
    const event = makeEvent({ source: 'web', timestamp: now.toISOString() });
    // All context events are 120s in the past (outside 60s window)
    const oldEvents = Array.from({ length: 5 }, (_, i) =>
      makeEvent({
        source: 'web',
        timestamp: new Date(now.getTime() - 120_000 - i * 1000).toISOString(),
      }),
    );
    const context: RuleContext = { recentEventsBySource: oldEvents };
    const result = rule.evaluate(event, context);
    expect(result.triggered).toBe(false);
  });

  it('should not trigger with empty context', () => {
    const event = makeEvent({ source: 'web' });
    const context: RuleContext = { recentEventsBySource: [] };
    const result = rule.evaluate(event, context);
    expect(result.triggered).toBe(false);
  });

  it('should exactly match threshold boundary (not >)', () => {
    // 2 in context + 1 current = 3 = threshold, NOT > threshold
    const event = makeEvent({ source: 'web' });
    const context = contextWithCount(2);
    const result = rule.evaluate(event, context);
    expect(result.triggered).toBe(false);
  });

  it('should respect custom parameters', () => {
    const strictRule = createRateSpikeRule(1, 10); // >1 event in 10s
    const event = makeEvent({ source: 'mobile' });
    const context = contextWithCount(1, 'mobile'); // 1 + 1 = 2 > 1
    const result = strictRule.evaluate(event, context);
    expect(result.triggered).toBe(true);
  });
});
