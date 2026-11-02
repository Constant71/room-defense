import { SurfaceMapping } from '../room/homography';
import { clamp01, dist, distToSegment, pointInPolygon } from '../room/geometry';
import {
  addSurface,
  allIds,
  checkRoom,
  emptyRoom,
  newId,
  pathPoints,
  removeFeature,
  type Problem,
} from '../room/room';
import type { FeatureKind, Marker, Path, Room, Surface, Vec2, Zone } from '../room/types';

export type Tool = 'select' | 'corners' | 'spawn' | 'goal' | 'path' | 'buildZone' | 'blocked';

export const TOOLS: { tool: Tool; key: string; label: string; hint: string }[] = [
  {
    tool: 'select',
    key: '1',
    label: 'Select',
    hint: 'Click to select. Drag points to move them; drag a zone to move it. Double-click an edge to add a point, right-click a point to remove it.',
  },
  {
    tool: 'corners',
    key: '2',
    label: 'Corners',
    hint: 'Drag each surface corner onto the matching corner in the room. Click a corner, then use the arrow keys to nudge it (Shift = 10 px). Panel in the way? P moves it to the other side, H hides it.',
  },
  { tool: 'spawn', key: '3', label: 'Spawn', hint: 'Click to place an enemy spawn point.' },
  { tool: 'goal', key: '4', label: 'Goal', hint: 'Click to place the goal enemies attack.' },
  {
    tool: 'path',
    key: '5',
    label: 'Path',
    hint: 'Start on a spawn, click waypoints, finish on a goal. Enter or double-click finishes, Backspace removes the last point, Esc cancels.',
  },
  {
    tool: 'buildZone',
    key: '6',
    label: 'Build zone',
    hint: 'Click the corners of an area where towers may be built. Enter or double-click closes it.',
  },
  {
    tool: 'blocked',
    key: '7',
    label: 'Blocked',
    hint: 'Click the corners of an area to keep clear (furniture, a TV, doors). Enter or double-click closes it.',
  },
];

/** Hit distances in output pixels at UI scale 1 (multiplied by Editor.handleScale). */
const HANDLE = 12;
const MARKER = 18;
const LINE = 8;
const UNDO_LIMIT = 200;

export interface Selection {
  kind: FeatureKind;
  id: string;
}

interface Draft {
  kind: 'path' | 'buildZone' | 'blocked';
  surfaceId: string;
  points: Vec2[];
  spawnId: string | null;
}

type Drag =
  | { type: 'corner'; surfaceId: string; index: number }
  | { type: 'vertex'; kind: 'path' | 'buildZone' | 'blocked'; id: string; index: number }
  | { type: 'marker'; kind: 'spawn' | 'goal'; id: string }
  | { type: 'zone'; kind: 'buildZone' | 'blocked'; id: string; lastUv: Vec2 };

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Room editor state and behaviour. Works in output pixels for input and
 * keeps the room in normalised / surface space. No DOM or PixiJS in here.
 */
export class Editor {
  room: Room;
  file: string | null = null;
  dirty = false;
  tool: Tool = 'corners';
  activeSurfaceId: string | null = null;
  selection: Selection | null = null;
  selectedCorner: { surfaceId: string; index: number } | null = null;
  draft: Draft | null = null;
  /** Last pointer position in output pixels (null when outside the canvas). */
  pointer: Vec2 | null = null;
  message = '';
  /** Grows handles and click targets along with the UI text size. */
  handleScale = 1;

  private drag: Drag | null = null;
  private dragSnapshot: string | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners = new Set<() => void>();
  private mappings = new Map<string, { key: string; mapping: SurfaceMapping | null }>();

  constructor(
    public viewport: Viewport,
    room?: Room,
  ) {
    this.room = room ?? emptyRoom('My room', viewport.width, viewport.height);
    this.activeSurfaceId = this.room.surfaces[0]?.id ?? null;
  }

  // ---- change notification ------------------------------------------------

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private snapshot(): string {
    return JSON.stringify(this.room);
  }

  /** Record the current room for undo, then mark dirty. Call before mutating. */
  private record(before = this.snapshot()): void {
    this.undoStack.push(before);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
  }

  private restore(json: string): void {
    this.room = JSON.parse(json) as Room;
    this.mappings.clear();
    if (!this.room.surfaces.some((s) => s.id === this.activeSurfaceId)) {
      this.activeSurfaceId = this.room.surfaces[0]?.id ?? null;
    }
    if (this.selection && !allIds(this.room).includes(this.selection.id)) this.selection = null;
    this.selectedCorner = null;
    this.draft = null;
    this.dirty = true;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    this.emit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.emit();
  }

