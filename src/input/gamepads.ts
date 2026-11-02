/**
 * Gamepad polling with hot-plug. Browsers only expose a pad after a button is
 * pressed on it, and state must be polled every frame via getGamepads().
 */

/** Button names for the W3C "standard" mapping, as labelled on an Xbox controller. */
// prettier-ignore
export const XBOX_BUTTONS = [
  'A', 'B', 'X', 'Y',
  'LB', 'RB', 'LT', 'RT',
  'View', 'Menu', 'LS', 'RS',
  'Up', 'Down', 'Left', 'Right',
  'Xbox',
] as const;

export interface PadState {
  index: number;
  id: string;
  isXbox: boolean;
  standardMapping: boolean;
  buttons: { pressed: boolean; value: number }[];
  axes: readonly number[];
}

export function isXboxPad(id: string): boolean {
  // Windows reports XInput pads as "Xbox 360 Controller (XInput STANDARD GAMEPAD)",
  // other paths include the Microsoft USB vendor id 045e.
  return /xbox|xinput|045e/i.test(id);
}

export class Gamepads {
  /** Connected pads keyed by gamepad index. */
  readonly pads = new Map<number, PadState>();
  private changed = true;

  constructor(target: Window = window) {
    target.addEventListener('gamepadconnected', () => (this.changed = true));
    target.addEventListener('gamepaddisconnected', () => (this.changed = true));
  }

  /** Poll all pads. Returns true when the set of connected pads changed. */
  poll(): boolean {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set<number>();
    for (const gp of list) {
      if (!gp || !gp.connected) continue;
      seen.add(gp.index);
      const existing = this.pads.get(gp.index);
      if (!existing || existing.id !== gp.id) this.changed = true;
      this.pads.set(gp.index, {
        index: gp.index,
        id: gp.id,
        isXbox: isXboxPad(gp.id),
        standardMapping: gp.mapping === 'standard',
        buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
        axes: gp.axes,
      });
    }
    for (const index of [...this.pads.keys()]) {
      if (!seen.has(index)) {
        this.pads.delete(index);
        this.changed = true;
      }
    }
    const changed = this.changed;
    this.changed = false;
    return changed;
  }
}
