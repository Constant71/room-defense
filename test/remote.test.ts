import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { WebSocket } from 'ws';
import { REMOTE_INFO_PATH, REMOTE_WS_PATH } from '../src/remote/protocol';

type Msg = { type: string; [k: string]: unknown };

/** A ws client that queues messages so tests can await them in order. */
async function client(
  url: string,
): Promise<{ ws: WebSocket; next: () => Promise<Msg>; closed: Promise<number> }> {
  const ws = new WebSocket(url);
  const queue: Msg[] = [];
  const waiters: ((m: Msg) => void)[] = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as Msg;
    const w = waiters.shift();
    if (w) w(m);
    else queue.push(m);
  });
  const closed = new Promise<number>((ok) => ws.on('close', (code) => ok(code)));
  await new Promise<void>((ok, fail) => {
    ws.once('open', () => ok());
    ws.once('error', fail);
  });
  const next = () =>
    new Promise<Msg>((ok, fail) => {
      const m = queue.shift();
      if (m) return ok(m);
      const t = setTimeout(() => fail(new Error('timed out waiting for a message')), 3000);
      waiters.push((x) => {
        clearTimeout(t);
        ok(x);
      });
    });
  return { ws, next, closed };
}

async function start(mode: string): Promise<{ server: ViteDevServer; base: string }> {
  const server = await createServer({
    configFile: 'vite.config.ts',
    mode,
    logLevel: 'silent',
    server: { port: 0, open: false, host: '127.0.0.1' },
  });
  await server.listen();
  const addr = server.httpServer!.address() as { port: number };
  return { server, base: `127.0.0.1:${addr.port}` };
}

describe('phone remote (npm run dev:phone)', () => {
  let server: ViteDevServer;
  let base: string;
  let code: string;

  beforeAll(async () => {
    ({ server, base } = await start('phone'));
    const info = (await (await fetch(`http://${base}${REMOTE_INFO_PATH}`)).json()) as {
      enabled: boolean;
      code: string;
    };
    expect(info.enabled).toBe(true);
    expect(info.code).toMatch(/^\d{6}$/);
    code = info.code;
  });
  afterAll(async () => {
    await server.close();
  });

  it('pairs with the code, relays commands to the PC and state to the phone', async () => {
    const host = await client(`ws://${base}${REMOTE_WS_PATH}?role=host`);
    expect(await host.next()).toEqual({ type: 'phones', count: 0 });

    const phone = await client(`ws://${base}${REMOTE_WS_PATH}`);
    phone.ws.send(JSON.stringify({ type: 'pair', code }));
    const paired = await phone.next();
    expect(paired.type).toBe('paired');
    expect(typeof paired.token).toBe('string');
    expect(await host.next()).toEqual({ type: 'phones', count: 1 });

    phone.ws.send(JSON.stringify({ type: 'cmd', cmd: { kind: 'undo' } }));
    expect(await host.next()).toEqual({ type: 'cmd', cmd: { kind: 'undo' } });

    host.ws.send(JSON.stringify({ type: 'state', state: { hello: 1 } }));
    expect(await phone.next()).toEqual({ type: 'state', state: { hello: 1 } });

    // The saved token reconnects without the code, and gets the latest state at once.
    phone.ws.close();
    await phone.closed;
    expect(await host.next()).toEqual({ type: 'phones', count: 0 });
    const again = await client(`ws://${base}${REMOTE_WS_PATH}`);
    again.ws.send(JSON.stringify({ type: 'pair', token: paired.token }));
    expect((await again.next()).type).toBe('paired');
    expect(await again.next()).toEqual({ type: 'state', state: { hello: 1 } });
    again.ws.close();
    host.ws.close();
  });

  it('ignores commands from a phone that has not paired', async () => {
    const host = await client(`ws://${base}${REMOTE_WS_PATH}?role=host`);
    await host.next(); // phones count
    const phone = await client(`ws://${base}${REMOTE_WS_PATH}`);
    phone.ws.send(JSON.stringify({ type: 'cmd', cmd: { kind: 'delete' } }));
    // Phone-count updates may still arrive; a command must never reach the PC.
    const seen: Msg[] = [];
    try {
      for (;;) seen.push(await host.next());
    } catch {
      // timed out: nothing more arrived
    }
    expect(seen.filter((m) => m.type === 'cmd')).toEqual([]);
    phone.ws.close();
    host.ws.close();
  });

  it('rejects wrong codes and locks out after repeated guesses', async () => {
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const phone = await client(`ws://${base}${REMOTE_WS_PATH}`);
      phone.ws.send(JSON.stringify({ type: 'pair', code: wrong }));
      expect((await phone.next()).message).toMatch(/Wrong pairing code/);
      expect(await phone.closed).toBe(4002);
    }
    // Even the right code is refused for a minute after 5 wrong guesses.
    const phone = await client(`ws://${base}${REMOTE_WS_PATH}`);
    phone.ws.send(JSON.stringify({ type: 'pair', code }));
    expect((await phone.next()).message).toMatch(/Too many/);
    expect(await phone.closed).toBe(4003);
  });
});

describe('plain npm run dev', () => {
  it('has phone editing switched off', async () => {
    const { server, base } = await start('development');
    try {
      const info = (await (await fetch(`http://${base}${REMOTE_INFO_PATH}`)).json()) as {
        enabled: boolean;
      };
      expect(info).toEqual({ enabled: false });
    } finally {
      await server.close();
    }
  });
});
