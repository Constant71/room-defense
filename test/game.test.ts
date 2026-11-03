import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  makeWave,
  MAX_LEVEL,
  RULES,
  towerStats,
  TOWERS,
  UPGRADES,
} from '../src/game/defs';
import { Game } from '../src/game/sim';
import { World } from '../src/game/world';
import { addSurface, emptyRoom } from '../src/room/room';
import type { Room } from '../src/room/types';

/**
 * A 1000x1000 output (aspect 1, so world = output space) with one full-screen
 * surface, a straight path from left to right along y = 0.5, a build zone
 * above the path and a blocked area inside it.
 */
function room(): Room {
  const r = emptyRoom('Test', 1000, 1000);
  const s = addSurface(r, 'Floor');
  s.corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  r.spawns.push({ id: 'spawn1', surfaceId: s.id, at: { x: 0, y: 0.5 } });
  r.goals.push({ id: 'goal1', surfaceId: s.id, at: { x: 1, y: 0.5 } });
  r.paths.push({ id: 'path1', spawnId: 'spawn1', goalId: 'goal1', waypoints: [] });
  r.buildZones.push({
    id: 'build1',
    surfaceId: s.id,
    points: [
      { x: 0, y: 0.3 },
      { x: 1, y: 0.3 },
      { x: 1, y: 0.6 },
      { x: 0, y: 0.6 },
    ],
  });
  r.blocked.push({
    id: 'blocked1',
    surfaceId: s.id,
    points: [
      { x: 0.8, y: 0.3 },
      { x: 0.9, y: 0.3 },
      { x: 0.9, y: 0.4 },
      { x: 0.8, y: 0.4 },
    ],
  });
  return r;
}

/** Run until `done` or the time limit, in 60 Hz steps. */
function run(g: Game, seconds: number, done: () => boolean = () => false): void {
  for (let t = 0; t < seconds && !done(); t += 1 / 60) g.step(1 / 60);
}

describe('World', () => {
  it('turns the room into world units', () => {
    const w = new World(room());
    expect(w.aspect).toBe(1);
    expect(w.paths).toHaveLength(1);
    expect(w.paths[0].length).toBeCloseTo(1);
    expect(w.buildZones[0][2].x).toBeCloseTo(1);
  });

  it('includes paths that cross surfaces', () => {
    const r = room();
    const wall = addSurface(r, 'Wall');
    wall.corners = [
      { x: 0.6, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.2 },
      { x: 0.6, y: 0.2 },
    ];
    r.goals[0] = { id: 'goal1', surfaceId: wall.id, at: { x: 0.5, y: 0.5 } };
    r.paths[0].waypoints = [{ surfaceId: r.surfaces[0].id, at: { x: 0.8, y: 0.5 } }];
    const w = new World(r);
    const pts = w.paths[0].points;
    expect(pts).toHaveLength(3);
    expect(pts[2].x).toBeCloseTo(0.8);
    expect(pts[2].y).toBeCloseTo(0.1);
  });
});

