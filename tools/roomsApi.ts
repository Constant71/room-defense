import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { parseRoom, ROOM_FILE_RE } from '../src/room/room.ts';

const MAX_BODY = 2 * 1024 * 1024;

/**
 * Lets the browser read and write rooms/*.json through the local dev server
 * (`npm run dev` / `npm run preview`):
 *   GET  /api/rooms          -> [{ file, name, updated }]
 *   GET  /api/rooms/<file>   -> room JSON
 *   PUT  /api/rooms/<file>   -> validate and save
 * Only listens on localhost (see vite.config.ts).
 */
export function roomsApi(roomsDir: string): Plugin {
  const dir = resolve(roomsDir);

  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((ok, fail) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          fail(new Error('room file too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
      req.on('error', fail);
    });

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/rooms')) return next();
    const file = url.pathname.slice('/api/rooms'.length).replace(/^\//, '');
    try {
      await mkdir(dir, { recursive: true });
      if (file === '' && req.method === 'GET') {
        const names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
        const rooms = await Promise.all(
          names.map(async (n) => {
            const path = join(dir, n);
            let name = n.slice(0, -5);
            try {
              name = (JSON.parse(await readFile(path, 'utf8')) as { name?: string }).name ?? name;
            } catch {
              // unreadable files still show up so the user can see them
            }
            return { file: n.slice(0, -5), name, updated: (await stat(path)).mtimeMs };
          }),
        );
        return send(
          res,
          200,
          rooms.sort((a, b) => b.updated - a.updated),
        );
      }
      if (!ROOM_FILE_RE.test(file)) return send(res, 400, { error: 'bad room file name' });
      const path = join(dir, `${file}.json`);
      if (req.method === 'GET') {
        return send(res, 200, parseRoom(JSON.parse(await readFile(path, 'utf8'))));
      }
      if (req.method === 'PUT') {
        const room = parseRoom(JSON.parse(await readBody(req)));
        const tmp = `${path}.tmp`;
        await writeFile(tmp, `${JSON.stringify(room, null, 2)}\n`, 'utf8');
        await rename(tmp, path);
        return send(res, 200, { ok: true, file });
      }
      return send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return send(res, 404, { error: 'room not found' });
      return send(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  };

  return {
    name: 'room-defense-rooms-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handler(req, res, next));
    },
  };
}
