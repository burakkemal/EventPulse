// src/application/statistical-evaluator.ts
export type StatisticalProfileId = string;

export type StatisticalProfile = Readonly<{
  id: StatisticalProfileId;

  // Count metric only (per FR-09 basic statistical anomaly detection)
  bucketSeconds: number; // e.g. 60
  baselineBuckets: number; // e.g. 20 (must be >= 2 for stddev)

  // Z-score threshold (e.g. 3.0)
  zThreshold: number;

  // Optional cool-down to prevent spam
  cooldownSeconds?: number;

  // Optional filters
  filters?: Readonly<{
    event_type?: string;
    source?: string;
  }>;
}>;

export type ZScoreDetails = Readonly<{
  profileId: StatisticalProfileId;
  bucketStart: string; // ISO
  bucketSeconds: number;

  currentCount: number;
  baselineBuckets: number;
  mean: number;
  stddev: number;
  z: number;

  filters?: StatisticalProfile["filters"];
}>;

export type StatisticalAnomaly = Readonly<{
  // We reuse the existing anomalies persistence path.
  rule_id: string; // stable string id for this detector/profile
  severity: string; // "warning" | "critical" | etc. (kept as string to avoid coupling)
  message: string;
  detected_at: Date;
  details: ZScoreDetails;
}>;

type ProfileState = {
  // Bucket start (epoch ms) -> count
  counts: Map<number, number>;
  // Cooldown tracking
  lastTriggeredAtMs?: number;
};

/** Minimal logger interface accepted by StatisticalEvaluator. */
export type StatisticalEvaluatorLog = {
  debug: (obj: Record<string, unknown>, msg: string) => void;
};

export type StatisticalEvaluatorOptions = Readonly<{
  profiles: readonly StatisticalProfile[];
  nowFn?: () => number; // epoch ms
  // Severity for anomalies emitted by this evaluator
  severity?: string; // default "warning"
  // Rule id prefix — prepended as "<prefix>-<profile.id>".
  // Leave empty (default) to use profile.id directly as the rule_id.
  ruleIdPrefix?: string; // default ""
  // Optional structured logger for internal debug traces.
  log?: StatisticalEvaluatorLog;
}>;

export class StatisticalEvaluator {
  private readonly profiles: readonly StatisticalProfile[];
  private readonly nowFn: () => number;
  private readonly severity: string;
  private readonly ruleIdPrefix: string;
  private readonly log: StatisticalEvaluatorLog | undefined;

  private readonly stateByProfileId = new Map<StatisticalProfileId, ProfileState>();

  constructor(opts: StatisticalEvaluatorOptions) {
    if (!Array.isArray(opts.profiles)) {
      throw new Error('StatisticalEvaluator requires profiles: StatisticalProfile[]');
    }
    this.profiles = opts.profiles;
    this.nowFn = opts.nowFn ?? (() => Date.now());
    this.severity = opts.severity ?? "warning";
    this.ruleIdPrefix = opts.ruleIdPrefix ?? "";
    this.log = opts.log;

    for (const p of this.profiles) {
      this.assertProfile(p);
      this.stateByProfileId.set(p.id, { counts: new Map<number, number>() });
    }
  }

