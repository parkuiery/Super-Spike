import { Ball } from "./ball";
import { Fighter, type Intent } from "./fighter";
import { aiIntent } from "./ai";
import { Effects } from "./effects";
import { Particles } from "../engine/particles";
import { audio } from "../engine/audio";
import {
  FLOOR_Y,
  NET_X,
  NET_TOP,
  CHAR_H,
  REACH,
  SPIKE_REACH,
  PERFECT_WINDOW,
  JUMP_VELOCITY,
  CHAR_GRAVITY,
  WALL_L,
  WALL_R,
  TEAM_SIZE,
  homeX,
  POINTS_TO_WIN_SET,
  SETS_TO_WIN_MATCH,
  WIN_BY_TWO,
  PLAYER_PALETTE,
  type Palette,
  type Difficulty,
  type Side,
} from "./config";
import { clamp, randRange, sign } from "../engine/math";

export type Phase = "ready" | "serve" | "rally" | "point" | "setover" | "matchover";

const APEX_TIME = JUMP_VELOCITY / CHAR_GRAVITY;
const IDLE: Intent = { moveX: 0, jump: false, hit: false, hitHeld: false };

// Your two off-ball teammates are competent regardless of chosen difficulty.
const TEAMMATE_DIFF: Difficulty = {
  key: "NORMAL",
  label: "",
  reaction: 0.12,
  speedMul: 1.0,
  errorPx: 34,
  jumpSkill: 0.72,
  aggression: 0.5,
};

const PLAYER_NUMBERS = [4, 7, 10];
const AI_NUMBERS = [9, 11, 3];

export class World {
  ball = new Ball();
  playerTeam: Fighter[] = [];
  aiTeam: Fighter[] = [];
  controlledIndex = 0;
  effects = new Effects();
  particles = new Particles();

  points: [number, number] = [0, 0]; // [player, ai] in current set
  sets: [number, number] = [0, 0];
  phase: Phase = "ready";
  private phaseTimer = 0;
  server: Side = -1;
  lastScorer: Side | null = null;
  matchWinner: Side | null = null;
  rallyCrossings = 0;
  longestRally = 0;
  banner = "";

  private ballSideSign = -1;
  private touchSide: Side | null = null;
  private touches = 0;
  private aiPalette: Palette;

  constructor(
    private difficulty: Difficulty,
    aiPalette: Palette,
  ) {
    this.aiPalette = aiPalette;
    for (let i = 0; i < TEAM_SIZE; i++) {
      this.playerTeam.push(new Fighter(-1, PLAYER_PALETTE, homeX(-1, i), i, PLAYER_NUMBERS[i]));
      this.aiTeam.push(new Fighter(1, aiPalette, homeX(1, i), i, AI_NUMBERS[i]));
    }
  }

  get activeFighter(): Fighter {
    return this.playerTeam[this.controlledIndex];
  }
  private allFighters(): Fighter[] {
    return [...this.playerTeam, ...this.aiTeam];
  }

  startMatch() {
    this.points = [0, 0];
    this.sets = [0, 0];
    this.matchWinner = null;
    this.lastScorer = null;
    this.server = -1;
    this.startServe(-1, true);
  }

  private startServe(server: Side, immediate = false) {
    this.server = server;
    this.phase = immediate ? "serve" : "ready";
    this.phaseTimer = immediate ? 0 : 0.7;
    this.banner = immediate ? "" : "READY";
    this.touchSide = null;
    this.touches = 0;
    for (let i = 0; i < TEAM_SIZE; i++) {
      this.playerTeam[i].reset(homeX(-1, i));
      this.aiTeam[i].reset(homeX(1, i));
    }
    // controller starts on the server (back player) or mid when receiving
    this.controlledIndex = server === -1 ? 0 : 1;
    if (immediate) this.tossServe();
  }

  private tossServe() {
    const team = this.server === -1 ? this.playerTeam : this.aiTeam;
    const srv = team[0];
    this.ball.reset(srv.x, 210);
    this.ball.setVelocity(0, 0);
    this.ballSideSign = this.server;
    audio.play("whistle");
  }