  // ---- room level ---------------------------------------------------------

  setRoom(room: Room, file: string | null): void {
    this.room = room;
    this.file = file;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.mappings.clear();
    this.activeSurfaceId = room.surfaces[0]?.id ?? null;
    this.selection = null;
    this.selectedCorner = null;
    this.draft = null;
    this.message = '';
    this.emit();
  }

  markSaved(file: string): void {
    this.file = file;
    this.dirty = false;
    this.emit();
  }

  rename(name: string): void {
    if (!name.trim() || name === this.room.name) return;
    this.record();
    this.room.name = name.trim();
    this.emit();
  }

  problems(): Problem[] {
    return checkRoom(this.room);
  }

  // ---- surfaces -------------------------------------------------------------

  addSurface(): void {
    this.record();
    const s = addSurface(this.room);
    this.activeSurfaceId = s.id;
    this.selection = { kind: 'surface', id: s.id };
    this.tool = 'corners';
    this.emit();
  }

  renameSurface(id: string, name: string): void {
    const s = this.room.surfaces.find((x) => x.id === id);
    if (!s || !name.trim() || s.name === name) return;
    this.record();
    s.name = name.trim();
    this.emit();
  }

  setActiveSurface(id: string): void {
    this.activeSurfaceId = id;
    this.selection = { kind: 'surface', id };
    this.emit();
  }

  /** Perspective mapping for a surface, cached until its corners change. */
  mapping(surface: Surface): SurfaceMapping | null {
    const key = JSON.stringify(surface.corners);
    const hit = this.mappings.get(surface.id);
    if (hit && hit.key === key) return hit.mapping;
    const px = surface.corners.map((c) => this.toPx(c)) as Surface['corners'];
    const mapping = SurfaceMapping.fromCorners(px);
    this.mappings.set(surface.id, {
      key: `${key}|${this.viewport.width}x${this.viewport.height}`,
      mapping,
    });
    return mapping;
  }

  setViewport(vp: Viewport): void {
    if (vp.width === this.viewport.width && vp.height === this.viewport.height) return;
    this.viewport = vp;
    this.mappings.clear();
  }

  // ---- coordinate helpers -------------------------------------------------

  toPx(p: Vec2): Vec2 {
    return { x: p.x * this.viewport.width, y: p.y * this.viewport.height };
  }

  fromPx(p: Vec2): Vec2 {
    return { x: p.x / this.viewport.width, y: p.y / this.viewport.height };
  }

  surface(id: string | null): Surface | undefined {
    return this.room.surfaces.find((s) => s.id === id);
  }

  /** Surface (u,v) -> output pixels. */
  uvToPx(surfaceId: string, uv: Vec2): Vec2 | null {
    const s = this.surface(surfaceId);
    const m = s && this.mapping(s);
    return m ? m.toOutput(uv) : null;
  }

  /** Output pixels -> surface (u,v), unclamped. */
  pxToUv(surfaceId: string, px: Vec2): Vec2 | null {
    const s = this.surface(surfaceId);
    const m = s && this.mapping(s);
    return m ? m.toSurface(px) : null;
  }

  surfaceQuadPx(s: Surface): Vec2[] {
    return s.corners.map((c) => this.toPx(c));
  }

  /** Topmost surface under a pixel, else null. */
  surfaceAt(px: Vec2): Surface | null {
    for (let i = this.room.surfaces.length - 1; i >= 0; i--) {
      const s = this.room.surfaces[i];
      if (pointInPolygon(px, this.surfaceQuadPx(s))) return s;
    }
    return null;
  }

  zonePx(zone: Zone): Vec2[] {
    return zone.points.map((p) => this.uvToPx(zone.surfaceId, p)).filter((p): p is Vec2 => !!p);
  }

  pathPx(path: Path): Vec2[] {
    return pathPoints(this.room, path)
      .map((p) => this.uvToPx(path.surfaceId, p))
      .filter((p): p is Vec2 => !!p);
  }

  // ---- tools ----------------------------------------------------------------

  setTool(tool: Tool): void {
    if (this.draft) this.cancelDraft();
    this.tool = tool;
    this.message = '';
    this.emit();
  }

  /** The surface a new feature at px goes on: the one under the cursor, else the active one. */
  private targetSurface(px: Vec2): Surface | null {
    const under = this.surfaceAt(px);
    if (under) return under;
    const active = this.surface(this.activeSurfaceId);
    return active && this.mapping(active) ? active : null;
  }

