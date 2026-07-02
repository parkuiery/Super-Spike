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
  POINTS_TO_WIN_SET,
  SETS_TO_WIN_MATCH,
  type Palette,
} from "./config";

const CHAR_K = 0.52; // world-height to screen scale for character billboards
const ATTACK = 130; // attack-line distance from the net (world z)

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export class Renderer {
  private t = 0;
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

    // depth-sorted draw list (players + ball + net), far first
    type Item = { z: number; draw: () => void };
    const items: Item[] = [];
    for (const f of world.playerTeam) items.push({ z: f.z, draw: () => this.drawFighter(f) });
    for (const f of world.aiTeam) items.push({ z: f.z, draw: () => this.drawFighter(f) });
    items.push({ z: world.ball.z, draw: () => this.drawBall(world.ball) });
    items.push({ z: NET_Z, draw: () => this.drawNet() });
    items.sort((a, b) => b.z - a.z);
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
    const far = project(COURT_W / 2, 0, COURT_L).sy; // ~ top of court
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

    // court surface
    const cg = ctx.createLinearGradient(0, fl.y, 0, nl.y);
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
      const sg = ctx.createLinearGradient(x + sway, fl.y, x + sway, nl.y);
      sg.addColorStop(0, "rgba(200,225,255,0.10)");
      sg.addColorStop(1, "rgba(200,225,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(x - 90 + sway, fl.y, 180, nl.y - fl.y);
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

  private drawFighter(f: Fighter) {
    const ctx = this.ctx;
    const p = f.palette;
    const face = f.facing;
    const airborne = !f.onGround;
    const swing = f.swing;
    const spiking = airborne && (swing > 0.05 || f.holdHit);

    const feet = project(f.x, f.y, f.z);
    const sc = feet.s * CHAR_K;
    let celebLift = 0;
    if (f.celebrate > 0) celebLift = Math.abs(Math.sin(this.t * 12)) * 12;

    ctx.save();
    ctx.translate(feet.sx, feet.sy - celebLift * sc);
    if (f.stunned > 0) ctx.rotate(Math.sin(this.t * 20) * 0.08);
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

    const hipY = -40;
    const shoulderY = -74;
    const headY = -96;
    const spread = 9;

    // legs
    const run = Math.sin(f.legPhase);
    let flX: number, flY: number, blX: number, blY: number;
    if (airborne) {
      flX = spread + face * 6;
      flY = hipY + (spiking ? 22 : 34);
      blX = -spread - face * 2;
      blY = hipY + (spiking ? 30 : 40);
    } else {
      flX = spread + run * 11;
      flY = 0;
      blX = -spread - run * 11;
      blY = 0;
    }
    this.limb(-spread * 0.5, hipY, blX, blY, face * 0.28, 13, p.shorts, p.skinShade);
    this.drawShoe(blX, blY, face, p.shoe);
    this.limb(spread * 0.5, hipY, flX, flY, face * 0.28, 13, p.shorts, p.skin);
    this.drawShoe(flX, flY, face, p.shoe);

    // torso
    const tg = ctx.createLinearGradient(0, shoulderY, 0, hipY + 6);
    tg.addColorStop(0, p.jersey);
    tg.addColorStop(1, p.jerseyShade);
    ctx.fillStyle = tg;
    this.roundRect(-18, shoulderY, 36, hipY - shoulderY + 12, 12);
    ctx.fill();
    ctx.fillStyle = p.trim;
    ctx.fillRect(-18, shoulderY + 12, 36, 4);
    ctx.font = "13px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(f.number), 0, shoulderY + 30);

    // back arm
    const shFront = 13 * face;
    const shBack = -13 * face;
    const backHandY = f.celebrate > 0 ? shoulderY - 28 : shoulderY + (airborne ? 30 : 24);
    const backHandX = shBack - face * (f.celebrate > 0 ? 6 : 10);
    this.limb(shBack, shoulderY + 4, backHandX, backHandY, -face * 0.3, 8, p.skinShade, p.skinShade);

    // hitting arm
    const armAngle = airborne ? -Math.PI * 0.72 + swing * Math.PI * 0.85 : -Math.PI * 0.12 - swing * Math.PI * 0.55;
    const armReach = 32;
    const handX = shFront + Math.cos(armAngle) * face * armReach;
    const handY = shoulderY + 4 + Math.sin(armAngle) * armReach;
    this.limb(shFront, shoulderY + 4, handX, handY, face * 0.28, 8.5, p.skin, p.skin);
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(handX, handY, 6, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = p.skinShade;
    ctx.fillRect(-5, shoulderY - 8, 10, 12);
    const hx2 = face * 3;
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(hx2, headY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexA(p.skinShade, 0.55);
    ctx.beginPath();
    ctx.arc(hx2 - face * 8, headY + 3, 8, 0, Math.PI * 2);
    ctx.fill();
    this.drawHair(p, hx2, headY, face);
    this.drawFace(hx2, headY, face, f);

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
