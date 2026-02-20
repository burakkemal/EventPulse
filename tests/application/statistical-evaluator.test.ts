import { describe, it, expect } from 'vitest';
import { StatisticalEvaluator } from '../../src/application/statistical-evaluator.js';
import type { StatisticalProfile } from '../../src/application/statistical-evaluator.js';

/** Helper: ISO string from epoch ms. */
function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

/** Helper: build a minimal evaluateEvent input. */
function makeInput(
  timestamp: string,
  overrides: { event_type?: string; source?: string } = {},
) {
  return { event_type: 'page_view', source: 'web', timestamp, ...overrides };
}

/**
 * Helper: fill exactly `counts.length` baseline buckets, one count per bucket.
 * Returns the epoch-ms start of the NEXT bucket after the last baseline bucket.
 */
function fillBaseline(
  evaluator: StatisticalEvaluator,
  baseTime: number,
  bucketMs: number,
  counts: number[],
  overrides: { event_type?: string; source?: string } = {},
): number {
  for (let b = 0; b < counts.length; b++) {
    const bucketStart = baseTime + b * bucketMs;
    for (let i = 0; i < counts[b]!; i++) {
      evaluator.evaluateEvent(makeInput(isoAt(bucketStart + i * 100), overrides));
    }
  }
  return baseTime + counts.length * bucketMs;
}

