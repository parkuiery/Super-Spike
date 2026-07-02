import {
  BALL_R,
  BALL_RESTITUTION,
  BALL_MAX_SPEED,
  AIR_DRAG,
  GRAVITY,
  CEIL_Y,
  WALL_L,
  WALL_R,
  FLOOR_Y,
  NET_X,
  NET_TOP,
  NET_W,
  type Side,
} from "./config";
import { clamp } from "../engine/math";

export interface TrailPoint {
  x: number;
  y: number;
  a: number;
}

export type BallEvent =
  | { type: "wall" }
  | { type: "net" }
  | { type: "nettop" }
  | { type: "floor"; side: Side; x: number };

export class Ball {
  x = NET_X;
  y = 160;
  vx = 0;
  vy = 0;
  spin = 0; // visual rotation velocity
  angle = 0;
  trail: TrailPoint[] = [];
  live = false; // whether it counts toward a rally (false during serve hold)
  lastHitBy: Side | null = null;
  active = true; // false once point is scored, until reset
  hot = 0; // >0 right after a spike, for a fiery trail

  reset(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.spin = 0;
    this.trail.length = 0;
    this.live = false;
    this.lastHitBy = null;
    this.active = true;
  }

  setVelocity(vx: number, vy: number) {
    this.vx = vx;
    this.vy = vy;
    this.clampSpeed();
  }

  private clampSpeed() {
    const s = Math.hypot(this.vx, this.vy);
    if (s > BALL_MAX_SPEED) {
      const k = BALL_MAX_SPEED / s;
      this.vx *= k;
      this.vy *= k;
    }
  }

  speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Advance physics; returns collision events that happened this step. */
  update(dt: number): BallEvent[] {
    const events: BallEvent[] = [];
    if (!this.active) return events;

    this.vy += GRAVITY * dt;
    this.vx *= AIR_DRAG;
    this.clampSpeed();
    if (this.hot > 0) this.hot = Math.max(0, this.hot - dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // spin visual
    this.spin = this.vx * 0.02;
    this.angle += this.spin * dt * 6;

    // ceiling
    if (this.y - BALL_R < CEIL_Y) {
      this.y = CEIL_Y + BALL_R;
      this.vy = Math.abs(this.vy) * 0.5;
    }
    // side walls
    if (this.x - BALL_R < WALL_L) {
      this.x = WALL_L + BALL_R;
      this.vx = Math.abs(this.vx) * 0.72;
      events.push({ type: "wall" });
    } else if (this.x + BALL_R > WALL_R) {
      this.x = WALL_R - BALL_R;
      this.vx = -Math.abs(this.vx) * 0.72;
      events.push({ type: "wall" });
    }

    // net collision — treat the net as a thin vertical bar from NET_TOP to FLOOR_Y
    const halfNet = NET_W / 2 + BALL_R;
    if (
      this.y + BALL_R > NET_TOP - BALL_R &&
      Math.abs(this.x - NET_X) < halfNet &&
      this.y < FLOOR_Y
    ) {
      // near the very top -> let it roll/tip over with a soft bump
      if (this.y < NET_TOP + BALL_R) {
        this.vy *= 0.4;
        this.y = NET_TOP - BALL_R;
        events.push({ type: "nettop" });
      } else {
        // bounce back to the side it came from
        if (this.x < NET_X) {
          this.x = NET_X - halfNet;
          this.vx = -Math.abs(this.vx) * 0.55 - 30;
        } else {
          this.x = NET_X + halfNet;
          this.vx = Math.abs(this.vx) * 0.55 + 30;
        }
        events.push({ type: "net" });
      }
    }

    // floor
    if (this.y + BALL_R > FLOOR_Y) {
      const side: Side = this.x < NET_X ? -1 : 1;
      events.push({ type: "floor", side, x: this.x });
      // bounce (for visual after point)
      this.y = FLOOR_Y - BALL_R;
      this.vy = -Math.abs(this.vy) * BALL_RESTITUTION;
      this.vx *= 0.8;
    }

    this.x = clamp(this.x, WALL_L + BALL_R, WALL_R - BALL_R);

    // trail
    this.trail.push({ x: this.x, y: this.y, a: 1 });
    if (this.trail.length > 14) this.trail.shift();
    for (const tp of this.trail) tp.a *= 0.86;

    return events;
  }

  /** Predict where the ball will cross a given y going downward (rough, ignores net). */
  predictLandingX(targetY = FLOOR_Y - BALL_R): number {
    let px = this.x;
    let py = this.y;
    let pvx = this.vx;
    let pvy = this.vy;
    const dt = 1 / 120;
    for (let i = 0; i < 600; i++) {
      pvy += GRAVITY * dt;
      px += pvx * dt;
      py += pvy * dt;
      if (px - BALL_R < WALL_L) {
        px = WALL_L + BALL_R;
        pvx = Math.abs(pvx) * 0.72;
      } else if (px + BALL_R > WALL_R) {
        px = WALL_R - BALL_R;
        pvx = -Math.abs(pvx) * 0.72;
      }
      if (py >= targetY && pvy > 0) break;
    }
    return px;
  }
}
