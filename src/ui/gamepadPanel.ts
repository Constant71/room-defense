import { XBOX_BUTTONS, type Gamepads, type PadState } from '../input/gamepads';
import { el } from './dom';

const DEADZONE = 0.15;

/** Layout of the button chips, using indexes into the standard mapping. */
const BUTTON_ROWS: number[][] = [
  [6, 4, 8, 16, 9, 5, 7], // LT LB View Xbox Menu RB RT
  [12, 13, 14, 15, 10, 11], // D-pad, stick clicks
  [0, 1, 2, 3], // A B X Y
];

interface Card {
  root: HTMLElement;
  chips: Map<number, HTMLElement>;
  sticks: { dot: HTMLElement; readout: HTMLElement; ring: HTMLElement }[];
  triggers: { fill: HTMLElement; readout: HTMLElement }[];
}

/** Controller checker: one card per connected pad, everything lights up when used. */
export class GamepadPanel {
  private readonly cards = new Map<number, Card>();
  private readonly list = el('div', { class: 'pads' });
  private readonly status = el('p', {});

  constructor(root: HTMLElement) {
    root.append(el('h2', {}, 'Controllers'), this.status, this.list);
    this.renderStatus(0);
  }

  update(pads: Gamepads, setChanged: boolean): void {
    if (setChanged) this.rebuild(pads);
    for (const [index, pad] of pads.pads) {
      const card = this.cards.get(index);
      if (card) this.paint(card, pad);
    }
  }

  private rebuild(pads: Gamepads): void {
    this.cards.clear();
    this.list.replaceChildren();
    for (const pad of [...pads.pads.values()].sort((a, b) => a.index - b.index)) {
      const card = this.makeCard(pad);
      this.cards.set(pad.index, card);
      this.list.append(card.root);
    }
    this.renderStatus(pads.pads.size);
  }

  private renderStatus(count: number): void {
    this.status.className = count ? 'ok' : 'warn';
    this.status.textContent = count
      ? `${count} controller${count > 1 ? 's' : ''} connected.`
      : 'No controller detected. Plug in an Xbox controller and press any button on it (browsers only show a controller after a button press).';
  }

  private makeCard(pad: PadState): Card {
    const chips = new Map<number, HTMLElement>();
    const rows = BUTTON_ROWS.map((row) =>
      el(
        'div',
        { class: 'chips' },
        ...row.map((i) => {
          const chip = el('span', { class: 'chip' }, XBOX_BUTTONS[i] ?? `B${i}`);
          chips.set(i, chip);
          return chip;
        }),
      ),
    );
    // Any extra buttons beyond the standard 17
    const extra = pad.buttons.slice(XBOX_BUTTONS.length).map((_, k) => {
      const i = XBOX_BUTTONS.length + k;
      const chip = el('span', { class: 'chip' }, `B${i}`);
      chips.set(i, chip);
      return chip;
    });
    if (extra.length) rows.push(el('div', { class: 'chips' }, ...extra));

    const triggers = ['LT', 'RT'].map((name) => {
      const fill = el('div', { class: 'bar-fill' });
      const readout = el('span', { class: 'value' });
      return {
        fill,
        readout,
        row: el('div', { class: 'row' }, `${name} `, el('div', { class: 'bar' }, fill), readout),
      };
    });

    const sticks = ['Left stick', 'Right stick'].map((name) => {
      const dot = el('div', { class: 'stick-dot' });
      const ring = el('div', { class: 'stick' }, dot);
      const readout = el('div', { class: 'value' });
      return {
        dot,
        ring,
        readout,
        box: el('div', { class: 'stick-box' }, el('div', {}, name), ring, readout),
      };
    });

    const kind = pad.isXbox ? 'Xbox controller' : 'Gamepad (not recognised as Xbox)';
    const warnings: HTMLElement[] = [];
    if (!pad.standardMapping) {
      warnings.push(
        el('p', { class: 'warn' }, 'Non-standard button mapping: labels below may not match.'),
      );
    }

    const root = el(
      'div',
      { class: 'pad' },
      el('div', { class: 'pad-title' }, `#${pad.index + 1} ${kind}`),
      el('div', { class: 'muted small' }, pad.id),
      ...warnings,
      ...rows,
      ...triggers.map((t) => t.row),
      el('div', { class: 'sticks' }, ...sticks.map((s) => s.box)),
    );
    return { root, chips, sticks, triggers };
  }

  private paint(card: Card, pad: PadState): void {
    for (const [i, chip] of card.chips) {
      const b = pad.buttons[i];
      chip.classList.toggle('on', !!b && (b.pressed || b.value > 0.1));
    }
    [6, 7].forEach((buttonIndex, k) => {
      const value = pad.buttons[buttonIndex]?.value ?? 0;
      const t = card.triggers[k];
      t.fill.style.width = `${Math.round(value * 100)}%`;
      t.readout.textContent = value.toFixed(2);
    });
    card.sticks.forEach((stick, k) => {
      const x = pad.axes[k * 2] ?? 0;
      const y = pad.axes[k * 2 + 1] ?? 0;
      const active = Math.hypot(x, y) > DEADZONE || !!pad.buttons[10 + k]?.pressed;
      stick.dot.style.transform = `translate(${x * 1.625}rem, ${y * 1.625}rem)`;
      stick.ring.classList.toggle('on', active);
      stick.readout.textContent = `${x.toFixed(2)}, ${y.toFixed(2)}`;
    });
  }
}
