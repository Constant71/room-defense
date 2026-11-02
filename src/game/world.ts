import { SurfaceMapping } from '../room/homography';
import { pathPoints } from '../room/room';
import type { Room, Surface, SurfacePoint, Vec2 } from '../room/types';

/** A path as a world-space polyline with cumulative lengths for walking along it. */
export interface WorldPath {
  id: string;
  points: Vec2[];
  /** cumulative[i] = distance from the start to points[i]. */
  cumulative: number[];
  length: number;
}

/**
 * The room in world units: y from 0 (top of the image) to 1 (bottom),
 * x from 0 to `aspect`. Built once when a game starts.
 */
export class World {
  readonly aspect: number;
  readonly paths: WorldPath[] = [];
  readonly buildZones: Vec2[][] = [];
  readonly blocked: Vec2[][] = [];
  readonly spawns: Vec2[] = [];
  readonly goals: Vec2[] = [];

  constructor(room: Room) {
    this.aspect = room.output.width / room.output.height || 16 / 9;
    const maps = new Map<string, SurfaceMapping | null>();
    const mapping = (s: Surface): SurfaceMapping | null => {
      if (!maps.has(s.id)) {
        const corners = s.corners.map((c) => this.fromOutput(c)) as Surface['corners'];
        maps.set(s.id, SurfaceMapping.fromCorners(corners));
      }
      return maps.get(s.id) ?? null;
    };
    const toWorld = (p: SurfacePoint): Vec2 | null => {
      const s = room.surfaces.find((x) => x.id === p.surfaceId);
      const m = s && mapping(s);
      return m ? m.toOutput(p.at) : null;
    };
    const zone = (z: { surfaceId: string; points: Vec2[] }): Vec2[] =>
      z.points.map((at) => toWorld({ surfaceId: z.surfaceId, at })).filter((p): p is Vec2 => !!p);

    for (const z of room.buildZones) this.buildZones.push(zone(z));
    for (const z of room.blocked) this.blocked.push(zone(z));
    for (const s of room.spawns) {
      const p = toWorld(s);
      if (p) this.spawns.push(p);
    }
    for (const g of room.goals) {
      const p = toWorld(g);
      if (p) this.goals.push(p);
    }
    for (const path of room.paths) {
      if (!path.spawnId || !path.goalId) continue;
      const points = pathPoints(room, path)
        .map(toWorld)
        .filter((p): p is Vec2 => !!p);
      if (points.length < 2) continue;
      const cumulative = [0];
      for (let i = 1; i < points.length; i++) {
        cumulative.push(
          cumulative[i - 1] +
            Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y),
        );
      }
      this.paths.push({
        id: path.id,
        points,
        cumulative,
        length: cumulative[cumulative.length - 1],
      });
    }
  }

  /** Output space (0-1 both ways) -> world. */
  fromOutput(p: Vec2): Vec2 {
    return { x: p.x * this.aspect, y: p.y };
  }

  /** World -> output space (0-1 both ways). */
  toOutput(p: Vec2): Vec2 {
    return { x: p.x / this.aspect, y: p.y };
  }
}

/** Position at distance `d` along a path (clamped to its ends). */
export function pointAlong(path: WorldPath, d: number): Vec2 {
  if (d <= 0) return path.points[0];
  if (d >= path.length) return path.points[path.points.length - 1];
  let i = 1;
  while (path.cumulative[i] < d) i++;
  const a = path.points[i - 1];
  const b = path.points[i];
  const seg = path.cumulative[i] - path.cumulative[i - 1];
  const t = seg === 0 ? 0 : (d - path.cumulative[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
