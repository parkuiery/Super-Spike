import { randRange, easeOutCubic } from "../engine/math";
import { VIEW_W, VIEW_H } from "./config";

interface Popup {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
  big: boolean;
}

interface Shock {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

/**
 * Game-feel layer: screen shake, hit-stop (freeze frames), slow-mo, screen
 * flash, and floating popup text ("SPIKE!", "PERFECT!", "POINT!").
 */
export class Effects {
  shakeMag = 0;
  shakeTime = 0;
  shakeDur = 0.001;
  hitstop = 0;
  slowmo = 0; // remaining seconds of slow motion
  slowmoScale = 1;
  flashColor = "#fff";
  flashAlpha = 0;
  zoom = 1;
  zoomFocusX = VIEW_W / 2;
  zoomFocusY = VIEW_H / 2;
  private popups: Popup[] = [];
  private shocks: Shock[] = [];
  private speedTime = 0;
  private speedMax = 0.001;
  private speedX = VIEW_W / 2;
  private speedY = VIEW_H / 2;
  private speedColor = "#ffffff";

  shockwave(x: number, y: number, color = "#ffffff", maxR = 130, width = 6) {
    this.shocks.push({ x, y, r: 10, maxR, life: 0.42, maxLife: 0.42, color, width });
  }
  punch(zoom: number, x: number, y: number) {
    this.zoom = Math.max(this.zoom, zoom);
    this.zoomFocusX = x;
    this.zoomFocusY = y;
  }
  speedLines(sec: number, x: number, y: number, color = "#ffffff") {
    this.speedTime = sec;
    this.speedMax = sec;
    this.speedX = x;
    this.speedY = y;
    this.speedColor = color;
  }

  shake(mag: number, dur = 0.3) {
    if (mag > this.shakeMag) {
      this.shakeMag = mag;
      this.shakeTime = dur;
      this.shakeDur = dur;
    }
  }
  freeze(sec: number) {
    this.hitstop = Math.max(this.hitstop, sec);
  }
  slow(sec: number, scale = 0.35) {
    this.slowmo = Math.max(this.slowmo, sec);
    this.slowmoScale = scale;
  }
  flash(color = "#fff", alpha = 0.6) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }
  popup(text: string, x: number, y: number, color = "#fff", big = false) {
    this.popups.push({
      text,
      x,
      y,
      vy: -60,
      life: big ? 1.1 : 0.85,
      maxLife: big ? 1.1 : 0.85,
      color,
      scale: 0,
      big,
    });
  }

  /** Returns the dt-scale to apply this frame (0 during hitstop). */
  timeScale(realDt: number): number {
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      return 0;
    }
    if (this.slowmo > 0) {
      this.slowmo -= realDt;
      return this.slowmoScale;
    }
    return 1;
  }

  /** Update visual-only effects with REAL dt (unaffected by slowmo/hitstop). */
  updateVisual(realDt: number) {
    if (this.shakeTime > 0) {
      this.shakeTime -= realDt;
      if (this.shakeTime <= 0) this.shakeMag = 0;
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - realDt * 3);
    this.zoom += (1 - this.zoom) * Math.min(1, realDt * 6);
    if (this.zoom < 1.002) this.zoom = 1;
    if (this.speedTime > 0) this.speedTime -= realDt;
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.life -= realDt;
      s.r += (s.maxR - s.r) * Math.min(1, realDt * 9);
      if (s.life <= 0) this.shocks.splice(i, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= realDt;
      p.y += p.vy * realDt;
      p.vy *= 0.9;
      const t = 1 - p.life / p.maxLife;
      p.scale = t < 0.25 ? easeOutCubic(t / 0.25) * 1.15 : 1.15 - (t - 0.25) * 0.2;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shakeMag <= 0) return { x: 0, y: 0 };
    const k = (this.shakeTime / this.shakeDur) * this.shakeMag;
    return { x: randRange(-k, k), y: randRange(-k, k) };
  }

  /** Expanding shock rings — drawn in world space (under screen shake). */
  renderShockwaves(ctx: CanvasRenderingContext2D) {
    if (!this.shocks.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.shocks) {
      const t = s.life / s.maxLife;
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * t;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Manga-style radial speed lines — drawn as a screen overlay. */
  renderSpeedLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.speedTime <= 0) return;
    const t = this.speedTime / this.speedMax; // 1 -> 0
    const alpha = easeOutCubic(Math.min(1, t)) * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.speedColor;
    const cx = this.speedX;
    const cy = this.speedY;
    const inner = Math.max(w, h) * (0.28 + (1 - t) * 0.5);
    const outer = Math.max(w, h) * 1.2;
    const N = 46;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + i * 0.3;
      const jitter = ((i * 37) % 11) / 11;
      ctx.lineWidth = 2 + jitter * 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  renderFlash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flashAlpha > 0.01) {
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  renderPopups(ctx: CanvasRenderingContext2D) {
    for (const p of this.popups) {
      const a = Math.min(1, p.life / p.maxLife + 0.2);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.scale(p.scale, p.scale);
      ctx.font = `${p.big ? 54 : 30}px Bungee, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = p.big ? 8 : 5;
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  reset() {
    this.shakeMag = 0;
    this.shakeTime = 0;
    this.hitstop = 0;
    this.slowmo = 0;
    this.flashAlpha = 0;
    this.zoom = 1;
    this.speedTime = 0;
    this.popups.length = 0;
    this.shocks.length = 0;
  }
}