  private markerNear(kind: 'spawn' | 'goal', px: Vec2, surfaceId?: string): Marker | null {
    const list = kind === 'spawn' ? this.room.spawns : this.room.goals;
    let best: Marker | null = null;
    let bestD = MARKER * this.handleScale;
    for (const m of list) {
      if (surfaceId && m.surfaceId !== surfaceId) continue;
      const p = this.uvToPx(m.surfaceId, m.at);
      const d = p ? dist(p, px) : Infinity;
      if (d <= bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  }

  pointerDown(px: Vec2, button: number, double: boolean): void {
    this.pointer = px;
    this.message = '';
    switch (this.tool) {
      case 'corners':
        this.cornerDown(px);
        break;
      case 'select':
        this.selectDown(px, button, double);
        break;
      case 'spawn':
      case 'goal':
        if (button === 0) this.placeMarker(this.tool, px);
        break;
      default:
        this.draftDown(this.tool, px, button, double);
    }
    this.emit();
  }

  pointerMove(px: Vec2 | null): void {
    this.pointer = px;
    if (!px || !this.drag) return;
    const d = this.drag;
    if (d.type === 'corner') {
      const s = this.surface(d.surfaceId);
      if (s) s.corners[d.index] = this.fromPx(px);
    } else if (d.type === 'marker') {
      const m = (d.kind === 'spawn' ? this.room.spawns : this.room.goals).find(
        (x) => x.id === d.id,
      );
      const uv = m && this.pxToUv(m.surfaceId, px);
      if (m && uv) m.at = clamp01(uv);
    } else if (d.type === 'vertex') {
      if (d.kind === 'path') {
        const p = this.room.paths.find((x) => x.id === d.id);
        const uv = p && this.pxToUv(p.surfaceId, px);
        if (p && uv) p.waypoints[d.index] = clamp01(uv);
      } else {
        const z = this.zoneList(d.kind).find((x) => x.id === d.id);
        const uv = z && this.pxToUv(z.surfaceId, px);
        if (z && uv) z.points[d.index] = clamp01(uv);
      }
    } else if (d.type === 'zone') {
      const z = this.zoneList(d.kind).find((x) => x.id === d.id);
      const uv = z && this.pxToUv(z.surfaceId, px);
      if (z && uv) {
        let dx = uv.x - d.lastUv.x;
        let dy = uv.y - d.lastUv.y;
        // Keep the whole zone on its surface.
        for (const p of z.points) {
          dx = Math.min(Math.max(dx, -p.x), 1 - p.x);
          dy = Math.min(Math.max(dy, -p.y), 1 - p.y);
        }
        z.points = z.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        d.lastUv = { x: d.lastUv.x + dx, y: d.lastUv.y + dy };
      }
    }
    this.emit();
  }

  pointerUp(): void {
    if (this.drag && this.dragSnapshot !== null && this.dragSnapshot !== this.snapshot()) {
      this.record(this.dragSnapshot);
    }
    this.drag = null;
    this.dragSnapshot = null;
    this.emit();
  }

  private startDrag(drag: Drag): void {
    this.drag = drag;
    this.dragSnapshot = this.snapshot();
  }

  private cornerDown(px: Vec2): void {
    // Active surface first so overlapping corners pick the one being worked on.
    const ordered = [...this.room.surfaces].sort(
      (a, b) => Number(b.id === this.activeSurfaceId) - Number(a.id === this.activeSurfaceId),
    );
    for (const s of ordered) {
      const quad = this.surfaceQuadPx(s);
      const index = quad.findIndex((c) => dist(c, px) <= HANDLE * this.handleScale * 1.5);
      if (index >= 0) {
        this.activeSurfaceId = s.id;
        this.selection = { kind: 'surface', id: s.id };
        this.selectedCorner = { surfaceId: s.id, index };
        this.startDrag({ type: 'corner', surfaceId: s.id, index });
        return;
      }
    }
    const s = this.surfaceAt(px);
    if (s) {
      this.activeSurfaceId = s.id;
      this.selection = { kind: 'surface', id: s.id };
    }
    this.selectedCorner = null;
  }

  private zoneList(kind: 'buildZone' | 'blocked'): Zone[] {
    return kind === 'buildZone' ? this.room.buildZones : this.room.blocked;
  }

  private selectDown(px: Vec2, button: number, double: boolean): void {
    const sel = this.selection;
    // 1. Handles of the selected path or zone
    if (sel && (sel.kind === 'path' || sel.kind === 'buildZone' || sel.kind === 'blocked')) {
      if (this.handleOnSelected(sel, px, button, double)) return;
    }
    // 2. Spawns and goals
    for (const kind of ['spawn', 'goal'] as const) {
      const m = this.markerNear(kind, px);
      if (m) {
        this.selection = { kind, id: m.id };
        this.activeSurfaceId = m.surfaceId;
        if (button === 0) this.startDrag({ type: 'marker', kind, id: m.id });
        return;
      }
    }
    // 3. Paths
    for (const p of this.room.paths) {
      const pts = this.pathPx(p);
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(px, pts[i - 1], pts[i]) <= LINE * this.handleScale) {
          this.selection = { kind: 'path', id: p.id };
          this.activeSurfaceId = p.surfaceId;
          return;
        }
      }
    }
    // 4. Zones (blocked drawn on top, so test it first)
    for (const kind of ['blocked', 'buildZone'] as const) {
      const list = this.zoneList(kind);
      for (let i = list.length - 1; i >= 0; i--) {
        const z = list[i];
        if (pointInPolygon(px, this.zonePx(z))) {
          this.selection = { kind, id: z.id };
          this.activeSurfaceId = z.surfaceId;
          const uv = this.pxToUv(z.surfaceId, px);
          if (uv && button === 0) this.startDrag({ type: 'zone', kind, id: z.id, lastUv: uv });
          return;
        }
      }
    }
    // 5. Surfaces
    const s = this.surfaceAt(px);
    this.selection = s ? { kind: 'surface', id: s.id } : null;
    if (s) this.activeSurfaceId = s.id;
  }