  private sideIndex(s: Side): 0 | 1 {
    return s === -1 ? 0 : 1;
  }
  private touchesForSide(s: Side): number {
    return this.touchSide === s ? this.touches : 0;
  }

  // ---------------------------------------------------------------- update
  update(realDt: number, playerIntent: Intent) {
    this.effects.updateVisual(realDt);
    const scale = this.effects.timeScale(realDt);
    const dt = realDt * scale;
    this.particles.update(dt);

    switch (this.phase) {
      case "ready":
        this.phaseTimer -= realDt;
        for (const f of this.allFighters()) f.update(dt, IDLE);
        if (this.phaseTimer <= 0) {
          this.phase = "serve";
          this.banner = "";
          this.tossServe();
        }
        break;
      case "serve":
      case "rally":
        this.simulate(dt, playerIntent);
        break;
      case "point":
        this.phaseTimer -= realDt;
        for (const f of this.allFighters()) f.update(dt, IDLE);
        this.ball.update(dt);
        if (this.phaseTimer <= 0) this.startServe(this.lastScorer ?? -1);
        break;
      case "setover":
        this.phaseTimer -= realDt;
        for (const f of this.allFighters()) f.update(dt, IDLE);
        if (this.phaseTimer <= 0) {
          this.points = [0, 0];
          this.startServe(this.lastScorer ?? -1);
        }
        break;
      case "matchover":
        this.phaseTimer -= realDt;
        for (const f of this.allFighters()) f.update(dt, IDLE);
        this.ball.update(dt);
        break;
    }
  }

  private nearestIndex(team: Fighter[]): number {
    let idx = 0;
    let min = Infinity;
    for (let i = 0; i < team.length; i++) {
      const d = Math.abs(this.ball.x - team[i].x);
      if (d < min) {
        min = d;
        idx = i;
      }
    }
    return idx;
  }

