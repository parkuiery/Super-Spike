import { VIEW_W, COURT_W, COURT_L } from "./config";

/**
 * Perspective projection for the 3/4 top-down court. A point (x, y, z) in world
 * space maps to screen (sx, sy) with a depth scale `s`. Near the camera (small z)
 * things are larger and lower on screen; far away they shrink toward the horizon.
 */
const CX = VIEW_W / 2;
const FOCAL = 888; // controls near-edge width
const D = 400; // camera distance beyond the near baseline
const HORIZON = 20; // screen y that z=+infinity approaches
const GROUND_K = 241; // vertical spread of the ground plane
const HEIGHT_K = 1.0; // world-height to screen-height factor

export interface Projected {
  sx: number;
  sy: number;
  s: number; // depth scale (1 ~ mid court)
  groundY: number; // screen y of the ground directly under the point
}

export function scaleAt(z: number): number {
  return FOCAL / (D + z);
}

export function project(x: number, y: number, z: number): Projected {
  const s = FOCAL / (D + z);
  const sx = CX + (x - COURT_W / 2) * s;
  const groundY = HORIZON + GROUND_K * s;
  const sy = groundY - y * s * HEIGHT_K;
  return { sx, sy, s, groundY };
}

/** Convenience: screen position of a point on the ground plane. */
export function projectGround(x: number, z: number): Projected {
  return project(x, 0, z);
}

export const COURT = { W: COURT_W, L: COURT_L };
