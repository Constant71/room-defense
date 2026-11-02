import { Container, Graphics, Text } from 'pixi.js';
import type { Editor } from './editor';
import type { Vec2 } from '../room/types';

// Bright colours on black only (projector friendly).
const WHITE = 0xffffff;
const CYAN = 0x00ffff;
const YELLOW = 0xffff00;
const GREEN = 0x00ff00;
const RED = 0xff3030;
const MAGENTA = 0xff00ff;
const ORANGE = 0xff9900;

const GRID = 10;

/** Draws the room being edited. Redrawn every frame from the Editor state. */
export class EditorView extends Container {
  private readonly g = new Graphics();
  private readonly labels: Text[] = [];

  constructor(private readonly editor: Editor) {
    super();
    this.addChild(this.g);
  }

  draw(): void {
    const ed = this.editor;
    const g = this.g.clear();
    let label = 0;

    // Surfaces: outline + warped grid so the perspective is visible.
    for (const s of ed.room.surfaces) {
      const active = s.id === ed.activeSurfaceId;
      const quad = ed.surfaceQuadPx(s);
      const mapping = ed.mapping(s);
      if (mapping) {
        for (let i = 1; i < GRID; i++) {
          const t = i / GRID;
          line(g, mapping.toOutput({ x: t, y: 0 }), mapping.toOutput({ x: t, y: 1 }));
          line(g, mapping.toOutput({ x: 0, y: t }), mapping.toOutput({ x: 1, y: t }));
        }
        g.stroke({ width: 1, color: WHITE, alpha: active ? 0.45 : 0.25 });
      }
      poly(g, quad).stroke({
        width: active ? 3 : 2,
        color: mapping ? (active ? CYAN : WHITE) : RED,
      });
      // Mark the top edge so it is clear which way up the surface is.
      line(g, quad[0], quad[1]).stroke({
        width: active ? 5 : 3,
        color: mapping ? (active ? CYAN : WHITE) : RED,
      });
      const centre = mapping ? mapping.toOutput({ x: 0.5, y: 0.5 }) : avg(quad);
      this.putLabel(label++, s.name, centre, active ? CYAN : WHITE);
    }

    // Zones
    for (const [list, color, kind] of [
      [ed.room.buildZones, CYAN, 'buildZone'],
      [ed.room.blocked, MAGENTA, 'blocked'],
    ] as const) {
      for (const z of list) {
        const pts = ed.zonePx(z);
        if (pts.length < 3) continue;
        const selected = ed.selection?.kind === kind && ed.selection.id === z.id;
        poly(g, pts)
          .fill({ color, alpha: selected ? 0.4 : 0.25 })
          .stroke({ width: selected ? 4 : 2, color });
        if (kind === 'blocked') hatch(g, pts, color);
        if (selected) handles(g, pts, WHITE);
      }
    }

    // Paths
    for (const p of ed.room.paths) {
      const pts = ed.pathPx(p);
      if (pts.length < 2) continue;
      const selected = ed.selection?.kind === 'path' && ed.selection.id === p.id;
      polyline(g, pts).stroke({
        width: selected ? 6 : 4,
        color: p.spawnId && p.goalId ? YELLOW : ORANGE,
      });
      for (let i = 1; i < pts.length; i++) arrow(g, pts[i - 1], pts[i], YELLOW);
      if (selected) {
        handles(
          g,
          p.waypoints.map((w) => ed.uvToPx(p.surfaceId, w)).filter((x): x is Vec2 => !!x),
          WHITE,
        );
      }
    }

    // Spawns and goals
    for (const m of ed.room.spawns) {
      const p = ed.uvToPx(m.surfaceId, m.at);
      if (!p) continue;
      const selected = ed.selection?.id === m.id;
      g.circle(p.x, p.y, 14).stroke({ width: selected ? 5 : 3, color: GREEN });
      g.circle(p.x, p.y, 5).fill(GREEN);
      this.putLabel(label++, 'SPAWN', { x: p.x, y: p.y - 28 }, GREEN);
    }
    for (const m of ed.room.goals) {
      const p = ed.uvToPx(m.surfaceId, m.at);
      if (!p) continue;
      const selected = ed.selection?.id === m.id;
      g.rect(p.x - 13, p.y - 13, 26, 26).stroke({ width: selected ? 5 : 3, color: RED });
      g.rect(p.x - 5, p.y - 5, 10, 10).fill(RED);
      this.putLabel(label++, 'GOAL', { x: p.x, y: p.y - 28 }, RED);
    }

    // Corner handles
    if (ed.tool === 'corners') {
      for (const s of ed.room.surfaces) {
        ed.surfaceQuadPx(s).forEach((c, i) => {
          const sel = ed.selectedCorner?.surfaceId === s.id && ed.selectedCorner.index === i;
          const color = s.id === ed.activeSurfaceId ? CYAN : WHITE;
          g.circle(c.x, c.y, 12).stroke({ width: 3, color });
          if (sel) g.circle(c.x, c.y, 6).fill(YELLOW);
          // Crosshair for precise placement on a real-world corner
          line(g, { x: c.x - 22, y: c.y }, { x: c.x + 22, y: c.y });
          line(g, { x: c.x, y: c.y - 22 }, { x: c.x, y: c.y + 22 });
          g.stroke({ width: 1, color: sel ? YELLOW : color });
        });
      }
    }

    // Draft in progress
    const d = ed.draft;
    if (d) {
      const pts: Vec2[] = [];
      const spawn = d.spawnId ? ed.room.spawns.find((s) => s.id === d.spawnId) : undefined;
      if (spawn) {
        const p = ed.uvToPx(spawn.surfaceId, spawn.at);
        if (p) pts.push(p);
      }
      for (const uv of d.points) {
        const p = ed.uvToPx(d.surfaceId, uv);
        if (p) pts.push(p);
      }
      const color = d.kind === 'path' ? YELLOW : d.kind === 'buildZone' ? CYAN : MAGENTA;
      if (pts.length) {
        polyline(g, ed.pointer ? [...pts, ed.pointer] : pts).stroke({ width: 3, color });
        if (d.kind !== 'path' && ed.pointer && pts.length >= 2) {
          line(g, ed.pointer, pts[0]).stroke({ width: 1, color, alpha: 0.6 });
        }
        handles(g, pts, color);
      }
    }

    // Cursor crosshair
    if (ed.pointer) {
      const p = ed.pointer;
      line(g, { x: p.x - 10, y: p.y }, { x: p.x + 10, y: p.y });
      line(g, { x: p.x, y: p.y - 10 }, { x: p.x, y: p.y + 10 });
      g.stroke({ width: 2, color: YELLOW });
    }

    for (let i = label; i < this.labels.length; i++) this.labels[i].visible = false;
  }