  /**
   * Evaluate a single event and (optionally) emit statistical anomalies.
   * This is intended to run post-ACK in the worker (best-effort).
   */
  evaluateEvent(input: {
    event_type: string;
    source: string;
    timestamp: string | Date;
  }): StatisticalAnomaly[] {
    const eventTimeMs = this.toEpochMs(input.timestamp);
    if (eventTimeMs === null) return [];

    const anomalies: StatisticalAnomaly[] = [];

    for (const profile of this.profiles) {
      if (!this.matchesFilters(profile, input)) {
        this.log?.debug(
          { profileId: profile.id, event_type: input.event_type, source: input.source },
          'StatEval: skipped — filter mismatch',
        );
        continue;
      }

      const bucketMs = profile.bucketSeconds * 1000;

      // IMPORTANT: bucket reference is derived from the EVENT timestamp,
      // not from wall-clock now(). This keeps bucket keys deterministic
      // regardless of when the worker processes the event.
      const eventBucketStart = Math.floor(eventTimeMs / bucketMs) * bucketMs;

      const state = this.stateByProfileId.get(profile.id);
      if (!state) continue;

      // Increment current-bucket count BEFORE any evaluation.
      const prev = state.counts.get(eventBucketStart) ?? 0;
      const currentCount = prev + 1;
      state.counts.set(eventBucketStart, currentCount);

      // ── Pruning ──────────────────────────────────────────────────────
      // Keep (baselineBuckets + 1) × bucketDuration of history so that a
      // single-bucket gap between the baseline phase and the spike bucket
      // does NOT evict the oldest baseline bucket.
      //
      // Example (baselineBuckets=5, bucketSeconds=10):
      //   baseline fills T, T+10s…T+40s; alignment sleep lands spike at T+60s.
      //   With the old window (baselineBuckets×bucket = 50s), oldestKept = T+10s
      //   and bucket T is pruned → only 4 baseline buckets remain → never fires.
      //   With (baselineBuckets+1)×bucket = 60s, oldestKept = T+0s → all 5 kept.
      //
      // We also use slice(-baselineBuckets) below so that any gap larger than
      // one bucket still produces the correct baseline from the N most-recent
      // completed buckets rather than failing the readiness check.
      const oldestKept = eventBucketStart - (profile.baselineBuckets + 1) * bucketMs;
      for (const bucketStart of state.counts.keys()) {
        if (bucketStart < oldestKept) state.counts.delete(bucketStart);
      }

      // ── Baseline collection ──────────────────────────────────────────
      // Collect all completed buckets (not the current one), sorted
      // oldest-first, then take the most-recent baselineBuckets entries.
      // Using slice(-N) means gaps in the timeline never inflate the count
      // artificially — we always use exactly the N closest completed buckets.
      const bucketStartsSorted = Array.from(state.counts.keys()).sort((a, b) => a - b);
      const completedBucketCounts: number[] = [];
      for (const bs of bucketStartsSorted) {
        if (bs !== eventBucketStart) {
          completedBucketCounts.push(state.counts.get(bs)!);
        }
      }
      // Most-recent N completed buckets
      const baselineCounts = completedBucketCounts.slice(-profile.baselineBuckets);

      // Need enough baseline buckets for meaningful stddev.
      if (baselineCounts.length < profile.baselineBuckets) {
        this.log?.debug(
          {
            profileId: profile.id,
            bucketStart: new Date(eventBucketStart).toISOString(),
            currentCount,
            completedBucketsAvailable: completedBucketCounts.length,
            baselineBucketsRequired: profile.baselineBuckets,
          },
          'StatEval: skipped — baseline not ready',
        );
        continue;
      }
      // Redundant safety (baselineBuckets >= 2 is asserted in constructor)
      if (baselineCounts.length < 2) continue;

      const mean = this.mean(baselineCounts);
      const stddev = this.stddev(baselineCounts, mean);

      if (stddev <= 0) {
        this.log?.debug(
          {
            profileId: profile.id,
            bucketStart: new Date(eventBucketStart).toISOString(),
            currentCount,
            baselineCounts,
            mean: this.round(mean, 4),
          },
          'StatEval: skipped — stddev is 0 (uniform baseline)',
        );
        continue;
      }

      const z = (currentCount - mean) / stddev;

      this.log?.debug(
        {
          profileId: profile.id,
          bucketStart: new Date(eventBucketStart).toISOString(),
          currentCount,
          baselineCounts,
          mean: this.round(mean, 4),
          stddev: this.round(stddev, 4),
          z: this.round(z, 4),
          zThreshold: profile.zThreshold,
          willFire: z >= profile.zThreshold,
        },
        'StatEval: z-score computed',
      );

      if (z < profile.zThreshold) continue;

      // Cooldown (wall-clock time is OK here; this is a notification suppression)
      const now = this.nowFn();
      const cooldownMs = (profile.cooldownSeconds ?? 0) * 1000;
      if (cooldownMs > 0 && state.lastTriggeredAtMs !== undefined) {
        const elapsed = now - state.lastTriggeredAtMs;
        if (elapsed < cooldownMs) {
          this.log?.debug(
            {
              profileId: profile.id,
              cooldownRemainingMs: cooldownMs - elapsed,
            },
            'StatEval: skipped — within cooldown window',
          );
          continue;
        }
      }
      state.lastTriggeredAtMs = now;

      const details: ZScoreDetails = {
        profileId: profile.id,
        bucketStart: new Date(eventBucketStart).toISOString(),
        bucketSeconds: profile.bucketSeconds,

        currentCount,
        baselineBuckets: profile.baselineBuckets,
        mean: this.round(mean, 4),
        stddev: this.round(stddev, 4),
        z: this.round(z, 4),

        filters: profile.filters,
      };

      const message = this.formatMessage(details);

      // rule_id: use "<prefix>-<id>" when a prefix is set, otherwise just profile.id.
      const rule_id = this.ruleIdPrefix ? `${this.ruleIdPrefix}-${profile.id}` : profile.id;

      anomalies.push({
        rule_id,
        severity: this.severity,
        message,
        detected_at: new Date(now),
        details,
      });
    }

    return anomalies;
  }

