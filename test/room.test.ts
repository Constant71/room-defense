import { describe, expect, it } from 'vitest';
import {
  addSurface,
  checkRoom,
  emptyRoom,
  fileNameFor,
  parseRoom,
  removeFeature,
} from '../src/room/room';
import type { Room } from '../src/room/types';

function playable(): Room {
  const room = emptyRoom('Living room', 1920, 1080);
  const s = addSurface(room, 'Floor');
  room.spawns.push({ id: 'spawn1', surfaceId: s.id, at: { x: 0.1, y: 0.1 } });
  room.goals.push({ id: 'goal1', surfaceId: s.id, at: { x: 0.9, y: 0.9 } });
  room.paths.push({
    id: 'path1',
    surfaceId: s.id,
    spawnId: 'spawn1',
    goalId: 'goal1',
    waypoints: [{ x: 0.5, y: 0.2 }],
  });
  room.buildZones.push({
    id: 'build1',
    surfaceId: s.id,
    points: [
      { x: 0.2, y: 0.4 },
      { x: 0.4, y: 0.4 },
      { x: 0.3, y: 0.6 },
    ],
  });
  return room;
}

describe('room', () => {
  it('a complete room has no problems', () => {
    expect(checkRoom(playable())).toEqual([]);
  });

  it('an empty room lists what is missing', () => {
    const errors = checkRoom(emptyRoom('x', 1, 1)).filter((p) => p.level === 'error');
    expect(errors.map((e) => e.message).join(' ')).toMatch(/surface.*spawn.*goal.*path/s);
  });

  it('survives a JSON round trip', () => {
    const room = playable();
    expect(parseRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
  });

  it('rejects broken files with a readable error', () => {
    expect(() => parseRoom({ version: 99 })).toThrow(/version/);
    const room = playable() as unknown as Record<string, unknown>;
    expect(() =>
      parseRoom({ ...room, spawns: [{ id: 'spawn9', surfaceId: 'nope', at: { x: 0, y: 0 } }] }),
    ).toThrow(/missing surface/);
    expect(() => parseRoom({ ...room, surfaces: [{ id: 's', name: 'S', corners: [] }] })).toThrow(
      /4 corners/,
    );
  });

  it('removing a spawn unlinks its paths; removing a surface removes its features', () => {
    const room = playable();
    removeFeature(room, 'spawn1');
    expect(room.paths[0].spawnId).toBeNull();
    expect(checkRoom(room).some((p) => p.featureId === 'path1')).toBe(true);
    removeFeature(room, room.surfaces[0].id);
    expect(room.surfaces).toEqual([]);
    expect(room.paths).toEqual([]);
    expect(room.goals).toEqual([]);
    expect(room.buildZones).toEqual([]);
  });

  it('makes safe file names', () => {
    expect(fileNameFor('  Living Room #2! ')).toBe('living-room-2');
    expect(fileNameFor('../../etc')).toBe('etc');
    expect(fileNameFor('???')).toBe('room');
  });
});
