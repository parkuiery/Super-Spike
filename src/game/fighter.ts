import {
  CHAR_W,
  CHAR_H,
  MOVE_SPEED,
  MOVE_ACCEL,
  AIR_CONTROL,
  JUMP_VELOCITY,
  CHAR_GRAVITY,
  FLOOR_Y,
  WALL_L,
  WALL_R,
  NET_X,
  NET_W,
  HIT_COOLDOWN,
  type Side,
  type Palette,
} from "./config";
import { approach, clamp } from "../engine/math";

export interface Intent {
  moveX: number; // -1..1
  jump: boolean; // edge: pressed this frame
  hit: boolean; // edge: pressed this frame
  hitHeld: boolean;
}

export class Fighter {
  x: number;
  y = FLOOR_Y; // feet
  vx = 0;
  vy = 0;
  onGround = true;
  facing: Side;

  hitCooldown = 0;
  swing = 0; // 0..1 animation of an arm swing (decays)
  swingDir = 0; // -1..1 horizontal aim of the current swing
  aimX = 0; // latest horizontal intent (used to aim hits)
  holdHit = false; // whether the hit key is held (for blocks)
  lastHitKind: "bump" | "set" | "spike" | "attack" | "block" | "serve" | "" = "";
  jumpTime = 0; // time since leaving ground (for spike-timing window)
  airborneApex = false;
  wantHit = false; // buffered hit request while airborne
  wantHitTimer = 0;

  // visual anim state
  bob = 0;
  squash = 1; // <1 = squashed (landing), >1 = stretched (jump)
  legPhase = 0;
  blink = 0;
  celebrate = 0; // >0 during point celebration
  stunned = 0;

  // AI state (used only when this fighter is AI-driven)
  aiReact = 0;
  aiTargetX = 0;
  aiWantJump = false;

  constructor(
    public side: Side,
    public palette: Palette,
    startX: number,
    public role: number, // 0 back, 1 mid, 2 front(net)
    public number: number, // jersey number
  ) {
    this.x = startX;
    this.aiTargetX = startX;
    this.facing = side === -1 ? 1 : -1; // face the net
  }

  get halfW() {
    return CHAR_W / 2;
  }
  get bodyCenterY() {
    return this.y - CHAR_H * 0.55;
  }
  get handY() {
    // where the hitting hand reaches (higher while airborne / swinging)
    const reachUp = this.onGround ? CHAR_H * 0.95 : CHAR_H * 1.25;
    return this.y - reachUp;
  }

  private xMin(): number {
    return this.side === -1 ? WALL_L + this.halfW : NET_X + NET_W / 2 + this.halfW;
  }
  private xMax(): number {
    return this.side === -1 ? NET_X - NET_W / 2 - this.halfW : WALL_R - this.halfW;
  }

  reset(startX: number) {
    this.x = startX;
    this.y = FLOOR_Y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.hitCooldown = 0;
    this.swing = 0;
    this.jumpTime = 0;
    this.wantHit = false;
    this.celebrate = 0;
    this.stunned = 0;
    this.squash = 1;
    this.aiReact = 0;
    this.aiTargetX = startX;
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
    this.aimX = intent.moveX;
    this.holdHit = intent.hitHeld;

    // horizontal movement
    const target = mx * MOVE_SPEED;
    const accel = MOVE_ACCEL * (this.onGround ? 1 : AIR_CONTROL);
    this.vx = approach(this.vx, target, accel * dt);
    if (Math.abs(mx) > 0.1) this.facing = mx < 0 ? -1 : 1;

    // jump
    if (intent.jump && this.onGround && !frozen) {
      this.vy = -JUMP_VELOCITY;
      this.onGround = false;
      this.jumpTime = 0;
      this.squash = 1.25;
    }

    // buffer a hit press so airborne timing feels responsive
    if (intent.hit && !frozen) {
      this.wantHit = true;
      this.wantHitTimer = 0.16;
    }

    // gravity
    if (!this.onGround) {
      this.vy += CHAR_GRAVITY * dt;
      this.jumpTime += dt;
      this.airborneApex = Math.abs(this.vy) < 90;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // clamp to own half
    const lo = this.xMin();
    const hi = this.xMax();
    if (this.x < lo) {
      this.x = lo;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x > hi) {
      this.x = hi;
      if (this.vx > 0) this.vx = 0;
    }

    // ground
    if (this.y >= FLOOR_Y) {
      if (!this.onGround && this.vy > 400) this.squash = 0.7; // landing squash
      this.y = FLOOR_Y;
      this.vy = 0;
      this.onGround = true;
    }

    // animation state
    this.squash = approach(this.squash, 1, dt * 4);
    this.swing = Math.max(0, this.swing - dt * 6);
    if (this.onGround && Math.abs(this.vx) > 30) {
      this.legPhase += dt * Math.abs(this.vx) * 0.05;
    } else {
      this.legPhase = approach(this.legPhase, 0, dt * 8);
    }
    this.bob = Math.sin(performanceBob(this.legPhase)) * 2;
    this.blink = Math.max(0, this.blink - dt);
  }

  /** Called by the match when a swing actually connects with the ball. */
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

// tiny helper to keep bob deterministic without Date.now
function performanceBob(phase: number): number {
  return phase;
}
