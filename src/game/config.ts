/** Logical resolution — the canvas is scaled to fit the window while keeping this aspect. */
export const VIEW_W = 960;
export const VIEW_H = 600;

/** Court geometry (in logical pixels). */
export const FLOOR_Y = 512; // top of the ground
export const CEIL_Y = 40; // ball can't go above this
export const WALL_L = 40; // left playable wall
export const WALL_R = VIEW_W - 40; // right playable wall
export const COURT_W = WALL_R - WALL_L;

export const NET_X = VIEW_W / 2;
export const NET_TOP = 300; // top of the net
export const NET_W = 8;

/** Physics (units: px, seconds). */
export const GRAVITY = 1500;
export const BALL_R = 15;
export const BALL_RESTITUTION = 0.62; // floor bounce energy retained
export const BALL_MAX_SPEED = 1300;
export const AIR_DRAG = 0.999;

/** Character. */
export const CHAR_W = 54;
export const CHAR_H = 92;
export const MOVE_SPEED = 340;
export const MOVE_ACCEL = 2600;
export const AIR_CONTROL = 0.55;
export const JUMP_VELOCITY = 720;
export const CHAR_GRAVITY = 2100;
export const REACH = 74; // hit reach radius from body center
export const SPIKE_REACH = 92; // reach while airborne near apex

/** Hit tuning. */
export const HIT_COOLDOWN = 0.12;
export const PERFECT_WINDOW = 0.11; // seconds around apex/timing for perfect spike
export const SPIKE_POWER = 1180;
export const BUMP_POWER = 620;
export const SET_POWER = 540;
export const BLOCK_POWER = 900;

/** Team formation. */
export const TEAM_SIZE = 3;
/** Home x for a fighter by side and role index (0 = back, 1 = mid, 2 = front/net). */
export function homeX(side: Side, role: number): number {
  const left = [WALL_L + 70, WALL_L + 215, NET_X - 95];
  const right = [WALL_R - 70, WALL_R - 215, NET_X + 95];
  return (side === -1 ? left : right)[role];
}

/** Match rules. */
export const POINTS_TO_WIN_SET = 7;
export const SETS_TO_WIN_MATCH = 2; // best of 3
export const WIN_BY_TWO = true;

export type Side = -1 | 1; // -1 = left (player), 1 = right (AI)

export interface Palette {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  jersey: string;
  jerseyShade: string;
  trim: string;
  shorts: string;
  name: string;
}

export const PLAYER_PALETTE: Palette = {
  skin: "#ffce9e",
  skinShade: "#e8ad78",
  hair: "#2b2f4a",
  hairShade: "#1c1f33",
  jersey: "#3b7dff",
  jerseyShade: "#2456c7",
  trim: "#eaf1ff",
  shorts: "#1b2b52",
  name: "YOU",
};

export const AI_PALETTES: Palette[] = [
  {
    skin: "#ffd9b0",
    skinShade: "#eab98a",
    hair: "#b23a48",
    hairShade: "#83232f",
    jersey: "#ff5252",
    jerseyShade: "#c62828",
    trim: "#fff0f0",
    shorts: "#4a1414",
    name: "BLAZE",
  },
  {
    skin: "#f2c69b",
    skinShade: "#d6a274",
    hair: "#2e7d32",
    hairShade: "#1b5e20",
    jersey: "#26c281",
    jerseyShade: "#159c63",
    trim: "#e9fff5",
    shorts: "#0f3d2b",
    name: "IVY",
  },
  {
    skin: "#e9b48a",
    skinShade: "#c89468",
    hair: "#6a1b9a",
    hairShade: "#4a148c",
    jersey: "#ab47bc",
    jerseyShade: "#7b1fa2",
    trim: "#f7e9ff",
    shorts: "#3b1147",
    name: "NOVA",
  },
];

export interface Difficulty {
  key: "EASY" | "NORMAL" | "HARD";
  label: string;
  reaction: number; // seconds of delay before AI commits
  speedMul: number;
  errorPx: number; // aiming error in px
  jumpSkill: number; // 0..1 probability it times spikes/blocks well
  aggression: number; // 0..1 tendency to go for spikes
}

export const DIFFICULTIES: Difficulty[] = [
  { key: "EASY", label: "EASY", reaction: 0.26, speedMul: 0.82, errorPx: 90, jumpSkill: 0.35, aggression: 0.4 },
  { key: "NORMAL", label: "NORMAL", reaction: 0.16, speedMul: 0.95, errorPx: 48, jumpSkill: 0.6, aggression: 0.62 },
  { key: "HARD", label: "HARD", reaction: 0.08, speedMul: 1.08, errorPx: 20, jumpSkill: 0.85, aggression: 0.82 },
];
