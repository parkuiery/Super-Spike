import { VIEW_W, VIEW_H, AI_PALETTES, DIFFICULTIES } from "./config";

type Ctx = CanvasRenderingContext2D;

function bg(ctx: Ctx, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, "#10152b");
  g.addColorStop(1, "#070a16");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // moving glow bars
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 6; i++) {
    const x = ((t * 40 + i * 200) % (VIEW_W + 200)) - 100;
    ctx.fillStyle = i % 2 ? "#3b7dff" : "#ff5252";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 80, 0);
    ctx.lineTo(x - 60, VIEW_H);
    ctx.lineTo(x - 140, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function volleyball(ctx: Ctx, x: number, y: number, r: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3b7dff";
  ctx.lineWidth = r * 0.13;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, -0.6, 0.6);
  ctx.moveTo(-r, 0);
  ctx.quadraticCurveTo(0, -r * 0.4, r, 0);
  ctx.moveTo(-r, 0);
  ctx.quadraticCurveTo(0, r * 0.4, r, 0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(60,90,160,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawTitle(ctx: Ctx, t: number, ballY: number) {
  bg(ctx, t);
  volleyball(ctx, VIEW_W / 2 + 210, ballY, 26, t * 4);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // title
  ctx.save();
  ctx.translate(VIEW_W / 2, 210);
  const pop = 1 + Math.sin(t * 2) * 0.02;
  ctx.scale(pop, pop);
  ctx.font = "84px Bungee, sans-serif";
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#0a0e1c";
  ctx.strokeText("SUPER", 0, -44);
  ctx.strokeText("SPIKE", 0, 44);
  const grad = ctx.createLinearGradient(0, -80, 0, 80);
  grad.addColorStop(0, "#7db4ff");
  grad.addColorStop(0.5, "#eaf1ff");
  grad.addColorStop(1, "#3b7dff");
  ctx.fillStyle = grad;
  ctx.fillText("SUPER", 0, -44);
  ctx.fillStyle = "#ff5252";
  ctx.strokeText("SPIKE", 0, 44);
  ctx.fillText("SPIKE", 0, 44);
  ctx.restore();

  ctx.fillStyle = "rgba(234,241,255,0.8)";
  ctx.font = "20px Rajdhani, sans-serif";
  ctx.fillText("3 vs 3 아케이드 배구", VIEW_W / 2, 320);

  // prompt blink
  const a = 0.5 + Math.sin(t * 4) * 0.5;
  ctx.globalAlpha = a;
  ctx.fillStyle = "#ffe14d";
  ctx.font = "28px Bungee, sans-serif";
  ctx.fillText("PRESS ANY KEY", VIEW_W / 2, 430);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(234,241,255,0.4)";
  ctx.font = "14px Rajdhani, sans-serif";
  ctx.fillText("코트 이동 WASD · 점프 SPACE · 스파이크 J", VIEW_W / 2, 520);
}

export function drawSelect(ctx: Ctx, t: number, diffIndex: number, oppIndex: number) {
  bg(ctx, t);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#eaf1ff";
  ctx.font = "40px Bungee, sans-serif";
  ctx.fillText("SELECT", VIEW_W / 2, 70);

  // difficulty row
  ctx.font = "18px Rajdhani, sans-serif";
  ctx.fillStyle = "rgba(234,241,255,0.6)";
  ctx.fillText("◀  난이도  ▶", VIEW_W / 2, 140);
  const dw = 180;
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    const x = VIEW_W / 2 + (i - diffIndex) * (dw + 20);
    const sel = i === diffIndex;
    const d = DIFFICULTIES[i];
    ctx.globalAlpha = sel ? 1 : 0.35;
    ctx.fillStyle = sel ? "#3b7dff" : "rgba(40,50,80,0.8)";
    roundRect(ctx, x - dw / 2, 165, dw, 70, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "28px Bungee, sans-serif";
    ctx.fillText(d.label, x, 190);
    ctx.font = "13px Rajdhani, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const stars = d.key === "EASY" ? "★☆☆" : d.key === "NORMAL" ? "★★☆" : "★★★";
    ctx.fillText(stars, x, 216);
  }
  ctx.globalAlpha = 1;

  // opponent
  ctx.font = "18px Rajdhani, sans-serif";
  ctx.fillStyle = "rgba(234,241,255,0.6)";
  ctx.fillText("▲  상대  ▼", VIEW_W / 2, 300);
  const opp = AI_PALETTES[oppIndex];
  // portrait
  const px = VIEW_W / 2;
  const py = 380;
  ctx.fillStyle = "rgba(8,12,26,0.7)";
  roundRect(ctx, px - 70, py - 55, 140, 130, 16);
  ctx.fill();
  // head
  ctx.fillStyle = opp.hair;
  ctx.beginPath();
  ctx.arc(px, py - 8, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = opp.skin;
  ctx.beginPath();
  ctx.arc(px, py, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = opp.hair;
  ctx.beginPath();
  ctx.arc(px, py - 6, 26, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#22283d";
  ctx.beginPath();
  ctx.arc(px - 8, py + 2, 3, 0, Math.PI * 2);
  ctx.arc(px + 8, py + 2, 3, 0, Math.PI * 2);
  ctx.fill();
  // jersey swatch
  ctx.fillStyle = opp.jersey;
  roundRect(ctx, px - 26, py + 30, 52, 22, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "22px Bungee, sans-serif";
  ctx.fillText(opp.name, px, py + 96);

  // start prompt
  const a = 0.5 + Math.sin(t * 4) * 0.5;
  ctx.globalAlpha = a;
  ctx.fillStyle = "#ffe14d";
  ctx.font = "26px Bungee, sans-serif";
  ctx.fillText("ENTER 로 시작", VIEW_W / 2, 540);
  ctx.globalAlpha = 1;
}

export function drawControls(ctx: Ctx) {
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "rgba(8,12,26,0.6)";
  roundRect(ctx, VIEW_W / 2 - 220, VIEW_H - 66, 440, 40, 10);
  ctx.fill();
  ctx.fillStyle = "#cfe0ff";
  ctx.font = "14px Rajdhani, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "WASD 코트 이동 · SPACE 점프 · J 리시브/토스/스파이크 · 공 근처 아군 자동 조종(🟢) · 네트에서 J유지=블록",
    VIEW_W / 2,
    VIEW_H - 46,
  );
  ctx.restore();
}

export function drawPause(ctx: Ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(6,10,22,0.72)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#eaf1ff";
  ctx.font = "56px Bungee, sans-serif";
  ctx.fillText("PAUSED", VIEW_W / 2, VIEW_H / 2 - 40);
  ctx.font = "20px Rajdhani, sans-serif";
  ctx.fillStyle = "rgba(234,241,255,0.8)";
  ctx.fillText("ESC 계속   ·   R 재시작   ·   M 메뉴", VIEW_W / 2, VIEW_H / 2 + 30);
  ctx.restore();
}

export function drawResult(ctx: Ctx, t: number, won: boolean, oppName: string, longestRally: number) {
  ctx.save();
  ctx.fillStyle = "rgba(6,10,22,0.8)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const pop = 1 + Math.sin(t * 3) * 0.03;
  ctx.save();
  ctx.translate(VIEW_W / 2, 200);
  ctx.scale(pop, pop);
  ctx.font = "72px Bungee, sans-serif";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#0a0e1c";
  const text = won ? "YOU WIN!" : "YOU LOSE";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = won ? "#7dffa8" : "#ff8a8a";
  ctx.fillText(text, 0, 0);
  ctx.restore();

  ctx.fillStyle = "rgba(234,241,255,0.85)";
  ctx.font = "22px Rajdhani, sans-serif";
  ctx.fillText(won ? `${oppName} 격파!` : `${oppName}에게 패배…`, VIEW_W / 2, 300);
  ctx.fillStyle = "#ffe14d";
  ctx.font = "18px Rajdhani, sans-serif";
  ctx.fillText(`최장 랠리: ${longestRally}회`, VIEW_W / 2, 340);

  const a = 0.5 + Math.sin(t * 4) * 0.5;
  ctx.globalAlpha = a;
  ctx.fillStyle = "#fff";
  ctx.font = "24px Bungee, sans-serif";
  ctx.fillText("ENTER 다시하기   ·   ESC 메뉴", VIEW_W / 2, 440);
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
