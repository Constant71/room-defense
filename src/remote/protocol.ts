/**
 * Messages between the phone, the dev server and the PC browser (the "host").
 * The host owns the Editor; phones only send commands and draw the state they get.
 * All positions are in output space (0-1 across the projected image).
 */
import type { Tool } from '../editor/editor.ts';
import type { Problem } from '../room/room.ts';
import type { Room, Vec2 } from '../room/types.ts';

export const REMOTE_WS_PATH = '/remote-ws';
export const REMOTE_INFO_PATH = '/api/remote/info';

export interface RemoteState {
  room: Room;
  file: string | null;
  dirty: boolean;
  tool: Tool;
  activeSurfaceId: string | null;
  selection: { kind: string; id: string } | null;
  selectedCorner: { surfaceId: string; index: number } | null;
  draft: { kind: string; surfaceId: string; points: Vec2[]; spawnId: string | null } | null;
  message: string;
  canUndo: boolean;
  canRedo: boolean;
  problems: Problem[];
  /** Host canvas size in CSS pixels (gives the aspect ratio and pixel scale). */
  viewport: { width: number; height: number };
  rooms: { file: string; name: string }[];
}

export type RemoteCommand =
  | {
      kind: 'pointer';
      phase: 'down' | 'move' | 'up';
      at: Vec2;
      button: 0 | 2;
      double: boolean;
      hit: number;
    }
  | { kind: 'tool'; tool: Tool }
  | { kind: 'nudge'; dx: number; dy: number }
  | { kind: 'surface'; id: string }
  | { kind: 'open'; file: string }
  | { kind: 'rename'; name: string }
  | { kind: 'renameSurface'; id: string; name: string }
  | {
      kind:
        | 'undo'
        | 'redo'
        | 'finish'
        | 'cancel'
        | 'backspace'
        | 'delete'
        | 'deselect'
        | 'addSurface'
        | 'save'
        | 'newRoom'
        | 'refreshRooms';
    };

/** Server -> host */
export type ToHost = { type: 'cmd'; cmd: unknown } | { type: 'phones'; count: number };
/** Host -> server */
export type FromHost = { type: 'state'; state: RemoteState };
/** Server -> phone */
export type ToPhone =
  | { type: 'paired'; token: string }
  | { type: 'state'; state: RemoteState }
  | { type: 'no-host' }
  | { type: 'error'; message: string };
/** Phone -> server */
export type FromPhone = { type: 'cmd'; cmd: RemoteCommand };

export interface RemoteInfo {
  enabled: boolean;
  code?: string;
  urls?: string[];
}

const TOOLS = new Set(['select', 'corners', 'spawn', 'goal', 'path', 'buildZone', 'blocked']);
const SIMPLE = new Set([
  'undo',
  'redo',
  'finish',
  'cancel',
  'backspace',
  'delete',
  'deselect',
  'addSurface',
  'save',
  'newRoom',
  'refreshRooms',
]);

const num = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

/** Validate a command from a phone. Returns null for anything malformed. */
export function parseCommand(raw: unknown): RemoteCommand | null {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== 'object' || typeof c.kind !== 'string') return null;
  switch (c.kind) {
    case 'pointer': {
      const at = c.at as Record<string, unknown> | null;
      if (c.phase !== 'down' && c.phase !== 'move' && c.phase !== 'up') return null;
      if (!at || !num(at.x, -1, 2) || !num(at.y, -1, 2)) return null;
      if (c.button !== 0 && c.button !== 2) return null;
      if (typeof c.double !== 'boolean' || !num(c.hit, 0, 10)) return null;
      return {
        kind: 'pointer',
        phase: c.phase,
        at: { x: at.x, y: at.y },
        button: c.button,
        double: c.double,
        hit: c.hit,
      };
    }
    case 'tool':
      return typeof c.tool === 'string' && TOOLS.has(c.tool)
        ? { kind: 'tool', tool: c.tool as Tool }
        : null;
    case 'nudge':
      return num(c.dx, -50, 50) && num(c.dy, -50, 50)
        ? { kind: 'nudge', dx: c.dx, dy: c.dy }
        : null;
    case 'surface':
      return text(c.id, 100) ? { kind: 'surface', id: c.id } : null;
    case 'open':
      return text(c.file, 64) ? { kind: 'open', file: c.file } : null;
    case 'rename':
      return text(c.name, 60) ? { kind: 'rename', name: c.name } : null;
    case 'renameSurface':
      return text(c.id, 100) && text(c.name, 40)
        ? { kind: 'renameSurface', id: c.id, name: c.name }
        : null;
    default:
      return SIMPLE.has(c.kind) ? ({ kind: c.kind } as RemoteCommand) : null;
  }
}
