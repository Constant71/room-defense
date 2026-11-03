import { expect, it } from 'vitest';
import { RULES, TOWERS, upgradeCost, type TowerKind } from '../src/game/defs';
import { Game } from '../src/game/sim';
import { World } from '../src/game/world';
import { addSurface, emptyRoom } from '../src/room/room';

/**
 * Balance guard: a simple bot that spends everything before each wave, building
 * next to the path. Mixing tower types should just about win; spamming a single
 * type should not. Re-tune src/game/defs.ts if this starts failing.
 */
function play(strategy: (g: Game) => void, zig: boolean): Game {
  const r = emptyRoom('B', 1600, 900);
  const s = addSurface(r);
  s.corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  r.spawns.push({ id: 'sp', surfaceId: s.id, at: { x: 0.02, y: 0.2 } });
  r.goals.push({ id: 'gl', surfaceId: s.id, at: { x: 0.98, y: 0.8 } });
  r.paths.push({
    id: 'p',
    spawnId: 'sp',
    goalId: 'gl',
    waypoints: zig
      ? [
          { surfaceId: s.id, at: { x: 0.5, y: 0.2 } },
          { surfaceId: s.id, at: { x: 0.5, y: 0.8 } },
        ]
      : [],
  });
  r.buildZones.push({
    id: 'b',
    surfaceId: s.id,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  });
  const g = new Game(new World(r));
  const phase = (): string => g.phase;
  for (let w = 0; w < RULES.waves && phase() === 'build'; w++) {
    strategy(g);
    g.startWave();
    for (let t = 0; t < 400 && phase() === 'wave'; t += 1 / 60) g.step(1 / 60);
  }
  return g;
}

// Greedy: place the chosen kind at the best free spot near the path start..end.
function greedy(kinds: TowerKind[], max = Infinity) {
  let i = 0;
  return (g: Game) => {
    while (g.towers.length < max) {
      let kind = kinds[i % kinds.length];
      if (g.credits < TOWERS[kind].cost) {
        const cheaper = kinds.filter((k) => TOWERS[k].cost <= g.credits);
        if (!cheaper.length) return;
        kind = cheaper[0];
      }
      let placed = false;
      const p = g.world.paths[0];
      for (let d = 0.15; d < p.length && !placed; d += 0.05) {
        for (const off of [0.06, -0.06, 0.1, -0.1]) {
          // A point along the path, pushed sideways off it.
          const pos = { x: 0, y: 0 };
          let k = 1;
          while (p.cumulative[k] < d) k++;
          const s0 = p.points[k - 1],
            s1 = p.points[k];
          const L = Math.hypot(s1.x - s0.x, s1.y - s0.y),
            t = (d - p.cumulative[k - 1]) / L;
          pos.x = s0.x + (s1.x - s0.x) * t - ((s1.y - s0.y) / L) * off;
          pos.y = s0.y + (s1.y - s0.y) * t + ((s1.x - s0.x) / L) * off;
          if (g.place(kind, pos) === 'ok') {
            placed = true;
            break;
          }
        }
      }
      if (!placed) return;
      i++;
    }
  };
}

it('rewards mixing tower types', () => {
  for (const zig of [false, true]) {
    const mixed = play(greedy(['pulse', 'pulse', 'frost', 'lance']), zig);
    const pulseOnly = play(greedy(['pulse']), zig);
    const lanceOnly = play(greedy(['lance']), zig);
    expect(mixed.phase).toBe('won');
    expect(pulseOnly.phase).not.toBe('won');
    expect(lanceOnly.phase).not.toBe('won');
  }
});

/** Build up to `max` towers like `greedy`, then spend the rest on upgrades (cheapest first). */
function upgrader(kinds: TowerKind[], max: number) {
  const build = greedy(kinds, max);
  return (g: Game) => {
    build(g);
    for (;;) {
      const options = g.towers
        .map((t) => ({ t, cost: upgradeCost(t.kind, t.level) }))
        .filter((o): o is { t: (typeof g.towers)[number]; cost: number } => o.cost !== null)
        .sort((a, b) => a.cost - b.cost);
      if (!options.length || options[0].cost > g.credits) return;
      g.upgrade(options[0].t.pos);
    }
  };
}

it('makes upgrading worthwhile, but not a few maxed towers on their own', () => {
  for (const zig of [false, true]) {
    expect(play(upgrader(['pulse', 'pulse', 'frost', 'lance'], 10), zig).phase).toBe('won');
    expect(play(upgrader(['pulse', 'pulse', 'frost', 'lance'], 4), zig).phase).not.toBe('won');
  }
});