  private selectControlled() {
    if (this.phase === "serve") {
      if (this.server === -1) this.controlledIndex = 0;
      return;
    }
    const active = this.playerTeam[this.controlledIndex];
    // lock switching mid-jump / mid-swing so a spike isn't hijacked
    if (!active.onGround || active.swing > 0.3) return;

    const towardUs = this.ball.x < NET_X || this.ball.vx < -20;
    const targetX = towardUs
      ? clamp(this.ball.predictLandingX(FLOOR_Y - 40), WALL_L, NET_X)
      : this.ball.x;

    let minIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < TEAM_SIZE; i++) {
      const d = Math.abs(targetX - this.playerTeam[i].x);
      if (d < minD) {
        minD = d;
        minIdx = i;
      }
    }
    const curD = Math.abs(targetX - active.x);
    if (minIdx !== this.controlledIndex && minD + 36 < curD) {
      this.controlledIndex = minIdx;
    }
  }

  private aiPrimaryIndex(serving: boolean, aNearest: number): number {
    if (serving && this.server === 1) return 0;
    const onAiSide = this.ball.x > NET_X;
    const heading = this.ball.vx > 20;
    if (this.ball.active && (onAiSide || heading)) return aNearest;
    return -1;
  }

  private simulate(dt: number, playerIntent: Intent) {
    const serving = this.phase === "serve";
    this.selectControlled();

    const pNearest = this.nearestIndex(this.playerTeam);
    const aNearest = this.nearestIndex(this.aiTeam);
    const aiPrimary = this.aiPrimaryIndex(serving, aNearest);
    const pTouches = this.touchesForSide(-1);
    const aTouches = this.touchesForSide(1);

    // player team
    for (let i = 0; i < TEAM_SIZE; i++) {
      const f = this.playerTeam[i];
      if (i === this.controlledIndex) {
        f.update(dt, playerIntent);
      } else {
        f.update(
          dt,
          aiIntent(dt, this.ball, f, {
            primary: false,
            nearest: i === pNearest,
            serving: false,
            diff: TEAMMATE_DIFF,
            touches: pTouches,
          }),
        );
      }
    }
    // ai team
    for (let i = 0; i < TEAM_SIZE; i++) {
      const f = this.aiTeam[i];
      f.update(
        dt,
        aiIntent(dt, this.ball, f, {
          primary: i === aiPrimary,
          nearest: i === aNearest,
          serving: serving && this.server === 1,
          diff: this.difficulty,
          touches: aTouches,
        }),
      );
    }

    // hit resolution
    for (const f of this.allFighters()) this.tryHit(f);

    // ball step
    const events = this.ball.update(dt);
    for (const e of events) this.handleBallEvent(e);

    // net crossing → new possession for the receiving side
    if (this.ball.live) {
      const s = sign(this.ball.x - NET_X);
      if (s !== 0 && s !== this.ballSideSign) {
        this.ballSideSign = s;
        this.touchSide = null;
        this.touches = 0;
        this.rallyCrossings++;
        this.longestRally = Math.max(this.longestRally, this.rallyCrossings);
      }
    }

    // serve safety: missed toss re-tosses (no penalty)
    if (this.phase === "serve" && !this.ball.live && this.ball.y >= FLOOR_Y - 20) {
      this.tossServe();
    }
  }

  private handleBallEvent(e: ReturnType<Ball["update"]>[number]) {
    switch (e.type) {
      case "wall":
        audio.play("bounce");
        this.particles.burst(this.ball.x, this.ball.y, 5, {
          color: "#9fb4ff",
          speed: [40, 120],
          life: [0.2, 0.4],
        });
        break;
      case "net":
        audio.play("bounce");
        this.particles.burst(NET_X, this.ball.y, 6, { color: "#ffffff", speed: [50, 140], life: [0.2, 0.45] });
        this.effects.shake(4, 0.15);
        break;
      case "nettop":
        audio.play("bounce");
        break;
      case "floor":
        if (this.phase === "rally" && this.ball.live) {
          this.scorePoint(e.side, e.x);
        } else {
          audio.play("bounce");
          if (this.ball.speed() > 120) {
            this.particles.burst(e.x, FLOOR_Y, 6, {
              color: "#c9a27a",
              speed: [60, 180],
              angle: -Math.PI / 2,
              spread: Math.PI * 0.7,
              life: [0.2, 0.5],
            });
          }
        }
        break;
    }
  }

  // ---------------------------------------------------------------- hitting
  private canReach(f: Fighter): boolean {
    const dxAbs = Math.abs(this.ball.x - f.x);
    const reach = f.onGround ? REACH : SPIKE_REACH;
    if (dxAbs > reach) return false;
    const top = f.y - CHAR_H * (f.onGround ? 1.35 : 1.7);
    const bottom = f.y + 10;
    if (this.ball.y < top || this.ball.y > bottom) return false;
    if (f.side === -1) return this.ball.x < NET_X + 30;
    return this.ball.x > NET_X - 30;
  }

  private tryHit(f: Fighter) {
    if (!f.wantHit || !f.canHit()) return;
    if (!this.ball.active) return;
    if (!this.canReach(f)) return;
    this.resolveHit(f);
  }

  private resolveHit(f: Fighter) {
    const opponentDir = (-f.side) as Side;
    const nearNet = Math.abs(f.x - NET_X) < 190;
    const ballHigh = this.ball.y < NET_TOP + 20;
    const rallyBoost = 1 + Math.min(this.rallyCrossings * 0.02, 0.28);
    const aimForward = clamp(f.aimX * opponentDir, -1, 1);
    const aim = clamp(1 + 0.45 * aimForward, 0.55, 1.55);

    const sideTouches = this.touchSide === f.side ? this.touches : 0;
    const serveHit = !this.ball.live;
    const mustGoOver = serveHit || sideTouches >= 2; // closing touch (or serve) crosses

    const comingOver = sign(this.ball.vx) === f.side && Math.abs(this.ball.x - NET_X) < 60;
    const isBlock = !f.onGround && nearNet && f.holdHit && comingOver;
    const isSpike = !f.onGround && nearNet && ballHigh;

    let kind: Fighter["lastHitKind"] = "bump";
    let vx = 0;
    let vy = 0;
    let perfect = false;

    if (serveHit) {
      // Dedicated serve: a strong high arc that clears the net from the back
      // court and lands in the opponent's half (volleyball serve rules).
      kind = "serve";
      vx = opponentDir * randRange(430, 500);
      vy = -randRange(820, 890);
    } else if (isBlock) {
      kind = "block";
      vx = opponentDir * randRange(480, 660) * rallyBoost;
      vy = randRange(360, 520);
    } else if (isSpike) {
      kind = "spike";
      perfect = Math.abs(f.jumpTime - APEX_TIME) < PERFECT_WINDOW || f.airborneApex;
      const power = (perfect ? 1.18 : 0.95) * rallyBoost;
      vx = opponentDir * randRange(840, 1000) * power;
      vy = randRange(330, 460) * (perfect ? 1.05 : 1);
    } else if (mustGoOver) {
      kind = "attack";
      vx = opponentDir * randRange(430, 560) * aim * rallyBoost;
      vy = -randRange(250, 350);
    } else {
      // receive / set — pop up on OWN side toward the net so a teammate can attack
      kind = sideTouches >= 1 ? "set" : "bump";
      const setX = f.side === -1 ? NET_X - 120 : NET_X + 120;
      const dir = sign(setX - this.ball.x) || opponentDir;
      const nearOwnNet = f.side === -1 ? this.ball.x > NET_X - 150 : this.ball.x < NET_X + 150;
      const drift = nearOwnNet ? randRange(40, 120) : randRange(140, 240);
      vx = dir * drift * aim;
      vy = -randRange(720, 840);
    }

    // nudge out of the body so it doesn't immediately re-collide
    this.ball.x += sign(vx) * 6;
    this.ball.y -= 2;
    this.ball.setVelocity(vx, vy);
    this.ball.lastHitBy = f.side;
    f.lastHitKind = serveHit ? "serve" : kind;
    f.triggerSwing(opponentDir);

    // possession / touch tracking
    if (!this.ball.live) {
      this.ball.live = true;
      this.phase = "rally";
      this.touchSide = f.side;
      this.touches = 1;
      this.ballSideSign = sign(this.ball.x - NET_X) || f.side;
    } else {
      if (this.touchSide === f.side) this.touches++;
      else {
        this.touchSide = f.side;
        this.touches = 1;
      }
      if (this.touches > 3) {
        this.effects.popup("OVER 3!", f.x, FLOOR_Y - 200, "#ff6b6b");
        this.scorePoint(f.side, f.x, true);
        return;
      }
    }

    this.spawnHitFx(f.lastHitKind, perfect);
  }

  private spawnHitFx(kind: Fighter["lastHitKind"], perfect: boolean) {
    const hx = this.ball.x;
    const hy = this.ball.y;
    switch (kind) {
      case "spike": {
        this.ball.hot = 0.9;
        audio.play("spike", perfect ? 1.2 : 1);
        this.effects.shake(perfect ? 18 : 12, 0.35);
        this.effects.freeze(perfect ? 0.07 : 0.04);
        this.effects.flash(perfect ? "#fff2b0" : "#ffffff", perfect ? 0.5 : 0.28);
        if (perfect) {
          this.effects.slow(0.16, 0.32);
          audio.play("perfect");
          this.effects.popup("PERFECT!", hx, hy - 60, "#ffe14d", true);
        } else {
          this.effects.popup("SPIKE!", hx, hy - 50, "#ff5252");
        }
        this.particles.burst(hx, hy, perfect ? 26 : 16, {
          color: perfect ? ["#ffe14d", "#fff", "#ff8a4d"] : ["#ffd24d", "#fff"],
          speed: [180, 460],
          size: [3, 7],
          life: [0.25, 0.6],
          shape: "spark",
          gravity: 200,
        });
        this.particles.burst(hx, hy, 1, { color: "#fff", shape: "ring", size: [8, 8], life: [0.4, 0.4] });
        break;
      }
      case "block":
        audio.play("block");
        this.effects.shake(14, 0.3);
        this.effects.freeze(0.05);
        this.effects.popup("BLOCK!", hx, hy - 50, "#6fd3ff");
        this.particles.burst(hx, hy, 14, { color: ["#6fd3ff", "#fff"], speed: [150, 360], shape: "spark", life: [0.2, 0.5] });
        break;
      case "set":
        audio.play("set");
        this.particles.burst(hx, hy, 6, { color: "#cfe0ff", speed: [70, 180], life: [0.2, 0.4] });
        break;
      case "attack":
        audio.play("set");
        this.particles.burst(hx, hy, 7, { color: "#cfe0ff", speed: [90, 220], life: [0.2, 0.45] });
        break;
      case "serve":
        audio.play("bump");
        this.particles.burst(hx, hy, 8, { color: "#fff", speed: [80, 220], life: [0.2, 0.45] });
        break;
      default:
        audio.play("bump");
        this.particles.burst(hx, hy, 7, { color: "#eaf1ff", speed: [70, 190], life: [0.2, 0.4] });
    }
  }

  // ---------------------------------------------------------------- scoring
  private scorePoint(floorSide: Side, x: number, _fault = false) {
    if (this.phase !== "rally") return;
    const winner = (-floorSide) as Side;
    this.lastScorer = winner;
    this.points[this.sideIndex(winner)]++;

    audio.play("whistle");
    window.setTimeout(() => audio.play("point"), 120);
    this.effects.shake(8, 0.3);
    this.ball.live = false;

    this.particles.burst(x, FLOOR_Y, 16, {
      color: "#d8b487",
      speed: [80, 260],
      angle: -Math.PI / 2,
      spread: Math.PI * 0.9,
      life: [0.3, 0.7],
      gravity: 500,
    });

    const wteam = winner === -1 ? this.playerTeam : this.aiTeam;
    const lteam = winner === -1 ? this.aiTeam : this.playerTeam;
    for (const f of wteam) f.celebrate = 1.4;
    for (const f of lteam) f.stunned = 0.5;

    const px = winner === -1 ? WALL_L + 180 : WALL_R - 180;
    this.effects.popup(winner === -1 ? "POINT!" : "LOST!", px, 220, winner === -1 ? "#7dffa8" : "#ff8a8a", true);
    if (winner === -1) audio.play("cheer");

    const pp = this.points[0];
    const ap = this.points[1];
    const setWon =
      (pp >= POINTS_TO_WIN_SET || ap >= POINTS_TO_WIN_SET) && (!WIN_BY_TWO || Math.abs(pp - ap) >= 2);

    if (setWon) {
      const setWinner: Side = pp > ap ? -1 : 1;
      this.sets[this.sideIndex(setWinner)]++;
      if (this.sets[this.sideIndex(setWinner)] >= SETS_TO_WIN_MATCH) {
        this.matchWinner = setWinner;
        this.phase = "matchover";
        this.phaseTimer = 999;
        this.banner = setWinner === -1 ? "YOU WIN!" : "YOU LOSE";
        audio.play(setWinner === -1 ? "cheer" : "buzzer");
        return;
      }
      this.phase = "setover";
      this.phaseTimer = 2.2;
      this.banner = `SET ${this.sets[0] + this.sets[1]} — ${setWinner === -1 ? "YOU" : this.aiPalette.name}`;
      return;
    }

    this.phase = "point";
    this.phaseTimer = 1.1;
    this.rallyCrossings = 0;
  }

  // ---------------------------------------------------------------- helpers
  setDifficulty(d: Difficulty) {
    this.difficulty = d;
  }

  /** Perfect-spike timing hint for the HUD ring (0..1 how close to apex). */
  spikeTiming(): number | null {
    const f = this.activeFighter;
    if (f.onGround) return null;
    return 1 - clamp(Math.abs(f.jumpTime - APEX_TIME) / 0.25, 0, 1);
  }

  get difficultyRef() {
    return this.difficulty;
  }
  get aiName() {
    return this.aiPalette.name;
  }
}
