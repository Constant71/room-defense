import { Application, Graphics } from 'pixi.js';
import { FixedStepLoop, FpsMeter } from './loop';
import { TestPattern } from './testPattern';
import { Gamepads } from './input/gamepads';
import { KeyboardMouse } from './input/keyboardMouse';
import { ProjectorPanel } from './ui/projectorPanel';
import { InputPanel } from './ui/inputPanel';
import { GamepadPanel } from './ui/gamepadPanel';

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    background: 0x000000,
    width: window.innerWidth,
    height: window.innerHeight,
    resolution: window.devicePixelRatio,
    autoDensity: true,
    antialias: true,
  });
  byId('stage').append(app.canvas);

  const pattern = new TestPattern();
  const cursor = new Graphics();
  app.stage.addChild(pattern, cursor);

  // Moving to another display can change the size and the device pixel ratio.
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    app.renderer.resize(w, h, window.devicePixelRatio);
    pattern.layout(w, h, window.devicePixelRatio);
  };
  window.addEventListener('resize', resize);
  resize();

  const km = new KeyboardMouse();
  const pads = new Gamepads();
  new ProjectorPanel(byId('projector-panel'));
  const inputPanel = new InputPanel(byId('input-panel'));
  const gamepadPanel = new GamepadPanel(byId('gamepad-panel'));

  const fpsEl = byId('fps');
  const hud = byId('hud');
  km.onPress('F3', () => (fpsEl.hidden = !fpsEl.hidden));
  km.onPress('KeyH', () => (hud.hidden = !hud.hidden));

  // Simulation: 60 fixed steps per second. Milestone 1 only polls input here.
  let padsChanged = false;
  const loop = new FixedStepLoop(() => {
    if (pads.poll()) padsChanged = true;
  });
  const meter = new FpsMeter();

  app.ticker.add((ticker) => {
    const steps = loop.advance(ticker.deltaMS);
    if (meter.sample(ticker.deltaMS, steps)) {
      fpsEl.textContent = `${meter.fps.toFixed(0)} fps · sim ${meter.ticksPerSecond.toFixed(0)} Hz · worst ${meter.worstFrameMs.toFixed(1)} ms`;
    }

    gamepadPanel.update(pads, padsChanged);
    padsChanged = false;
    inputPanel.update(km);

    cursor.clear();
    if (km.mouseInside) {
      const s = 14;
      cursor
        .moveTo(km.mouseX - s, km.mouseY)
        .lineTo(km.mouseX + s, km.mouseY)
        .moveTo(km.mouseX, km.mouseY - s)
        .lineTo(km.mouseX, km.mouseY + s)
        .stroke({ width: 2, color: km.mouseButtons ? 0xff00ff : 0xffff00 });
    }
  });
}

void main();