describe('Game', () => {
  it('only allows towers in build zones, off the path and not blocked', () => {
    const g = new Game(new World(room()));
    expect(g.canPlace('pulse', { x: 0.5, y: 0.35 })).toBe('ok');
    expect(g.canPlace('pulse', { x: 0.5, y: 0.1 })).toBe('outside-build-zone');
    expect(g.canPlace('pulse', { x: 0.5, y: 0.51 })).toBe('on-path');
    expect(g.canPlace('pulse', { x: 0.85, y: 0.35 })).toBe('blocked');
    expect(g.place('pulse', { x: 0.5, y: 0.35 })).toBe('ok');
    expect(g.canPlace('pulse', { x: 0.51, y: 0.35 })).toBe('too-close');
    expect(g.credits).toBe(RULES.startCredits - TOWERS.pulse.cost);
    g.credits = 10;
    expect(g.canPlace('lance', { x: 0.2, y: 0.35 })).toBe('no-credits');
  });

  it('sells for a partial refund', () => {
    const g = new Game(new World(room()));
    g.place('lance', { x: 0.3, y: 0.35 });
    expect(g.sell({ x: 0.305, y: 0.35 })).toBe(Math.floor(TOWERS.lance.cost * RULES.sellRefund));
    expect(g.towers).toHaveLength(0);
    expect(g.sell({ x: 0.3, y: 0.35 })).toBe(0);
  });

  it('enemies walk the path and cost lives at the goal', () => {
    const g = new Game(new World(room()));
    expect(g.startWave()).toBe(true);
    expect(g.startWave()).toBe(false); // already running
    const count = makeWave(1).length;
    run(g, 60, () => g.phase !== 'wave');
    expect(g.phase).toBe('build');
    expect(g.lives).toBe(RULES.startLives - count * ENEMIES.crawler.harm);
    const bonus = RULES.waveBonus.base + RULES.waveBonus.perWave;
    expect(g.events).toContain(`wave-clear:1:${bonus}`);
  });

  it('towers kill enemies for credits and a wave bonus', () => {
    const g = new Game(new World(room()));
    g.credits = 1000;
    for (const x of [0.15, 0.3, 0.45, 0.6]) g.place('pulse', { x, y: 0.4 });
    g.startWave();
    run(g, 60, () => g.phase !== 'wave');
    expect(g.lives).toBe(RULES.startLives);
    const kills = g.events.filter((e) => e === 'kill').length;
    expect(kills).toBe(makeWave(1).length);
    expect(g.credits).toBe(
      1000 -
        4 * TOWERS.pulse.cost +
        kills * ENEMIES.crawler.bounty +
        RULES.waveBonus.base +
        RULES.waveBonus.perWave,
    );
  });

  it('frost slows everything in range', () => {
    const g = new Game(new World(room()));
    g.place('frost', { x: 0.1, y: 0.42 });
    g.startWave();
    run(g, 1.2);
    const e = g.enemies[0];
    expect(e.slowUntil).toBeGreaterThan(g.time);
    // Slowed enemies cover less ground than an unslowed one would.
    expect(e.dist).toBeLessThan(ENEMIES.crawler.speed * g.time);
  });

  it('is lost when the lives run out, and nothing moves after', () => {
    const g = new Game(new World(room()));
    g.lives = 3;
    g.startWave();
    run(g, 60, () => g.phase === 'lost');
    expect(g.phase).toBe('lost');
    expect(g.lives).toBe(0);
    const t = g.time;
    g.step(1);
    expect(g.time).toBe(t);
    expect(g.place('pulse', { x: 0.5, y: 0.35 })).toBe('not-now');
  });

  it('is won after the last wave, with a strong defence', () => {
    const g = new Game(new World(room()));
    g.credits = 100000;
    for (let x = 0.05; x < 0.8; x += 0.05) {
      g.place('lance', { x, y: 0.42 });
      g.place('frost', { x: x + 0.025, y: 0.58 });
    }
    for (let w = 0; w < RULES.waves; w++) {
      expect(g.startWave()).toBe(true);
      run(g, 300, () => g.phase !== 'wave');
    }
    expect(g.phase).toBe('won');
    expect(g.lives).toBe(RULES.startLives);
  });

  it('pausing freezes the game', () => {
    const g = new Game(new World(room()));
    g.startWave();
    run(g, 2);
    const before = g.enemies.map((e) => e.dist);
    g.togglePause();
    run(g, 2);
    expect(g.enemies.map((e) => e.dist)).toEqual(before);
    expect(g.startWave()).toBe(false);
  });

  it('waves get harder', () => {
    const w1 = makeWave(1);
    const w8 = makeWave(8);
    expect(w8.length).toBeGreaterThan(w1.length);
    expect(w8.some((s) => s.kind === 'brute')).toBe(true);
    expect(w1.some((s) => s.kind === 'brute')).toBe(false);
    expect(w8[0].hpScale).toBeGreaterThan(w1[0].hpScale);
  });

  it('upgrades towers up to the top level, for credits', () => {
    const g = new Game(new World(room()));
    g.credits = 1000;
    g.place('pulse', { x: 0.5, y: 0.35 });
    expect(g.upgrade({ x: 0.2, y: 0.35 })).toBe('no-tower');
    expect(g.upgrade({ x: 0.505, y: 0.35 })).toBe('ok');
    expect(g.upgrade({ x: 0.5, y: 0.35 })).toBe('ok');
    expect(g.towers[0].level).toBe(MAX_LEVEL);
    expect(g.upgrade({ x: 0.5, y: 0.35 })).toBe('max-level');
    const spent = TOWERS.pulse.cost + UPGRADES.pulse[0].cost + UPGRADES.pulse[1].cost;
    expect(g.credits).toBe(1000 - spent);
    // Selling refunds part of everything spent on the tower.
    expect(g.refundAt({ x: 0.5, y: 0.35 })).toBe(Math.floor(spent * RULES.sellRefund));
    g.credits = 0;
    expect(g.sell({ x: 0.5, y: 0.35 })).toBe(Math.floor(spent * RULES.sellRefund));
  });

  it('refuses an upgrade it cannot afford', () => {
    const g = new Game(new World(room()));
    g.place('lance', { x: 0.5, y: 0.35 });
    g.credits = UPGRADES.lance[0].cost - 1;
    expect(g.upgrade({ x: 0.5, y: 0.35 })).toBe('no-credits');
    expect(g.towers[0].level).toBe(1);
  });

  it('upgraded towers are stronger', () => {
    for (const kind of ['pulse', 'lance', 'frost'] as const) {
      const l1 = towerStats(kind, 1);
      const l3 = towerStats(kind, 3);
      expect(l3.damage * l3.rate).toBeGreaterThan(l1.damage * l1.rate);
      expect(l3.range).toBeGreaterThan(l1.range);
      expect(l3.cost).toBe(l1.cost); // stats keep the build cost; upgrades cost extra
    }
    expect(towerStats('frost', 3).slow!.factor).toBeLessThan(towerStats('frost', 1).slow!.factor);
  });
});
