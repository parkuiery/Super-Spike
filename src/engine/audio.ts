/**
 * Procedural SFX + music via Web Audio. No asset files needed — everything is
 * synthesized, so the game ships tiny and loads instantly.
 */
type SfxName =
  | "bump"
  | "set"
  | "spike"
  | "block"
  | "whistle"
  | "point"
  | "bounce"
  | "jump"
  | "ui"
  | "perfect"
  | "cheer"
  | "buzzer";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private musicTimer: number | null = null;
  muted = false;

  /** Must be called from a user gesture (autoplay policy). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    dest: GainNode,
    slideTo?: number,
  ) {
    if (!this.ctx) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, dest: GainNode, hp = 800) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t);
  }

  play(name: SfxName, power = 1) {
    if (!this.ctx || this.muted) return;
    const d = this.sfxGain;
    switch (name) {
      case "jump":
        this.tone(220, 0.14, "sine", 0.25, d, 420);
        break;
      case "bump":
        this.tone(320, 0.09, "triangle", 0.32, d, 260);
        this.noise(0.05, 0.12, d, 1200);
        break;
      case "set":
        this.tone(500, 0.1, "sine", 0.28, d, 700);
        break;
      case "spike":
        this.tone(180, 0.18, "sawtooth", 0.35 * power, d, 60);
        this.noise(0.14, 0.35 * power, d, 500);
        break;
      case "block":
        this.tone(140, 0.16, "square", 0.34, d, 90);
        this.noise(0.1, 0.28, d, 700);
        break;
      case "bounce":
        this.tone(240, 0.07, "triangle", 0.2, d, 150);
        break;
      case "whistle":
        this.tone(1900, 0.16, "sine", 0.22, d, 2100);
        this.tone(2300, 0.16, "sine", 0.16, d, 2500);
        break;
      case "buzzer":
        this.tone(160, 0.5, "square", 0.3, d, 150);
        break;
      case "point":
        this.tone(520, 0.1, "square", 0.28, d);
        window.setTimeout(() => this.tone(700, 0.14, "square", 0.28, d), 90);
        break;
      case "perfect":
        this.tone(660, 0.09, "sine", 0.3, d);
        window.setTimeout(() => this.tone(880, 0.09, "sine", 0.3, d), 80);
        window.setTimeout(() => this.tone(1320, 0.16, "sine", 0.3, d), 160);
        break;
      case "ui":
        this.tone(600, 0.06, "square", 0.2, d, 720);
        break;
      case "cheer":
        this.noise(0.6, 0.16, d, 500);
        break;
    }
  }

  // Simple looping bassline/arpeggio for menu + match energy ---------------
  private musicStep = 0;
  startMusic(bpm = 128) {
    if (!this.ctx || this.musicTimer !== null) return;
    const interval = (60 / bpm / 2) * 1000; // eighth notes
    const scale = [0, 3, 5, 7, 10, 12, 10, 7]; // minor pentatonic-ish
    const root = 110;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => {
      const s = this.musicStep++;
      // bass on downbeats
      if (s % 4 === 0) {
        this.tone(root * (s % 8 === 0 ? 1 : 1.5), 0.22, "triangle", 0.25, this.musicGain, root);
      }
      // arpeggio
      const note = scale[s % scale.length];
      const freq = root * 2 * Math.pow(2, note / 12);
      this.tone(freq, 0.16, "square", 0.09, this.musicGain);
      // hat
      if (s % 2 === 1) this.noise(0.03, 0.05, this.musicGain, 6000);
    }, interval);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audio = new AudioEngine();
