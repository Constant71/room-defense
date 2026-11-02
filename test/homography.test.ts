import { describe, expect, it } from 'vitest';
import { isConvexQuad, SurfaceMapping } from '../src/room/homography';
import type { Vec2 } from '../src/room/types';

const quad: [Vec2, Vec2, Vec2, Vec2] = [
  { x: 100, y: 120 },
  { x: 900, y: 80 },
  { x: 1000, y: 700 },
  { x: 50, y: 650 },
];

describe('SurfaceMapping', () => {
  it('maps the unit square corners onto the quad', () => {
    const m = SurfaceMapping.fromCorners(quad)!;
    const corners = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    corners.forEach((c, i) => {
      const p = m.toOutput(c);
      expect(p.x).toBeCloseTo(quad[i].x, 6);
      expect(p.y).toBeCloseTo(quad[i].y, 6);
    });
  });

  it('round-trips surface <-> output', () => {
    const m = SurfaceMapping.fromCorners(quad)!;
    for (const uv of [
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.9 },
      { x: 0.77, y: 0.23 },
    ]) {
      const back = m.toSurface(m.toOutput(uv));
      expect(back.x).toBeCloseTo(uv.x, 9);
      expect(back.y).toBeCloseTo(uv.y, 9);
    }
  });

  it('keeps straight lines straight (centre lies on both diagonals)', () => {
    const m = SurfaceMapping.fromCorners(quad)!;
    const c = m.toOutput({ x: 0.5, y: 0.5 });
    const cross = (a: Vec2, b: Vec2, p: Vec2) =>
      (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    expect(cross(quad[0], quad[2], c)).toBeCloseTo(0, 6);
    expect(cross(quad[1], quad[3], c)).toBeCloseTo(0, 6);
  });

  it('handles a plain rectangle (affine case)', () => {
    const m = SurfaceMapping.fromCorners([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ])!;
    expect(m.toOutput({ x: 0.25, y: 0.5 })).toEqual({ x: 50, y: 50 });
  });

  it('rejects crossed or degenerate corners', () => {
    const crossed: [Vec2, Vec2, Vec2, Vec2] = [quad[0], quad[2], quad[1], quad[3]];
    expect(isConvexQuad(crossed)).toBe(false);
    expect(SurfaceMapping.fromCorners(crossed)).toBeNull();
    const flat: [Vec2, Vec2, Vec2, Vec2] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
    ];
    expect(SurfaceMapping.fromCorners(flat)).toBeNull();
  });
});
