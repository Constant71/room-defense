import { SurfaceMapping } from '../room/homography';
import { pathPoints } from '../room/room';
import type { Vec2 } from '../room/types';
import type { RemoteCommand, RemoteState } from '../remote/protocol';

const FINGER_PX = 22;
const DRAG_START_PX = 8;
const LONG_PRESS_MS = 550;
const DOUBLE_TAP_MS = 350;
const FINE_FACTOR = 0.25;

type Gesture =
  | { kind: 'none' }
  | { kind: 'pending'; id: number; start: Vec2; timer: number }
  | { kind: 'drag'; id: number; start: Vec2 }
  | { kind: 'pinch'; dist: number; mid: Vec2 }
  | { kind: 'done' };

/**
 * Small live copy of the projected image. One finger edits (tap, drag,
 * long-press = right-click), two fingers zoom and pan the view.
 */
export class MapView {
  readonly canvas = document.createElement('canvas');
  fine = false;
  state: RemoteState | null = null;

  private ctx = this.canvas.getContext('2d')!;
  private zoom = 1;
  private pan: Vec2 = { x: 0, y: 0 };
  private w = 300;
  private h = 170;
  private pointers = new Map<number, Vec2>();
  private gesture: Gesture = { kind: 'none' };
  private lastTap: { t: number; at: Vec2 } | null = null;
  private finger: Vec2 | null = null;
  private frame = 0;

