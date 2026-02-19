import type { Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { AnomalyNotificationPayload } from '../../infrastructure/redis/anomaly-notifier.js';

/**
 * Minimal WebSocket server using raw Node.js HTTP upgrade.
 *
 * Implements RFC 6455 for:
 * - accepting browser clients on /ws
 * - server heartbeat PING → client PONG (alive tracking)
 * - incoming PING → respond PONG immediately
 * - incoming PONG → mark alive
 * - incoming CLOSE → echo close + graceful teardown
 * - broadcasting text frames to all connected clients
 *
 * Browser-to-server frames are always masked per RFC 6455 §5.3.
 * Multiple frames per TCP chunk are consumed in a loop.
 */

const WS_GUID = '258EAFA5-E914-47DA-95CA-5AB9FC11CF97';

let nextClientId = 1;

interface WsClient {
  id: number;
  socket: Socket;
  alive: boolean;
  closed: boolean;
  buffer: Buffer;
}

export class WebSocketServer {
  private clients: Set<WsClient> = new Set();
  private readonly log: Logger;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(log: Logger) {
    this.log = log;
  }

  /* ------------------------------------------------------------------ */
  /*  Attach to HTTP server                                             */
  /* ------------------------------------------------------------------ */

  attach(server: HttpServer): void {
    server.on('upgrade', (req, socket, head: Buffer) => {
      // Cast: Node.js upgrade socket is always net.Socket
      const sock = socket as Socket;

      if (req.url !== '/ws') {
        sock.destroy();
        return;
      }

      const key = req.headers['sec-websocket-key'];
      if (!key || Array.isArray(key)) {
        sock.destroy();
        return;
      }

      const accept = createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');

      sock.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n` +
          '\r\n',
      );

      // ── Critical: reconfigure socket for long-lived WS usage ──
      //
      // After HTTP upgrade the Node.js HTTP parser signals "request body
      // complete" by pushing null into the socket's readable stream.  With
      // the default allowHalfOpen=false this triggers an automatic
      // socket.end() → 'close' event within 1 ms, killing the brand-new
      // WebSocket connection before any frames can be exchanged.
      //
      // Setting allowHalfOpen=true prevents that cascade.  Real client
      // disconnections are caught by the 'close' event (actual TCP teardown),
      // the heartbeat timeout, or a WS close frame.
      sock.allowHalfOpen = true;
      // Clear any HTTP-inherited timeout (requestTimeout, keepAliveTimeout).
      sock.setTimeout(0);
      // Disable Nagle — send 101, pings, and frames without delay.
      sock.setNoDelay(true);
      // TCP keep-alive at the OS level.
      sock.setKeepAlive(true, 30_000);

      const client: WsClient = {
        id: nextClientId++,
        socket: sock,
        alive: true,
        closed: false,
        buffer: head.length > 0 ? Buffer.from(head) : Buffer.alloc(0),
      };

      this.clients.add(client);
      this.log.info(
        { clientId: client.id, clientCount: this.clients.size },
        'WebSocket upgrade accepted',
      );

      /* — TCP data — */
      sock.on('data', (chunk: Buffer) => {
        if (client.closed) return;

        client.buffer = Buffer.concat([client.buffer, chunk]);

        // consume as many complete frames as possible
        while (client.buffer.length > 0) {
          let frame: ReturnType<typeof this.tryParseFrame>;
          try {
            frame = this.tryParseFrame(client.buffer);
          } catch (err: unknown) {
            this.log.warn(
              { clientId: client.id, err },
              'WebSocket frame parse error — closing client',
            );
            this.gracefulClose(client, 'frame_parse_error');
            return;
          }

          if (!frame) break; // need more bytes

          client.buffer = client.buffer.subarray(frame.nextOffset);
          client.alive = true; // any valid frame resets heartbeat

          const { opcode } = frame;

          if (opcode === 0x0a) {
            // PONG received
            this.log.debug({ clientId: client.id }, 'Pong received');
            continue;
          }

          if (opcode === 0x09) {
            // PING from client → respond PONG with same payload
            this.safeWrite(client, this.encodeControlFrame(0x0a, frame.payload));
            continue;
          }

          if (opcode === 0x08) {
            // CLOSE frame from client
            this.log.debug({ clientId: client.id }, 'Close frame received from client');
            this.safeWrite(client, this.encodeControlFrame(0x08, frame.payload));
            this.gracefulClose(client, 'close_frame');
            return; // stop processing this buffer
          }

          // TEXT (0x01) / BINARY (0x02) / CONTINUATION (0x00): ignore for demo
        }
      });

      /* — Lifecycle events — */
      sock.on('timeout', () => {
        this.log.debug({ clientId: client.id }, 'Socket timeout event fired');
        this.gracefulClose(client, 'timeout');
      });

      sock.on('end', () => {
        // NOTE: Do NOT call gracefulClose here.
        // After HTTP upgrade the parser fires a spurious 'end' (readable
        // EOF) within ~1 ms.  With allowHalfOpen=true the socket stays
        // open for writing.  Real disconnections are caught by the
        // 'close' event or heartbeat timeout.
        this.log.debug({ clientId: client.id }, 'Socket end event (readable EOF — ignored)');
      });

      sock.on('close', (hadError: boolean) => {
        this.log.debug({ clientId: client.id, hadError }, 'Socket close event');
        this.gracefulClose(client, hadError ? 'close_error' : 'close');
      });

      sock.on('error', (err) => {
        if (!client.closed) {
          this.log.debug({ clientId: client.id, err: String(err) }, 'Socket error event');
        }
        this.gracefulClose(client, 'error');
      });

      // ── Resume the socket so data events flow ──
      // After HTTP upgrade the parser may leave the socket paused.
      sock.resume();
    });

    // Heartbeat: PING every 30 s, drop unresponsive clients
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.alive) {
          this.log.debug(
            { clientId: client.id },
            'Heartbeat timeout — removing client',
          );
          this.gracefulClose(client, 'heartbeat_timeout');
          continue;
        }
        client.alive = false;
        this.log.debug({ clientId: client.id }, 'Ping sent');
        this.safeWrite(client, this.encodeControlFrame(0x09, Buffer.alloc(0)));
      }
    }, 30_000);

    this.log.info('WebSocket server attached on /ws');
  }

  /* ------------------------------------------------------------------ */
  /*  Broadcast                                                         */
  /* ------------------------------------------------------------------ */

  broadcast(payload: AnomalyNotificationPayload): void {
    const message = JSON.stringify({
      type: 'anomaly',
      severity: payload.severity,
      message: payload.message,
      detected_at: payload.detected_at,
      anomaly_id: payload.anomaly_id,
      rule_id: payload.rule_id,
    });

    const frame = this.encodeTextFrame(message);
    let sent = 0;

    for (const client of this.clients) {
      if (this.safeWrite(client, frame)) sent++;
    }

    this.log.info(
      { clientCount: this.clients.size, sent },
      'Broadcasting anomaly to clients',
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Public helpers                                                     */
  /* ------------------------------------------------------------------ */

  get clientCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const client of this.clients) {
      this.gracefulClose(client, 'server_shutdown');
    }
    this.clients.clear();
  }

  /* ------------------------------------------------------------------ */
  /*  Private — lifecycle                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Idempotent teardown — safe to call multiple times.
   * Guards against double-destroy via the `closed` flag.
   * `reason` is logged so operators can see WHY a client dropped.
   */
  private gracefulClose(client: WsClient, reason: string): void {
    if (client.closed) return;
    client.closed = true;
    this.clients.delete(client);

    try {
      if (!client.socket.destroyed) {
        client.socket.destroy();
      }
    } catch {
      // already gone
    }

    this.log.info(
      { clientId: client.id, reason, clientCount: this.clients.size },
      'WebSocket client disconnected',
    );
  }

  /**
   * Write to socket with error guard.  Returns true on success.
   */
  private safeWrite(client: WsClient, data: Buffer): boolean {
    if (client.closed || client.socket.destroyed) return false;
    try {
      client.socket.write(data);
      return true;
    } catch {
      this.gracefulClose(client, 'write_error');
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Private — frame parsing                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Parse ONE WebSocket frame from the front of `buf`.
   * Returns null when more bytes are needed.
   * Throws on truly malformed data (e.g. 64-bit length overflow).
   */
  private tryParseFrame(
    buf: Buffer,
  ): null | { opcode: number; payload: Buffer; nextOffset: number } {
    if (buf.length < 2) return null;

    const b0 = buf[0]!;
    const b1 = buf[1]!;

    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) === 0x80;

    let payloadLen = b1 & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (buf.length < offset + 2) return null;
      payloadLen = buf.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      // 64-bit extended length — not expected in this project.
      throw new Error('64-bit WebSocket payload length not supported');
    }

    const maskLen = masked ? 4 : 0;
    const totalNeeded = offset + maskLen + payloadLen;
    if (buf.length < totalNeeded) return null;

    let maskingKey: Buffer | null = null;
    if (masked) {
      maskingKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    let payload = buf.subarray(offset, offset + payloadLen);

    if (masked && maskingKey) {
      const unmasked = Buffer.allocUnsafe(payload.length);
      for (let i = 0; i < payload.length; i++) {
        unmasked[i] = payload[i]! ^ maskingKey[i % 4]!;
      }
      payload = unmasked;
    }

    return { opcode, payload, nextOffset: offset + payloadLen };
  }

  /* ------------------------------------------------------------------ */
  /*  Private — frame encoding (server → client, unmasked)              */
  /* ------------------------------------------------------------------ */

  private encodeControlFrame(opcode: number, payload: Buffer): Buffer {
    const len = payload.length;
    if (len > 125) {
      // RFC 6455 §5.5: control frames MUST have payload ≤ 125
      return Buffer.from([0x80 | opcode, 0x00]);
    }
    const header = Buffer.alloc(2);
    header[0] = 0x80 | opcode; // FIN + opcode
    header[1] = len;
    return Buffer.concat([header, payload]);
  }

  private encodeTextFrame(data: string): Buffer {
    const payload = Buffer.from(data, 'utf-8');
    const len = payload.length;

    let header: Buffer;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + TEXT
      header[1] = len;
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      // Truncate to 65535 for safety
      const truncated = payload.subarray(0, 65535);
      const h = Buffer.alloc(4);
      h[0] = 0x81;
      h[1] = 126;
      h.writeUInt16BE(truncated.length, 2);
      return Buffer.concat([h, truncated]);
    }

    return Buffer.concat([header, payload]);
  }
}
