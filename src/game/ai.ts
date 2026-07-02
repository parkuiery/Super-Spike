import { Ball } from "./ball";
import { Fighter, type Intent } from "./fighter";
import {
  NET_X,
  NET_TOP,
  FLOOR_Y,
  WALL_L,
  WALL_R,
  REACH,
  SPIKE_REACH,
  homeX,
  type Difficulty,
} from "./config";
import { clamp, rand, randRange } from "../engine/math";

export interface AIContext {
  primary: boolean; // this fighter should drive offense (go play the ball)
  nearest: boolean; // this fighter is the closest on its side to the ball
  serving: boolean; // its team is serving and the ball isn't live yet
  diff: Difficulty;
  touches: number; // touches its side has already made this possession
}

const IDLE: Intent = { moveX: 0, jump: false, hit: false, hitHeld: false };

/**
 * Per-fighter AI. Positions to a home zone, receives/sets on early touches and
 * spikes/attacks on the closing touch. The controlled player's team uses this
 * for its two off-ball members; the opponent uses it for all three.
 */
export function aiIntent(dt: number, ball: Ball, self: Fighter, o: AIContext): Intent {
  if (self.celebrate > 0 || self.stunned > 0) return IDLE;
  const intent: Intent = { moveX: 0, jump: false, hit: false, hitHeld: false };
  const side = self.side;
  const ownMin = side === -1 ? WALL_L + 30 : NET_X + 40;
  const ownMax = side === -1 ? NET_X - 40 : WALL_R - 30;
  const home = homeX(side, self.role);
  const attacking = o.primary && o.touches >= 2; // closing touch → send it over

  // reaction cadence — recompute intent target on a human-ish delay
  self.aiReact -= dt;
  if (self.aiReact <= 0) {
    self.aiReact = o.diff.reaction;
    if (o.primary && ball.active) {
      let land = ball.predictLandingX(FLOOR_Y - 40);
      land += randRange(-o.diff.errorPx, o.diff.errorPx);
      if (attacking) {
        self.aiTargetX = clamp(ball.x + side * 6, ownMin, ownMax);
        self.aiWantJump = rand() < 0.45 + o.diff.jumpSkill * 0.5;
      } else {
        // stand slightly behind the ball (toward own wall) so the pop goes forward
        self.aiTargetX = clamp(land + side * 22, ownMin, ownMax);
        self.aiWantJump = false;
      }
    } else {
      self.aiTargetX = home;
      self.aiWantJump = false;
    }
  }

  // serving: move under the toss and put it in play
  if (o.serving && !ball.live && o.primary) {
    self.aiTargetX = clamp(ball.x + side * 8, ownMin, ownMax);
    const dx = self.aiTargetX - self.x;
    intent.moveX = clamp(dx / 24, -1, 1) * o.diff.speedMul;
    const near = Math.abs(ball.x - self.x) < REACH * 0.9;
    const goodHeight = ball.y > NET_TOP - 40 && ball.y < FLOOR_Y - 40;
    if (near && goodHeight && ball.vy > -40) intent.hit = true;
    return intent;
  }

  // move toward target zone
  const dx = self.aiTargetX - self.x;
  if (Math.abs(dx) > 10) intent.moveX = clamp(dx / 26, -1, 1) * o.diff.speedMul;

  if (!ball.active) return intent;

  const distX = Math.abs(ball.x - self.x);
  const nearNet = Math.abs(self.x - NET_X) < 170;
  const ballHigh = ball.y < NET_TOP + 40;
  const opponentAttacking =
    ball.vx * side > 0 && Math.abs(ball.x - NET_X) < 110 && ball.y < NET_TOP + 70;
  const doBlock = self.role === 2 && nearNet && opponentAttacking && ball.speed() > 500 && rand() < o.diff.jumpSkill;

  // jump: spike on the closing touch, or block at the net
  if (self.onGround && ball.y < FLOOR_Y - 120) {
    const spikeJump =
      attacking && self.aiWantJump && nearNet && distX < REACH * 1.5 && ballHigh && ball.vy > -140;
    if (spikeJump || doBlock) intent.jump = true;
  }

  // hit: primary/nearest players play the ball; front players may also block
  const allowHit = o.primary || o.nearest || self.role === 2;
  const canReach = distX < (self.onGround ? REACH : SPIKE_REACH) * 1.1;
  if (self.canHit() && canReach && allowHit) {
    if (self.onGround) {
      if (ball.y > NET_TOP - 30 && ball.y < FLOOR_Y - 6 && ball.vy > -80) intent.hit = true;
    } else {
      const handClose = ball.y < self.y - 40 && ball.y > self.bodyCenterY - 140;
      const wellTimed = self.airborneApex || rand() < o.diff.jumpSkill * dt * 60;
      if (handClose && (wellTimed || ball.vy > 40)) intent.hit = true;
      intent.hitHeld = doBlock;
    }
  }

  return intent;
}
