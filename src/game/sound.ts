/**
 * Sound effects synthesised with Web Audio: no sound files to ship.
 * Browsers only allow audio after a key press or click, so the context is
 * (re)started on the first one. Volume and mute are remembered.
 */
export type SoundName =
  | 'shot-pulse'
  | 'shot-lance'
  | 'shot-frost'
  | 'kill'
  | 'leak'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'error'
  | 'wave-start'
  | 'wave-clear'
  | 'won'
  | 'lost';

const KEY = 'roomDefense.sound';
/** Minimum time between two plays of the same sound, so 10 towers don't make a wall of noise. */
const MIN_GAP_MS: Partial<Record<SoundName, number>> = {
  'shot-pulse': 70,
  'shot-lance': 90,
  'shot-frost': 150,
  kill: 45,
  leak: 120,
};

export class Sound {
  volume = 0.6;
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<SoundName, number>();
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
        volume?: number;
        muted?: boolean;
      } | null;
      if (saved && typeof saved.volume === 'number')
        this.volume = Math.min(1, Math.max(0, saved.volume));
      if (saved && typeof saved.muted === 'boolean') this.muted = saved.muted;
    } catch {
      // keep defaults
    }
    const unlock = (): void => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.volume > 0) this.muted = false;
    this.changed();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.changed();
  }

  private changed(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try {
      localStorage.setItem(KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {
      // only a convenience
    }
    for (const fn of this.listeners) fn();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    // Gentle limiter so many sounds at once don't clip.
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    return this.ctx;
  }

  play(name: SoundName): void {
    if (this.muted || this.volume === 0) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = performance.now();
    const gap = MIN_GAP_MS[name];
    if (gap && now - (this.last.get(name) ?? -Infinity) < gap) return;
    this.last.set(name, now);
    const t = ctx.currentTime;
    switch (name) {
      case 'shot-pulse':
        this.tone(t, 880, 0.05, 'square', 0.08, 660);
        break;
      case 'shot-lance':
        this.tone(t, 300, 0.16, 'sawtooth', 0.12, 90);
        break;
      case 'shot-frost':
        this.tone(t, 1400, 0.22, 'sine', 0.1, 500);
        this.noise(t, 0.15, 0.04, 3000);
        break;
      case 'kill':
        this.tone(t, 520, 0.07, 'triangle', 0.14, 1250);
        break;
      case 'leak':
        this.tone(t, 110, 0.35, 'square', 0.18, 70);
        break;
      case 'build':
        this.tone(t, 523, 0.08, 'triangle', 0.18);
        this.tone(t + 0.08, 784, 0.12, 'triangle', 0.18);
        break;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.06, f, 0.1, 'triangle', 0.16));
        break;
      case 'sell':
        this.tone(t, 659, 0.08, 'triangle', 0.15);
        this.tone(t + 0.08, 440, 0.12, 'triangle', 0.15);
        break;
      case 'error':
        this.tone(t, 160, 0.12, 'square', 0.1);
        break;
      case 'wave-start':
        [392, 392, 587].forEach((f, i) =>
          this.tone(t + i * 0.16, f, i === 2 ? 0.35 : 0.12, 'sawtooth', 0.12),
        );
        break;
      case 'wave-clear':
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.09, f, 0.25, 'sine', 0.2));
        break;
      case 'won':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
          this.tone(t + i * 0.14, f, 0.3, 'triangle', 0.2),
        );
        break;
      case 'lost':
        [392, 330, 262, 196].forEach((f, i) => this.tone(t + i * 0.22, f, 0.4, 'sawtooth', 0.15));
        break;
    }
  }

  /** One enveloped oscillator note, optionally sliding to `slideTo` Hz. */
  private tone(
    t: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A short burst of filtered noise (frost hiss). */
  private noise(t: number, dur: number, vol: number, cutoff: number): void {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
  }
}

export const sound = new Sound();