  // ----- helpers -----

  private assertProfile(p: StatisticalProfile): void {
    if (!p.id || typeof p.id !== "string") throw new Error("StatisticalProfile.id is required");
    if (!Number.isFinite(p.bucketSeconds) || p.bucketSeconds <= 0) {
      throw new Error(`Invalid bucketSeconds for profile ${p.id}`);
    }
    if (!Number.isInteger(p.baselineBuckets) || p.baselineBuckets < 2) {
      throw new Error(`baselineBuckets must be an integer >= 2 for profile ${p.id}`);
    }
    if (!Number.isFinite(p.zThreshold) || p.zThreshold <= 0) {
      throw new Error(`Invalid zThreshold for profile ${p.id}`);
    }
    if (p.cooldownSeconds !== undefined) {
      if (!Number.isFinite(p.cooldownSeconds) || p.cooldownSeconds < 0) {
        throw new Error(`Invalid cooldownSeconds for profile ${p.id}`);
      }
    }
  }

  private matchesFilters(profile: StatisticalProfile, ev: { event_type: string; source: string }): boolean {
    const f = profile.filters;
    if (!f) return true;
    if (f.event_type !== undefined && f.event_type !== ev.event_type) return false;
    if (f.source !== undefined && f.source !== ev.source) return false;
    return true;
  }

  private toEpochMs(ts: string | Date): number | null {
    if (ts instanceof Date) {
      const n = ts.getTime();
      return Number.isFinite(n) ? n : null;
    }
    const n = Date.parse(ts);
    return Number.isFinite(n) ? n : null;
  }

  private mean(values: number[]): number {
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  }

  // Population stddev (sufficient for anomaly detection baseline)
  private stddev(values: number[], mean: number): number {
    let acc = 0;
    for (const v of values) {
      const d = v - mean;
      acc += d * d;
    }
    const variance = acc / values.length;
    return Math.sqrt(variance);
  }

  private round(n: number, dp: number): number {
    const m = Math.pow(10, dp);
    return Math.round(n * m) / m;
  }

  private formatMessage(d: ZScoreDetails): string {
    const f = d.filters ?? {};
    const parts: string[] = [];
    if (f.event_type) parts.push(`event_type=${f.event_type}`);
    if (f.source) parts.push(`source=${f.source}`);

    const filterStr = parts.length ? ` (${parts.join(", ")})` : "";
    return `Z-score spike detected${filterStr}: z=${d.z}, current=${d.currentCount}, mean=${d.mean}, stddev=${d.stddev}, bucketSeconds=${d.bucketSeconds}, bucketStart=${d.bucketStart}`;
  }
}
