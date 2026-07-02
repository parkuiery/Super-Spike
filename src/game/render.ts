import { World } from "./world";
import { Fighter } from "./fighter";
import { Ball } from "./ball";
import { project } from "./camera";
import {
  VIEW_W,
  VIEW_H,
  COURT_W,
  COURT_L,
  NET_Z,
  NET_H,
  CHAR_HEIGHT,
  BALL_R,
  MOVE_SPEED,
  POINTS_TO_WIN_SET,
  SETS_TO_WIN_MATCH,
  type Palette,
} from "./config";
import { clamp, lerp } from "../engine/math";

const CHAR_K = 0.9; // world-height to screen scale for character billboards
const ATTACK = 130; // attack-line distance from the net (world z)

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Smoothed limb/body pose so animation transitions blend instead of snapping. */
interface Pose {
  flX: number;
  flY: number;
  blX: number;
  blY: number;
  hNx: number;
  hNy: number;
  hFx: number;
  hFy: number;
  lower: number;
  lean: number;
}

export class Renderer {
  private t = 0;
  // smoothed animation pose per fighter, so state changes blend instead of snapping
  private anims = new WeakMap<Fighter, Pose>();
  constructor(private ctx: CanvasRenderingContext2D) {}

  drawScene(world: World, realDt: number) {
    this.t += realDt;
    const ctx = this.ctx;

    this.drawArena();

    // ground shadows for everything
    for (const f of world.playerTeam) this.drawShadow(f.x, f.z, f.y, 22);
    for (const f of world.aiTeam) this.drawShadow(f.x, f.z, f.y, 22);
    this.drawShadow(world.ball.x, world.ball.z, world.ball.y, BALL_R);
    this.drawActiveMarker(world.activeFighter);

    // depth-sorted draw list (players + ball + net), far first (larger x = farther)
    type Item = { d: number; draw: () => void };
    const items: Item[] = [];
    for (const f of world.playerTeam) items.push({ d: f.x, draw: () => this.drawFighter(f, world.ball, realDt) });
    for (const f of world.aiTeam) items.push({ d: f.x, draw: () => this.drawFighter(f, world.ball, realDt) });
    items.push({ d: world.ball.x, draw: () => this.drawBall(world.ball) });
    items.push({ d: COURT_W / 2, draw: () => this.drawNet() });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.draw();

    world.particles.render(ctx);
    world.effects.renderShockwaves(ctx);
    this.drawTimingRing(world);
    if (world.phase === "serve" || world.phase === "ready") this.drawServeIndicator(world);
    world.effects.renderPopups(ctx);
  }

  drawOverlay(world: World) {
    this.drawHUD(world);
  }

  // ------------------------------------------------------------- arena
  private drawArena() {
    const ctx = this.ctx;
    // background
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, "#0f1630");
    g.addColorStop(0.5, "#17203f");
    g.addColorStop(1, "#0c1226");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // spotlights
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const x = 200 + i * 200;
      const sway = Math.sin(this.t * 0.6 + i) * 24;
      const lg = ctx.createLinearGradient(x, 0, x + sway, 340);
      lg.addColorStop(0, "rgba(150,180,255,0.16)");
      lg.addColorStop(1, "rgba(150,180,255,0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x - 14, 0);
      ctx.lineTo(x + 14, 0);
      ctx.lineTo(x + 150 + sway, 340);
      ctx.lineTo(x - 150 + sway, 340);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    this.drawStands();
    this.drawCourt();
  }

