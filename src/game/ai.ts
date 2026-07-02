import { Ball } from "./ball";
import { Fighter, type Intent } from "./fighter";
import {
  NET_Z,
  NET_H,
  COURT_L,
  REACH_XZ,
  REACH_Y,
  SPIKE_REACH_Y,
  homePos,
  type Difficulty,
} from "./config";
import { clamp, rand, randRange } from "../engine/math";

export interface AIContext {
  primary: boolean;
  nearest: boolean;
  serving: boolean;
  diff: Difficulty;
  touches: number;
}

const IDLE: Intent = { moveX: 0, moveZ: 0, jump: false, hit: false, hitHeld: false };

export function aiIntent(dt: number, ball: Ball, self: Fighter, o: AIContext): Intent {
  if (self.celebrate > 0 || self.stunned > 0) return IDLE;
  const intent: Intent = { moveX: 0, moveZ: 0, jump: false, hit: false, hitHeld: false };
  const side = self.side;
  const dirNet = -side; // +z toward far for the near team, etc.
  const home = homePos(side, self.role);
  const attacking = o.primary && o.touches >= 2;
  const netZ = NET_Z - dirNet * 44; // just in front of the net on our side

  self.aiReact -= dt;
  if (self.aiReact <= 0) {
    self.aiReact = o.diff.reaction;
    if (o.primary && ball.active) {
      const land = ball.predictLanding();
      const ex = randRange(-o.diff.errorXZ, o.diff.errorXZ);
      const ez = randRange(-o.diff.errorXZ, o.diff.errorXZ);
      if (attacking) {
        self.aiTargetX = clamp(ball.x + ex * 0.4, 16, 344);
        self.aiTargetZ = netZ;
        self.aiWantJump = rand() < 0.5 + o.diff.jumpSkill * 0.5;
      } else {
        self.aiTargetX = clamp(land.x + ex, 16, 344);
        self.aiTargetZ = land.z - dirNet * 16 + ez * 0.3;
        self.aiWantJump = false;
      }
    } else {
      self.aiTargetX = home.x;
      self.aiTargetZ = home.z;
      self.aiWantJump = false;
    }
  }

  const moveTo = (tx: number, tz: number, mul = 1) => {
    const dx = tx - self.x;
    const dz = tz - self.z;
    if (Math.abs(dx) > 8) intent.moveX = clamp(dx / 22, -1, 1) * o.diff.speedMul * mul;
    if (Math.abs(dz) > 8) intent.moveZ = clamp(dz / 22, -1, 1) * o.diff.speedMul * mul;
  };

  // serving — stand under the toss (on our own baseline) and put it in play
  if (o.serving && !ball.live && o.primary) {
    moveTo(clamp(ball.x, 16, 344), ball.z);
    const near = Math.hypot(ball.x - self.x, ball.z - self.z) < REACH_XZ * 1.1;
    if (near && ball.y < REACH_Y + 6 && ball.vy < 6) intent.hit = true;
    return intent;
  }

  moveTo(self.aiTargetX, self.aiTargetZ);
  if (!ball.active) return intent;

  const distXZ = Math.hypot(ball.x - self.x, ball.z - self.z);
  const nearNet = Math.abs(self.z - NET_Z) < 90;
  const ballHigh = ball.y > NET_H - 10;
  const comingOver = ball.vz * side < 0 && Math.abs(ball.z - NET_Z) < 80; // ball heading to our side over the net
  const doBlock = self.role === 2 && nearNet && comingOver && ball.y > NET_H - 20 && rand() < o.diff.jumpSkill;

  if (self.onGround) {
    const spikeJump = attacking && self.aiWantJump && nearNet && distXZ < REACH_XZ * 1.6 && ballHigh;
    if (spikeJump || doBlock) intent.jump = true;
  }

  const allowHit = o.primary || o.nearest || self.role === 2;
  const reachY = self.onGround ? REACH_Y : SPIKE_REACH_Y;
  const canReach = distXZ < REACH_XZ * 1.15 && ball.y > self.y + 8 && ball.y < self.y + reachY + 18;
  if (self.canHit() && canReach && allowHit) {
    if (self.onGround) {
      if (ball.vy < 40) intent.hit = true;
    } else {
      const wellTimed = self.airborneApex || rand() < o.diff.jumpSkill * dt * 60;
      if (wellTimed || ball.vy < 20) intent.hit = true;
      intent.hitHeld = doBlock;
    }
  }
  void COURT_L;
  return intent;
}
