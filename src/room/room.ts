import { isConvexQuad } from './homography.ts';
import {
  ROOM_VERSION,
  type Marker,
  type Path,
  type Room,
  type Surface,
  type SurfacePoint,
  type Vec2,
  type Zone,
} from './types.ts';

export function newId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) {
    const id = `${prefix}${n}`;
    if (!used.has(id)) return id;
  }
}

export function allIds(room: Room): string[] {
  return [
    ...room.surfaces,
    ...room.spawns,
    ...room.goals,
    ...room.paths,
    ...room.buildZones,
    ...room.blocked,
  ].map((f) => f.id);
}

export function emptyRoom(name: string, width: number, height: number): Room {
  return {
    version: ROOM_VERSION,
    name,
    output: { width, height },
    surfaces: [],
    spawns: [],
    goals: [],
    paths: [],
    buildZones: [],
    blocked: [],
  };
}

/** A new surface as a centred rectangle, ready to be corner-pinned. */
export function addSurface(room: Room, name?: string): Surface {
  const id = newId('surface', allIds(room));
  const k = room.surfaces.length * 0.03;
  const surface: Surface = {
    id,
    name: name ?? `Surface ${room.surfaces.length + 1}`,
    corners: [
      { x: 0.2 + k, y: 0.2 + k },
      { x: 0.8 + k, y: 0.2 + k },
      { x: 0.8 + k, y: 0.8 + k },
      { x: 0.2 + k, y: 0.8 + k },
    ],
  };
  room.surfaces.push(surface);
  return surface;
}

/**
 * Remove a surface and everything drawn on it. Paths that cross it lose the
 * waypoints (and spawn/goal) on it; a path left with fewer than two points goes.
 */
export function removeSurface(room: Room, surfaceId: string): void {
  room.surfaces = room.surfaces.filter((s) => s.id !== surfaceId);
  const keep = <T extends { surfaceId: string }>(list: T[]): T[] =>
    list.filter((f) => f.surfaceId !== surfaceId);
  room.spawns = keep(room.spawns);
  room.goals = keep(room.goals);
  room.buildZones = keep(room.buildZones);
  room.blocked = keep(room.blocked);
  for (const p of room.paths) {
    p.waypoints = keep(p.waypoints);
    if (p.spawnId && !room.spawns.some((s) => s.id === p.spawnId)) p.spawnId = null;
    if (p.goalId && !room.goals.some((g) => g.id === p.goalId)) p.goalId = null;
  }
  room.paths = room.paths.filter((p) => pathPoints(room, p).length >= 2);
}

/** Remove any feature by id (removing a spawn or goal unlinks paths that used it). */
export function removeFeature(room: Room, id: string): void {
  if (room.surfaces.some((s) => s.id === id)) return removeSurface(room, id);
  room.spawns = room.spawns.filter((f) => f.id !== id);
  room.goals = room.goals.filter((f) => f.id !== id);
  room.paths = room.paths.filter((f) => f.id !== id);
  room.buildZones = room.buildZones.filter((f) => f.id !== id);
  room.blocked = room.blocked.filter((f) => f.id !== id);
  for (const p of room.paths) {
    if (p.spawnId === id) p.spawnId = null;
    if (p.goalId === id) p.goalId = null;
  }
}

/** The full point list of a path: spawn, waypoints, goal (missing ends are skipped). */
export function pathPoints(room: Room, path: Path): SurfacePoint[] {
  const spawn = room.spawns.find((s) => s.id === path.spawnId);
  const goal = room.goals.find((g) => g.id === path.goalId);
  return [...(spawn ? [spawn] : []), ...path.waypoints, ...(goal ? [goal] : [])];
}

export interface Problem {
  level: 'error' | 'warning';
  message: string;
  featureId?: string;
}

/** Checks a room is playable. Errors block play; warnings are worth a look. */
export function checkRoom(room: Room): Problem[] {
  const problems: Problem[] = [];

  if (room.surfaces.length === 0)
    problems.push({ level: 'error', message: 'Add at least one surface.' });
  for (const s of room.surfaces) {
    if (!isConvexQuad(s.corners)) {
      problems.push({
        level: 'error',
        message: `${s.name}: corners are crossed or folded. Drag them into a clean four-sided shape.`,
        featureId: s.id,
      });
    }
  }
  if (room.spawns.length === 0)
    problems.push({ level: 'error', message: 'Place at least one spawn.' });
  if (room.goals.length === 0)
    problems.push({ level: 'error', message: 'Place at least one goal.' });
  if (room.paths.length === 0)
    problems.push({ level: 'error', message: 'Draw at least one enemy path.' });

  room.paths.forEach((p, i) => {
    const label = `Path ${i + 1}`;
    if (!p.spawnId) {
      problems.push({
        level: 'error',
        message: `${label} does not start at a spawn.`,
        featureId: p.id,
      });
    }
    if (!p.goalId) {
      problems.push({
        level: 'error',
        message: `${label} does not end at a goal.`,
        featureId: p.id,
      });
    }
  });
  for (const s of room.spawns) {
    if (!room.paths.some((p) => p.spawnId === s.id)) {
      problems.push({
        level: 'warning',
        message: 'A spawn has no path leaving it.',
        featureId: s.id,
      });
    }
  }
  for (const g of room.goals) {
    if (!room.paths.some((p) => p.goalId === g.id)) {
      problems.push({
        level: 'warning',
        message: 'A goal has no path reaching it.',
        featureId: g.id,
      });
    }
  }
  if (room.buildZones.length === 0) {
    problems.push({
      level: 'warning',
      message: 'No build zones yet: players will have nowhere to place towers.',
    });
  }
  return problems;
}