  /** Vertex drag / insert / remove on the selected path or zone. Returns true if handled. */
  private handleOnSelected(sel: Selection, px: Vec2, button: number, double: boolean): boolean {
    const isPath = sel.kind === 'path';
    const path = isPath ? this.room.paths.find((p) => p.id === sel.id) : undefined;
    const zone = !isPath
      ? this.zoneList(sel.kind as 'buildZone' | 'blocked').find((z) => z.id === sel.id)
      : undefined;
    const surfaceId = path?.surfaceId ?? zone?.surfaceId;
    const pts = path?.waypoints ?? zone?.points;
    if (!surfaceId || !pts) return false;
    const pxPts = pts.map((p) => this.uvToPx(surfaceId, p));

    const index = pxPts.findIndex((p) => p && dist(p, px) <= HANDLE * this.handleScale);
    if (index >= 0) {
      if (button === 2) {
        if (zone && zone.points.length <= 3) {
          this.message = 'A zone needs at least 3 points. Delete the whole zone instead.';
          return true;
        }
        this.record();
        pts.splice(index, 1);
      } else {
        this.startDrag({
          type: 'vertex',
          kind: sel.kind as 'path' | 'buildZone' | 'blocked',
          id: sel.id,
          index,
        });
      }
      return true;
    }

    if (double && button === 0) {
      // Insert a point on the nearest edge.
      const ring = path ? this.pathPx(path) : (pxPts as Vec2[]);
      const closed = !path;
      let best = -1;
      let bestD = LINE * this.handleScale;
      const n = closed ? ring.length : ring.length - 1;
      for (let i = 0; i < n; i++) {
        const d = distToSegment(px, ring[i], ring[(i + 1) % ring.length]);
        if (d <= bestD) {
          best = i;
          bestD = d;
        }
      }
      const uv = this.pxToUv(surfaceId, px);
      if (best >= 0 && uv) {
        this.record();
        // For paths, ring index 0 may be the spawn, which is not a waypoint.
        const offset =
          path && path.spawnId && this.room.spawns.some((s) => s.id === path.spawnId) ? 1 : 0;
        const at = Math.max(0, Math.min(pts.length, best + 1 - offset));
        pts.splice(at, 0, clamp01(uv));
        return true;
      }
    }
    return false;
  }

  private placeMarker(kind: 'spawn' | 'goal', px: Vec2): void {
    const s = this.targetSurface(px);
    const uv = s && this.pxToUv(s.id, px);
    if (!s || !uv) {
      this.message = 'Add a surface first (Corners tool), then place points on it.';
      return;
    }
    this.record();
    const marker: Marker = { id: newId(kind, allIds(this.room)), surfaceId: s.id, at: clamp01(uv) };
    (kind === 'spawn' ? this.room.spawns : this.room.goals).push(marker);
    this.activeSurfaceId = s.id;
    this.selection = { kind, id: marker.id };
  }

