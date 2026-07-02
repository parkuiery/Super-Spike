/**
 * Verifies the serve trajectory clears the net and lands in the opponent's
 * half from realistic serve positions, using the real Ball physics (net +
 * floor collisions). Run via esbuild.
 */
// @ts-nocheck
import { Ball } from "../src/game/ball";
import { NET_X, WALL_L, WALL_R, FLOOR_Y } from "../src/game/config";

function trySer(x: number, contactY: number, side: -1 | 1) {
  const opponentDir = -side;
  const b = new Ball();
  b.reset(x, contactY);
  b.live = true;
  // mid of the tuned serve range
  b.setVelocity(opponentDir * 465, -855);
  let hardNet = false;
  for (let i = 0; i < 1200; i++) {
    const events = b.update(1 / 120);
    for (const e of events) {
      if (e.type === "net") hardNet = true;
      if (e.type === "floor") {
        const landSide = e.x < NET_X ? -1 : 1;
        return { landSide, landX: Math.round(e.x), hardNet, crossedToOpp: landSide === opponentDir };
      }
    }
  }
  return { landSide: 0, landX: -1, hardNet, crossedToOpp: false };
}

let pass = 0;
let fail = 0;
const rows: string[] = [];
const leftPositions = [WALL_L + 70, WALL_L + 140, 300, NET_X - 130];
for (const x of leftPositions) {
  for (const cy of [385, 410, 440]) {
    const r = trySer(x, cy, -1);
    const ok = r.crossedToOpp && !r.hardNet;
    if (ok) pass++;
    else fail++;
    rows.push(
      `L x=${x} cy=${cy} -> land x=${r.landX} side=${r.landSide} hardNet=${r.hardNet} ${ok ? "OK" : "FAIL"}`,
    );
  }
}
// mirror check on the right (AI serves)
for (const x of [WALL_R - 70, WALL_R - 140, 660]) {
  const r = trySer(x, 410, 1);
  const ok = r.crossedToOpp && !r.hardNet;
  if (ok) pass++;
  else fail++;
  rows.push(`R x=${x} cy=410 -> land x=${r.landX} side=${r.landSide} hardNet=${r.hardNet} ${ok ? "OK" : "FAIL"}`);
}

console.log("--- SERVE TRAJECTORY TEST ---");
for (const r of rows) console.log(r);
console.log(`pass=${pass} fail=${fail}`);
console.log(fail === 0 ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
