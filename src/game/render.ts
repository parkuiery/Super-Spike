import { World } from "./world";
import { Fighter } from "./fighter";
import { Ball } from "./ball";
import {
  VIEW_W,
  VIEW_H,
  FLOOR_Y,
  CEIL_Y,
  WALL_L,
  WALL_R,
  NET_X,
  NET_TOP,
  NET_W,
  BALL_R,
  CHAR_H,
  CHAR_W,
  POINTS_TO_WIN_SET,
  SETS_TO_WIN_MATCH,
  type Palette,
} from "./config";
import { clamp } from "../engine/math";

/** hex "#rrggbb" -> "rgba(r,g,b,a)". */
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

  /** World content — drawn inside the camera transform (shake + zoom punch). */
  drawScene(world: World, realDt: number) {
    this.t += realDt;
    const ctx = this.ctx;

    this.drawArena();
    for (const f of world.playerTeam) this.drawShadow(f);
    for (const f of world.aiTeam) this.drawShadow(f);
    this.drawBallShadow(world.ball);
    this.drawActiveMarker(world.activeFighter);
    this.drawNetBack();

    // back players first for a light depth feel
    for (const f of world.playerTeam) this.drawFighter(f, false);
    for (const f of world.aiTeam) this.drawFighter(f, true);

    this.drawNetFront();
    this.drawBall(world.ball);

    world.particles.render(ctx);
    world.effects.renderShockwaves(ctx);
    this.drawTimingRing(world);
    if (world.phase === "serve" || world.phase === "ready") this.drawServeIndicator(world);
    world.effects.renderPopups(ctx);
  }

  /** Screen-fixed overlay — HUD (unaffected by camera). */
  drawOverlay(world: World) {
    this.drawHUD(world);
  }

  private drawServeIndicator(world: World) {
    const ctx = this.ctx;
    const f = (world.server === -1 ? world.playerTeam : world.aiTeam)[0];
    const bounce = Math.abs(Math.sin(this.t * 6)) * 6;
    const y = f.y - CHAR_H - 34 - bounce;
    const color = world.server === -1 ? "#7dffa8" : "#ff8a8a";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(f.x - 9, y);
    ctx.lineTo(f.x + 9, y);
    ctx.lineTo(f.x, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.font = "11px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SERVE", f.x, y - 8);
  }

  // ------------------------------------------------------------- arena
  private drawArena() {
    const ctx = this.ctx;
    // back wall gradient
    const g = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
    g.addColorStop(0, "#141b34");
    g.addColorStop(0.6, "#1c2647");
    g.addColorStop(1, "#243157");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, FLOOR_Y);

    // spotlight cones (additive glow) + fixtures
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const x = 200 + i * 200;
      const sway = Math.sin(this.t * 0.6 + i) * 22;
      const lg = ctx.createLinearGradient(x, CEIL_Y, x + sway, 320);
      lg.addColorStop(0, "rgba(150,180,255,0.18)");
      lg.addColorStop(1, "rgba(150,180,255,0)");
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(x - 16, CEIL_Y - 6);
      ctx.lineTo(x + 16, CEIL_Y - 6);
      ctx.lineTo(x + 150 + sway, 330);
      ctx.lineTo(x - 150 + sway, 330);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // fixtures
    for (let i = 0; i < 4; i++) {
      const x = 200 + i * 200;
      ctx.fillStyle = "#0e1428";
      ctx.fillRect(x - 40, CEIL_Y - 18, 80, 7);
      ctx.fillStyle = "#fdfbe6";
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(x - 26 + k * 26, CEIL_Y - 14, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // crowd stands
    this.drawCrowd();

    // banner
    ctx.fillStyle = "rgba(59,125,255,0.9)";
    ctx.fillRect(VIEW_W / 2 - 190, 70, 380, 34);
    ctx.fillStyle = "#eaf1ff";
    ctx.font = "20px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SUPER SPIKE ARENA", VIEW_W / 2, 88);

    // floor
    const fg = ctx.createLinearGradient(0, FLOOR_Y, 0, VIEW_H);
    fg.addColorStop(0, "#d9a066");
    fg.addColorStop(1, "#a9713f");
    ctx.fillStyle = fg;
    ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);
    // floor planks
    ctx.strokeStyle = "rgba(120,70,30,0.35)";
    ctx.lineWidth = 2;
    for (let x = 0; x < VIEW_W; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, FLOOR_Y);
      ctx.lineTo(x - 40, VIEW_H);
      ctx.stroke();
    }
    // glossy sheen streaks (spotlight reflections on the polished floor)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const x = 200 + i * 200;
      const sway = Math.sin(this.t * 0.6 + i) * 22;
      const sg = ctx.createLinearGradient(x + sway, FLOOR_Y, x + sway, VIEW_H);
      sg.addColorStop(0, "rgba(255,240,200,0.10)");
      sg.addColorStop(1, "rgba(255,240,200,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(x - 24 + sway, FLOOR_Y);
      ctx.lineTo(x + 24 + sway, FLOOR_Y);
      ctx.lineTo(x + 60 + sway, VIEW_H);
      ctx.lineTo(x - 60 + sway, VIEW_H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // court boundary lines
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(WALL_L, FLOOR_Y + 2);
    ctx.lineTo(WALL_R, FLOOR_Y + 2);
    ctx.stroke();
    // attack lines
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 3;
    for (const lx of [NET_X - 150, NET_X + 150]) {
      ctx.beginPath();
      ctx.moveTo(lx, FLOOR_Y + 4);
      ctx.lineTo(lx - 30, VIEW_H);
      ctx.stroke();
    }
  }

  private drawCrowd() {
    const ctx = this.ctx;
    const colors = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c77dff", "#ff9f45"];
    ctx.save();
    for (let row = 0; row < 3; row++) {
      const y = 196 + row * 22;
      for (let x = 30; x < VIEW_W - 20; x += 24) {
        // a wave travels across the stands (mexican wave)
        const wavePhase = this.t * 2.4 - x * 0.012;
        const wave = Math.max(0, Math.sin(wavePhase)) ** 2;
        const bob = wave * 9 + Math.sin(this.t * 3 + x) * 1.5;
        ctx.fillStyle = colors[(x + row) % colors.length];
        ctx.globalAlpha = 0.6 - row * 0.12;
        // body
        ctx.beginPath();
        ctx.arc(x + (row % 2) * 12, y - bob, 6, 0, Math.PI * 2);
        ctx.fill();
        // raised arms at wave peak
        if (wave > 0.5 && row === 0) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 4, y - bob - 4);
          ctx.lineTo(x - 7, y - bob - 12);
          ctx.moveTo(x + 4, y - bob - 4);
          ctx.lineTo(x + 7, y - bob - 12);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    // occasional camera flashes in the crowd
    for (let i = 0; i < 5; i++) {
      const fx = ((i * 191 + Math.floor(this.t * 3) * 137) % VIEW_W);
      const flick = (Math.sin(this.t * 20 + i * 5) + 1) / 2;
      if (flick > 0.88) {
        ctx.fillStyle = `rgba(255,255,255,${(flick - 0.88) * 6})`;
        ctx.beginPath();
        ctx.arc(fx, 200 + (i % 3) * 22, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // stand base rail
    ctx.fillStyle = "rgba(10,14,28,0.75)";
    ctx.fillRect(0, 260, VIEW_W, 30);
    ctx.fillStyle = "rgba(120,150,220,0.25)";
    ctx.fillRect(0, 260, VIEW_W, 3);
    ctx.restore();
  }

  private drawNetBack() {
    // posts
    const ctx = this.ctx;
    ctx.fillStyle = "#2a2f45";
    ctx.fillRect(NET_X - NET_W / 2 - 2, NET_TOP, NET_W + 4, FLOOR_Y - NET_TOP);
  }

  private drawNetFront() {
    const ctx = this.ctx;
    // mesh
    ctx.save();
    ctx.strokeStyle = "rgba(230,238,255,0.5)";
    ctx.lineWidth = 1;
    const left = NET_X - NET_W / 2;
    for (let y = NET_TOP + 6; y < FLOOR_Y; y += 9) {
      ctx.beginPath();
      ctx.moveTo(left - 1, y);
      ctx.lineTo(left + NET_W + 1, y);
      ctx.stroke();
    }
    // top tape
    ctx.fillStyle = "#f4f8ff";
    ctx.fillRect(left - 2, NET_TOP - 6, NET_W + 4, 8);
    ctx.restore();
  }

  // ------------------------------------------------------------- shadows
  private drawShadow(f: Fighter) {
    const ctx = this.ctx;
    const h = clamp((FLOOR_Y - f.y) / 260, 0, 1);
    const w = CHAR_W * (1 - h * 0.4);
    ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - h * 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(f.x, FLOOR_Y + 6, w * 0.7, 8 * (1 - h * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBallShadow(b: Ball) {
    const ctx = this.ctx;
    const h = clamp((FLOOR_Y - b.y) / 400, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * (1 - h * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(b.x, FLOOR_Y + 6, BALL_R * (1 - h * 0.4), 6 * (1 - h * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawActiveMarker(f: Fighter) {
    const ctx = this.ctx;
    const pulse = 0.6 + Math.sin(this.t * 8) * 0.4;
    ctx.save();
    ctx.strokeStyle = `rgba(125,255,168,${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(f.x, FLOOR_Y + 6, 26, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    // little chevron above the head
    const y = f.y - CHAR_H - 16 - Math.abs(Math.sin(this.t * 6)) * 4;
    ctx.fillStyle = "#7dffa8";
    ctx.beginPath();
    ctx.moveTo(f.x - 7, y);
    ctx.lineTo(f.x + 7, y);
    ctx.lineTo(f.x, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------- fighter
  /** A 2-segment limb with a bent joint (elbow/knee). */
  private limb(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    bend: number,
    width: number,
    upper: string,
    lower: string,
  ) {
    const ctx = this.ctx;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const px = -dy / len;
    const py = dx / len;
    const kx = mx + px * bend * len;
    const ky = my + py * bend * len;
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
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x - 6, y + 2, 15, 2);
  }

  private drawHair(p: Palette, hx: number, hy: number, face: number) {
    const ctx = this.ctx;
    // back hair
    ctx.fillStyle = p.hairShade;
    ctx.beginPath();
    ctx.arc(hx, hy - 2, 17, 0, Math.PI * 2);
    ctx.fill();
    // crown
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.arc(hx, hy - 3, 15.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(hx - 15.5, hy - 5, 31, 6);

    if (p.style === "spiky") {
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        const bx = hx + i * 6;
        ctx.moveTo(bx - 4, hy - 7);
        ctx.lineTo(bx, hy + 2);
        ctx.lineTo(bx + 4, hy - 7);
      }
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
      // ponytail trailing behind (opposite the facing side)
      ctx.beginPath();
      ctx.ellipse(hx - face * 19, hy - 4, 8, 17, face * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.trim;
      ctx.beginPath();
      ctx.arc(hx - face * 11, hy - 8, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.style === "swept") {
      ctx.beginPath();
      ctx.moveTo(hx - 15, hy - 3);
      ctx.quadraticCurveTo(hx + face * 20, hy - 18, hx + face * 17, hy + 5);
      ctx.quadraticCurveTo(hx + face * 4, hy - 4, hx - 15, hy - 2);
      ctx.fill();
    } else {
      // mohawk crest
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
    // highlight streak
    ctx.strokeStyle = p.hairLight;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hx + face * 4, hy - 4, 11, -Math.PI * 0.85, -Math.PI * 0.3);
    ctx.stroke();
  }

  private drawFighter(f: Fighter, isAI: boolean) {
    const ctx = this.ctx;
    const p = f.palette;
    const face = f.facing;
    const airborne = !f.onGround;
    const swing = f.swing;
    const spiking = airborne && (swing > 0.05 || f.holdHit);

    ctx.save();
    let cy = f.y;
    if (f.celebrate > 0) cy -= Math.abs(Math.sin(this.t * 12)) * 10;
    ctx.translate(f.x, cy);
    if (f.stunned > 0) ctx.rotate(Math.sin(this.t * 20) * 0.08);
    const sy = f.squash;
    const sx = 1 + (1 - f.squash) * 0.55;
    ctx.scale(sx, sy);

    // spike aura behind the body
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

    // ---- legs ----
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

    // ---- torso ----
    const tg = ctx.createLinearGradient(0, shoulderY, 0, hipY + 6);
    tg.addColorStop(0, p.jersey);
    tg.addColorStop(1, p.jerseyShade);
    ctx.fillStyle = tg;
    this.roundRect(-18, shoulderY, 36, hipY - shoulderY + 12, 12);
    ctx.fill();
    // rim light on the facing edge
    ctx.fillStyle = hexA(p.trim, 0.25);
    this.roundRect(face > 0 ? 11 : -18, shoulderY + 2, 7, hipY - shoulderY + 6, 5);
    ctx.fill();
    // collar
    ctx.fillStyle = p.trim;
    ctx.fillRect(-18, shoulderY + 12, 36, 4);
    // number
    ctx.font = "13px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(f.number), 0, shoulderY + 30);

    // ---- back arm ----
    const shFront = 13 * face;
    const shBack = -13 * face;
    const backHandY = f.celebrate > 0 ? shoulderY - 28 : shoulderY + (airborne ? 30 : 24);
    const backHandX = shBack - face * (f.celebrate > 0 ? 6 : 10);
    this.limb(shBack, shoulderY + 4, backHandX, backHandY, -face * 0.3, 8, p.skinShade, p.skinShade);

    // ---- hitting arm ----
    const armAngle = airborne
      ? -Math.PI * 0.72 + swing * Math.PI * 0.85
      : -Math.PI * 0.12 - swing * Math.PI * 0.55;
    const armReach = 32;
    const handX = shFront + Math.cos(armAngle) * face * armReach;
    const handY = shoulderY + 4 + Math.sin(armAngle) * armReach;
    this.limb(shFront, shoulderY + 4, handX, handY, face * 0.28, 8.5, p.skin, p.skin);
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(handX, handY, 6, 0, Math.PI * 2);
    ctx.fill();

    // ---- neck + head ----
    ctx.fillStyle = p.skinShade;
    ctx.fillRect(-5, shoulderY - 8, 10, 12);
    const hx2 = face * 3;
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(hx2, headY, 15, 0, Math.PI * 2);
    ctx.fill();
    // cheek shade
    ctx.fillStyle = hexA(p.skinShade, 0.55);
    ctx.beginPath();
    ctx.arc(hx2 - face * 8, headY + 3, 8, 0, Math.PI * 2);
    ctx.fill();
    this.drawHair(p, hx2, headY, face);
    this.drawFace(hx2, headY, face, f);
    // rim light on head
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx2, headY, 15, face > 0 ? -1.1 : Math.PI + 0.1, face > 0 ? -0.1 : Math.PI + 1.1);
    ctx.stroke();

    ctx.restore();

    if (f.celebrate > 0) this.drawSparkles(f.x, f.y - CHAR_H - 6);
    if (isAI && f.stunned > 0) this.drawStunStars(f.x, f.y - CHAR_H);
  }

  private drawFace(hx: number, hy: number, face: number, f: Fighter) {
    const ctx = this.ctx;
    ctx.fillStyle = "#22283d";
    const eyeX = 4 * face;
    if (f.stunned > 0) {
      // x_x eyes
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
      // determined eyes
      ctx.beginPath();
      ctx.ellipse(hx + eyeX + face * 1, hy, 2.4, 3.4, 0, 0, Math.PI * 2);
      ctx.ellipse(hx + eyeX + face * 8, hy, 2.4, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // brow
      ctx.strokeStyle = "#22283d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx + eyeX - 2, hy - 5);
      ctx.lineTo(hx + eyeX + 4, hy - 4);
      ctx.stroke();
    }
    // mouth
    ctx.strokeStyle = "#7a3b2e";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (f.celebrate > 0) ctx.arc(hx + eyeX + face * 4, hy + 7, 3, 0, Math.PI);
    else ctx.moveTo(hx + eyeX + face * 2, hy + 7), ctx.lineTo(hx + eyeX + face * 7, hy + 7);
    ctx.stroke();
  }

  private drawSparkles(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#ffe14d";
    for (let i = 0; i < 4; i++) {
      const a = this.t * 4 + (i * Math.PI) / 2;
      const r = 24 + Math.sin(this.t * 6 + i) * 6;
      this.star(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, 5, a);
    }
  }
  private drawStunStars(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#ffd93d";
    for (let i = 0; i < 3; i++) {
      const a = this.t * 8 + (i * Math.PI * 2) / 3;
      this.star(x + Math.cos(a) * 18, y + Math.sin(a) * 6, 4, a);
    }
    void ctx;
  }
  private star(x: number, y: number, r: number, rot: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const a2 = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------- ball
  private drawBall(b: Ball) {
    const ctx = this.ctx;
    const hot = b.hot > 0;
    // energy comet trail (additive glow)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < b.trail.length; i++) {
      const tp = b.trail[i];
      const f = i / b.trail.length;
      const a = tp.a * (hot ? 0.6 : 0.32);
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      const rr = BALL_R * (0.35 + f * 0.85) * (hot ? 1.25 : 1);
      const gg = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, rr);
      if (hot) {
        gg.addColorStop(0, "rgba(255,235,150,1)");
        gg.addColorStop(0.5, "rgba(255,140,50,0.8)");
        gg.addColorStop(1, "rgba(255,60,20,0)");
      } else {
        gg.addColorStop(0, "rgba(180,205,255,0.9)");
        gg.addColorStop(1, "rgba(90,130,255,0)");
      }
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (hot) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gh = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, BALL_R + 14);
      gh.addColorStop(0, `rgba(255,220,120,${0.7 * b.hot})`);
      gh.addColorStop(1, "rgba(255,120,40,0)");
      ctx.fillStyle = gh;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R + 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    // base
    ctx.fillStyle = "#fefefe";
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    // shading
    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, BALL_R);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(150,170,210,0.5)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    // panels
    ctx.strokeStyle = "#3b7dff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R * 0.9, -0.6, 0.6);
    ctx.moveTo(-BALL_R, 0);
    ctx.quadraticCurveTo(0, -6, BALL_R, 0);
    ctx.moveTo(-BALL_R, 0);
    ctx.quadraticCurveTo(0, 6, BALL_R, 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(60,90,160,0.4)";
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------- timing ring
  private drawTimingRing(world: World) {
    const timing = world.spikeTiming();
    if (timing === null) return;
    const f = world.activeFighter;
    const x = f.x;
    const y = f.y - CHAR_H - 26;
    const ctx = this.ctx;
    // outer guide
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
    // shrinking indicator
    const perfect = timing > 0.8;
    ctx.strokeStyle = perfect ? "#ffe14d" : "#6fd3ff";
    ctx.lineWidth = perfect ? 5 : 4;
    ctx.beginPath();
    ctx.arc(x, y, 6 + (1 - timing) * 18, 0, Math.PI * 2);
    ctx.stroke();
    if (perfect) {
      ctx.fillStyle = "#ffe14d";
      ctx.font = "11px Bungee, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HIT!", x, y - 30);
    }
  }

  // ------------------------------------------------------------- HUD
  private drawHUD(world: World) {
    const ctx = this.ctx;
    // scoreboard
    const w = 300;
    const x = VIEW_W / 2 - w / 2;
    const y = 12;
    ctx.fillStyle = "rgba(8,12,26,0.82)";
    this.roundRect(x, y, w, 48, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,160,255,0.25)";
    ctx.lineWidth = 2;
    this.roundRect(x, y, w, 48, 10);
    ctx.stroke();

    // names
    ctx.textBaseline = "middle";
    ctx.font = "16px Rajdhani, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#7db4ff";
    ctx.fillText("YOU", x + 14, y + 16);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff8a8a";
    ctx.fillText(world.aiName, x + w - 14, y + 16);

    // points
    ctx.font = "30px Bungee, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#eaf1ff";
    ctx.fillText(String(world.points[0]), x + 14, y + 34);
    ctx.textAlign = "right";
    ctx.fillText(String(world.points[1]), x + w - 14, y + 34);

    // set pips
    ctx.textAlign = "center";
    for (let i = 0; i < SETS_TO_WIN_MATCH; i++) {
      ctx.fillStyle = world.sets[0] > i ? "#3b7dff" : "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(x + w / 2 - 20 - i * 12, y + 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = world.sets[1] > i ? "#ff5252" : "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(x + w / 2 + 20 + i * 12, y + 14, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // to-win + rally
    ctx.fillStyle = "rgba(234,241,255,0.6)";
    ctx.font = "12px Rajdhani, sans-serif";
    ctx.fillText(`FIRST TO ${POINTS_TO_WIN_SET}`, x + w / 2, y + 38);

    if (world.rallyCrossings >= 4) {
      ctx.fillStyle = "#ffe14d";
      ctx.font = "14px Bungee, sans-serif";
      ctx.fillText(`RALLY x${world.rallyCrossings}`, VIEW_W / 2, 78);
    }

    // banner (READY / SET / result)
    if (world.banner) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.font = "40px Bungee, sans-serif";
      ctx.textAlign = "center";
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
