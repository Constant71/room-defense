import { distToSegment, pointInPolygon } from '../room/geometry';
import type { Vec2 } from '../room/types';
import {
  ENEMIES,
  makeWave,
  RULES,
  TOWERS,
  type EnemyKind,
  type Spawn,
  type TowerKind,
} from './defs';
import { pointAlong, type World } from './world';

export type Phase = 'build' | 'wave' | 'won' | 'lost';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pathIndex: number;
  /** Distance walked along the path, world units. */
  dist: number;
  hp: number;
  maxHp: number;
  slowUntil: number;
  slowFactor: number;
  pos: Vec2;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  pos: Vec2;
  /** Seconds until it may fire again. */
  cooldown: number;
  /** Credits spent on it (for the refund). */
  spent: number;
  owner: number;
}

/** Short-lived visual: a beam from a tower to a target, or a frost pulse. */
export interface Effect {
  kind: 'beam' | 'pulse';
  from: Vec2;
  to: Vec2;
  color: number;
  until: number;
}

export type PlaceResult =
  'ok' | 'outside-build-zone' | 'blocked' | 'on-path' | 'too-close' | 'no-credits' | 'not-now';

/**
 * Room Defense rules. Advanced in fixed steps with `step(dt)`; reads no clock
 * of its own, so tests can run whole games instantly.
 */
export class Game {
  phase: Phase = 'build';
  paused = false;
  credits = RULES.startCredits;
  lives = RULES.startLives;
  /** Last wave started (0 before the first). */
  wave = 0;
  time = 0;
  enemies: Enemy[] = [];
  towers: Tower[] = [];
  effects: Effect[] = [];
  /** Things that just happened, for sounds and messages; cleared by the caller. */
  events: string[] = [];

  private queue: Spawn[] = [];
  private waveTime = 0;
  private spawnCount = 0;
  private nextId = 1;

  constructor(readonly world: World) {}

  get waveCount(): number {
    return RULES.waves;
  }

  // ---- player actions -------------------------------------------------------

  /** Start the next wave (only between waves). */
  startWave(): boolean {
    if (this.phase !== 'build' || this.paused || this.world.paths.length === 0) return false;
    this.wave++;
    this.queue = makeWave(this.wave);
    this.waveTime = 0;
    this.phase = 'wave';
    this.events.push(`wave-start:${this.wave}`);
    return true;
  }

  togglePause(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.paused = !this.paused;
  }

  canPlace(kind: TowerKind, pos: Vec2): PlaceResult {
    if (this.phase === 'won' || this.phase === 'lost' || this.paused) return 'not-now';
    if (!this.world.buildZones.some((z) => pointInPolygon(pos, z))) return 'outside-build-zone';
    if (this.world.blocked.some((z) => pointInPolygon(pos, z))) return 'blocked';
    for (const p of this.world.paths) {
      for (let i = 1; i < p.points.length; i++) {
        if (distToSegment(pos, p.points[i - 1], p.points[i]) < RULES.pathClearance)
          return 'on-path';
      }
    }
    if (
      this.towers.some((t) => Math.hypot(t.pos.x - pos.x, t.pos.y - pos.y) < RULES.towerRadius * 2)
    ) {
      return 'too-close';
    }
    if (this.credits < TOWERS[kind].cost) return 'no-credits';
    return 'ok';
  }

  place(kind: TowerKind, pos: Vec2, owner = 0): PlaceResult {
    const ok = this.canPlace(kind, pos);
    if (ok !== 'ok') return ok;
    const cost = TOWERS[kind].cost;
    this.credits -= cost;
    this.towers.push({ id: this.nextId++, kind, pos: { ...pos }, cooldown: 0, spent: cost, owner });
    this.events.push(`build:${kind}`);
    return 'ok';
  }

