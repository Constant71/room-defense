import type { Vec2 } from './types.ts';

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * Perspective transform taking the unit square (0,0),(1,0),(1,1),(0,1) onto the
 * quad q0..q3 (Heckbert's square-to-quad). Returns null for a degenerate quad.
 */
export function squareToQuad(q: readonly [Vec2, Vec2, Vec2, Vec2]): Mat3 | null {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    // Affine (parallelogram)
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-12) return null;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }
  return [a, b, c, d, e, f, g, h, 1];
}

export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [
    A * s,
    -(b * i - c * h) * s,
    (b * f - c * e) * s,
    B * s,
    (a * i - c * g) * s,
    -(a * f - c * d) * s,
    C * s,
    -(a * h - b * g) * s,
    (a * e - b * d) * s,
  ];
}

export function apply(m: Mat3, p: Vec2): Vec2 {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

/** True if the quad is convex and wound consistently (a usable corner pin). */
export function isConvexQuad(q: readonly Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Maps between one surface's (u,v) space and output space. */
export class SurfaceMapping {
  private readonly forward: Mat3;
  private readonly inverse: Mat3;

  private constructor(forward: Mat3, inverse: Mat3) {
    this.forward = forward;
    this.inverse = inverse;
  }

  static fromCorners(corners: readonly [Vec2, Vec2, Vec2, Vec2]): SurfaceMapping | null {
    if (!isConvexQuad(corners)) return null;
    const f = squareToQuad(corners);
    const inv = f && invert(f);
    return f && inv ? new SurfaceMapping(f, inv) : null;
  }

  toOutput(uv: Vec2): Vec2 {
    return apply(this.forward, uv);
  }

  toSurface(out: Vec2): Vec2 {
    return apply(this.inverse, out);
  }
}