  private putLabel(i: number, text: string, at: Vec2, color: number): void {
    let t = this.labels[i];
    if (!t) {
      t = new Text({
        text,
        style: { fontFamily: 'Segoe UI, sans-serif', fontSize: 18, fontWeight: '600', fill: WHITE },
      });
      t.anchor.set(0.5);
      this.labels[i] = t;
      this.addChild(t);
    }
    if (t.text !== text) t.text = text;
    t.style.fill = color;
    t.position.set(at.x, at.y);
    t.visible = true;
  }
}

function line(g: Graphics, a: Vec2, b: Vec2): Graphics {
  return g.moveTo(a.x, a.y).lineTo(b.x, b.y);
}

function polyline(g: Graphics, pts: Vec2[]): Graphics {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  return g;
}

function poly(g: Graphics, pts: Vec2[]): Graphics {
  return g.poly(
    pts.flatMap((p) => [p.x, p.y]),
    true,
  );
}

function avg(pts: Vec2[]): Vec2 {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function handles(g: Graphics, pts: Vec2[], color: number): void {
  for (const p of pts)
    g.rect(p.x - 6, p.y - 6, 12, 12)
      .fill({ color: 0x000000 })
      .stroke({ width: 2, color });
}

function arrow(g: Graphics, a: Vec2, b: Vec2, color: number): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 40) return;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const s = 10;
  g.poly(
    [
      mx + ux * s,
      my + uy * s,
      mx - ux * s - uy * s,
      my - uy * s + ux * s,
      mx - ux * s + uy * s,
      my - uy * s - ux * s,
    ],
    true,
  ).fill(color);
}

/** Diagonal stripes clipped to the polygon (even-odd scanline along x + y = k). */
function hatch(g: Graphics, pts: Vec2[], color: number): void {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const step = 18;
  for (let k = minX + minY; k < maxX + maxY; k += step) {
    // Line x + y = k, intersected with each polygon edge
    const hits: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const fa = a.x + a.y - k;
      const fb = b.x + b.y - k;
      if (fa > 0 !== fb > 0) {
        const t = fa / (fa - fb);
        hits.push(a.x + t * (b.x - a.x));
      }
    }
    hits.sort((p, q) => p - q);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      line(g, { x: hits[i], y: k - hits[i] }, { x: hits[i + 1], y: k - hits[i + 1] });
    }
  }
  g.stroke({ width: 1, color, alpha: 0.7 });
}
