/**
 * Keyboard/pointer input for desktop. Tracks held keys plus edge-triggered
 * "pressed this frame" so gameplay can react to taps precisely.
 */
export class Input {
  private held = new Set<string>();
  private pressedBuffer = new Set<string>();
  private pressedThisFrame = new Set<string>();
  pointerDown = false;
  pointerPressed = false;
  private pointerBuffer = false;

  constructor(target: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("blur", this.onBlur);
    // Prevent page scroll from arrows/space.
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Space",
          ].includes(e.code)
        ) {
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.held.add(e.code);
    this.pressedBuffer.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };
  private onPointerDown = () => {
    this.pointerDown = true;
    this.pointerBuffer = true;
  };
  private onPointerUp = () => {
    this.pointerDown = false;
  };
  private onBlur = () => {
    this.held.clear();
    this.pointerDown = false;
  };

  /** Call once at the start of each frame to latch edge triggers. */
  begin() {
    this.pressedThisFrame = this.pressedBuffer;
    this.pressedBuffer = new Set();
    this.pointerPressed = this.pointerBuffer;
    this.pointerBuffer = false;
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }
  pressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressedThisFrame.has(c));
  }

  // Semantic helpers -------------------------------------------------------
  get moveX(): number {
    let x = 0;
    if (this.down("ArrowLeft", "KeyA")) x -= 1;
    if (this.down("ArrowRight", "KeyD")) x += 1;
    return x;
  }
  /** +1 = toward the net / far side (up the screen), -1 = toward own baseline. */
  get moveZ(): number {
    let z = 0;
    if (this.down("ArrowUp", "KeyW")) z += 1;
    if (this.down("ArrowDown", "KeyS")) z -= 1;
    return z;
  }
  jumpHeld(): boolean {
    return this.down("Space");
  }
  jumpPressed(): boolean {
    return this.pressed("Space");
  }
  hitHeld(): boolean {
    return this.down("KeyJ", "KeyK") || this.pointerDown;
  }
  hitPressed(): boolean {
    return this.pressed("KeyJ", "KeyK") || this.pointerPressed;
  }
  confirmPressed(): boolean {
    return this.pressed("Enter", "Space", "KeyJ") || this.pointerPressed;
  }
  anyPressed(): boolean {
    return this.pressedThisFrame.size > 0 || this.pointerPressed;
  }
}
