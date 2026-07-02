/**
 * Verifies serves clear the net and land in the opponent's court (3D). Uses the
 * real Ball physics and replicates the World serve solve (target + flight time).
 */
// @ts-nocheck
import { Ball } from "../src/game/ball";
import { COURT_W, COURT_L, NET_Z, GRAVITY } from "../src/game/config";

function solveTo(b: Ball, tx: number, tz: number, T: number) {
  return {
    vx: (tx - b.x) / T,
    vy: (0.5 * GRAVITY * T * T - b.y) / T,
    vz: (tz - b.z) / T,
  };
}

function trySer(x: number, contactY: number, side: -1 | 1) {
  const dirNet = -side;
  const b = new Ball();
  b.reset(x, contactY, side === -1 ? -14 : COURT_L + 14);
  b.live = true;
  const tx = Math.max(40, Math.min(COURT_W - 40, x));
  const tz = NET_Z + dirNet * 195;
  const v = solveTo(b, tx, tz, 1.3);
  b.setVelocity(v.vx, v.vy, v.vz);
  let hardNet = false;
  for (let i = 0; i < 1400; i++) {
    for (const e of b.update(1 / 120)) {
      if (e.type === "net") hardNet = true;
      if (e.type === "floor") {
        const landSide = e.z < NET_Z ? -1 : 1;
        return { landZ: Math.round(e.z), landSide, inBounds: e.inBounds, hardNet, ok: landSide === dirNet && e.inBounds && !hardNet };
      }
    }
  }
  return { landZ: -1, landSide: 0, inBounds: false, hardNet, ok: false };
}

let pass = 0;
let fail = 0;
const rows: string[] = [];
for (const side of [-1, 1] as const) {
  for (const x of [60, COURT_W / 2, COURT_W - 60]) {
    for (const cy of [40, 60, 90]) {
      const r = trySer(x, cy, side);
      r.ok ? pass++ : fail++;
      rows.push(`side=${side} x=${x} cy=${cy} -> landZ=${r.landZ} side=${r.landSide} in=${r.inBounds} net=${r.hardNet} ${r.ok ? "OK" : "FAIL"}`);
    }
  }
}
console.log("--- SERVE TRAJECTORY TEST (3D) ---");
for (const r of rows) console.log(r);
console.log(`pass=${pass} fail=${fail}`);
console.log(fail === 0 ? "RESULT: PASS ✅" : "RESULT: FAIL ❌");
