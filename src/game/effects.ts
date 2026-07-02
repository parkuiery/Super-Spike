import { randRange, easeOutCubic } from "../engine/math";

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
  private popups: Popup[] = [];

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
    this.popups.length = 0;
  }
}
