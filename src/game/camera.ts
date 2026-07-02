import { VIEW_W, COURT_W, COURT_L } from "./config";

/**
 * Perspective projection for a side-elevated 3/4 view (like The Spike): the
 * camera sits above one sideline looking across the court. The court's long
 * axis (z, endline-to-endline) runs HORIZONTALLY on screen with the net a
 * vertical line in the centre; the court width (x) recedes INTO the screen as
 * depth, so both teams are fully visible on the left and right.
 *   world (x, y, z) — x = depth (near..far sideline), z = horizontal, y = height
 */
const CX = VIEW_W / 2;
const FOCAL = 600;
const D = 600; // camera distance beyond the near sideline (x = 0); smaller = lower, more grazing angle
const HORIZON = -60;
const GROUND_K = 560; // smaller = flatter/more side-on court (less top-down)
const HEIGHT_K = 1.3; // larger = taller players/net (more side-on feel)

export interface Projected {
  sx: number;
  sy: number;
  s: number; // depth scale
  groundY: number;
}

/** Depth scale as a function of court-width depth x. */
export function scaleAt(x: number): number {
  return FOCAL / (D + x);
}

export function project(x: number, y: number, z: number): Projected {
  const s = FOCAL / (D + x);
  const sx = CX + (z - COURT_L / 2) * s;
  const groundY = HORIZON + GROUND_K * s;
  const sy = groundY - y * s * HEIGHT_K;
  return { sx, sy, s, groundY };
}

export function projectGround(x: number, z: number): Projected {
  return project(x, 0, z);
}

export const COURT = { W: COURT_W, L: COURT_L };
