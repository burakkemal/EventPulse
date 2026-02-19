import type { RuleRow } from '../infrastructure/db/index.js';

/**
 * Thread-safe (single-threaded atomic swap) wrapper for the in-memory
 * rule snapshot used by the consumer loop.
 *
 * The consumer calls `get()` on every event evaluation.
 * The hot-reload subscriber calls `set()` when rules change.
 *
 * Because Node.js is single-threaded and `get()`/`set()` are synchronous,
 * there is no torn-read risk. The consumer always sees a complete snapshot —
 * either the old one or the new one, never a partial mix.
 */
export class RuleStore {
  private rules: readonly RuleRow[];

  constructor(initial: readonly RuleRow[] = []) {
    this.rules = initial;
  }

  /** Returns the current snapshot. O(1), no copy. */
  get(): readonly RuleRow[] {
    return this.rules;
  }

  /** Atomically replaces the snapshot. */
  set(next: readonly RuleRow[]): void {
    this.rules = next;
  }
}
