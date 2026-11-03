/**
 * Game balance. World units: the projected image is 1 unit tall and
 * `aspect` units wide, so sizes and speeds look the same on any projector.
 */

export type TowerKind = 'pulse' | 'lance' | 'frost';
export type EnemyKind = 'crawler' | 'dart' | 'brute';

export interface TowerDef {
  kind: TowerKind;
  name: string;
  cost: number;
  /** Reach in world units. */
  range: number;
  /** Shots per second. */
  rate: number;
  damage: number;
  /** Frost: hits every enemy in range and slows them. */
  area?: boolean;
  slow?: { factor: number; seconds: number };
  color: number;
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  pulse: {
    kind: 'pulse',
    name: 'Pulse',
    cost: 50,
    range: 0.16,
    rate: 2,
    damage: 1,
    color: 0x00ffff,
  },
  lance: {
    kind: 'lance',
    name: 'Lance',
    cost: 100,
    range: 0.3,
    rate: 0.6,
    damage: 6,
    color: 0xffff00,
  },
  frost: {
    kind: 'frost',
    name: 'Frost',
    cost: 70,
    range: 0.12,
    rate: 1,
    damage: 0.25,
    area: true,
    slow: { factor: 0.45, seconds: 1.5 },
    color: 0x66ccff,
  },
};
export const TOWER_ORDER: TowerKind[] = ['pulse', 'lance', 'frost'];

export const MAX_LEVEL = 3;

/** What an upgrade changes, and what it costs. Index 0 = level 1 -> 2, index 1 = 2 -> 3. */
export interface Upgrade {
  cost: number;
  range?: number;
  rate?: number;
  damage?: number;
  slow?: { factor: number; seconds: number };
}

export const UPGRADES: Record<TowerKind, [Upgrade, Upgrade]> = {
  pulse: [
    { cost: 38, damage: 1.6, range: 0.18 },
    { cost: 65, damage: 2.4, rate: 2.5, range: 0.2 },
  ],
  lance: [
    { cost: 75, damage: 10, range: 0.33 },
    { cost: 120, damage: 16, rate: 0.75, range: 0.36 },
  ],
  frost: [
    { cost: 50, damage: 0.4, range: 0.14, slow: { factor: 0.4, seconds: 1.75 } },
    { cost: 82, damage: 0.6, range: 0.16, slow: { factor: 0.32, seconds: 2 } },
  ],
};

/** A tower's stats at a level (1 to MAX_LEVEL). */
export function towerStats(kind: TowerKind, level: number): TowerDef {
  let def: TowerDef = { ...TOWERS[kind] };
  for (let l = 2; l <= Math.min(level, MAX_LEVEL); l++) {
    const { cost: _cost, ...changes } = UPGRADES[kind][l - 2];
    def = { ...def, ...changes };
  }
  return def;
}

/** Cost to go from `level` to `level + 1`, or null at the top level. */
export function upgradeCost(kind: TowerKind, level: number): number | null {
  return level < MAX_LEVEL ? UPGRADES[kind][level - 1].cost : null;
}

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  /** World units per second. */
  speed: number;
  bounty: number;
  /** Lives lost if it reaches a goal. */
  harm: number;
  radius: number;
  color: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  crawler: {
    kind: 'crawler',
    hp: 4,
    speed: 0.11,
    bounty: 3,
    harm: 1,
    radius: 0.016,
    color: 0xff00ff,
  },
  dart: { kind: 'dart', hp: 2, speed: 0.2, bounty: 3, harm: 1, radius: 0.013, color: 0xff9900 },
  brute: {
    kind: 'brute',
    hp: 16,
    speed: 0.07,
    bounty: 8,
    harm: 3,
    radius: 0.024,
    color: 0xff3030,
  },
};

export const RULES = {
  startCredits: 150,
  startLives: 20,
  waves: 10,
  sellRefund: 0.7,
  towerRadius: 0.022,
  /** Towers must keep this far from the middle of any path. */
  pathClearance: 0.035,
  /** Bonus for clearing wave n: base + perWave * n. */
  waveBonus: { base: 20, perWave: 3 },
};

export interface Spawn {
  kind: EnemyKind;
  /** Seconds after the wave starts. */
  at: number;
  hpScale: number;
}

/** Wave n (1-based): more enemies, tougher kinds later, and more hit points. */
export function makeWave(n: number): Spawn[] {
  const hpScale = Math.pow(1.2, n - 1);
  const gap = Math.max(0.45, 0.85 - 0.04 * n);
  const kinds: EnemyKind[] = [];
  const crawlers = 4 + 2 * n;
  const darts = n >= 2 ? 2 * (n - 1) : 0;
  const brutes = n >= 4 ? Math.floor((n - 2) / 2) : 0;
  for (let i = 0; i < crawlers; i++) kinds.push('crawler');
  // Interleave darts and brutes through the wave rather than all at the end.
  const insert = (kind: EnemyKind, count: number): void => {
    for (let i = 0; i < count; i++) {
      const at = Math.round(((i + 1) * kinds.length) / (count + 1));
      kinds.splice(at, 0, kind);
    }
  };
  insert('dart', darts);
  insert('brute', brutes);
  return kinds.map((kind, i) => ({ kind, at: i * gap, hpScale }));
}