describe('StatisticalEvaluator', () => {
  const BUCKET_SEC = 60;
  const BUCKET_MS = BUCKET_SEC * 1000;
  const BASELINE_BUCKETS = 5;

  // Varied baseline so population stddev > 0 (mean=3, stddev≈1.41)
  const VARIED_BASELINE = [2, 4, 2, 4, 3];

  const defaultProfile: StatisticalProfile = {
    id: 'zscore-count-spike',
    bucketSeconds: BUCKET_SEC,
    baselineBuckets: BASELINE_BUCKETS,
    zThreshold: 3.0,
    cooldownSeconds: 0,
  };

  // ─── Test 1: No alert before baseline is filled ───────────────────
  it('should not alert before baselineBuckets are filled', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const evaluator = new StatisticalEvaluator({
      profiles: [defaultProfile],
      nowFn: () => clock,
    });

    // Send events in only 3 buckets (need 5 baseline buckets before current)
    for (let bucket = 0; bucket < 3; bucket++) {
      clock = baseTime + bucket * BUCKET_MS;
      for (let i = 0; i < 10; i++) {
        const result = evaluator.evaluateEvent(
          makeInput(isoAt(baseTime + bucket * BUCKET_MS + i * 100)),
        );
        expect(result).toHaveLength(0);
      }
    }
  });

  // ─── Test 2: Stable series produces no anomalies ──────────────────
  // Uses uniform counts — stddev=0 guard must suppress all alerts.
  it('should not alert on a stable event series (stddev guard)', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const evaluator = new StatisticalEvaluator({
      profiles: [{ ...defaultProfile, zThreshold: 0.1 }], // very sensitive — would fire if z was calculated
      nowFn: () => clock,
    });

    const EVENTS_PER_BUCKET = 10;

    // Uniform counts across all buckets → stddev=0 → evaluator must stay silent
    for (let bucket = 0; bucket <= BASELINE_BUCKETS; bucket++) {
      clock = baseTime + bucket * BUCKET_MS;
      for (let i = 0; i < EVENTS_PER_BUCKET; i++) {
        const result = evaluator.evaluateEvent(
          makeInput(isoAt(baseTime + bucket * BUCKET_MS + i * 100)),
        );
        expect(result).toHaveLength(0);
      }
    }
  });

  // ─── Test 3: Spike produces anomaly with z >= threshold ───────────
  it('should detect a spike and produce an anomaly', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const evaluator = new StatisticalEvaluator({
      profiles: [{ ...defaultProfile, zThreshold: 2.0 }],
      nowFn: () => clock,
    });

    // Varied baseline ensures stddev > 0
    // VARIED_BASELINE = [2,4,2,4,3] → mean=3, stddev≈0.894
    const spikeBucketStart = fillBaseline(evaluator, baseTime, BUCKET_MS, VARIED_BASELINE);
    clock = spikeBucketStart;

    // Threshold: count >= mean + 2*stddev ≈ 3 + 1.79 ≈ 4.79 → fires at count=5
    let spikeAnomaly = null;
    for (let i = 0; i < 30; i++) {
      const results = evaluator.evaluateEvent(
        makeInput(isoAt(spikeBucketStart + i * 100)),
      );
      if (results.length > 0) {
        spikeAnomaly = results[0]!;
        break;
      }
    }

    expect(spikeAnomaly).not.toBeNull();
    // ruleIdPrefix defaults to "" so rule_id === profile.id
    expect(spikeAnomaly!.rule_id).toBe('zscore-count-spike');
    expect(spikeAnomaly!.severity).toBe('warning');
    expect(spikeAnomaly!.message).toContain('Z-score spike detected');
    expect(spikeAnomaly!.message).toContain('mean=');
    expect(spikeAnomaly!.message).toContain('stddev=');
    expect(spikeAnomaly!.details.z).toBeGreaterThanOrEqual(2.0);
    expect(spikeAnomaly!.details.stddev).toBeGreaterThan(0);
    expect(spikeAnomaly!.detected_at).toBeInstanceOf(Date);
  });

  // ─── Test 4: stddev === 0 handled safely ──────────────────────────
  it('should not divide by zero when stddev is 0 (all baseline buckets identical)', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const evaluator = new StatisticalEvaluator({
      profiles: [{ ...defaultProfile, zThreshold: 0.1 }],
      nowFn: () => clock,
    });

    const EVENTS_PER_BUCKET = 5;

    // Fill baseline with EXACTLY identical counts → population stddev = 0
    const currentBucket = fillBaseline(
      evaluator,
      baseTime,
      BUCKET_MS,
      Array(BASELINE_BUCKETS).fill(EVENTS_PER_BUCKET) as number[],
    );
    clock = currentBucket;

    // Even a different count in the current bucket must NOT alert: stddev=0 guard
    for (let i = 0; i < EVENTS_PER_BUCKET + 3; i++) {
      const results = evaluator.evaluateEvent(
        makeInput(isoAt(currentBucket + i * 1000)),
      );
      expect(results).toHaveLength(0);
    }
  });

  // ─── Test 5: Cooldown prevents repeated anomalies ─────────────────
  it('should suppress anomalies within cooldown window', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const COOLDOWN_SEC = 120;
    const evaluator = new StatisticalEvaluator({
      profiles: [{ ...defaultProfile, zThreshold: 2.0, cooldownSeconds: COOLDOWN_SEC }],
      nowFn: () => clock,
    });

    // Varied baseline so stddev > 0
    const spikeBucket = fillBaseline(evaluator, baseTime, BUCKET_MS, VARIED_BASELINE);
    clock = spikeBucket;

    let firstAnomaly = false;
    let secondAnomaly = false;

    for (let i = 0; i < 50; i++) {
      const results = evaluator.evaluateEvent(
        makeInput(isoAt(spikeBucket + i * 100)),
      );
      if (results.length > 0 && !firstAnomaly) {
        firstAnomaly = true;
      } else if (results.length > 0 && firstAnomaly) {
        secondAnomaly = true;
      }
    }

    expect(firstAnomaly).toBe(true);
    // Within cooldown — must NOT have triggered a second time in the same bucket
    expect(secondAnomaly).toBe(false);
  });

  // ─── Test 6: Filter matching ──────────────────────────────────────
  it('should only evaluate events matching the profile filter', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const filteredProfile: StatisticalProfile = {
      ...defaultProfile,
      filters: { event_type: 'error' },
    };
    const evaluator = new StatisticalEvaluator({
      profiles: [filteredProfile],
      nowFn: () => clock,
    });

    // Send non-matching 'page_view' events across many buckets — all ignored.
    // Because no 'error' events are counted, baseline never fills.
    for (let bucket = 0; bucket <= BASELINE_BUCKETS + 2; bucket++) {
      clock = baseTime + bucket * BUCKET_MS;
      for (let i = 0; i < 20; i++) {
        const results = evaluator.evaluateEvent(
          makeInput(isoAt(baseTime + bucket * BUCKET_MS + i * 100), {
            event_type: 'page_view',
          }),
        );
        expect(results).toHaveLength(0);
      }
    }

    // Even a massive 'page_view' burst produces nothing
    const burstBucket = baseTime + (BASELINE_BUCKETS + 3) * BUCKET_MS;
    clock = burstBucket;
    for (let i = 0; i < 100; i++) {
      const results = evaluator.evaluateEvent(
        makeInput(isoAt(burstBucket + i * 100), { event_type: 'page_view' }),
      );
      expect(results).toHaveLength(0);
    }
  });

  // ─── Test 7: Multiple profiles operate independently ──────────────
  it('should track multiple profiles independently', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const profileA: StatisticalProfile = {
      ...defaultProfile,
      id: 'profile-a',
      zThreshold: 2.0,
      filters: { event_type: 'error' },
    };
    const profileB: StatisticalProfile = {
      ...defaultProfile,
      id: 'profile-b',
      zThreshold: 2.0,
      filters: { event_type: 'page_view' },
    };
    const evaluator = new StatisticalEvaluator({
      profiles: [profileA, profileB],
      nowFn: () => clock,
    });

    // Fill baseline for profile-A ('error' events only) with varied counts
    let spikeBucket = baseTime;
    for (let b = 0; b < BASELINE_BUCKETS; b++) {
      const bucketStart = baseTime + b * BUCKET_MS;
      const count = VARIED_BASELINE[b]!;
      for (let i = 0; i < count; i++) {
        evaluator.evaluateEvent(
          makeInput(isoAt(bucketStart + i * 100), { event_type: 'error' }),
        );
      }
      spikeBucket = bucketStart + BUCKET_MS;
    }

    // Spike of 'error' events → must trigger profile-A only
    clock = spikeBucket;
    let profileAFired = false;
    let profileBFired = false;

    for (let i = 0; i < 50; i++) {
      const results = evaluator.evaluateEvent(
        makeInput(isoAt(spikeBucket + i * 100), { event_type: 'error' }),
      );
      for (const a of results) {
        if (a.rule_id === 'profile-a') profileAFired = true;
        if (a.rule_id === 'profile-b') profileBFired = true;
      }
    }

    expect(profileAFired).toBe(true);   // 'error' spike triggers profile-A
    expect(profileBFired).toBe(false);  // profile-B never counted 'error' events
  });

  // ─── Test 8: anomaly message includes expected fields ─────────────
  it('should include z-score, mean, stddev, and filters in anomaly message', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const profile: StatisticalProfile = {
      ...defaultProfile,
      zThreshold: 2.0,
      filters: { event_type: 'error', source: 'api' },
    };
    const evaluator = new StatisticalEvaluator({
      profiles: [profile],
      nowFn: () => clock,
    });

    // Varied baseline (stddev > 0)
    const spikeBucket = fillBaseline(
      evaluator,
      baseTime,
      BUCKET_MS,
      VARIED_BASELINE,
      { event_type: 'error', source: 'api' },
    );
    clock = spikeBucket;

    let anomaly = null;
    for (let i = 0; i < 40; i++) {
      const results = evaluator.evaluateEvent(
        makeInput(isoAt(spikeBucket + i * 100), { event_type: 'error', source: 'api' }),
      );
      if (results.length > 0) {
        anomaly = results[0]!;
        break;
      }
    }

    expect(anomaly).not.toBeNull();
    // formatMessage produces: "Z-score spike detected (event_type=error, source=api): z=X, current=Y, mean=Z..."
    expect(anomaly!.message).toContain('z=');
    expect(anomaly!.message).toContain('current=');
    expect(anomaly!.message).toContain('mean=');
    expect(anomaly!.message).toContain('stddev=');
    expect(anomaly!.message).toContain('bucketSeconds=60');
    expect(anomaly!.message).toContain('event_type=error');
    expect(anomaly!.message).toContain('source=api');
    // details struct
    expect(anomaly!.details.z).toBeGreaterThanOrEqual(2.0);
    expect(anomaly!.details.mean).toBeGreaterThan(0);
    expect(anomaly!.details.stddev).toBeGreaterThan(0);
    expect(anomaly!.details.filters?.event_type).toBe('error');
    expect(anomaly!.details.filters?.source).toBe('api');
  });

  // ─── Test 9: spike TWO buckets after baseline still fires (regression) ─────
  // Before the pruning fix, the window was baselineBuckets×bucket = 5×60s = 300s.
  // A spike at T+360s (2 buckets past last baseline) caused oldestKept = T+60s,
  // evicting bucket-0 (T) → only 4 baseline entries → "not ready" → no anomaly.
  // After fix: window = (baselineBuckets+1)×bucket = 360s, oldestKept = T+0 → all 5 kept.
  it('should still detect a spike when spike bucket is 2 buckets after last baseline', () => {
    const baseTime = 1_700_000_000_000;
    let clock = baseTime;
    const evaluator = new StatisticalEvaluator({
      profiles: [{ ...defaultProfile, zThreshold: 2.0 }],
      nowFn: () => clock,
    });

    // Fill exactly BASELINE_BUCKETS buckets: T, T+60s, T+120s, T+180s, T+240s
    // Varied counts so stddev > 0
    const nextBucket = fillBaseline(evaluator, baseTime, BUCKET_MS, VARIED_BASELINE);

    // Skip one bucket: spike lands at T+360s (2 full buckets after T+240s)
    const spikeBucketStart = nextBucket + BUCKET_MS; // +1 extra gap
    clock = spikeBucketStart;

    let spikeAnomaly = null;
    for (let i = 0; i < 50; i++) {
      const results = evaluator.evaluateEvent(
        makeInput(isoAt(spikeBucketStart + i * 100)),
      );
      if (results.length > 0) {
        spikeAnomaly = results[0]!;
        break;
      }
    }

    // All 5 baseline buckets must survive pruning → anomaly fires
    expect(spikeAnomaly).not.toBeNull();
    expect(spikeAnomaly!.details.z).toBeGreaterThanOrEqual(2.0);
    expect(spikeAnomaly!.details.baselineBuckets).toBe(BASELINE_BUCKETS);
  });
});
