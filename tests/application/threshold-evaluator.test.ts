import { describe, it, expect, beforeEach } from 'vitest';
import { ThresholdEvaluator } from '../../src/application/threshold-evaluator.js';
import type { EvaluatableEvent } from '../../src/application/threshold-evaluator.js';
import type { RuleRow } from '../../src/infrastructure/db/rule-repository.js';

// ── Helpers ──────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-02-18T12:00:00Z').getTime();

function makeEvent(overrides: Partial<EvaluatableEvent> = {}): EvaluatableEvent {
  return {
    event_id: overrides.event_id ?? `evt-${Math.random().toString(36).slice(2, 8)}`,
    event_type: overrides.event_type ?? 'error',
    source: overrides.source ?? 'payment_service',
    timestamp: overrides.timestamp ?? new Date(FIXED_NOW).toISOString(),
  };
}

function makeRule(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    rule_id: overrides.rule_id ?? '11111111-2222-3333-4444-555555555555',
    name: overrides.name ?? 'Test rule',
    enabled: overrides.enabled ?? true,
    severity: overrides.severity ?? 'critical',
    window_seconds: overrides.window_seconds ?? 60,
    cooldown_seconds: overrides.cooldown_seconds ?? 0,
    condition: overrides.condition ?? {
      type: 'threshold',
      metric: 'count',
      filters: { event_type: 'error', source: 'payment_service' },
      operator: '>',
      value: 2,
    },
    created_at: overrides.created_at ?? new Date(FIXED_NOW),
    updated_at: overrides.updated_at ?? new Date(FIXED_NOW),
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('ThresholdEvaluator', () => {
  let evaluator: ThresholdEvaluator;

  beforeEach(() => {
    evaluator = new ThresholdEvaluator(() => FIXED_NOW);
  });

  // --- Filter matching ---

  describe('filter matching', () => {
    it('matches when event_type and source match', () => {
      const rule = makeRule();
      const event = makeEvent();

      // Send 3 events to exceed threshold of 2
      evaluator.evaluate(makeEvent(), [rule]);
      evaluator.evaluate(makeEvent(), [rule]);
      const anomalies = evaluator.evaluate(event, [rule]);

      expect(anomalies).toHaveLength(1);
    });

    it('skips rule when event_type does not match', () => {
      const rule = makeRule();
      const event = makeEvent({ event_type: 'page_view' });

      evaluator.evaluate(event, [rule]);
      evaluator.evaluate(event, [rule]);
      const anomalies = evaluator.evaluate(event, [rule]);

      expect(anomalies).toHaveLength(0);
    });

    it('skips rule when source does not match', () => {
      const rule = makeRule();
      const event = makeEvent({ source: 'auth_service' });

      evaluator.evaluate(event, [rule]);
      evaluator.evaluate(event, [rule]);
      const anomalies = evaluator.evaluate(event, [rule]);

      expect(anomalies).toHaveLength(0);
    });

    it('matches when filters are empty (match all events)', () => {
      const rule = makeRule({
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>',
          value: 1,
        },
      });

      evaluator.evaluate(makeEvent({ event_type: 'anything', source: 'anywhere' }), [rule]);
      const anomalies = evaluator.evaluate(makeEvent({ event_type: 'other', source: 'else' }), [rule]);

      expect(anomalies).toHaveLength(1);
    });

    it('matches when only event_type filter is set', () => {
      const rule = makeRule({
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: { event_type: 'error' },
          operator: '>',
          value: 1,
        },
      });

      evaluator.evaluate(makeEvent({ source: 'any' }), [rule]);
      const anomalies = evaluator.evaluate(makeEvent({ source: 'different' }), [rule]);

      expect(anomalies).toHaveLength(1);
    });

    it('matches when only source filter is set', () => {
      const rule = makeRule({
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: { source: 'payment_service' },
          operator: '>',
          value: 1,
        },
      });

      evaluator.evaluate(makeEvent({ event_type: 'any' }), [rule]);
      const anomalies = evaluator.evaluate(makeEvent({ event_type: 'different' }), [rule]);

      expect(anomalies).toHaveLength(1);
    });
  });

  // --- Window behavior ---

  describe('window behavior', () => {
    it('counts events within the window period', () => {
      const rule = makeRule({
        window_seconds: 60,
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 3,
        },
      });

      const t = FIXED_NOW;
      evaluator.evaluate(makeEvent({ timestamp: new Date(t - 30_000).toISOString() }), [rule]);
      evaluator.evaluate(makeEvent({ timestamp: new Date(t - 10_000).toISOString() }), [rule]);
      const anomalies = evaluator.evaluate(makeEvent({ timestamp: new Date(t).toISOString() }), [rule]);

      expect(anomalies).toHaveLength(1);
    });

    it('prunes events older than window_seconds', () => {
      const rule = makeRule({
        window_seconds: 10,
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>',
          value: 2,
        },
      });

      const t = FIXED_NOW;
      // These two events are 30s old — outside the 10s window
      evaluator.evaluate(makeEvent({ timestamp: new Date(t - 30_000).toISOString() }), [rule]);
      evaluator.evaluate(makeEvent({ timestamp: new Date(t - 25_000).toISOString() }), [rule]);
      // This event is current — should be the only one in window
      const anomalies = evaluator.evaluate(makeEvent({ timestamp: new Date(t).toISOString() }), [rule]);

      expect(anomalies).toHaveLength(0); // Only 1 event in window, need > 2
    });

    it('does not grow unboundedly when events stream continuously', () => {
      const rule = makeRule({
        window_seconds: 5,
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 999, // won't trigger
        },
      });

      // Send 100 events spanning 100 seconds, window is 5s
      for (let i = 0; i < 100; i++) {
        evaluator.evaluate(
          makeEvent({ timestamp: new Date(FIXED_NOW + i * 1000).toISOString() }),
          [rule],
        );
      }

      // Window should contain at most ~5 entries (not 100)
      expect(evaluator.totalEntries).toBeLessThanOrEqual(6);
    });
  });

  // --- Operator handling ---

  describe('operator handling', () => {
    function testOperator(operator: string, value: number, eventCount: number, expected: boolean): void {
      it(`${eventCount} events ${operator} ${value} → ${expected ? 'triggers' : 'no trigger'}`, () => {
        const freshEvaluator = new ThresholdEvaluator(() => FIXED_NOW);
        const rule = makeRule({
          condition: {
            type: 'threshold',
            metric: 'count',
            filters: {},
            operator,
            value,
          },
        });

        let anomalies: ReturnType<ThresholdEvaluator['evaluate']> = [];
        for (let i = 0; i < eventCount; i++) {
          anomalies = freshEvaluator.evaluate(makeEvent(), [rule]);
        }

        if (expected) {
          expect(anomalies).toHaveLength(1);
        } else {
          expect(anomalies).toHaveLength(0);
        }
      });
    }

    // > operator
    testOperator('>', 3, 3, false);
    testOperator('>', 3, 4, true);

    // >= operator
    testOperator('>=', 3, 2, false);
    testOperator('>=', 3, 3, true);

    // < operator
    testOperator('<', 3, 2, true);
    testOperator('<', 3, 3, false);

    // <= operator
    testOperator('<=', 3, 3, true);
    testOperator('<=', 3, 4, false);

    // == operator
    testOperator('==', 3, 3, true);
    testOperator('==', 3, 4, false);

    // != operator
    testOperator('!=', 3, 2, true);
    testOperator('!=', 3, 3, false);
  });

  // --- Cooldown behavior ---

  describe('cooldown behavior', () => {
    it('suppresses subsequent triggers within cooldown period', () => {
      let currentTime = FIXED_NOW;
      const evalWithClock = new ThresholdEvaluator(() => currentTime);

      const rule = makeRule({
        cooldown_seconds: 60,
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 1,
        },
      });

      // First event triggers
      const first = evalWithClock.evaluate(makeEvent(), [rule]);
      expect(first).toHaveLength(1);

      // Second event within cooldown — suppressed
      currentTime = FIXED_NOW + 30_000; // 30s later
      const second = evalWithClock.evaluate(makeEvent({ timestamp: new Date(currentTime).toISOString() }), [rule]);
      expect(second).toHaveLength(0);
    });

    it('triggers again after cooldown expires', () => {
      let currentTime = FIXED_NOW;
      const evalWithClock = new ThresholdEvaluator(() => currentTime);

      const rule = makeRule({
        cooldown_seconds: 60,
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 1,
        },
      });

      // First trigger
      const first = evalWithClock.evaluate(makeEvent(), [rule]);
      expect(first).toHaveLength(1);

      // After cooldown expires
      currentTime = FIXED_NOW + 61_000; // 61s later
      const second = evalWithClock.evaluate(makeEvent({ timestamp: new Date(currentTime).toISOString() }), [rule]);
      expect(second).toHaveLength(1);
    });

    it('does not apply cooldown when cooldown_seconds is 0', () => {
      const rule = makeRule({
        cooldown_seconds: 0,
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 1,
        },
      });

      const first = evaluator.evaluate(makeEvent(), [rule]);
      const second = evaluator.evaluate(makeEvent(), [rule]);

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
    });
  });

  // --- Multiple rules ---

  describe('multiple rules', () => {
    it('evaluates each rule independently', () => {
      const ruleA = makeRule({
        rule_id: 'aaaa',
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: { event_type: 'error' },
          operator: '>=',
          value: 1,
        },
      });

      const ruleB = makeRule({
        rule_id: 'bbbb',
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: { event_type: 'page_view' },
          operator: '>=',
          value: 1,
        },
      });

      const anomalies = evaluator.evaluate(makeEvent({ event_type: 'error' }), [ruleA, ruleB]);

      // Only ruleA matches error event type
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.rule_id).toBe('aaaa');
    });

    it('can trigger multiple rules from one event', () => {
      const ruleA = makeRule({
        rule_id: 'aaaa',
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 1,
        },
      });

      const ruleB = makeRule({
        rule_id: 'bbbb',
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 1,
        },
      });

      const anomalies = evaluator.evaluate(makeEvent(), [ruleA, ruleB]);
      expect(anomalies).toHaveLength(2);
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('returns empty array with no rules', () => {
      const anomalies = evaluator.evaluate(makeEvent(), []);
      expect(anomalies).toHaveLength(0);
    });

    it('skips disabled rules', () => {
      const rule = makeRule({
        enabled: false,
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 1,
        },
      });

      const anomalies = evaluator.evaluate(makeEvent(), [rule]);
      expect(anomalies).toHaveLength(0);
    });

    it('anomaly contains correct metadata', () => {
      const rule = makeRule({
        rule_id: 'rule-123',
        name: 'My Rule',
        severity: 'warning',
        condition: {
          type: 'threshold',
          metric: 'count',
          filters: {},
          operator: '>=',
          value: 1,
        },
      });

      const event = makeEvent({ event_id: 'evt-abc' });
      const anomalies = evaluator.evaluate(event, [rule]);

      expect(anomalies).toHaveLength(1);
      const a = anomalies[0]!;
      expect(a.rule_id).toBe('rule-123');
      expect(a.event_id).toBe('evt-abc');
      expect(a.severity).toBe('warning');
      expect(a.message).toContain('My Rule');
      expect(a.message).toContain('>=');
      expect(a.detected_at).toBeDefined();
    });
  });
});
