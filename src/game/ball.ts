import {
  BALL_R,
  BALL_RESTITUTION,
  BALL_MAX_SPEED,
  AIR_DRAG,
  GRAVITY,
  COURT_W,
  COURT_L,
  NET_Z,
  NET_H,
  NET_BAND,
  type Side,
} from "./config";

export interface TrailPoint {
  x: number;
  y: number;
  z: number;
  a: number;
}

export type BallEvent =
  | { type: "net" }
  | { type: "nettop" }
  | { type: "floor"; side: Side; x: number; z: number; inBounds: boolean };

export class Ball {
  x = COURT_W / 2;
  y = 120; // height
  z = NET_Z;
  vx = 0;
  vy = 0;
  vz = 0;
  spin = 0;
  trail: TrailPoint[] = [];
  live = false;
  lastHitBy: Side | null = null;
  active = true;
  hot = 0;

  reset(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.spin = 0;
    this.trail.length = 0;
    this.live = false;
    this.lastHitBy = null;
    this.active = true;
    this.hot = 0;
  }

  setVelocity(vx: number, vy: number, vz: number) {
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.clampSpeed();
  }

  private clampSpeed() {
    const s = Math.hypot(this.vx, this.vy, this.vz);
    if (s > BALL_MAX_SPEED) {
      const k = BALL_MAX_SPEED / s;
      this.vx *= k;
      this.vy *= k;
      this.vz *= k;
    }
  }

  speed(): number {
    return Math.hypot(this.vx, this.vy, this.vz);
  }
  /** Horizontal (court-plane) speed — useful for km/h readout. */
  planarSpeed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  update(dt: number): BallEvent[] {
    const events: BallEvent[] = [];
    if (!this.active) return events;

    this.vy -= GRAVITY * dt;
    this.vx *= AIR_DRAG;
    this.vz *= AIR_DRAG;
    if (this.hot > 0) this.hot = Math.max(0, this.hot - dt);

    const prevZ = this.z;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.spin += dt * 6;

    // net: a vertical plane at z = NET_Z spanning the whole width, up to NET_H
    const crossed = (prevZ - NET_Z) * (this.z - NET_Z) <= 0;
    const within = Math.abs(this.z - NET_Z) < NET_BAND / 2 + BALL_R;
    if ((crossed || within) && this.y < NET_H + BALL_R) {
      if (this.y > NET_H - BALL_R) {
        // clip the tape — tip over, killing most speed
        this.vy *= 0.35;
        this.vz *= 0.5;
        events.push({ type: "nettop" });
      } else {
        // hits the net — bounce back to the side it came from
        const dir = Math.sign(this.vz) || 1;
        this.z = NET_Z - dir * (NET_BAND / 2 + BALL_R);
        this.vz = -this.vz * 0.42;
        this.vx *= 0.6;
        events.push({ type: "net" });
      }
    }

    // floor
    if (this.y <= 0 && this.vy < 0) {
      const side: Side = this.z < NET_Z ? -1 : 1;
      const inBounds = this.x >= 0 && this.x <= COURT_W && this.z >= 0 && this.z <= COURT_L;
      events.push({ type: "floor", side, x: this.x, z: this.z, inBounds });
      this.y = 0;
      this.vy = -this.vy * BALL_RESTITUTION;
      this.vx *= 0.8;
      this.vz *= 0.8;
    }

    this.clampSpeed();

    this.trail.push({ x: this.x, y: this.y, z: this.z, a: 1 });
    if (this.trail.length > 14) this.trail.shift();
    for (const tp of this.trail) tp.a *= 0.86;

    return events;
  }

  /** Predict where the ball will hit the floor (y=0) going down. */
  predictLanding(): { x: number; z: number } {
    let px = this.x;
    let py = this.y;
    let pz = this.z;
    let pvx = this.vx;
    let pvy = this.vy;
    let pvz = this.vz;
    const dt = 1 / 120;
    for (let i = 0; i < 800; i++) {
      pvy -= GRAVITY * dt;
      px += pvx * dt;
      py += pvy * dt;
      pz += pvz * dt;
      if (py <= 0 && pvy < 0) break;
    }
    return { x: px, z: pz };
  }
}
