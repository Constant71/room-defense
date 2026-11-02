import { Container, Graphics, Text } from 'pixi.js';

/**
 * Projector test pattern. Bright colours on pure black only: dark colours
 * disappear on a projector, so nothing here is drawn below full brightness.
 */
const WHITE = 0xffffff;
const CYAN = 0x00ffff;
const MAGENTA = 0xff00ff;
const YELLOW = 0xffff00;
const GREEN = 0x00ff00;
const RED = 0xff0000;
const BLUE = 0x0000ff;

/** Classic bar order, all at full saturation and brightness. */
const BARS = [WHITE, YELLOW, CYAN, GREEN, MAGENTA, RED, BLUE];
const GRID = 10;

export class TestPattern extends Container {
  private readonly g = new Graphics();
  private readonly sizeText = new Text({
    text: '',
    style: { fill: WHITE, fontFamily: 'Consolas, monospace', fontSize: 24, align: 'center' },
  });

  constructor() {
    super();
    this.sizeText.anchor.set(0.5);
    this.addChild(this.g, this.sizeText);
  }

  /** Redraw for an output of w x h CSS pixels at the given device pixel ratio. */
  layout(w: number, h: number, dpr: number): void {
    const g = this.g.clear();
    const short = Math.min(w, h);
    const line = Math.max(2, Math.round(short / 400));

    // 10 x 10 grid
    for (let i = 1; i < GRID; i++) {
      const x = (w * i) / GRID;
      const y = (h * i) / GRID;
      g.moveTo(x, 0).lineTo(x, h);
      g.moveTo(0, y).lineTo(w, y);
    }
    g.stroke({ width: line, color: CYAN });

    // Diagonals corner to corner
    g.moveTo(0, 0).lineTo(w, h).moveTo(w, 0).lineTo(0, h);
    g.stroke({ width: line, color: MAGENTA });

    // Centre circle and crosshair
    const r = short * 0.2;
    g.circle(w / 2, h / 2, r).stroke({ width: line * 2, color: GREEN });
    g.moveTo(w / 2 - r * 0.15, h / 2)
      .lineTo(w / 2 + r * 0.15, h / 2)
      .moveTo(w / 2, h / 2 - r * 0.15)
      .lineTo(w / 2, h / 2 + r * 0.15)
      .stroke({ width: line, color: YELLOW });

    // Colour bars: one grid row tall, below the circle
    const barTop = (h * 7.5) / GRID;
    const barH = h / GRID;
    const barLeft = w / GRID;
    const barW = (w * 8) / GRID / BARS.length;
    BARS.forEach((color, i) => {
      g.rect(barLeft + i * barW, barTop, barW, barH).fill(color);
    });

    // White border, fully inside the output so the edges are visible
    const border = line * 3;
    g.rect(border / 2, border / 2, w - border, h - border).stroke({ width: border, color: WHITE });

    // Output resolution in device pixels (what the projector actually receives)
    this.sizeText.text = `${Math.round(w * dpr)} × ${Math.round(h * dpr)}`;
    this.sizeText.style.fontSize = Math.max(14, Math.round(short / 30));
    this.sizeText.position.set(w / 2, h / 2 + r * 0.45);
  }
}
