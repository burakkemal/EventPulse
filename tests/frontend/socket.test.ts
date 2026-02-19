/* ------------------------------------------------------------------ */
/*  Tests for src/frontend/realtime/socket.ts                          */
/*  Verifies the adapter stub contract.                                */
/* ------------------------------------------------------------------ */

import { describe, it, expect, vi } from 'vitest';
import { connect, subscribe, disconnect } from '../../src/frontend/realtime/socket.js';

describe('WebSocket adapter stub', () => {
  it('connect() does not throw', () => {
    expect(() => connect()).not.toThrow();
  });

  it('disconnect() does not throw', () => {
    expect(() => disconnect()).not.toThrow();
  });

  it('subscribe() returns an unsubscribe function', () => {
    const handler = vi.fn();
    const unsub = subscribe(handler);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('handler is never invoked (stub does nothing)', () => {
    const handler = vi.fn();
    subscribe(handler);
    // No WebSocket connection exists, so handler should never be called
    expect(handler).not.toHaveBeenCalled();
  });
});
