/**
 * Headless self-play harness for the 3D court sim. A scripted bot plays the
 * near team against the AI to stress physics, scoring, serve and set/match flow.
 */
// @ts-nocheck
const timers: Array<() => void> = [];
(globalThis as any).window = { setTimeout: (fn: () => void) => (timers.push(fn), 0) };

import { World } from "../src/game/world";
import { DIFFICULTIES, AI_PALETTES, NET_Z, NET_H, REACH_XZ } from "../src/game/config";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

function botIntent(world: World) {
  const f = world.activeFighter;
  const b = world.ball;
  const tx = b.x;
  const tz = Math.min(b.z, NET_Z - 30);
  const moveX = clamp((tx - f.x) / 22, -1, 1);
  const moveZ = clamp((tz - f.z) / 22, -1, 1);
  const distXZ = Math.hypot(b.x - f.x, b.z - f.z);
  const jump = f.onGround && distXZ < REACH_XZ * 1.5 && b.y > NET_H - 12 && b.z < NET_Z;
  const hit = distXZ < REACH_XZ * 1.15 && b.y > f.y + 8 && b.y < f.y + 120;
  return { moveX, moveZ, jump, hit, hitHeld: false };
}

const world = new World(DIFFICULTIES[1], AI_PALETTES[0]);
world.startMatch();

const dt = 1 / 60;
const FRAMES = 60 * 300;
let anomalies = 0;
let maxSpeed = 0;
let scoreEvents = 0;
let prevTotal = 0;
const phaseCounts: Record<string, number> = {};
const reasons: Record<string, number> = {};

for (let i = 0; i < FRAMES; i++) {
  world.update(dt, botIntent(world));
  while (timers.length) timers.shift()!();

  const b = world.ball;
  const coords = [...world.playerTeam, ...world.aiTeam].flatMap((f: any) => [f.x, f.y, f.z]);
  if (!finite(b.x, b.y, b.z, b.vx, b.vy, b.vz) || !finite(...coords)) {
    anomalies++;
    console.error(`NaN at frame ${i}, phase=${world.phase}`);
    break;
  }
  maxSpeed = Math.max(maxSpeed, b.speed());
  phaseCounts[world.phase] = (phaseCounts[world.phase] || 0) + 1;
  const total = world.points[0] + world.points[1] + (world.sets[0] + world.sets[1]) * 7;
  if (total > prevTotal) {
    scoreEvents++;
    prevTotal = total;
    (reasons as any)[world.lastPointReason] = ((reasons as any)[world.lastPointReason] || 0) + 1;
  }
  if (world.matchWinner !== null) {
    console.log(`Match ended at frame ${i} (${(i / 60).toFixed(1)}s)`);
    break;
  }
}

console.log("--- HEADLESS 3D SIM REPORT ---");
console.log("anomalies (NaN):", anomalies);
console.log("score events:", scoreEvents);
console.log("points:", world.points, "sets:", world.sets, "winner:", world.matchWinner);
console.log("longest rally:", world.longestRally, "max speed:", maxSpeed.toFixed(0));
console.log("point reasons:", reasons);
console.log("phase frames:", phaseCounts);
console.log(anomalies === 0 && scoreEvents > 0 ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
