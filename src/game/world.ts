import { Ball } from "./ball";
import { Fighter, type Intent } from "./fighter";
import { aiIntent } from "./ai";
import { Effects } from "./effects";
import { Particles } from "../engine/particles";
import { audio } from "../engine/audio";
import { project } from "./camera";
import {
  COURT_W,
  COURT_L,
  NET_Z,
  NET_H,
  REACH_XZ,
  REACH_Y,
  SPIKE_REACH_Y,
  PERFECT_WINDOW,
  JUMP_V,
  CHAR_GRAVITY,
  GRAVITY,
  SPIKE_POWER,
  TEAM_SIZE,
  homePos,
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

const APEX_TIME = JUMP_V / CHAR_GRAVITY;
const IDLE: Intent = { moveX: 0, moveZ: 0, jump: false, hit: false, hitHeld: false };

const TEAMMATE_DIFF: Difficulty = {
  key: "NORMAL",
  label: "",
  reaction: 0.13,
  speedMul: 1.0,
  errorXZ: 18,
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

  points: [number, number] = [0, 0];
  sets: [number, number] = [0, 0];
  phase: Phase = "ready";
  private phaseTimer = 0;
  server: Side = -1;
  lastScorer: Side | null = null;
  matchWinner: Side | null = null;
  rallyCrossings = 0;
  longestRally = 0;
  banner = "";

  private ballSideSign: Side = -1;
  private touchSide: Side | null = null;
  private touches = 0;
  private aiPalette: Palette;

  constructor(
    private difficulty: Difficulty,
    aiPalette: Palette,
  ) {
    this.aiPalette = aiPalette;
    for (let i = 0; i < TEAM_SIZE; i++) {
      this.playerTeam.push(new Fighter(-1, PLAYER_PALETTE, i, PLAYER_NUMBERS[i]));
      this.aiTeam.push(new Fighter(1, aiPalette, i, AI_NUMBERS[i]));
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
    for (const f of this.allFighters()) f.reset();
    this.controlledIndex = server === -1 ? 0 : 1;
    if (immediate) this.tossServe();
  }

  private tossServe() {
    const team = this.server === -1 ? this.playerTeam : this.aiTeam;
    const srv = team[0];
    // stand the server just inside the baseline
    const h = homePos(this.server, 0);
    srv.x = h.x;
    srv.z = this.server === -1 ? 26 : COURT_L - 26;
    this.ball.reset(srv.x, 130, srv.z);
    this.ballSideSign = this.server;
    audio.play("whistle");
  }

  private sideIndex(s: Side): 0 | 1 {
    return s === -1 ? 0 : 1;
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

  private nearestIndex(team: Fighter[], tx: number, tz: number): number {
    let idx = 0;
    let min = Infinity;
    for (let i = 0; i < team.length; i++) {
      const d = Math.hypot(tx - team[i].x, tz - team[i].z);
      if (d < min) {
        min = d;
        idx = i;
      }
    }
    return idx;
  }

  private selectControlled() {
    if (this.phase === "serve" && this.server === -1) {
      this.controlledIndex = 0;
      return;
    }
    const active = this.playerTeam[this.controlledIndex];
    if (!active.onGround || active.swing > 0.3) return;

    const towardUs = this.ball.z < NET_Z || this.ball.vz < -20;
    let tx = this.ball.x;
    let tz = this.ball.z;
    if (towardUs) {
      const l = this.ball.predictLanding();
      tx = l.x;
      tz = clamp(l.z, 8, NET_Z - 10);
    }
    let minIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < TEAM_SIZE; i++) {
      const d = Math.hypot(tx - this.playerTeam[i].x, tz - this.playerTeam[i].z);
      if (d < minD) {
        minD = d;
        minIdx = i;
      }
    }
    const curD = Math.hypot(tx - active.x, tz - active.z);
    if (minIdx !== this.controlledIndex && minD + 26 < curD) this.controlledIndex = minIdx;
  }

  private aiPrimaryIndex(serving: boolean, aNearest: number): number {
    if (serving && this.server === 1) return 0;
    const onAiSide = this.ball.z > NET_Z;
    const heading = this.ball.vz > 20;
    if (this.ball.active && (onAiSide || heading)) return aNearest;
    return -1;
  }

  private simulate(dt: number, playerIntent: Intent) {
    const serving = this.phase === "serve";
    this.selectControlled();

    const pNearest = this.nearestIndex(this.playerTeam, this.ball.x, this.ball.z);
    const aNearest = this.nearestIndex(this.aiTeam, this.ball.x, this.ball.z);
    const aiPrimary = this.aiPrimaryIndex(serving, aNearest);
    const pTouches = this.touchSide === -1 ? this.touches : 0;
    const aTouches = this.touchSide === 1 ? this.touches : 0;

    for (let i = 0; i < TEAM_SIZE; i++) {
      const f = this.playerTeam[i];
      if (i === this.controlledIndex) f.update(dt, playerIntent);
      else
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

    for (const f of this.allFighters()) this.tryHit(f);

    const events = this.ball.update(dt);
    for (const e of events) this.handleBallEvent(e);

    if (this.ball.live) {
      const s = sign(this.ball.z - NET_Z);
      if (s !== 0 && s !== this.ballSideSign) {
        this.ballSideSign = s as Side;
        this.touchSide = null;
        this.touches = 0;
        this.rallyCrossings++;
        this.longestRally = Math.max(this.longestRally, this.rallyCrossings);
      }
    }

    if (this.phase === "serve" && !this.ball.live && this.ball.y <= 0) this.tossServe();
  }

  private handleBallEvent(e: ReturnType<Ball["update"]>[number]) {
    switch (e.type) {
      case "net": {
        audio.play("bounce");
        const pr = project(this.ball.x, this.ball.y, NET_Z);
        this.particles.burst(pr.sx, pr.sy, 6, { color: "#ffffff", speed: [50, 140], life: [0.2, 0.45] });
        this.effects.shake(4, 0.15);
        break;
      }
      case "nettop":
        audio.play("bounce");
        break;
      case "floor":
        if (this.phase === "rally" && this.ball.live) {
          this.scorePoint(e.side, e.inBounds, e.x, e.z);
        } else {
          audio.play("bounce");
        }
        break;
    }
  }

  // ---------------------------------------------------------------- hitting
  private canReach(f: Fighter): boolean {
    const distXZ = Math.hypot(this.ball.x - f.x, this.ball.z - f.z);
    if (distXZ > REACH_XZ) return false;
    const reachY = f.onGround ? REACH_Y : SPIKE_REACH_Y;
    if (this.ball.y < f.y - 6 || this.ball.y > f.y + reachY + 14) return false;
    // stay on own side (small margin over the net for blocks)
    if (f.side === -1) return this.ball.z < NET_Z + 24;
    return this.ball.z > NET_Z - 24;
  }

  private tryHit(f: Fighter) {
    if (!f.wantHit || !f.canHit() || !this.ball.active) return;
    if (!this.canReach(f)) return;
    this.resolveHit(f);
  }

  private solveTo(tx: number, tz: number, T: number): { vx: number; vy: number; vz: number } {
    const vx = (tx - this.ball.x) / T;
    const vz = (tz - this.ball.z) / T;
    const vy = (0.5 * GRAVITY * T * T - this.ball.y) / T; // land at y=0 after time T
    return { vx, vy, vz };
  }

  private resolveHit(f: Fighter) {
    const dirNet = (-f.side) as Side; // +z toward opponent
    const nearNet = Math.abs(f.z - NET_Z) < 150;
    const ballHigh = this.ball.y > NET_H - 12;
    const rallyBoost = 1 + Math.min(this.rallyCrossings * 0.02, 0.28);
    const aimX = clamp(f.aimX, -1, 1);

    const sideTouches = this.touchSide === f.side ? this.touches : 0;
    const serveHit = !this.ball.live;
    const mustGoOver = serveHit || sideTouches >= 2;

    const comingOver = sign(this.ball.vz) === dirNet && Math.abs(this.ball.z - NET_Z) < 60;
    const isBlock = !f.onGround && nearNet && f.holdHit && comingOver;
    const isSpike = !f.onGround && nearNet && ballHigh;

    let kind: Fighter["lastHitKind"] = "bump";
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let perfect = false;

    const farCourtZ = () => NET_Z + dirNet * randRange(120, 260); // deep in opponent court

    if (serveHit) {
      kind = "serve";
      const tx = clamp(f.x + aimX * 90, 40, COURT_W - 40);
      const tz = NET_Z + dirNet * randRange(150, 240);
      ({ vx, vy, vz } = this.solveTo(tx, tz, 1.3));
    } else if (isBlock) {
      kind = "block";
      vz = dirNet * randRange(280, 420) * rallyBoost;
      vy = -randRange(150, 240);
      vx = aimX * 120;
    } else if (isSpike) {
      kind = "spike";
      perfect = Math.abs(f.jumpTime - APEX_TIME) < PERFECT_WINDOW || f.airborneApex;
      const power = (perfect ? 1.2 : 0.95) * rallyBoost;
      vz = dirNet * SPIKE_POWER * power;
      vy = -randRange(90, 200) * (perfect ? 1.1 : 1);
      vx = aimX * 160;
    } else if (mustGoOver) {
      kind = "attack";
      const tx = clamp(f.x + aimX * 110, 40, COURT_W - 40);
      ({ vx, vy, vz } = this.solveTo(tx, farCourtZ(), 1.0));
      vx *= rallyBoost;
      vz *= rallyBoost;
    } else {
      // receive / set — pop up on OWN side toward the net for a teammate
      kind = sideTouches >= 1 ? "set" : "bump";
      const tx = clamp(f.x + aimX * 70, 40, COURT_W - 40);
      const tz = NET_Z - dirNet * randRange(50, 100); // just in front of the net, our side
      ({ vx, vy, vz } = this.solveTo(tx, tz, 0.82));
    }

    // nudge out of the body a touch
    this.ball.z += dirNet * 4;
    this.ball.y += 3;
    this.ball.setVelocity(vx, vy, vz);
    this.ball.lastHitBy = f.side;
    f.lastHitKind = serveHit ? "serve" : kind;
    f.triggerSwing(dirNet);

    if (!this.ball.live) {
      this.ball.live = true;
      this.phase = "rally";
      this.touchSide = f.side;
      this.touches = 1;
      this.ballSideSign = (sign(this.ball.z - NET_Z) || f.side) as Side;
    } else {
      if (this.touchSide === f.side) this.touches++;
      else {
        this.touchSide = f.side;
        this.touches = 1;
      }
      if (this.touches > 3) {
        const pr = project(f.x, f.y + 70, f.z);
        this.effects.popup("OVER 3!", pr.sx, pr.sy, "#ff6b6b");
        this.scorePoint(f.side, true, f.x, f.z);
        return;
      }
    }

    this.spawnHitFx(f, f.lastHitKind, perfect);
  }

  private spawnHitFx(f: Fighter, kind: Fighter["lastHitKind"], perfect: boolean) {
    const pr = project(this.ball.x, this.ball.y, this.ball.z);
    const hx = pr.sx;
    const hy = pr.sy;
    switch (kind) {
      case "spike": {
        this.ball.hot = perfect ? 1.2 : 0.9;
        audio.play("spike", perfect ? 1.2 : 1);
        this.effects.shake(perfect ? 20 : 13, 0.35);
        this.effects.freeze(perfect ? 0.08 : 0.045);
        this.effects.flash(perfect ? "#fff2b0" : "#ffffff", perfect ? 0.55 : 0.3);
        this.effects.shockwave(hx, hy, perfect ? "#ffe14d" : "#ffd24d", perfect ? 200 : 150, perfect ? 10 : 6);
        this.effects.punch(perfect ? 1.12 : 1.06, hx, hy);
        this.effects.speedLines(perfect ? 0.3 : 0.18, hx, hy, perfect ? "#fff2b0" : "#ffffff");
        if (perfect) {
          this.effects.slow(0.16, 0.32);
          audio.play("perfect");
          this.effects.popup("PERFECT!", hx, hy - 40, "#ffe14d", true);
        } else {
          this.effects.popup("SPIKE!", hx, hy - 30, "#ff5252");
        }
        this.particles.burst(hx, hy, perfect ? 26 : 16, {
          color: perfect ? ["#ffe14d", "#fff", "#ff8a4d"] : ["#ffd24d", "#fff"],
          speed: [180, 460],
          size: [3, 7],
          life: [0.25, 0.6],
          shape: "spark",
          gravity: 200,
        });
        break;
      }
      case "block":
        audio.play("block");
        this.effects.shake(15, 0.3);
        this.effects.freeze(0.06);
        this.effects.flash("#bfefff", 0.22);
        this.effects.shockwave(hx, hy, "#6fd3ff", 140, 7);
        this.effects.popup("BLOCK!", hx, hy - 30, "#6fd3ff");
        this.particles.burst(hx, hy, 16, { color: ["#6fd3ff", "#fff"], speed: [150, 380], shape: "spark", life: [0.2, 0.5] });
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
    void f;
  }

  // ---------------------------------------------------------------- scoring
  private scorePoint(floorSide: Side, inBounds: boolean, x: number, z: number) {
    if (this.phase !== "rally") return;
    let winner: Side;
    if (inBounds) winner = (-floorSide) as Side;
    else winner = (this.ball.lastHitBy ? -this.ball.lastHitBy : -floorSide) as Side;

    this.lastScorer = winner;
    this.points[this.sideIndex(winner)]++;

    audio.play("whistle");
    window.setTimeout(() => audio.play("point"), 120);
    this.effects.shake(8, 0.3);
    this.ball.live = false;

    const pr = project(x, 0, z);
    this.particles.burst(pr.sx, pr.sy, 16, {
      color: inBounds ? "#d8b487" : "#ff6b6b",
      speed: [80, 240],
      angle: -Math.PI / 2,
      spread: Math.PI * 0.9,
      life: [0.3, 0.7],
      gravity: 500,
    });

    const wteam = winner === -1 ? this.playerTeam : this.aiTeam;
    const lteam = winner === -1 ? this.aiTeam : this.playerTeam;
    for (const f of wteam) f.celebrate = 1.4;
    for (const f of lteam) f.stunned = 0.5;

    this.effects.popup(winner === -1 ? "POINT!" : "LOST!", 480, 210, winner === -1 ? "#7dffa8" : "#ff8a8a", true);
    if (!inBounds) this.effects.popup("OUT!", pr.sx, pr.sy - 20, "#ff6b6b");
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
