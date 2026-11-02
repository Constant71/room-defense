/**
 * Room file format (rooms/<file>.json). Everything a room needs to line the
 * game up with the real room.
 *
 * Two coordinate spaces:
 * - Output space: the projected image, normalised so (0,0) is the top-left of
 *   the canvas and (1,1) the bottom-right. Independent of resolution.
 * - Surface space: (u,v) in [0,1] across one surface (floor, wall, table...).
 *   Each surface is corner-pinned onto the output with a perspective warp, so
 *   moving a corner later re-aligns everything drawn on that surface.
 */
export const ROOM_VERSION = 1;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Surface {
  id: string;
  name: string;
  /** Output-space corners in order: top-left, top-right, bottom-right, bottom-left. */
  corners: [Vec2, Vec2, Vec2, Vec2];
}

/** A single point on a surface, in surface (u,v) space. */
export interface Marker {
  id: string;
  surfaceId: string;
  at: Vec2;
}

/** Enemy route: spawn -> waypoints -> goal, all on one surface. */
export interface Path {
  id: string;
  surfaceId: string;
  spawnId: string | null;
  goalId: string | null;
  waypoints: Vec2[];
}

/** Closed polygon on a surface, in surface (u,v) space. */
export interface Zone {
  id: string;
  surfaceId: string;
  points: Vec2[];
}

export interface Room {
  version: typeof ROOM_VERSION;
  name: string;
  /** Resolution the room was mapped at, for reference only. */
  output: { width: number; height: number };
  surfaces: Surface[];
  spawns: Marker[];
  goals: Marker[];
  paths: Path[];
  buildZones: Zone[];
  blocked: Zone[];
}

export type FeatureKind = 'surface' | 'spawn' | 'goal' | 'path' | 'buildZone' | 'blocked';
