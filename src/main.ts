import "./style.css";
import { Input } from "./engine/input";
import { audio } from "./engine/audio";
import { VIEW_W, VIEW_H, AI_PALETTES, DIFFICULTIES, type Difficulty, type Palette } from "./game/config";
import { World } from "./game/world";
import { Renderer } from "./game/render";
import { drawTitle, drawSelect, drawPause, drawResult, drawControls } from "./game/menus";

type State = "title" | "select" | "match" | "paused";

class Game {
  canvas = document.getElementById("game") as HTMLCanvasElement;
  ctx = this.canvas.getContext("2d")!;
  input = new Input(this.canvas);
  renderer = new Renderer(this.ctx);
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  state: State = "title";
  world: World | null = null;
  diffIndex = 1;
  oppIndex = 0;
  menuBallY = 120;
  menuBallVY = 0;
  time = 0;
  last = 0;
  resultShown = false;

  constructor() {
    this.resize();
    window.addEventListener("resize", () => this.resize());
    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
    // resume audio on first gesture
    const kick = () => audio.ensure();
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
    requestAnimationFrame((t) => {
      this.last = t;
      this.loop(t);
    });
  }

  resize() {
    const margin = 24;
    const availW = window.innerWidth - margin;
    const availH = window.innerHeight - margin;
    const scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    const cssW = Math.floor(VIEW_W * scale);
    const cssH = Math.floor(VIEW_H * scale);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(VIEW_W * this.dpr);
    this.canvas.height = Math.floor(VIEW_H * this.dpr);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
  }

  private get difficulty(): Difficulty {
    return DIFFICULTIES[this.diffIndex];
  }
  private get opponent(): Palette {
    return AI_PALETTES[this.oppIndex];
  }

  startMatch() {
    this.world = new World(this.difficulty, this.opponent);
    this.world.startMatch();
    this.state = "match";
    this.resultShown = false;
    audio.stopMusic();
    audio.startMusic(138);
  }

  loop = (t: number) => {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.05) dt = 0.05; // clamp large gaps (tab switch)
    this.time += dt;
    this.input.begin();

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    switch (this.state) {
      case "title":
        this.updateTitle();
        break;
      case "select":
        this.updateSelect();
        break;
      case "match":
        this.updateMatch(dt);
        break;
      case "paused":
        this.updatePaused();
        break;
    }

    requestAnimationFrame(this.loop);
  };

  // ------------------------------------------------------------- title
  private updateTitle() {
    this.menuBallVY += 900 * (1 / 60);
    this.menuBallY += this.menuBallVY * (1 / 60);
    if (this.menuBallY > 360) {
      this.menuBallY = 360;
      this.menuBallVY = -520;
    }
    drawTitle(this.ctx, this.time, this.menuBallY);
    if (this.input.anyPressed()) {
      audio.ensure();
      audio.play("ui");
      this.state = "select";
    }
  }

  // ------------------------------------------------------------- select
  private updateSelect() {
    if (this.input.pressed("ArrowLeft", "KeyA")) {
      this.diffIndex = (this.diffIndex + DIFFICULTIES.length - 1) % DIFFICULTIES.length;
      audio.play("ui");
    }
    if (this.input.pressed("ArrowRight", "KeyD")) {
      this.diffIndex = (this.diffIndex + 1) % DIFFICULTIES.length;
      audio.play("ui");
    }
    if (this.input.pressed("ArrowUp", "KeyW")) {
      this.oppIndex = (this.oppIndex + AI_PALETTES.length - 1) % AI_PALETTES.length;
      audio.play("ui");
    }
    if (this.input.pressed("ArrowDown", "KeyS")) {
      this.oppIndex = (this.oppIndex + 1) % AI_PALETTES.length;
      audio.play("ui");
    }
    if (this.input.pressed("Escape")) {
      this.state = "title";
      audio.play("ui");
    }
    if (this.input.pressed("Enter", "Space", "KeyJ") || this.input.pointerPressed) {
      audio.play("whistle");
      this.startMatch();
      return;
    }
    drawSelect(this.ctx, this.time, this.diffIndex, this.oppIndex);
  }

  // ------------------------------------------------------------- match
  private updateMatch(dt: number) {
    const world = this.world!;
    // pause
    if (this.input.pressed("Escape", "KeyP") && !world.matchWinner) {
      this.state = "paused";
      audio.play("ui");
      audio.stopMusic();
      return;
    }

    const intent = {
      moveX: this.input.moveX,
      jump: this.input.jumpPressed(),
      hit: this.input.hitPressed(),
      hitHeld: this.input.hitHeld(),
    };
    world.update(dt, intent);

    // draw with screen shake
    const shake = world.effects.shakeOffset();
    this.ctx.save();
    this.ctx.translate(shake.x, shake.y);
    this.renderer.drawWorld(world, dt);
    this.ctx.restore();
    world.effects.renderFlash(this.ctx, VIEW_W, VIEW_H);

    // controls hint early on
    if (this.time < 9999 && world.sets[0] + world.sets[1] === 0 && world.points[0] + world.points[1] === 0) {
      drawControls(this.ctx);
    }

    // result overlay
    if (world.matchWinner !== null) {
      audio.stopMusic();
      drawResult(this.ctx, this.time, world.matchWinner === -1, world.aiName, world.longestRally);
      if (this.input.pressed("KeyR", "Enter", "Space")) {
        audio.play("ui");
        this.startMatch();
      }
      if (this.input.pressed("Escape", "KeyM")) {
        audio.play("ui");
        this.state = "title";
      }
    }
  }

  // ------------------------------------------------------------- paused
  private updatePaused() {
    // draw frozen world underneath
    if (this.world) {
      this.renderer.drawWorld(this.world, 0);
    }
    drawPause(this.ctx);
    if (this.input.pressed("Escape", "KeyP", "Enter")) {
      this.state = "match";
      audio.play("ui");
      audio.startMusic(138);
    }
    if (this.input.pressed("KeyM")) {
      this.state = "title";
      audio.play("ui");
    }
    if (this.input.pressed("KeyR")) {
      this.startMatch();
    }
  }
}

new Game();