  private draftDown(kind: Draft['kind'], px: Vec2, button: number, double: boolean): void {
    if (button === 2) {
      if (this.draft) this.finishDraft();
      return;
    }
    if (button !== 0) return;
    if (!this.draft) {
      const s = this.targetSurface(px);
      if (!s) {
        this.message = 'Add a surface first (Corners tool), then draw on it.';
        return;
      }
      this.activeSurfaceId = s.id;
      this.draft = { kind, surfaceId: s.id, points: [], spawnId: null };
      if (kind === 'path') {
        const spawn = this.markerNear('spawn', px, s.id);
        if (spawn) {
          this.draft.spawnId = spawn.id;
          return;
        }
      }
    }
    const draft = this.draft;
    if (double) {
      // The first click of the double-click already added this point.
      this.finishDraft();
      return;
    }
    if (draft.kind === 'path') {
      const goal = this.markerNear('goal', px, draft.surfaceId);
      if (goal) {
        this.finishDraft(goal.id);
        return;
      }
    }
    const uv = this.pxToUv(draft.surfaceId, px);
    if (uv) draft.points.push(clamp01(uv));
  }

  removeLastDraftPoint(): void {
    if (!this.draft) return;
    if (this.draft.points.length) this.draft.points.pop();
    else this.draft = null;
    this.emit();
  }

  cancelDraft(): void {
    this.draft = null;
    this.emit();
  }

  /** Close the current path or zone. */
  finishDraft(goalId: string | null = null): void {
    const d = this.draft;
    if (!d) return;
    if (d.kind === 'path') {
      // A goal clicked last links the path; otherwise check the last point.
      if (!goalId && d.points.length) {
        const last = this.uvToPx(d.surfaceId, d.points[d.points.length - 1]);
        const goal = last && this.markerNear('goal', last, d.surfaceId);
        if (goal) {
          goalId = goal.id;
          d.points.pop();
        }
      }
      const total = d.points.length + (d.spawnId ? 1 : 0) + (goalId ? 1 : 0);
      if (total < 2) {
        this.message = 'A path needs at least two points.';
        this.emit();
        return;
      }
      this.record();
      const path: Path = {
        id: newId('path', allIds(this.room)),
        surfaceId: d.surfaceId,
        spawnId: d.spawnId,
        goalId,
        waypoints: d.points,
      };
      this.room.paths.push(path);
      this.selection = { kind: 'path', id: path.id };
      if (!d.spawnId || !goalId) {
        this.message =
          'Path saved, but it should start on a spawn and end on a goal. Drag its ends onto them or redraw it.';
      }
    } else {
      if (d.points.length < 3) {
        this.message = 'A zone needs at least three points.';
        this.emit();
        return;
      }
      this.record();
      const zone: Zone = {
        id: newId(d.kind === 'buildZone' ? 'build' : 'blocked', allIds(this.room)),
        surfaceId: d.surfaceId,
        points: d.points,
      };
      this.zoneList(d.kind).push(zone);
      this.selection = { kind: d.kind, id: zone.id };
    }
    this.draft = null;
    this.emit();
  }

  deleteSelection(): void {
    if (!this.selection) return;
    this.record();
    removeFeature(this.room, this.selection.id);
    if (this.selection.kind === 'surface') {
      this.activeSurfaceId = this.room.surfaces[0]?.id ?? null;
      this.selectedCorner = null;
    }
    this.selection = null;
    this.emit();
  }

  /** Arrow-key nudge in output pixels: the selected corner, else the selected spawn/goal. */
  nudge(dxPx: number, dyPx: number): void {
    const c = this.selectedCorner;
    if (this.tool === 'corners' && c) {
      const s = this.surface(c.surfaceId);
      if (!s) return;
      this.record();
      const p = this.toPx(s.corners[c.index]);
      s.corners[c.index] = this.fromPx({ x: p.x + dxPx, y: p.y + dyPx });
      this.emit();
      return;
    }
    const sel = this.selection;
    if (sel && (sel.kind === 'spawn' || sel.kind === 'goal')) {
      const m = (sel.kind === 'spawn' ? this.room.spawns : this.room.goals).find(
        (x) => x.id === sel.id,
      );
      const p = m && this.uvToPx(m.surfaceId, m.at);
      const uv = m && p && this.pxToUv(m.surfaceId, { x: p.x + dxPx, y: p.y + dyPx });
      if (m && uv) {
        this.record();
        m.at = clamp01(uv);
        this.emit();
      }
    }
  }
}