  private drawStands() {
    const ctx = this.ctx;
    const far = project(COURT_W, 0, COURT_L / 2).sy; // ~ top of court (far sideline)
    // stand backdrop
    ctx.fillStyle = "rgba(8,12,26,0.6)";
    ctx.fillRect(0, 30, VIEW_W, far - 20);
    const colors = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c77dff", "#ff9f45"];
    for (let row = 0; row < 4; row++) {
      const y = 46 + row * 26;
      if (y > far - 16) break;
      for (let x = 24; x < VIEW_W - 16; x += 22) {
        const wave = Math.max(0, Math.sin(this.t * 2.4 - x * 0.012)) ** 2;
        const bob = wave * 8 + Math.sin(this.t * 3 + x) * 1.2;
        ctx.fillStyle = colors[(x + row) % colors.length];
        ctx.globalAlpha = 0.5 - row * 0.08;
        ctx.beginPath();
        ctx.arc(x + (row % 2) * 10, y - bob, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private courtCorner(x: number, z: number) {
    const p = project(x, 0, z);
    return { x: p.sx, y: p.groundY };
  }

  private drawCourt() {
    const ctx = this.ctx;
    const nl = this.courtCorner(0, 0);
    const nr = this.courtCorner(COURT_W, 0);
    const fr = this.courtCorner(COURT_W, COURT_L);
    const fl = this.courtCorner(0, COURT_L);
    const topY = Math.min(nl.y, nr.y, fr.y, fl.y);
    const botY = Math.max(nl.y, nr.y, fr.y, fl.y);

    // court surface
    const cg = ctx.createLinearGradient(0, topY, 0, botY);
    cg.addColorStop(0, "#2f6fb0");
    cg.addColorStop(1, "#3f86c9");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(nl.x, nl.y);
    ctx.lineTo(nr.x, nr.y);
    ctx.lineTo(fr.x, fr.y);
    ctx.lineTo(fl.x, fl.y);
    ctx.closePath();
    ctx.fill();
    // surround (out area) subtle
    ctx.strokeStyle = "rgba(20,40,70,0.6)";
    ctx.lineWidth = 6;
    ctx.stroke();

    // glossy sheen from spotlights
    ctx.save();
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const x = 200 + i * 200;
      const sway = Math.sin(this.t * 0.6 + i) * 24;
      const sg = ctx.createLinearGradient(x + sway, topY, x + sway, botY);
      sg.addColorStop(0, "rgba(200,225,255,0.10)");
      sg.addColorStop(1, "rgba(200,225,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(x - 90 + sway, topY, 180, botY - topY);
    }
    ctx.restore();

    // lines
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nl.x, nl.y);
    ctx.lineTo(nr.x, nr.y);
    ctx.lineTo(fr.x, fr.y);
    ctx.lineTo(fl.x, fl.y);
    ctx.closePath();
    ctx.stroke();
    // net line + attack lines
    for (const [z, w] of [
      [NET_Z, 3],
      [NET_Z - ATTACK, 2],
      [NET_Z + ATTACK, 2],
    ] as const) {
      const a = this.courtCorner(0, z);
      const b = this.courtCorner(COURT_W, z);
      ctx.lineWidth = w;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------- net
  private drawNet() {
    const ctx = this.ctx;
    const bl = project(0, 0, NET_Z);
    const br = project(COURT_W, 0, NET_Z);
    const tl = project(0, NET_H, NET_Z);
    const tr = project(COURT_W, NET_H, NET_Z);
    // posts
    ctx.strokeStyle = "#20263b";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bl.sx, bl.sy);
    ctx.lineTo(tl.sx, tl.sy);
    ctx.moveTo(br.sx, br.sy);
    ctx.lineTo(tr.sx, tr.sy);
    ctx.stroke();
    // mesh
    ctx.strokeStyle = "rgba(230,238,255,0.35)";
    ctx.lineWidth = 1;
    const cols = 30;
    for (let i = 0; i <= cols; i++) {
      const t = i / cols;
      const x0 = bl.sx + (br.sx - bl.sx) * t;
      const y0 = bl.sy + (br.sy - bl.sy) * t;
      const x1 = tl.sx + (tr.sx - tl.sx) * t;
      const y1 = tl.sy + (tr.sy - tl.sy) * t;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    for (let r = 0; r <= 5; r++) {
      const t = r / 5;
      const xl = bl.sx + (tl.sx - bl.sx) * t;
      const yl = bl.sy + (tl.sy - bl.sy) * t;
      const xr = br.sx + (tr.sx - br.sx) * t;
      const yr = br.sy + (tr.sy - br.sy) * t;
      ctx.beginPath();
      ctx.moveTo(xl, yl);
      ctx.lineTo(xr, yr);
      ctx.stroke();
    }
    // top tape
    ctx.strokeStyle = "#f4f8ff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tl.sx, tl.sy);
    ctx.lineTo(tr.sx, tr.sy);
    ctx.stroke();
  }

  // ------------------------------------------------------------- shadows/markers
  private drawShadow(x: number, z: number, y: number, r: number) {
    const ctx = this.ctx;
    const p = project(x, 0, z);
    const lift = clampN((200 - y) / 200, 0.35, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.3 * lift})`;
    ctx.beginPath();
    ctx.ellipse(p.sx, p.groundY, r * p.s * 0.55, r * p.s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawActiveMarker(f: Fighter) {
    const ctx = this.ctx;
    const p = project(f.x, 0, f.z);
    const pulse = 0.6 + Math.sin(this.t * 8) * 0.4;
    ctx.strokeStyle = `rgba(125,255,168,${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.sx, p.groundY, 26 * p.s, 12 * p.s, 0, 0, Math.PI * 2);
    ctx.stroke();
    const head = project(f.x, f.y + CHAR_HEIGHT + 18, f.z);
    const yy = head.sy - Math.abs(Math.sin(this.t * 6)) * 4;
    ctx.fillStyle = "#7dffa8";
    ctx.beginPath();
    ctx.moveTo(head.sx - 7, yy);
    ctx.lineTo(head.sx + 7, yy);
    ctx.lineTo(head.sx, yy + 10);
    ctx.closePath();
    ctx.fill();
  }

  // ------------------------------------------------------------- fighter
  private limb(x0: number, y0: number, x1: number, y1: number, bend: number, width: number, upper: string, lower: string) {
    const ctx = this.ctx;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const kx = mx + (-dy / len) * bend * len;
    const ky = my + (dx / len) * bend * len;
    ctx.lineCap = "round";
    ctx.strokeStyle = upper;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.strokeStyle = lower;
    ctx.lineWidth = width * 0.9;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  private drawShoe(x: number, y: number, face: number, color: string) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + face * 3, y - 1, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHair(p: Palette, hx: number, hy: number, face: number) {
    const ctx = this.ctx;
    ctx.fillStyle = p.hairShade;
    ctx.beginPath();
    ctx.arc(hx, hy - 2, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.arc(hx, hy - 3, 15.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(hx - 15.5, hy - 5, 31, 6);
    if (p.style === "spiky") {
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        const bx = hx + i * 7;
        ctx.moveTo(bx - 4, hy - 9);
        ctx.lineTo(bx + face * 3, hy - 24);
        ctx.lineTo(bx + 4, hy - 9);
      }
      ctx.fill();
    } else if (p.style === "ponytail") {
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 15.5, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx - face * 19, hy - 4, 8, 17, face * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.style === "swept") {
      ctx.beginPath();
      ctx.moveTo(hx - 15, hy - 3);
      ctx.quadraticCurveTo(hx + face * 20, hy - 18, hx + face * 17, hy + 5);
      ctx.quadraticCurveTo(hx + face * 4, hy - 4, hx - 15, hy - 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        const bx = hx + i * 4;
        ctx.moveTo(bx - 3, hy - 7);
        ctx.lineTo(bx, hy - 26 + Math.abs(i) * 3);
        ctx.lineTo(bx + 3, hy - 7);
      }
      ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath();
      ctx.arc(hx - 11, hy - 2, 5, 0, Math.PI * 2);
      ctx.arc(hx + 11, hy - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = p.hairLight;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hx + face * 4, hy - 4, 11, -Math.PI * 0.85, -Math.PI * 0.3);
    ctx.stroke();
  }

  private drawArm(sx: number, sy: number, hx: number, hy: number, bend: number, upper: string, lower: string, skin: string) {
    this.limb(sx, sy, hx, hy, bend, 8.5, upper, lower);
    const ctx = this.ctx;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFighter(f: Fighter, ball: Ball, realDt: number) {
    const ctx = this.ctx;
    const p = f.palette;
    const face = f.facing;
    const airborne = !f.onGround;
    const swing = f.swing;
    const kind = f.lastHitKind;
    const t = this.t + f.number * 1.7; // desync idle timing per player
    const breath = Math.sin(t * 2.0);
    const planar = Math.hypot(f.vx, f.vz);
    const moving = !airborne && planar > 28;
    const ballLive = ball.live && ball.active;
    const acting = swing > 0.06;
    const ready = !airborne && ballLive && !moving && !acting && f.celebrate <= 0 && f.stunned <= 0;
    const spiking = airborne && (swing > 0.05 || f.holdHit || kind === "spike" || kind === "attack");
    const ballDirZ = Math.sign(ball.z - f.z) || face;
    const spread = 9;

    // ================= TARGET pose (before smoothing) =================
    const tLower = ready ? 6 + breath * 1.2 : moving ? 3 : kind === "bump" && acting ? 5 : 0;
    const hipY = -40 + tLower;
    const shoulderY = -74 + tLower;
    const headY = -96 + tLower;

    // legs
    let tflX: number, tflY: number, tblX: number, tblY: number;
    if (airborne) {
      if (spiking) {
        tflX = spread + face * 8; tflY = hipY + 20;
        tblX = -spread; tblY = hipY + 32;
      } else {
        tflX = spread + face * 4; tflY = hipY + 30;
        tblX = -spread - face * 2; tblY = hipY + 38;
      }
    } else if (moving) {
      const s = Math.sin(f.legPhase);
      tflX = spread + s * 13; tflY = -Math.max(0, s) * 7;
      tblX = -spread - s * 13; tblY = -Math.max(0, -s) * 7;
    } else {
      const w = ready ? spread + 3 : spread;
      tflX = w; tflY = 0;
      tblX = -w; tblY = 0;
    }

    // arms
    const shN = 13 * face;
    const shF = -13 * face;
    let tHNx: number, tHNy: number, tHFx: number, tHFy: number;
    if (f.stunned > 0) {
      tHNx = shN + face * 2; tHNy = shoulderY + 42;
      tHFx = shF - face * 2; tHFy = shoulderY + 44;
    } else if (f.celebrate > 0) {
      const pump = Math.abs(Math.sin(this.t * 12)) * 10;
      tHNx = shN + face * 4; tHNy = headY - 16 - pump;
      tHFx = shF - face * 4; tHFy = headY - 16 - pump;
    } else if (airborne && (kind === "spike" || kind === "attack" || (spiking && !f.holdHit))) {
      const strike = swing; // 1 at contact, decays -> arm returns to windup
      tHNx = lerp(shN + face * 6, shN + face * 34, strike);
      tHNy = lerp(headY - 28, shoulderY + 18, strike);
      tHFx = shF - face * 16; tHFy = shoulderY + 2;
    } else if (airborne && (kind === "block" || f.holdHit)) {
      tHNx = shN + face * 2; tHNy = headY - 30;
      tHFx = shF - face * 2; tHFy = headY - 30;
    } else if (airborne) {
      tHNx = shN + face * 6; tHNy = headY - 20;
      tHFx = shF + face * 2; tHFy = headY - 14;
    } else if (acting && kind === "set") {
      const s = swing;
      tHNx = shN + face * 2; tHNy = headY - 12 - s * 5;
      tHFx = shF - face * 2; tHFy = headY - 12 - s * 5;
    } else if (acting && kind === "serve") {
      const s = swing;
      tHNx = shN + face * (10 + s * 22); tHNy = headY - 24 + s * 34;
      tHFx = shF - face * 6; tHFy = shoulderY + 18;
    } else if (acting) {
      const s = swing;
      const px = face * (18 + s * 12);
      const py = shoulderY + 34 - s * 8;
      tHNx = px; tHNy = py;
      tHFx = px - face * 3; tHFy = py + 2;
    } else if (moving) {
      const sw = Math.sin(f.legPhase);
      tHNx = shN + face * 8 + sw * 10; tHNy = shoulderY + 26 - Math.abs(sw) * 2;
      tHFx = shF - face * 8 - sw * 10; tHFy = shoulderY + 26 - Math.abs(sw) * 2;
    } else if (ready) {
      const b = breath * 1.5;
      tHNx = shN + face * 16; tHNy = shoulderY + 26 + b;
      tHFx = shF + face * 10; tHFy = shoulderY + 28 - b;
    } else {
      const b = breath * 2;
      tHNx = shN + face * 3; tHNy = shoulderY + 34 + b;
      tHFx = shF - face * 3; tHFy = shoulderY + 34 - b;
    }

    let tLean = clamp(f.vz / MOVE_SPEED, -1, 1) * 0.14;
    if (acting && (kind === "bump" || kind === "serve")) tLean += face * 0.12;
    else if (ready) tLean += ballDirZ * 0.05;
    if (airborne) tLean *= 0.4;
    if (f.stunned > 0) tLean = Math.sin(this.t * 20) * 0.14 + face * 0.08;

    // ================= smooth current pose toward target =================
    let a = this.anims.get(f);
    if (!a) {
      a = { flX: tflX, flY: tflY, blX: tblX, blY: tblY, hNx: tHNx, hNy: tHNy, hFx: tHFx, hFy: tHFy, lower: tLower, lean: tLean };
      this.anims.set(f, a);
    } else {
      const kLimb = 1 - Math.exp(-24 * realDt); // limbs: snappy but never popping
      const kBody = 1 - Math.exp(-13 * realDt); // weight shifts: smoother
      a.flX = lerp(a.flX, tflX, kLimb); a.flY = lerp(a.flY, tflY, kLimb);
      a.blX = lerp(a.blX, tblX, kLimb); a.blY = lerp(a.blY, tblY, kLimb);
      a.hNx = lerp(a.hNx, tHNx, kLimb); a.hNy = lerp(a.hNy, tHNy, kLimb);
      a.hFx = lerp(a.hFx, tHFx, kLimb); a.hFy = lerp(a.hFy, tHFy, kLimb);
      a.lower = lerp(a.lower, tLower, kBody);
      a.lean = lerp(a.lean, tLean, kBody);
    }

    // resolved (smoothed) values
    const sHipY = -40 + a.lower;
    const sShoulderY = -74 + a.lower;
    const sHeadY = -96 + a.lower;
    const shY = sShoulderY + 4;

    // ================= draw =================
    const feet = project(f.x, f.y, f.z);
    const sc = feet.s * CHAR_K;
    const celebLift = f.celebrate > 0 ? Math.abs(Math.sin(this.t * 12)) * 12 : 0;

    ctx.save();
    ctx.translate(feet.sx, feet.sy - celebLift * sc);
    const sqx = 1 + (1 - f.squash) * 0.55;
    ctx.scale(sc * sqx, sc * f.squash);

    if (spiking) {
      const glow = Math.min(1, swing + 0.4);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const ag = ctx.createRadialGradient(0, -50, 4, 0, -50, 74);
      ag.addColorStop(0, hexA(p.accent, 0.5 * glow));
      ag.addColorStop(1, hexA(p.accent, 0));
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(0, -50, 74, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // legs
    this.limb(-spread * 0.5, sHipY, a.blX, a.blY, face * 0.28, 13, p.shorts, p.skinShade);
    this.drawShoe(a.blX, a.blY, face, p.shoe);
    this.limb(spread * 0.5, sHipY, a.flX, a.flY, face * 0.28, 13, p.shorts, p.skin);
    this.drawShoe(a.flX, a.flY, face, p.shoe);

    // upper body (leans about the hip)
    ctx.save();
    ctx.translate(0, sHipY);
    ctx.rotate(a.lean);
    ctx.translate(0, -sHipY);

    this.drawArm(shF, shY, a.hFx, a.hFy, -face * 0.3, p.skinShade, p.skinShade, p.skinShade);

    const tg = ctx.createLinearGradient(0, sShoulderY, 0, sHipY + 6);
    tg.addColorStop(0, p.jersey);
    tg.addColorStop(1, p.jerseyShade);
    ctx.fillStyle = tg;
    this.roundRect(-18, sShoulderY, 36, sHipY - sShoulderY + 12, 12);
    ctx.fill();
    ctx.fillStyle = p.trim;
    ctx.fillRect(-18, sShoulderY + 12, 36, 4);
    ctx.font = "13px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(f.number), 0, sShoulderY + 30);

    this.drawArm(shN, shY, a.hNx, a.hNy, face * 0.28, p.skin, p.skin, p.skin);

    ctx.fillStyle = p.skinShade;
    ctx.fillRect(-5, sShoulderY - 8, 10, 12);
    const headTilt = clamp(a.lean * 0.4, -0.14, 0.14);
    const hx2 = face * 3 + headTilt * 30;
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(hx2, sHeadY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexA(p.skinShade, 0.55);
    ctx.beginPath();
    ctx.arc(hx2 - face * 8, sHeadY + 3, 8, 0, Math.PI * 2);
    ctx.fill();
    this.drawHair(p, hx2, sHeadY, face);
    this.drawFace(hx2, sHeadY, face, f);

    ctx.restore();
    ctx.restore();
  }

  private drawFace(hx: number, hy: number, face: number, f: Fighter) {
    const ctx = this.ctx;
    ctx.fillStyle = "#22283d";
    const eyeX = 4 * face;
    if (f.stunned > 0) {
      ctx.strokeStyle = "#22283d";
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        const ex = hx + eyeX * 0.4 + s * 5;
        ctx.beginPath();
        ctx.moveTo(ex - 3, hy - 3);
        ctx.lineTo(ex + 3, hy + 3);
        ctx.moveTo(ex + 3, hy - 3);
        ctx.lineTo(ex - 3, hy + 3);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(hx + eyeX + face * 1, hy, 2.4, 3.4, 0, 0, Math.PI * 2);
      ctx.ellipse(hx + eyeX + face * 8, hy, 2.4, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#22283d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx + eyeX - 2, hy - 5);
      ctx.lineTo(hx + eyeX + 4, hy - 4);
      ctx.stroke();
    }
    ctx.strokeStyle = "#7a3b2e";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (f.celebrate > 0) ctx.arc(hx + eyeX + face * 4, hy + 7, 3, 0, Math.PI);
    else {
      ctx.moveTo(hx + eyeX + face * 2, hy + 7);
      ctx.lineTo(hx + eyeX + face * 7, hy + 7);
    }
    ctx.stroke();
  }

  // ------------------------------------------------------------- ball
  private drawBall(b: Ball) {
    const ctx = this.ctx;
    const hot = b.hot > 0;
    // comet trail
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < b.trail.length; i++) {
      const tp = b.trail[i];
      const pr = project(tp.x, tp.y, tp.z);
      const fr = i / b.trail.length;
      const a = tp.a * (hot ? 0.55 : 0.3);
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      const rr = BALL_R * pr.s * (0.4 + fr * 0.85) * (hot ? 1.3 : 1);
      const gg = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, rr);
      if (hot) {
        gg.addColorStop(0, "rgba(255,235,150,1)");
        gg.addColorStop(0.5, "rgba(255,140,50,0.8)");
        gg.addColorStop(1, "rgba(255,60,20,0)");
      } else {
        gg.addColorStop(0, "rgba(190,210,255,0.9)");
        gg.addColorStop(1, "rgba(90,130,255,0)");
      }
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    const pr = project(b.x, b.y, b.z);
    const r = BALL_R * pr.s;
    if (hot) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gh = ctx.createRadialGradient(pr.sx, pr.sy, 2, pr.sx, pr.sy, r + 12);
      gh.addColorStop(0, `rgba(255,220,120,${0.7 * b.hot})`);
      gh.addColorStop(1, "rgba(255,120,40,0)");
      ctx.fillStyle = gh;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, r + 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(pr.sx, pr.sy);
    ctx.rotate(b.spin);
    ctx.fillStyle = "#fefefe";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const sg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    sg.addColorStop(0, "rgba(255,255,255,0.9)");
    sg.addColorStop(1, "rgba(150,170,210,0.5)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3b7dff";
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, -0.6, 0.6);
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(0, -r * 0.4, r, 0);
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(0, r * 0.4, r, 0);
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------- timing / serve
  private drawTimingRing(world: World) {
    const timing = world.spikeTiming();
    if (timing === null) return;
    const f = world.activeFighter;
    const head = project(f.x, f.y + CHAR_HEIGHT + 30, f.z);
    const ctx = this.ctx;
    const s = head.s;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(head.sx, head.sy, 22 * s, 0, Math.PI * 2);
    ctx.stroke();
    const perfect = timing > 0.8;
    ctx.strokeStyle = perfect ? "#ffe14d" : "#6fd3ff";
    ctx.lineWidth = perfect ? 5 : 4;
    ctx.beginPath();
    ctx.arc(head.sx, head.sy, (6 + (1 - timing) * 18) * s, 0, Math.PI * 2);
    ctx.stroke();
    if (perfect) {
      ctx.fillStyle = "#ffe14d";
      ctx.font = "11px Bungee, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HIT!", head.sx, head.sy - 30 * s);
    }
  }

  private drawServeIndicator(world: World) {
    const ctx = this.ctx;
    const f = (world.server === -1 ? world.playerTeam : world.aiTeam)[0];
    const head = project(f.x, f.y + CHAR_HEIGHT + 34, f.z);
    const bounce = Math.abs(Math.sin(this.t * 6)) * 5;
    const color = world.server === -1 ? "#7dffa8" : "#ff8a8a";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(head.sx - 9, head.sy - bounce);
    ctx.lineTo(head.sx + 9, head.sy - bounce);
    ctx.lineTo(head.sx, head.sy + 12 - bounce);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SERVE", head.sx, head.sy - 10 - bounce);
  }

  // ------------------------------------------------------------- HUD
  private drawHUD(world: World) {
    const ctx = this.ctx;
    const w = 300;
    const x = VIEW_W / 2 - w / 2;
    const y = 10;
    ctx.fillStyle = "rgba(8,12,26,0.85)";
    this.roundRect(x, y, w, 46, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,160,255,0.25)";
    ctx.lineWidth = 2;
    this.roundRect(x, y, w, 46, 10);
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.font = "15px Rajdhani, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#7db4ff";
    ctx.fillText("YOU", x + 14, y + 15);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff8a8a";
    ctx.fillText(world.aiName, x + w - 14, y + 15);

    ctx.font = "28px Bungee, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#eaf1ff";
    ctx.fillText(String(world.points[0]), x + 14, y + 32);
    ctx.textAlign = "right";
    ctx.fillText(String(world.points[1]), x + w - 14, y + 32);

    ctx.textAlign = "center";
    for (let i = 0; i < SETS_TO_WIN_MATCH; i++) {
      ctx.fillStyle = world.sets[0] > i ? "#3b7dff" : "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(x + w / 2 - 22 - i * 12, y + 13, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = world.sets[1] > i ? "#ff5252" : "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(x + w / 2 + 22 + i * 12, y + 13, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(234,241,255,0.6)";
    ctx.font = "11px Rajdhani, sans-serif";
    ctx.fillText(`FIRST TO ${POINTS_TO_WIN_SET}`, x + w / 2, y + 36);

    // telemetry: ball speed + height (arcade readout, like The Spike)
    const kmh = world.ball.planarSpeed() * 0.2;
    const meters = Math.max(0, world.ball.y) * 0.025;
    ctx.textAlign = "left";
    ctx.font = "16px Rajdhani, sans-serif";
    ctx.fillStyle = "#cfe0ff";
    ctx.fillText(`${kmh.toFixed(1)} km/h`, 20, 26);
    ctx.textAlign = "right";
    ctx.fillText(`${meters.toFixed(2)} m`, VIEW_W - 20, 26);

    if (world.rallyCrossings >= 4) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffe14d";
      ctx.font = "14px Bungee, sans-serif";
      ctx.fillText(`RALLY x${world.rallyCrossings}`, VIEW_W / 2, 72);
    }

    if (world.banner) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = "40px Bungee, sans-serif";
      ctx.fillText(world.banner, VIEW_W / 2 + 2, VIEW_H / 2 - 40 + 2);
      ctx.fillStyle = "#ffe14d";
      ctx.fillText(world.banner, VIEW_W / 2, VIEW_H / 2 - 40);
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function clampN(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
