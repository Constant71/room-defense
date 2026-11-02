import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { networkInterfaces } from 'node:os';
import type { Plugin } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { REMOTE_INFO_PATH, REMOTE_WS_PATH, type RemoteInfo } from '../src/remote/protocol.ts';

/** Max failed pairing attempts per address per minute. */
const MAX_FAILURES = 5;
const MAX_MESSAGE = 512 * 1024;

export function isLoopback(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * IPv4 addresses a phone on the same network can reach. Home-network (private)
 * addresses come first; any other network addresses are only used if there are none.
 */
export function lanAddresses(): string[] {
  const home: string[] = [];
  const other: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) home.push(a.address);
      else other.push(a.address);
    }
  }
  return home.length ? home : other;
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Phone remote for the room editor. Only active with `npm run dev:phone`.
 *
 * - The PC browser (the "host") must connect from this PC (loopback).
 * - A phone pairs with a 6-digit code shown on the projector, then gets a
 *   session token so it can reconnect until the server restarts.
 * - The server only relays: phone commands go to the host, host state goes to phones.
 */
export function phoneRemote(enabled: boolean): Plugin {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const tokens = new Set<string>();
  const failures = new Map<string, { count: number; since: number }>();
  const hosts = new Set<WebSocket>();
  const phones = new Set<WebSocket>();
  let lastState: string | null = null;
  let port = 5173;

  const send = (ws: WebSocket, msg: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const tellHostsPhoneCount = (): void => {
    for (const h of hosts) send(h, { type: 'phones', count: phones.size });
  };

  const tooManyFailures = (addr: string): boolean => {
    const f = failures.get(addr);
    if (!f) return false;
    if (Date.now() - f.since > 60_000) {
      failures.delete(addr);
      return false;
    }
    return f.count >= MAX_FAILURES;
  };
  const fail = (addr: string): void => {
    const f = failures.get(addr);
    if (!f || Date.now() - f.since > 60_000) failures.set(addr, { count: 1, since: Date.now() });
    else f.count++;
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== REMOTE_WS_PATH) return; // not ours (e.g. Vite HMR)
    const addr = req.socket.remoteAddress ?? '';
    const role = url.searchParams.get('role');
    if (role === 'host') {
      if (!isLoopback(addr)) return void socket.destroy();
      wss.handleUpgrade(req, socket, head, (ws) => onHost(ws));
      return;
    }
    // Phones authenticate inside the socket so they get a readable error.
    wss.handleUpgrade(req, socket, head, (ws) => onPhone(ws, addr));
  };

  const onHost = (ws: WebSocket): void => {
    hosts.add(ws);
    send(ws, { type: 'phones', count: phones.size });
    ws.on('message', (data) => {
      const text = data.toString();
      let msg: { type?: string; state?: unknown };
      try {
        msg = JSON.parse(text) as typeof msg;
      } catch {
        return;
      }
      if (msg.type !== 'state') return;
      lastState = text;
      for (const p of phones) if (p.readyState === WebSocket.OPEN) p.send(text);
    });
    ws.on('close', () => {
      hosts.delete(ws);
      if (hosts.size === 0) for (const p of phones) send(p, { type: 'no-host' });
    });
  };

  const onPhone = (ws: WebSocket, addr: string): void => {
    let paired = false;
    const timeout = setTimeout(() => {
      if (!paired) ws.close(4001, 'pairing timeout');
    }, 30_000);

    ws.on('message', (data) => {
      let msg: { type?: string; code?: unknown; token?: unknown; cmd?: unknown };
      try {
        msg = JSON.parse(data.toString()) as typeof msg;
      } catch {
        return;
      }
      if (!paired) {
        if (msg.type !== 'pair') return;
        if (tooManyFailures(addr)) {
          send(ws, {
            type: 'error',
            message: 'Too many wrong codes. Wait a minute and try again.',
          });
          return void ws.close(4003, 'rate limited');
        }
        const byToken = typeof msg.token === 'string' && tokens.has(msg.token);
        const byCode = typeof msg.code === 'string' && sameText(msg.code.trim(), code);
        if (!byToken && !byCode) {
          fail(addr);
          send(ws, {
            type: 'error',
            message: 'Wrong pairing code. Check the code on the projector.',
          });
          return void ws.close(4002, 'bad code');
        }
        paired = true;
        clearTimeout(timeout);
        const token = byToken ? (msg.token as string) : randomBytes(24).toString('base64url');
        tokens.add(token);
        phones.add(ws);
        send(ws, { type: 'paired', token });
        if (hosts.size === 0) send(ws, { type: 'no-host' });
        else if (lastState) ws.send(lastState);
        tellHostsPhoneCount();
        return;
      }
      if (msg.type === 'cmd') for (const h of hosts) send(h, { type: 'cmd', cmd: msg.cmd });
    });
    ws.on('close', () => {
      clearTimeout(timeout);
      if (phones.delete(ws)) tellHostsPhoneCount();
    });
  };

  const attach = (httpServer: Server | null | undefined): void => {
    if (!enabled || !httpServer) return;
    httpServer.on('upgrade', onUpgrade);
    httpServer.on('listening', () => {
      const a = httpServer.address();
      if (a && typeof a === 'object') port = a.port;
    });
  };

  const info = (req: IncomingMessage): RemoteInfo => {
    if (!enabled) return { enabled: false };
    // Only the PC itself may read the pairing code.
    if (!isLoopback(req.socket.remoteAddress)) return { enabled: true };
    return {
      enabled: true,
      code,
      urls: lanAddresses().map((ip) => `http://${ip}:${port}/phone.html`),
    };
  };

  type Middlewares = {
    use: (
      fn: (req: IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void,
    ) => void;
  };
  const infoRoute = (middlewares: Middlewares): void => {
    middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== REMOTE_INFO_PATH) return next();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(info(req)));
    });
  };

  return {
    name: 'room-defense-phone-remote',
    configureServer(server) {
      attach(server.httpServer as Server | null);
      infoRoute(server.middlewares);
      if (enabled) {
        server.httpServer?.once('listening', () => {
          const urls = lanAddresses().map((ip) => `http://${ip}:${port}/phone.html`);
          server.config.logger.info(
            `\n  Phone editing is ON. Pairing code: ${code}\n` +
              (urls.length
                ? urls.map((u) => `  Phone:   ${u}`).join('\n')
                : '  No Wi-Fi/network address found: connect this PC to your home network.') +
              '\n',
          );
        });
      }
    },
    configurePreviewServer(server) {
      attach(server.httpServer as Server | null);
      infoRoute(server.middlewares);
    },
  };
}
