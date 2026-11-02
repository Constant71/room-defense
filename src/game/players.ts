import type { Gamepads } from '../input/gamepads';
import type { KeyboardMouse } from '../input/keyboardMouse';
import type { Vec2 } from '../room/types';
import { TOWER_ORDER, type TowerKind } from './defs';

export type Action = 'place' | 'sell' | 'next' | 'prev' | 'menu';

export interface Player {
  /** 1 and 2 for controllers, 0 for the mouse. */
  id: number;
  label: string;
  color: number;
  /** World position. */
  cursor: Vec2;
  tower: TowerKind;
  /** Short feedback shown next to the cursor (e.g. why a tower can't go there). */
  note: string;
  noteUntil: number;
  active: boolean;
}

const DEADZONE = 0.15;
/** World units per second at full stick. */
const STICK_SPEED = 0.8;
const DPAD_SPEED = 0.12;
const PAD_COLORS = [0x00ffff, 0xff00ff];

// Standard-mapping button indexes (Xbox labels)
const A = 0;
const B = 1;
const X = 2;
const LB = 4;
const RB = 5;
const MENU = 9;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

/**
 * Turns controllers (up to two players) and the mouse/keyboard into cursor
 * movement and one-shot actions. Call `update` once per simulation step.
 */
export class Players {
  readonly pads: Player[] = [1, 2].map((id) => ({
    id,
    label: `P${id}`,
    color: PAD_COLORS[id - 1],
    cursor: { x: 0.5, y: 0.5 },
    tower: 'pulse',
    note: '',
    noteUntil: 0,
    active: false,
  }));
  readonly mouse: Player = {
    id: 0,
    label: 'Mouse',
    color: 0xffffff,
    cursor: { x: 0.5, y: 0.5 },
    tower: 'pulse',
    note: '',
    noteUntil: 0,
    active: false,
  };

  private prevButtons = new Map<number, boolean[]>();
  private prevKeys = new Set<string>();
  private mouseClicks: Action[] = [];

  get all(): Player[] {
    return [...this.pads, this.mouse];
  }

  /** Called from the canvas mouse handler: left = build, right = sell. */
  mouseClick(button: number): void {
    if (button === 0) this.mouseClicks.push('place');
    else if (button === 2) this.mouseClicks.push('sell');
  }

  /**
   * @param toWorld converts window pixels to world units
   * @param aspect  world width (height is 1)
   */
  update(
    dt: number,
    gamepads: Gamepads,
    km: KeyboardMouse,
    toWorld: (px: Vec2) => Vec2,
    aspect: number,
  ): { player: Player; action: Action }[] {
    const out: { player: Player; action: Action }[] = [];

    // Controllers: the first two connected become P1 and P2.
    const connected = [...gamepads.pads.values()].sort((a, b) => a.index - b.index).slice(0, 2);
    this.pads.forEach((p, i) => (p.active = i < connected.length));
    connected.forEach((pad, i) => {
      const player = this.pads[i];
      const pressed = pad.buttons.map((b) => b.pressed);
      const before = this.prevButtons.get(pad.index) ?? [];
      const down = (b: number): boolean => !!pressed[b] && !before[b];
      this.prevButtons.set(pad.index, pressed);

      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const mag = Math.hypot(ax, ay);
      if (mag > DEADZONE) {
        // Squared response: gentle near the centre, fast at the edge.
        const k = ((Math.min(1, mag) - DEADZONE) / (1 - DEADZONE)) ** 2 * STICK_SPEED * dt;
        player.cursor.x += (ax / mag) * k;
        player.cursor.y += (ay / mag) * k;
      }
      const dx = Number(!!pressed[RIGHT]) - Number(!!pressed[LEFT]);
      const dy = Number(!!pressed[DOWN]) - Number(!!pressed[UP]);
      player.cursor.x += dx * DPAD_SPEED * dt;
      player.cursor.y += dy * DPAD_SPEED * dt;
      player.cursor.x = Math.min(aspect, Math.max(0, player.cursor.x));
      player.cursor.y = Math.min(1, Math.max(0, player.cursor.y));

      if (down(A)) out.push({ player, action: 'place' });
      if (down(B)) out.push({ player, action: 'sell' });
      if (down(X) || down(RB)) out.push({ player, action: 'next' });
      if (down(LB)) out.push({ player, action: 'prev' });
      if (down(MENU)) out.push({ player, action: 'menu' });
    });
    for (const index of [...this.prevButtons.keys()]) {
      if (!gamepads.pads.has(index)) this.prevButtons.delete(index);
    }

    // Mouse and keyboard
    const m = this.mouse;
    m.active = km.mouseInside;
    if (km.mouseInside) m.cursor = toWorld({ x: km.mouseX, y: km.mouseY });
    for (const action of this.mouseClicks) out.push({ player: m, action });
    this.mouseClicks = [];
    const keyDown = (code: string): boolean => km.heldKeys.has(code) && !this.prevKeys.has(code);
    TOWER_ORDER.forEach((kind, i) => {
      if (keyDown(`Digit${i + 1}`)) m.tower = kind;
    });
    if (keyDown('KeyQ')) out.push({ player: m, action: 'prev' });
    if (keyDown('KeyE')) out.push({ player: m, action: 'next' });
    if (keyDown('Space') || keyDown('Enter')) out.push({ player: m, action: 'menu' });
    this.prevKeys = new Set(km.heldKeys);
    return out;
  }
}
