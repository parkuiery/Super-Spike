export interface Vec2 {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

export const sign = (v: number): number => (v < 0 ? -1 : v > 0 ? 1 : 0);

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export const approach = (cur: number, target: number, step: number): number => {
  if (cur < target) return Math.min(cur + step, target);
  if (cur > target) return Math.max(cur - step, target);
  return target;
};

/** Deterministic-ish PRNG so effects vary without Math.random surprises. */
let seed = 0x1a2b3c4d;
export const rand = (): number => {
  // xorshift32
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
};
export const randRange = (lo: number, hi: number): number => lo + rand() * (hi - lo);
export const randSign = (): number => (rand() < 0.5 ? -1 : 1);

export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
