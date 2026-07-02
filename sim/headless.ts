/**
 * Headless self-play harness: a scripted bot plays the human side against the
 * AI to stress the World simulation for crashes, NaNs, stalls and to confirm
 * scoring / set / match transitions all fire. Not shipped — run via esbuild.
 */
// @ts-nocheck
const timers: Array<() => void> = [];
(globalThis as any).window = {
  setTimeout: (fn: () => void) => {
    timers.push(fn);
    return 0;
  },
};

import { World } from "../src/game/world";
import { DIFFICULTIES, AI_PALETTES, NET_X, FLOOR_Y, NET_TOP, REACH } from "../src/game/config";

function finite(...xs: number[]) {
  return xs.every((x) => Number.isFinite(x));
}

function botIntent(world: World) {
  const f = world.activeFighter;
  const b = world.ball;
  let moveX = 0;
  const target = b.x < NET_X ? b.x + 10 : NET_X - 120;
  const dx = target - f.x;
  if (Math.abs(dx) > 8) moveX = Math.max(-1, Math.min(1, dx / 24));
  const distX = Math.abs(b.x - f.x);
  const ballHigh = b.y < NET_TOP + 40;
  const jump = f.onGround && distX < REACH * 1.3 && ballHigh && b.x < NET_X && b.y < FLOOR_Y - 120;
  const hit =
    distX < REACH * 1.1 &&
    b.y < f.y - 20 &&
    b.y > f.y - 160 &&
    b.x < NET_X + 20;
  return { moveX, jump, hit, hitHeld: false };
}

const world = new World(DIFFICULTIES[1], AI_PALETTES[0]);
world.startMatch();

const dt = 1 / 60;
const FRAMES = 60 * 240; // 4 simulated minutes
let anomalies = 0;
let maxSpeed = 0;
let lastPhase = world.phase;
const phaseCounts: Record<string, number> = {};
let scoreEvents = 0;
let prevTotal = 0;

for (let i = 0; i < FRAMES; i++) {
  world.update(dt, botIntent(world));
  // flush any pending setTimeouts (audio point sfx etc.)
  while (timers.length) timers.shift()!();

  const b = world.ball;
  const fighterCoords = [...world.playerTeam, ...world.aiTeam].flatMap((f: any) => [f.x, f.y]);
  if (!finite(b.x, b.y, b.vx, b.vy) || !finite(...fighterCoords)) {
    anomalies++;
    if (anomalies <= 3) console.error(`NaN at frame ${i}, phase=${world.phase}`);
    break;
  }
  maxSpeed = Math.max(maxSpeed, b.speed());
  phaseCounts[world.phase] = (phaseCounts[world.phase] || 0) + 1;
  lastPhase = world.phase;

  const total = world.points[0] + world.points[1] + (world.sets[0] + world.sets[1]) * 7;
  if (total > prevTotal) {
    scoreEvents++;
    prevTotal = total;
  }
  if (world.matchWinner !== null) {
    console.log(`Match ended at frame ${i} (${(i / 60).toFixed(1)}s)`);
    break;
  }
}

console.log("--- HEADLESS SIM REPORT ---");
console.log("anomalies (NaN):", anomalies);
console.log("score events:", scoreEvents);
console.log("points:", world.points, "sets:", world.sets);
console.log("match winner:", world.matchWinner);
console.log("longest rally:", world.longestRally);
console.log("max ball speed:", maxSpeed.toFixed(0));
console.log("last phase:", lastPhase);
console.log("phase frame distribution:", phaseCounts);
console.log(anomalies === 0 && scoreEvents > 0 ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
