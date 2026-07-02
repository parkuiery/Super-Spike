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
} from "./config";
import { clamp } from "../engine/math";

export class Renderer {
  private t = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  drawWorld(world: World, realDt: number) {
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
    this.drawTimingRing(world);
    if (world.phase === "serve" || world.phase === "ready") this.drawServeIndicator(world);
    this.drawHUD(world);
    world.effects.renderPopups(ctx);
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

    // ceiling lights
    for (let i = 0; i < 4; i++) {
      const x = 140 + i * 230;
      ctx.fillStyle = "rgba(180,200,255,0.10)";
      ctx.beginPath();
      ctx.moveTo(x, CEIL_Y - 10);
      ctx.lineTo(x + 120, CEIL_Y - 10);
      ctx.lineTo(x + 180, 190);
      ctx.lineTo(x - 60, 190);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e9f0ff";
      ctx.fillRect(x, CEIL_Y - 16, 120, 10);
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
    const colors = ["#ff6b6b", "#ffd93d", "#6bcB77", "#4d96ff", "#c77dff", "#ff9f45"];
    ctx.save();
    for (let row = 0; row < 3; row++) {
      const y = 200 + row * 22;
      for (let x = 30; x < VIEW_W - 20; x += 26) {
        const bob = Math.sin(this.t * 3 + x * 0.3 + row) * 2;
        ctx.fillStyle = colors[(x + row) % colors.length];
        ctx.globalAlpha = 0.55 - row * 0.1;
        ctx.beginPath();
        ctx.arc(x + (row % 2) * 12, y + bob, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // stand base
    ctx.fillStyle = "rgba(10,14,28,0.7)";
    ctx.fillRect(0, 262, VIEW_W, 30);
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
  private drawFighter(f: Fighter, isAI: boolean) {
    const ctx = this.ctx;
    const p = f.palette;
    ctx.save();

    let cx = f.x;
    let cy = f.y;
    let tilt = 0;
    if (f.celebrate > 0) cy -= Math.abs(Math.sin(this.t * 12)) * 10;
    if (f.stunned > 0) tilt = Math.sin(this.t * 20) * 0.08;

    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    const sy = f.squash;
    const sx = 1 + (1 - f.squash) * 0.55;
    ctx.scale(sx, sy);

    const face = f.facing; // -1 or 1
    const swing = f.swing;
    const airborne = !f.onGround;

    // --- legs ---
    const hipY = -38;
    const legSpread = 10;
    const run = Math.sin(f.legPhase) * (f.onGround ? 8 : 3);
    ctx.strokeStyle = p.shorts;
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    // back leg
    ctx.strokeStyle = p.skinShade;
    ctx.beginPath();
    ctx.moveTo(-legSpread, hipY);
    ctx.lineTo(-legSpread - run * 0.5, airborne ? hipY + 34 : 0);
    ctx.stroke();
    // front leg
    ctx.strokeStyle = p.skin;
    ctx.beginPath();
    ctx.moveTo(legSpread, hipY);
    ctx.lineTo(legSpread + run * 0.5, airborne ? hipY + 30 : 0);
    ctx.stroke();
    // shorts
    ctx.fillStyle = p.shorts;
    this.roundRect(-16, hipY - 6, 32, 20, 8);
    ctx.fill();

    // --- torso (jersey) ---
    const shoulderY = -70;
    ctx.fillStyle = p.jersey;
    this.roundRect(-17, shoulderY, 34, hipY - shoulderY + 12, 12);
    ctx.fill();
    // shade
    ctx.fillStyle = p.jerseyShade;
    this.roundRect(-17, shoulderY + 18, 34, hipY - shoulderY - 6, 8);
    ctx.fill();
    // trim stripe
    ctx.fillStyle = p.trim;
    ctx.fillRect(-17, shoulderY + 12, 34, 4);
    // jersey number
    ctx.fillStyle = p.trim;
    ctx.font = "12px Bungee, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(f.number), 0, shoulderY + 26);

    // --- arms ---
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    // hitting arm (front, toward net = face direction)
    const swingAngle = airborne
      ? -Math.PI * 0.62 + swing * Math.PI * 0.7 // overhead swing down for spike
      : -Math.PI * 0.15 - swing * Math.PI * 0.5;
    const armLen = 30;
    const ax = face * 12;
    const ay = shoulderY + 6;
    const hxp = ax + Math.cos(swingAngle) * face * armLen;
    const hyp = ay + Math.sin(swingAngle) * armLen - (airborne ? 6 : 0);
    ctx.strokeStyle = p.skin;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(hxp, hyp);
    ctx.stroke();
    // hand
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(hxp, hyp, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // back arm
    ctx.strokeStyle = p.skinShade;
    ctx.beginPath();
    ctx.moveTo(-face * 12, ay);
    ctx.lineTo(-face * 16, ay + (f.celebrate > 0 ? -26 : 22));
    ctx.stroke();

    // --- head ---
    const headY = shoulderY - 15;
    const headX = face * 3;
    // hair back
    ctx.fillStyle = p.hairShade;
    ctx.beginPath();
    ctx.arc(headX, headY, 17, 0, Math.PI * 2);
    ctx.fill();
    // face
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(headX, headY, 15, 0, Math.PI * 2);
    ctx.fill();
    // hair top
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.arc(headX, headY - 3, 15, Math.PI, Math.PI * 2);
    ctx.fill();
    // spiky bangs
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const bx = headX + i * 6;
      ctx.moveTo(bx - 4, headY - 6);
      ctx.lineTo(bx, headY + 3);
      ctx.lineTo(bx + 4, headY - 6);
    }
    ctx.fill();

    // face expression
    this.drawFace(headX, headY, face, f);

    ctx.restore();

    // celebration sparkles / stun stars (unscaled overlay)
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
    // trail
    for (let i = 0; i < b.trail.length; i++) {
      const tp = b.trail[i];
      const a = tp.a * 0.5;
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = b.hot > 0 ? "#ff8a3d" : "#9fb4ff";
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, BALL_R * (0.3 + (i / b.trail.length) * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (b.hot > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,140,60,${0.5 * b.hot})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R + 8, 0, Math.PI * 2);
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
