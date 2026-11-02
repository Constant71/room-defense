/**
 * One text/UI size for the whole game, so panels stay readable on a projector
 * across the room. Panels use rem units (see style.css); the canvas reads
 * `uiScale.value` for its labels and handles.
 */
const KEY = 'roomDefense.uiScale';
export const UI_SCALES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
const DEFAULT = 1.5;

class UiScale {
  value: number = DEFAULT;
  private listeners = new Set<(v: number) => void>();

  constructor() {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if ((UI_SCALES as readonly number[]).includes(saved)) this.value = saved;
    } catch {
      // storage unavailable: keep the default
    }
    this.apply();
  }

  onChange(fn: (v: number) => void): void {
    this.listeners.add(fn);
  }

  step(dir: 1 | -1): void {
    const i = UI_SCALES.findIndex((s) => s >= this.value);
    const next = UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
    if (next === this.value) return;
    this.value = next;
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // only a convenience
    }
    this.apply();
  }

  private apply(): void {
    document.documentElement.style.setProperty('--ui-scale', String(this.value));
    for (const fn of this.listeners) fn(this.value);
  }
}

export const uiScale = new UiScale();