// ---- Loading untrusted JSON ----------------------------------------------

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function vec(v: unknown): Vec2 {
  const o = v as Record<string, unknown> | null;
  if (!o || !isNum(o.x) || !isNum(o.y)) throw new Error('bad point');
  return { x: o.x, y: o.y };
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 200) throw new Error(`bad ${what}`);
  return v;
}
function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${what} must be a list`);
  return v;
}

/** Parse and validate a room file. Throws an Error with a readable message. */
export function parseRoom(data: unknown): Room {
  const o = data as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') throw new Error('not a room file');
  // Version 1 kept a whole path on one surface; it is upgraded on load.
  const v1 = o.version === 1;
  if (!v1 && o.version !== ROOM_VERSION) {
    throw new Error(`unsupported room version ${String(o.version)}`);
  }
  const output = o.output as Record<string, unknown> | undefined;
  const marker = (m: unknown): Marker => {
    const r = m as Record<string, unknown>;
    return { id: str(r.id, 'id'), surfaceId: str(r.surfaceId, 'surfaceId'), at: vec(r.at) };
  };
  const zone = (z: unknown): Zone => {
    const r = z as Record<string, unknown>;
    const points = list(r.points, 'zone points').map(vec);
    if (points.length < 3) throw new Error('zone needs 3+ points');
    return { id: str(r.id, 'id'), surfaceId: str(r.surfaceId, 'surfaceId'), points };
  };
  const room: Room = {
    version: ROOM_VERSION,
    name: str(o.name, 'name'),
    output: {
      width: isNum(output?.width) ? output.width : 1920,
      height: isNum(output?.height) ? output.height : 1080,
    },
    surfaces: list(o.surfaces, 'surfaces').map((s) => {
      const r = s as Record<string, unknown>;
      const corners = list(r.corners, 'corners').map(vec);
      if (corners.length !== 4) throw new Error('surface needs 4 corners');
      return {
        id: str(r.id, 'id'),
        name: str(r.name, 'surface name'),
        corners: corners as Surface['corners'],
      };
    }),
    spawns: list(o.spawns, 'spawns').map(marker),
    goals: list(o.goals, 'goals').map(marker),
    paths: list(o.paths, 'paths').map((p) => {
      const r = p as Record<string, unknown>;
      const pathSurface = v1 ? str(r.surfaceId, 'surfaceId') : '';
      return {
        id: str(r.id, 'id'),
        spawnId: r.spawnId == null ? null : str(r.spawnId, 'spawnId'),
        goalId: r.goalId == null ? null : str(r.goalId, 'goalId'),
        waypoints: list(r.waypoints, 'waypoints').map((w): SurfacePoint => {
          if (v1) return { surfaceId: pathSurface, at: vec(w) };
          const q = w as Record<string, unknown> | null;
          return { surfaceId: str(q?.surfaceId, 'surfaceId'), at: vec(q?.at) };
        }),
      };
    }),
    buildZones: list(o.buildZones, 'buildZones').map(zone),
    blocked: list(o.blocked, 'blocked').map(zone),
  };

  const ids = allIds(room);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate ids');
  const surfaces = new Set(room.surfaces.map((s) => s.id));
  for (const f of [
    ...room.spawns,
    ...room.goals,
    ...room.paths.flatMap((p) => p.waypoints.map((w) => ({ ...w, id: p.id }))),
    ...room.buildZones,
    ...room.blocked,
  ]) {
    if (!surfaces.has(f.surfaceId)) throw new Error(`${f.id} is on a missing surface`);
  }
  const spawnIds = new Set(room.spawns.map((s) => s.id));
  const goalIds = new Set(room.goals.map((g) => g.id));
  for (const p of room.paths) {
    if (p.spawnId && !spawnIds.has(p.spawnId)) p.spawnId = null;
    if (p.goalId && !goalIds.has(p.goalId)) p.goalId = null;
  }
  return room;
}

/** File names allowed in rooms/: letters, digits, dash, underscore. */
export const ROOM_FILE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function fileNameFor(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'room';
}
