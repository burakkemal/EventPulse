import { describe, it, expect } from 'vitest';
import { createInvalidPayloadRule } from '../../src/domain/rules/invalid-payload.js';
import type { RuleContext } from '../../src/domain/rules/types.js';
import { makeEvent } from './helpers.js';

describe('Invalid Payload Rule', () => {
  const rule = createInvalidPayloadRule();
  const emptyContext: RuleContext = { recentEventsBySource: [] };

  it('should pass page_view with required url field', () => {
    const event = makeEvent({ event_type: 'page_view', payload: { url: '/home' } });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(false);
  });

  it('should trigger page_view missing url', () => {
    const event = makeEvent({ event_type: 'page_view', payload: {} });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.message).toContain('url');
      expect(result.anomaly.severity).toBe('medium');
    }
  });

  it('should trigger button_click missing element_id', () => {
    const event = makeEvent({
      event_type: 'button_click',
      payload: { url: '/page' },
    });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.message).toContain('element_id');
    }
  });

  it('should trigger button_click missing both url and element_id', () => {
    const event = makeEvent({ event_type: 'button_click', payload: {} });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.message).toContain('url');
      expect(result.anomaly.message).toContain('element_id');
    }
  });

  it('should pass form_submit with all required fields', () => {
    const event = makeEvent({
      event_type: 'form_submit',
      payload: { url: '/form', form_name: 'signup' },
    });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(false);
  });

  it('should pass unknown event types', () => {
    const event = makeEvent({
      event_type: 'custom_event',
      payload: {},
    });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(false);
  });

  it('should treat null values as missing', () => {
    const event = makeEvent({
      event_type: 'page_view',
      payload: { url: null },
    });
    const result = rule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
  });

  it('should accept custom required fields map', () => {
    const customRule = createInvalidPayloadRule({
      purchase: ['amount', 'currency'],
    });
    const event = makeEvent({
      event_type: 'purchase',
      payload: { amount: 42 }, // missing currency
    });
    const result = customRule.evaluate(event, emptyContext);
    expect(result.triggered).toBe(true);
    if (result.triggered) {
      expect(result.anomaly.message).toContain('currency');
    }
  });
});
