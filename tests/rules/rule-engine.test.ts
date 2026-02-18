import { describe, it, expect } from 'vitest';
import { EventWindow, evaluateEvent } from '../../src/application/rule-engine.js';
import { createRateSpikeRule } from '../../src/domain/rules/rate-spike.js';
import { createInvalidPayloadRule } from '../../src/domain/rules/invalid-payload.js';
import { createTimestampDriftRule } from '../../src/domain/rules/timestamp-drift.js';
import type { Rule, RuleContext, RuleResult } from '../../src/domain/rules/types.js';
import { makeEvent, FIXED_NOW } from './helpers.js';

describe('EventWindow', () => {
  it('should track events per source', () => {
    const w = new EventWindow(60_000);
    const e1 = makeEvent({ source: 'web' });
    const e2 = makeEvent({ source: 'mobile' });
    w.add(e1);
    w.add(e2);
    expect(w.size).toBe(2);
    expect(w.getRecentBySource('web', 'none')).toHaveLength(1);
    expect(w.getRecentBySource('mobile', 'none')).toHaveLength(1);
  });

  it('should exclude event by ID', () => {
    const w = new EventWindow(60_000);
    const e = makeEvent({ source: 'web', event_id: 'exclude-me' });
    w.add(e);
    expect(w.getRecentBySource('web', 'exclude-me')).toHaveLength(0);
    expect(w.getRecentBySource('web', 'other')).toHaveLength(1);
  });

  it('should prune events outside the window', () => {
    const w = new EventWindow(10_000); // 10s window
    const now = new Date();
    const old = makeEvent({
      source: 'web',
      timestamp: new Date(now.getTime() - 20_000).toISOString(), // 20s ago
    });
    const recent = makeEvent({
      source: 'web',
      timestamp: now.toISOString(),
    });
    w.add(old);
    w.add(recent); // triggers prune on 'web'
    // The old event should have been pruned
    expect(w.getRecentBySource('web', 'none')).toHaveLength(1);
  });

  it('should return empty array for unknown source', () => {
    const w = new EventWindow(60_000);
    expect(w.getRecentBySource('unknown', 'none')).toHaveLength(0);
  });
});

describe('evaluateEvent', () => {
  it('should return results for all rules', () => {
    const rules: Rule[] = [
      createRateSpikeRule(100, 60),
      createInvalidPayloadRule(),
      createTimestampDriftRule(300, () => FIXED_NOW),
    ];
    const w = new EventWindow();
    const event = makeEvent({
      event_type: 'page_view',
      payload: { url: '/test' },
      timestamp: new Date(FIXED_NOW).toISOString(),
    });

    const { results, anomalies } = evaluateEvent(event, rules, w);
    expect(results).toHaveLength(3);
    expect(anomalies).toHaveLength(0);
  });

  it('should collect anomalies from triggered rules', () => {
    const rules: Rule[] = [
      createInvalidPayloadRule(),
      createTimestampDriftRule(300, () => FIXED_NOW),
    ];
    const w = new EventWindow();
    // Missing url (invalid payload) + old timestamp (drift)
    const event = makeEvent({
      event_type: 'page_view',
      payload: {},
      timestamp: new Date(FIXED_NOW - 600_000).toISOString(), // 10 min ago
    });

    const { results, anomalies } = evaluateEvent(event, rules, w);
    expect(results).toHaveLength(2);
    expect(anomalies).toHaveLength(2);
    expect(anomalies.map((a) => a.rule_id)).toContain('invalid-payload');
    expect(anomalies.map((a) => a.rule_id)).toContain('timestamp-drift');
  });

  it('should add event to window after evaluation', () => {
    const w = new EventWindow();
    const rules: Rule[] = [];
    const event = makeEvent({ source: 'test-source' });
    evaluateEvent(event, rules, w);
    expect(w.getRecentBySource('test-source', 'none')).toHaveLength(1);
  });

  it('should handle empty rule list', () => {
    const w = new EventWindow();
    const event = makeEvent();
    const { results, anomalies } = evaluateEvent(event, [], w);
    expect(results).toHaveLength(0);
    expect(anomalies).toHaveLength(0);
  });

  it('should work with a custom rule', () => {
    const alwaysTrigger: Rule = {
      id: 'always-trigger',
      name: 'Always Trigger',
      description: 'Test rule that always triggers',
      severity: 'critical',
      evaluate(event, _context: RuleContext): RuleResult {
        return {
          triggered: true,
          rule_id: 'always-trigger',
          anomaly: {
            rule_id: 'always-trigger',
            event_id: event.event_id,
            severity: 'critical',
            message: 'Always fires',
            detected_at: new Date().toISOString(),
          },
        };
      },
    };
    const w = new EventWindow();
    const event = makeEvent();
    const { anomalies } = evaluateEvent(event, [alwaysTrigger], w);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.severity).toBe('critical');
  });
});
