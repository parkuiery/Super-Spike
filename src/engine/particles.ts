import { randRange, rand } from "./math";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  shape: "circle" | "spark" | "ring" | "star";
  rot: number;
  vr: number;
}

export class Particles {
  private pool: Particle[] = [];

  clear() {
    this.pool.length = 0;
  }

  count(): number {
    return this.pool.length;
  }

  emit(p: Partial<Particle> & { x: number; y: number }) {
    this.pool.push({
      x: p.x,
      y: p.y,
      vx: p.vx ?? 0,
      vy: p.vy ?? 0,
      life: p.life ?? 0.5,
      maxLife: p.life ?? 0.5,
      size: p.size ?? 4,
      color: p.color ?? "#fff",
      gravity: p.gravity ?? 0,
      drag: p.drag ?? 0.98,
      shape: p.shape ?? "circle",
      rot: p.rot ?? 0,
      vr: p.vr ?? 0,
    });
  }

  burst(
    x: number,
    y: number,
    n: number,
    opts: {
      speed?: [number, number];
      color?: string | string[];
      size?: [number, number];
      life?: [number, number];
      gravity?: number;
      shape?: Particle["shape"];
      spread?: number;
      angle?: number;
    } = {},
  ) {
    const {
      speed = [60, 220],
      color = "#fff",
      size = [2, 5],
      life = [0.3, 0.7],
      gravity = 400,
      shape = "circle",
      spread = Math.PI * 2,
      angle = -Math.PI / 2,
    } = opts;
    for (let i = 0; i < n; i++) {
      const a = angle + randRange(-spread / 2, spread / 2);
      const sp = randRange(speed[0], speed[1]);
      this.emit({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: randRange(life[0], life[1]),
        size: randRange(size[0], size[1]),
        color: Array.isArray(color) ? color[Math.floor(rand() * color.length)] : color,
        gravity,
        shape,
        rot: randRange(0, Math.PI * 2),
        vr: randRange(-8, 8),
      });
    }
  }

  update(dt: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    for (const p of this.pool) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "spark") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(0, -p.size * 0.25, p.size * 3 * t, p.size * 0.5);
        ctx.restore();
      } else if (p.shape === "ring") {
        ctx.lineWidth = p.size * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t) * 5 + 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === "star") {
        this.star(ctx, p.x, p.y, p.size * (0.5 + t), p.rot);
      }
    }
    ctx.globalAlpha = 1;
  }

  private star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
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
}
