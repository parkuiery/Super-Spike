/** Logical resolution — the canvas is scaled to fit the window while keeping this aspect. */
export const VIEW_W = 960;
export const VIEW_H = 600;

/**
 * The game is played on a 3D court seen from a 3/4 top-down perspective.
 * World axes:
 *   x  — across the court (0 .. COURT_W), left to right
 *   z  — depth along the court (0 .. COURT_L); 0 = near baseline, COURT_L = far
 *   y  — height above the floor (0 = ground, up is positive)
 * The near team (player) defends the small-z half; the far team (AI) the large-z half.
 */
export const COURT_W = 360;
export const COURT_L = 760;
export const NET_Z = COURT_L / 2;
export const NET_H = 66; // net height in world units
export const NET_BAND = 12; // net thickness in z for ball collision

/** Physics (world units, seconds). */
export const GRAVITY = 430; // ball gravity
export const BALL_R = 11;
export const BALL_RESTITUTION = 0.5;
export const BALL_MAX_SPEED = 1000;
export const AIR_DRAG = 0.999;

/** Characters (world units). */
export const MOVE_SPEED = 205;
export const MOVE_ACCEL = 1500;
export const AIR_CONTROL = 0.5;
export const JUMP_V = 250; // initial jump speed (y)
export const CHAR_GRAVITY = 640;
export const REACH_XZ = 44; // horizontal reach radius on the court plane
export const REACH_Y = 78; // how high the arms reach while grounded
export const SPIKE_REACH_Y = 118; // reach while airborne
export const CHAR_HEIGHT = 74; // world height of a standing player (for the head)

/** Hit tuning (world-unit velocities). */
export const HIT_COOLDOWN = 0.12;
export const PERFECT_WINDOW = 0.11;
export const SPIKE_POWER = 620;
export const BUMP_UP = 300;

/** Match rules. */
export const POINTS_TO_WIN_SET = 7;
export const SETS_TO_WIN_MATCH = 2; // best of 3
export const WIN_BY_TWO = true;

export const TEAM_SIZE = 3;

export type Side = -1 | 1; // -1 = near (player), 1 = far (AI)

/** Home position for a fighter by side and role index (0 back-left, 1 back-right, 2 front/net). */
export function homePos(side: Side, role: number): { x: number; z: number } {
  const xs = [COURT_W * 0.27, COURT_W * 0.73, COURT_W * 0.5];
  const nearZ = [NET_Z * 0.34, NET_Z * 0.34, NET_Z * 0.8];
  const x = xs[role];
  const z = side === -1 ? nearZ[role] : COURT_L - nearZ[role];
  return { x, z };
}

export type HairStyle = "spiky" | "ponytail" | "swept" | "mohawk";

export interface Palette {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairLight: string;
  jersey: string;
  jerseyShade: string;
  trim: string;
  shorts: string;
  shoe: string;
  accent: string;
  style: HairStyle;
  name: string;
}

export const PLAYER_PALETTE: Palette = {
  skin: "#ffce9e",
  skinShade: "#e8ad78",
  hair: "#2b2f4a",
  hairShade: "#1c1f33",
  hairLight: "#4a5688",
  jersey: "#3b7dff",
  jerseyShade: "#2456c7",
  trim: "#eaf1ff",
  shorts: "#1b2b52",
  shoe: "#f5f7ff",
  accent: "#6fd3ff",
  style: "spiky",
  name: "YOU",
};

export const AI_PALETTES: Palette[] = [
  {
    skin: "#ffd9b0",
    skinShade: "#eab98a",
    hair: "#b23a48",
    hairShade: "#83232f",
    hairLight: "#e0616f",
    jersey: "#ff5252",
    jerseyShade: "#c62828",
    trim: "#fff0f0",
    shorts: "#4a1414",
    shoe: "#2a2a2a",
    accent: "#ff7a4d",
    style: "mohawk",
    name: "BLAZE",
  },
  {
    skin: "#f2c69b",
    skinShade: "#d6a274",
    hair: "#2e7d32",
    hairShade: "#1b5e20",
    hairLight: "#57b85c",
    jersey: "#26c281",
    jerseyShade: "#159c63",
    trim: "#e9fff5",
    shorts: "#0f3d2b",
    shoe: "#ffffff",
    accent: "#5affc0",
    style: "ponytail",
    name: "IVY",
  },
  {
    skin: "#e9b48a",
    skinShade: "#c89468",
    hair: "#6a1b9a",
    hairShade: "#4a148c",
    hairLight: "#9d4bd0",
    jersey: "#ab47bc",
    jerseyShade: "#7b1fa2",
    trim: "#f7e9ff",
    shorts: "#3b1147",
    shoe: "#1a1a1a",
    accent: "#d17aff",
    style: "swept",
    name: "NOVA",
  },
];

export interface Difficulty {
  key: "EASY" | "NORMAL" | "HARD";
  label: string;
  reaction: number;
  speedMul: number;
  errorXZ: number; // aiming error in world units
  jumpSkill: number;
  aggression: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { key: "EASY", label: "EASY", reaction: 0.28, speedMul: 0.82, errorXZ: 46, jumpSkill: 0.35, aggression: 0.4 },
  { key: "NORMAL", label: "NORMAL", reaction: 0.17, speedMul: 0.96, errorXZ: 26, jumpSkill: 0.6, aggression: 0.62 },
  { key: "HARD", label: "HARD", reaction: 0.09, speedMul: 1.08, errorXZ: 12, jumpSkill: 0.85, aggression: 0.82 },
];