  constructor(private readonly send: (cmd: RemoteCommand) => void) {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e, true));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
  }

  setState(s: RemoteState): void {
    const aspectChanged =
      !this.state ||
      this.state.viewport.width / this.state.viewport.height !==
        s.viewport.width / s.viewport.height;
    this.state = s;
    if (aspectChanged) this.layout();
    this.redraw();
  }

  resetView(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.redraw();
  }

  layout(): void {
    const vp = this.state?.viewport ?? { width: 16, height: 9 };
    const width = this.canvas.parentElement?.clientWidth || 300;
    const maxH = window.innerHeight * 0.55;
    this.w = width;
    this.h = Math.min(maxH, (width * vp.height) / vp.width);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.height = `${this.h}px`;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  // ---- coordinates --------------------------------------------------------

  /** Size of the output image drawn at zoom 1, letterboxed into the canvas. */
  private base(): { w: number; h: number; x: number; y: number } {
    const vp = this.state?.viewport ?? { width: 16, height: 9 };
    const s = Math.min(this.w / vp.width, this.h / vp.height);
    const w = vp.width * s;
    const h = vp.height * s;
    return { w, h, x: (this.w - w) / 2, y: (this.h - h) / 2 };
  }

  /** Output space (0-1) -> canvas CSS px. */
  private toCanvas(p: Vec2): Vec2 {
    const b = this.base();
    return {
      x: (b.x + p.x * b.w) * this.zoom + this.pan.x,
      y: (b.y + p.y * b.h) * this.zoom + this.pan.y,
    };
  }

  /** Canvas CSS px -> output space (0-1). */
  private toOutput(c: Vec2): Vec2 {
    const b = this.base();
    return {
      x: ((c.x - this.pan.x) / this.zoom - b.x) / b.w,
      y: ((c.y - this.pan.y) / this.zoom - b.y) / b.h,
    };
  }

  private local(e: PointerEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Finger radius in output-width units, so the PC uses fingertip-sized hit areas. */
  private hit(): number {
    return FINGER_PX / (this.base().w * this.zoom);
  }

  // ---- gestures -----------------------------------------------------------

  private pointer(
    phase: 'down' | 'move' | 'up',
    at: Vec2,
    button: 0 | 2 = 0,
    double = false,
  ): void {
    this.send({ kind: 'pointer', phase, at: this.toOutput(at), button, double, hit: this.hit() });
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      // Second finger: switch to zoom/pan.
      const g = this.gesture;
      if (g.kind === 'pending') clearTimeout(g.timer);
      if (g.kind === 'drag') this.pointer('up', g.start);
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: mid(a, b) };
      this.finger = null;
      return;
    }
    if (this.pointers.size > 2) return;
    const timer = window.setTimeout(() => {
      if (this.gesture.kind !== 'pending') return;
      // Long press = right-click (removes a point with the Select tool, finishes a shape).
      this.pointer('down', p, 2);
      this.pointer('up', p, 2);
      navigator.vibrate?.(30);
      this.gesture = { kind: 'done' };
    }, LONG_PRESS_MS);
    this.gesture = { kind: 'pending', id: e.pointerId, start: p, timer };
    this.finger = p;
    this.redraw();
  }

  private move(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (g.kind === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const m = mid(a, b);
      const z = Math.min(8, Math.max(1, (this.zoom * d) / Math.max(1, g.dist)));
      // Zoom around the midpoint, then follow the midpoint's movement.
      const k = z / this.zoom;
      this.pan = { x: m.x - (g.mid.x - this.pan.x) * k, y: m.y - (g.mid.y - this.pan.y) * k };
      this.zoom = z;
      if (z === 1) this.pan = { x: 0, y: 0 };
      this.gesture = { kind: 'pinch', dist: d, mid: m };
      this.redraw();
      return;
    }
    if (g.kind === 'pending' && g.id === e.pointerId) {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < DRAG_START_PX) return;
      clearTimeout(g.timer);
      this.pointer('down', g.start);
      this.gesture = { kind: 'drag', id: e.pointerId, start: g.start };
    }
    const d = this.gesture;
    if (d.kind === 'drag' && d.id === e.pointerId) {
      const at = this.fine
        ? {
            x: d.start.x + (p.x - d.start.x) * FINE_FACTOR,
            y: d.start.y + (p.y - d.start.y) * FINE_FACTOR,
          }
        : p;
      this.finger = at;
      this.pointer('move', at);
      this.redraw();
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    if (!this.pointers.delete(e.pointerId)) return;
    const g = this.gesture;
    if (g.kind === 'pending' && g.id === e.pointerId) {
      clearTimeout(g.timer);
      if (!cancelled) {
        const now = performance.now();
        const last = this.lastTap;
        const double =
          !!last &&
          now - last.t < DOUBLE_TAP_MS &&
          Math.hypot(last.at.x - g.start.x, last.at.y - g.start.y) < 30;
        this.pointer('down', g.start, 0, double);
        this.pointer('up', g.start);
        this.lastTap = double ? null : { t: now, at: g.start };
      }
    } else if (g.kind === 'drag' && g.id === e.pointerId) {
      this.pointer('up', this.finger ?? g.start);
    }
    if (this.pointers.size === 0) {
      this.gesture = { kind: 'none' };
      this.finger = null;
    } else if (g.kind === 'pinch') {
      this.gesture = { kind: 'done' };
    }
    this.redraw();
  }

  // ---- drawing --------------------------------------------------------------

  redraw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, this.h);
    const s = this.state;
    const b = this.base();
    const tl = this.toCanvas({ x: 0, y: 0 });
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(tl.x, tl.y, b.w * this.zoom, b.h * this.zoom);
    ctx.setLineDash([]);
    if (!s) return;

    const maps = new Map<string, SurfaceMapping | null>();
    for (const surf of s.room.surfaces) {
      const quad = surf.corners.map((c) => this.toCanvas(c)) as [Vec2, Vec2, Vec2, Vec2];
      const m = SurfaceMapping.fromCorners(quad);
      maps.set(surf.id, m);
      const active = surf.id === s.activeSurfaceId;
      if (m) {
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
          const t = i / 10;
          seg(ctx, m.toOutput({ x: t, y: 0 }), m.toOutput({ x: t, y: 1 }));
          seg(ctx, m.toOutput({ x: 0, y: t }), m.toOutput({ x: 1, y: t }));
        }
        ctx.strokeStyle = active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      polygon(ctx, quad);
      ctx.strokeStyle = m ? (active ? '#00ffff' : '#ffffff') : '#ff3030';
      ctx.lineWidth = active ? 3 : 2;
      ctx.stroke();
      ctx.beginPath();
      seg(ctx, quad[0], quad[1]);
      ctx.lineWidth = active ? 5 : 3;
      ctx.stroke();
      const c = m ? m.toOutput({ x: 0.5, y: 0.5 }) : quad[0];
      label(ctx, surf.name, c, active ? '#00ffff' : '#ffffff');
    }
    const uv = (surfaceId: string, p: Vec2): Vec2 | null =>
      maps.get(surfaceId)?.toOutput(p) ?? null;
    const selected = (id: string) => s.selection?.id === id;

    for (const [list, color, fill] of [
      [s.room.buildZones, '#00ffff', 'rgba(0,255,255,0.25)'],
      [s.room.blocked, '#ff00ff', 'rgba(255,0,255,0.3)'],
    ] as const) {
      for (const z of list) {
        const pts = z.points.map((p) => uv(z.surfaceId, p)).filter((p): p is Vec2 => !!p);
        if (pts.length < 3) continue;
        ctx.beginPath();
        polygon(ctx, pts);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = selected(z.id) ? 4 : 2;
        ctx.stroke();
        if (selected(z.id)) handles(ctx, pts);
      }
    }

    for (const p of s.room.paths) {
      const pts = pathPoints(s.room, p)
        .map((q) => uv(q.surfaceId, q.at))
        .filter((q): q is Vec2 => !!q);
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
      ctx.strokeStyle = p.spawnId && p.goalId ? '#ffff00' : '#ff9900';
      ctx.lineWidth = selected(p.id) ? 5 : 3;
      ctx.stroke();
      if (selected(p.id)) {
        handles(
          ctx,
          p.waypoints.map((w) => uv(w.surfaceId, w.at)).filter((q): q is Vec2 => !!q),
        );
      }
    }

    for (const m of s.room.spawns) {
      const p = uv(m.surfaceId, m.at);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = selected(m.id) ? 4 : 2.5;
      ctx.stroke();
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    for (const m of s.room.goals) {
      const p = uv(m.surfaceId, m.at);
      if (!p) continue;
      ctx.strokeStyle = '#ff3030';
      ctx.lineWidth = selected(m.id) ? 4 : 2.5;
      ctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
      ctx.fillStyle = '#ff3030';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }

    if (s.tool === 'corners') {
      for (const surf of s.room.surfaces) {
        surf.corners.forEach((c, i) => {
          const p = this.toCanvas(c);
          const sel = s.selectedCorner?.surfaceId === surf.id && s.selectedCorner.index === i;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = surf.id === s.activeSurfaceId ? '#00ffff' : '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          if (sel) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffff00';
            ctx.fill();
          }
        });
      }
    }

    const d = s.draft;
    if (d) {
      const pts: Vec2[] = [];
      const spawn = d.spawnId ? s.room.spawns.find((x) => x.id === d.spawnId) : undefined;
      if (spawn) {
        const p = uv(spawn.surfaceId, spawn.at);
        if (p) pts.push(p);
      }
      for (const q of d.points) {
        const p = uv(q.surfaceId, q.at);
        if (p) pts.push(p);
      }
      if (pts.length) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y);
        ctx.strokeStyle =
          d.kind === 'path' ? '#ffff00' : d.kind === 'buildZone' ? '#00ffff' : '#ff00ff';
        ctx.lineWidth = 3;
        ctx.stroke();
        handles(ctx, pts);
      }
    }

    if (this.finger) {
      const f = this.finger;
      ctx.beginPath();
      ctx.arc(f.x, f.y, FINGER_PX, 0, Math.PI * 2);
      ctx.strokeStyle = this.fine ? '#ff00ff' : '#ffff00';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (this.zoom > 1) label(ctx, `${this.zoom.toFixed(1)}×`, { x: 28, y: this.h - 14 }, '#ffff00');
  }
}

function mid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function seg(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2): void {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

function polygon(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

function handles(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
  for (const p of pts) {
    ctx.fillStyle = '#000';
    ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, at: Vec2, color: string): void {
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, at.x, at.y);
  ctx.fillStyle = color;
  ctx.fillText(text, at.x, at.y);
}
