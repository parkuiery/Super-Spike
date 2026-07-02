import {
  MOVE_SPEED,
  MOVE_ACCEL,
  AIR_CONTROL,
  JUMP_V,
  CHAR_GRAVITY,
  COURT_W,
  NET_Z,
  COURT_L,
  HIT_COOLDOWN,
  homePos,
  type Side,
  type Palette,
} from "./config";
import { approach, clamp } from "../engine/math";

export interface Intent {
  moveX: number; // -1..1 (left/right across court)
  moveZ: number; // -1..1 (toward/away from net; + = toward far)
  jump: boolean;
  hit: boolean;
  hitHeld: boolean;
}

export class Fighter {
  x: number;
  z: number;
  y = 0; // height
  vx = 0;
  vz = 0;
  vy = 0;
  onGround = true;
  facing = 1; // sprite facing (-1 left, 1 right)

  hitCooldown = 0;
  swing = 0;
  swingDir = 0;
  aimX = 0;
  aimZ = 0;
  holdHit = false;
  lastHitKind: "bump" | "set" | "spike" | "attack" | "block" | "serve" | "" = "";
  jumpTime = 0;
  airborneApex = false;
  wantHit = false;
  wantHitTimer = 0;

  squash = 1;
  legPhase = 0;
  celebrate = 0;
  stunned = 0;

  // AI state
  aiReact = 0;
  aiTargetX = 0;
  aiTargetZ = 0;
  aiWantJump = false;

  constructor(
    public side: Side,
    public palette: Palette,
    public role: number,
    public number: number,
  ) {
    const h = homePos(side, role);
    this.x = h.x;
    this.z = h.z;
    this.aiTargetX = h.x;
    this.aiTargetZ = h.z;
    this.facing = side === -1 ? 1 : -1; // face the net (net is horizontal centre on screen)
  }

  get bodyTopY() {
    return this.y + 74; // approx head height in world units
  }
  get handY() {
    return this.y + (this.onGround ? 78 : 118);
  }

  private zBounds(): [number, number] {
    return this.side === -1 ? [12, NET_Z - 16] : [NET_Z + 16, COURT_L - 12];
  }

  reset() {
    const h = homePos(this.side, this.role);
    this.x = h.x;
    this.z = h.z;
    this.y = 0;
    this.vx = this.vz = this.vy = 0;
    this.onGround = true;
    this.hitCooldown = 0;
    this.swing = 0;
    this.jumpTime = 0;
    this.wantHit = false;
    this.celebrate = 0;
    this.stunned = 0;
    this.squash = 1;
    this.aiReact = 0;
    this.aiTargetX = h.x;
    this.aiTargetZ = h.z;
    this.aiWantJump = false;
  }

  update(dt: number, intent: Intent) {
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.celebrate = Math.max(0, this.celebrate - dt);
    this.stunned = Math.max(0, this.stunned - dt);
    if (this.wantHitTimer > 0) {
      this.wantHitTimer -= dt;
      if (this.wantHitTimer <= 0) this.wantHit = false;
    }

    const frozen = this.stunned > 0 || this.celebrate > 0;
    const mx = frozen ? 0 : intent.moveX;
    const mz = frozen ? 0 : intent.moveZ;
    this.aimX = intent.moveX;
    this.aimZ = intent.moveZ;
    this.holdHit = intent.hitHeld;

    const accel = MOVE_ACCEL * (this.onGround ? 1 : AIR_CONTROL);
    this.vx = approach(this.vx, mx * MOVE_SPEED, accel * dt);
    this.vz = approach(this.vz, mz * MOVE_SPEED, accel * dt);
    // sprite faces along the horizontal (net) axis = z movement
    if (Math.abs(mz) > 0.1) this.facing = mz < 0 ? -1 : 1;

    if (intent.jump && this.onGround && !frozen) {
      this.vy = JUMP_V;
      this.onGround = false;
      this.jumpTime = 0;
      this.squash = 1.25;
    }
    if (intent.hit && !frozen) {
      this.wantHit = true;
      this.wantHitTimer = 0.16;
    }

    if (!this.onGround) {
      this.vy -= CHAR_GRAVITY * dt;
      this.jumpTime += dt;
      this.airborneApex = Math.abs(this.vy) < 40;
    }

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;

    // clamp to court / own half
    this.x = clamp(this.x, 12, COURT_W - 12);
    const [zlo, zhi] = this.zBounds();
    if (this.z < zlo) {
      this.z = zlo;
      if (this.vz < 0) this.vz = 0;
    } else if (this.z > zhi) {
      this.z = zhi;
      if (this.vz > 0) this.vz = 0;
    }

    if (this.y <= 0) {
      if (!this.onGround && this.vy < -140) this.squash = 0.72;
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
    }

    this.squash = approach(this.squash, 1, dt * 4);
    this.swing = Math.max(0, this.swing - dt * 6);
    const planar = Math.hypot(this.vx, this.vz);
    if (this.onGround && planar > 24) this.legPhase += dt * planar * 0.06;
    else this.legPhase = approach(this.legPhase, 0, dt * 8);
  }

  triggerSwing(dir: number) {
    this.swing = 1;
    this.swingDir = clamp(dir, -1, 1);
    this.hitCooldown = HIT_COOLDOWN;
    this.wantHit = false;
    this.squash = this.onGround ? 0.9 : 1.1;
  }

  canHit(): boolean {
    return this.hitCooldown <= 0 && this.stunned <= 0 && this.celebrate <= 0;
  }
}