  towerAt(pos: Vec2, reach = RULES.towerRadius * 1.5): Tower | null {
    let best: Tower | null = null;
    let bestD = reach;
    for (const t of this.towers) {
      const d = Math.hypot(t.pos.x - pos.x, t.pos.y - pos.y);
      if (d <= bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  /** Sell the tower near `pos` for a partial refund. Returns the refund (0 if none). */
  sell(pos: Vec2): number {
    if (this.phase === 'won' || this.phase === 'lost' || this.paused) return 0;
    const t = this.towerAt(pos);
    if (!t) return 0;
    this.towers = this.towers.filter((x) => x !== t);
    const refund = Math.floor(t.spent * RULES.sellRefund);
    this.credits += refund;
    this.events.push('sell');
    return refund;
  }

  // ---- simulation -----------------------------------------------------------

  step(dt: number): void {
    if (this.paused || this.phase === 'won' || this.phase === 'lost') return;
    this.time += dt;
    this.effects = this.effects.filter((e) => e.until > this.time);
    if (this.phase === 'wave') this.spawnDue(dt);
    this.moveEnemies(dt);
    if (this.lives <= 0) {
      this.lives = 0;
      this.phase = 'lost';
      this.events.push('lost');
      return;
    }
    this.fireTowers(dt);
    if (this.phase === 'wave' && this.queue.length === 0 && this.enemies.length === 0) {
      const bonus = RULES.waveBonus.base + RULES.waveBonus.perWave * this.wave;
      this.credits += bonus;
      this.events.push(`wave-clear:${this.wave}:${bonus}`);
      if (this.wave >= RULES.waves) {
        this.phase = 'won';
        this.events.push('won');
      } else {
        this.phase = 'build';
      }
    }
  }

  private spawnDue(dt: number): void {
    this.waveTime += dt;
    while (this.queue.length && this.queue[0].at <= this.waveTime) {
      const s = this.queue.shift()!;
      const def = ENEMIES[s.kind];
      // Spread enemies over all paths in turn.
      const pathIndex = this.spawnCount++ % this.world.paths.length;
      const hp = def.hp * s.hpScale;
      this.enemies.push({
        id: this.nextId++,
        kind: s.kind,
        pathIndex,
        dist: 0,
        hp,
        maxHp: hp,
        slowUntil: 0,
        slowFactor: 1,
        pos: this.world.paths[pathIndex].points[0],
      });
    }
  }

  private moveEnemies(dt: number): void {
    const arrived: Enemy[] = [];
    for (const e of this.enemies) {
      const path = this.world.paths[e.pathIndex];
      const slow = e.slowUntil > this.time ? e.slowFactor : 1;
      e.dist += ENEMIES[e.kind].speed * slow * dt;
      e.pos = pointAlong(path, e.dist);
      if (e.dist >= path.length) arrived.push(e);
    }
    if (arrived.length) {
      for (const e of arrived) {
        this.lives -= ENEMIES[e.kind].harm;
        this.events.push('leak');
      }
      this.enemies = this.enemies.filter((e) => !arrived.includes(e));
    }
  }

  private fireTowers(dt: number): void {
    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const def = TOWERS[t.kind];
      const inRange = this.enemies.filter(
        (e) => e.hp > 0 && Math.hypot(e.pos.x - t.pos.x, e.pos.y - t.pos.y) <= def.range,
      );
      if (!inRange.length) continue;
      t.cooldown = 1 / def.rate;
      if (def.area) {
        for (const e of inRange) this.hit(e, def.damage, def.slow);
        this.effects.push({
          kind: 'pulse',
          from: t.pos,
          to: t.pos,
          color: def.color,
          until: this.time + 0.25,
        });
      } else {
        // Shoot the enemy closest to its goal.
        const target = inRange.reduce((a, b) => (this.remaining(a) <= this.remaining(b) ? a : b));
        this.hit(target, def.damage, def.slow);
        this.effects.push({
          kind: 'beam',
          from: t.pos,
          to: target.pos,
          color: def.color,
          until: this.time + 0.08,
        });
      }
    }
    const dead = this.enemies.filter((e) => e.hp <= 0);
    if (dead.length) {
      for (const e of dead) {
        this.credits += ENEMIES[e.kind].bounty;
        this.events.push('kill');
      }
      this.enemies = this.enemies.filter((e) => e.hp > 0);
    }
  }

  private remaining(e: Enemy): number {
    return this.world.paths[e.pathIndex].length - e.dist;
  }

  private hit(e: Enemy, damage: number, slow?: { factor: number; seconds: number }): void {
    e.hp -= damage;
    if (slow) {
      e.slowFactor = slow.factor;
      e.slowUntil = this.time + slow.seconds;
    }
  }
}
