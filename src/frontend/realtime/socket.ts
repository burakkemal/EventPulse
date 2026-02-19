/* ------------------------------------------------------------------ */
/*  WebSocket adapter — placeholder for real-time anomaly/event push   */
/*                                                                     */
/*  ⚠️  WebSocket integration will be implemented later.               */
/*                                                                     */
/*  This module exposes the public contract that UI components bind     */
/*  to.  Internally it does NOTHING — no connection, no frames.        */
/*  When the WebSocket transport is wired in, only this file changes;  */
/*  all consumers remain untouched.                                    */
/* ------------------------------------------------------------------ */

/** Payload shape pushed by the server over WebSocket. */
export interface WsAnomalyMessage {
  type: 'anomaly';
  anomaly_id: string;
  rule_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detected_at: string;
}

export type WsHandler = (msg: WsAnomalyMessage) => void;

const handlers = new Set<WsHandler>();

/**
 * Connect to the WebSocket server.
 *
 * TODO: WebSocket integration will be implemented later.
 * Currently a no-op.
 */
export function connect(): void {
  // WebSocket integration will be implemented later.
  // When implemented, this will:
  //   const ws = new WebSocket(`ws://${location.host}/ws`);
  //   ws.onmessage = (e) => {
  //     const msg = JSON.parse(e.data) as WsAnomalyMessage;
  //     handlers.forEach(h => h(msg));
  //   };
}

/**
 * Register a handler for incoming WebSocket messages.
 * Returns an unsubscribe function.
 *
 * TODO: WebSocket integration will be implemented later.
 * Currently stores the handler but never invokes it.
 */
export function subscribe(handler: WsHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Disconnect from the WebSocket server.
 *
 * TODO: WebSocket integration will be implemented later.
 * Currently a no-op.
 */
export function disconnect(): void {
  // WebSocket integration will be implemented later.
}
