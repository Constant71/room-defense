import type { KeyboardMouse } from '../input/keyboardMouse';
import { el } from './dom';

const MOUSE_BUTTONS = ['Left', 'Right', 'Middle', 'Back', 'Forward'];

/** Mouse and keyboard checker. */
export class InputPanel {
  private readonly pos = el('span', { class: 'value' });
  private readonly buttons = MOUSE_BUTTONS.map((name) => el('span', { class: 'chip' }, name));
  private readonly wheel = el('span', { class: 'value' });
  private readonly keys = el('div', { class: 'chips keys' });
  private readonly last = el('span', { class: 'value' });
  private keysShown = '';

  constructor(root: HTMLElement) {
    root.append(
      el('h2', {}, 'Mouse & keyboard'),
      el('div', { class: 'row' }, 'Cursor ', this.pos),
      el('div', { class: 'chips' }, ...this.buttons),
      el('div', { class: 'row' }, 'Wheel ', this.wheel),
      el('div', { class: 'row' }, 'Keys held'),
      this.keys,
      el('div', { class: 'row' }, 'Last key ', this.last),
    );
  }

  update(km: KeyboardMouse): void {
    const dpr = window.devicePixelRatio;
    this.pos.textContent = km.mouseInside
      ? `${Math.round(km.mouseX)}, ${Math.round(km.mouseY)}  (pixel ${Math.round(km.mouseX * dpr)}, ${Math.round(km.mouseY * dpr)})`
      : 'outside window';
    this.buttons.forEach((chip, i) =>
      chip.classList.toggle('on', (km.mouseButtons & (1 << i)) !== 0),
    );
    this.wheel.textContent = String(km.wheel);
    this.last.textContent = km.lastKey || '—';

    const shown = [...km.heldKeys].join(' ');
    if (shown !== this.keysShown) {
      this.keysShown = shown;
      this.keys.replaceChildren(
        ...(km.heldKeys.size
          ? [...km.heldKeys].map((code) => el('span', { class: 'chip on' }, code))
          : [el('span', { class: 'muted' }, 'none')]),
      );
    }
  }
}
