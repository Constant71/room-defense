import { Container, Graphics, Text } from 'pixi.js';
import type { Vec2 } from '../room/types';
import { ENEMIES, RULES, towerStats, TOWERS, upgradeCost, type TowerKind } from './defs';
import type { Player } from './players';
import type { Game } from './sim';

const WHITE = 0xffffff;
const GREEN = 0x00ff00;
const RED = 0xff3030;
const YELLOW = 0xffff00;
const CYAN = 0x00ffff;

/** Draws a running game. Bright shapes on black only (projector friendly). */
export class GameView extends Container {
  private readonly g = new Graphics();
  private readonly labels: Text[] = [];
  private w = 1;
  private h = 1;
  private aspect = 16 / 9;
  /** Grows lines and labels with the UI text size. */
  scale1 = 1;

  constructor() {
    super();
    this.addChild(this.g);
  }

  private px(p: Vec2): Vec2 {
    return { x: (p.x / this.aspect) * this.w, y: p.y * this.h };
  }

  /** World length -> screen pixels (world units are fractions of the image height). */
  private len(d: number): number {
    return d * this.h;
  }

  draw(
    game: Game,
    players: Player[],
    width: number,
    height: number,
    canPlace: (p: Player) => boolean,
  ): void {
    this.w = width;
    this.h = height;
    this.aspect = game.world.aspect;
    const k = this.scale1;
    const g = this.g.clear();
    const world = game.world;
    let label = 0;

    // Build zones: faint so the room stays visible, but enough to aim at.
    for (const z of world.buildZones) {
      if (z.length < 3) continue;
      g.poly(
        z.flatMap((p) => {
          const q = this.px(p);
          return [q.x, q.y];
        }),
        true,
      )
        .fill({ color: CYAN, alpha: 0.08 })
        .stroke({ width: 2 * k, color: CYAN, alpha: 0.5 });
    }
    for (const z of world.blocked) {
      if (z.length < 3) continue;
      g.poly(
        z.flatMap((p) => {
          const q = this.px(p);
          return [q.x, q.y];
        }),
        true,
      ).stroke({
        width: 2 * k,
        color: 0xff00ff,
        alpha: 0.35,
      });
    }
    // Paths
    for (const p of world.paths) {
      const pts = p.points.map((q) => this.px(q));
      g.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
      g.stroke({ width: this.len(RULES.pathClearance) * 1.2, color: YELLOW, alpha: 0.12 });
      g.moveTo(pts[0].x, pts[0].y);
      for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
      g.stroke({ width: 2 * k, color: YELLOW, alpha: 0.6 });
    }
    for (const s of world.spawns) {
      const q = this.px(s);
      g.circle(q.x, q.y, 14 * k).stroke({ width: 3 * k, color: GREEN });
    }
    for (const s of world.goals) {
      const q = this.px(s);
      g.rect(q.x - 14 * k, q.y - 14 * k, 28 * k, 28 * k).stroke({ width: 3 * k, color: RED });
    }

    // Towers
    for (const t of game.towers) {
      this.tower(g, t.kind, this.px(t.pos), 1, t.level);
    }

    // Effects
    for (const e of game.effects) {
      const a = this.px(e.from);
      if (e.kind === 'beam') {
        const b = this.px(e.to);
        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ width: 3 * k, color: e.color });
      } else {
        const left = Math.max(0, (e.until - game.time) / 0.25);
        g.circle(a.x, a.y, this.len(e.radius ?? TOWERS.frost.range) * (1 - left * 0.5)).stroke({
          width: 3 * k,
          color: e.color,
          alpha: left,
        });
      }
    }

    // Enemies
    for (const e of game.enemies) {
      const def = ENEMIES[e.kind];
      const q = this.px(e.pos);
      const r = this.len(def.radius);
      const slowed = e.slowUntil > game.time;
      if (e.kind === 'dart') {
        g.poly([q.x, q.y - r * 1.3, q.x + r * 1.1, q.y + r, q.x - r * 1.1, q.y + r], true).fill(
          def.color,
        );
      } else if (e.kind === 'brute') {
        g.rect(q.x - r, q.y - r, r * 2, r * 2).fill(def.color);
      } else {
        g.circle(q.x, q.y, r).fill(def.color);
      }
      if (slowed) g.circle(q.x, q.y, r * 1.5).stroke({ width: 2 * k, color: TOWERS.frost.color });
      // Health bar
      const bw = Math.max(r * 2.4, 18 * k);
      const frac = Math.max(0, e.hp / e.maxHp);
      g.rect(q.x - bw / 2, q.y - r - 9 * k, bw, 4 * k).fill({ color: WHITE, alpha: 0.35 });
      g.rect(q.x - bw / 2, q.y - r - 9 * k, bw * frac, 4 * k).fill(
        frac > 0.5 ? GREEN : frac > 0.25 ? YELLOW : RED,
      );
    }

    // Player cursors: ghost tower + range, green if it can be built there.
    for (const p of players) {
      if (!p.active) continue;
      const q = this.px(p.cursor);
      const def = TOWERS[p.tower];
      const ok = canPlace(p);
      const hover = game.towerAt(p.cursor);
      if (hover) {
        // Show the tower's current reach (what upgrading or selling affects).
        const hq = this.px(hover.pos);
        g.circle(hq.x, hq.y, this.len(towerStats(hover.kind, hover.level).range)).stroke({
          width: 2 * k,
          color: WHITE,
          alpha: 0.6,
        });
      } else {
        g.circle(q.x, q.y, this.len(def.range)).stroke({
          width: 2 * k,
          color: ok ? GREEN : RED,
          alpha: 0.7,
        });
        this.tower(g, p.tower, q, 0.5);
      }
      const s = 16 * k;
      g.moveTo(q.x - s, q.y)
        .lineTo(q.x - s / 3, q.y)
        .moveTo(q.x + s / 3, q.y)
        .lineTo(q.x + s, q.y);
      g.moveTo(q.x, q.y - s)
        .lineTo(q.x, q.y - s / 3)
        .moveTo(q.x, q.y + s / 3)
        .lineTo(q.x, q.y + s);
      g.stroke({ width: 3 * k, color: p.color });
      const note = p.noteUntil > performance.now() ? `  ${p.note}` : '';
      let text = `${p.label} · ${def.name} ${def.cost}`;
      if (hover) {
        const up = upgradeCost(hover.kind, hover.level);
        const upText = up === null ? 'max level' : `upgrade ${up}`;
        text = `${p.label} · ${TOWERS[hover.kind].name} L${hover.level} · ${upText} · sell ${game.refundAt(hover.pos)}`;
      }
      this.putLabel(label++, `${text}${note}`, { x: q.x, y: q.y + 28 * k }, p.color);
    }
    for (let i = label; i < this.labels.length; i++) this.labels[i].visible = false;
  }

  private tower(g: Graphics, kind: TowerKind, q: Vec2, alpha: number, level = 1): void {
    // Upgraded towers are a little bigger and show one pip per level.
    const r = this.len(RULES.towerRadius) * (1 + (level - 1) * 0.12);
    const def = TOWERS[kind];
    const k = this.scale1;
    if (kind === 'lance') {
      g.poly([q.x, q.y - r, q.x + r, q.y, q.x, q.y + r, q.x - r, q.y], true)
        .fill({ color: def.color, alpha: alpha * 0.35 })
        .stroke({ width: 3 * k, color: def.color, alpha });
    } else if (kind === 'frost') {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        pts.push(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r);
      }
      g.poly(pts, true)
        .fill({ color: def.color, alpha: alpha * 0.35 })
        .stroke({ width: 3 * k, color: def.color, alpha });
    } else {
      g.circle(q.x, q.y, r)
        .fill({ color: def.color, alpha: alpha * 0.35 })
        .stroke({ width: 3 * k, color: def.color, alpha });
    }
    g.circle(q.x, q.y, r * 0.3).fill({ color: def.color, alpha });
    if (level > 1) {
      const pip = Math.max(3 * k, r * 0.25);
      for (let i = 0; i < level; i++) {
        const x = q.x + (i - (level - 1) / 2) * pip * 3;
        g.circle(x, q.y + r + pip * 2, pip).fill({ color: 0xffffff, alpha });
      }
    }
  }

  private putLabel(i: number, text: string, at: Vec2, color: number): void {
    let t = this.labels[i];
    if (!t) {
      t = new Text({
        text,
        style: {
          fontFamily: 'Segoe UI, sans-serif',
          fontSize: 18,
          fontWeight: '700',
          fill: WHITE,
          stroke: { color: 0x000000, width: 4 },
        },
      });
      t.anchor.set(0.5, 0);
      this.labels[i] = t;
      this.addChild(t);
    }
    if (t.text !== text) t.text = text;
    t.style.fill = color;
    const size = 18 * this.scale1;
    if (t.style.fontSize !== size) {
      t.style.fontSize = size;
      t.style.stroke = { color: 0x000000, width: 4 * this.scale1 };
    }
    t.position.set(at.x, at.y);
    t.visible = true;
  }
}
