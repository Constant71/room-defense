import { Application, Graphics } from 'pixi.js';
import { FixedStepLoop, FpsMeter } from './loop';
import { TestPattern } from './testPattern';
import { Gamepads } from './input/gamepads';
import { KeyboardMouse } from './input/keyboardMouse';
import { ProjectorPanel } from './ui/projectorPanel';
import { InputPanel } from './ui/inputPanel';
import { GamepadPanel } from './ui/gamepadPanel';
import { Editor } from './editor/editor';
import { EditorView } from './editor/editorView';
import { EditorPanel } from './editor/editorPanel';
import { el } from './ui/dom';

type Mode = 'checks' | 'editor';
const MODE_KEY = 'roomDefense.mode';

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'editor' ? 'editor' : 'checks';
  } catch {
    return 'checks';
  }
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
  const editor = new Editor({ width: window.innerWidth, height: window.innerHeight });
  const editorView = new EditorView(editor);
  app.stage.addChild(pattern, editorView, cursor);

  // Moving to another display can change the size and the device pixel ratio.
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    app.renderer.resize(w, h, window.devicePixelRatio);
    pattern.layout(w, h, window.devicePixelRatio);
    editor.setViewport({ width: w, height: h });
  };
  window.addEventListener('resize', resize);
  resize();

  const km = new KeyboardMouse();
  const pads = new Gamepads();
  new ProjectorPanel(byId('projector-panel'));
  const inputPanel = new InputPanel(byId('input-panel'));
  const gamepadPanel = new GamepadPanel(byId('gamepad-panel'));
  const editorPanel = new EditorPanel(byId('editor-panel'), editor);

  // ---- modes ---------------------------------------------------------------
  const checksButton = el('button', {}, 'Checks');
  const editorButton = el('button', {}, 'Room editor');
  byId('mode-bar').append(
    checksButton,
    editorButton,
    el('span', { class: 'muted small' }, 'F2 switches'),
  );
  let mode: Mode = 'checks';
  const setMode = (next: Mode): void => {
    mode = next;
    const editing = mode === 'editor';
    pattern.visible = !editing;
    cursor.visible = !editing;
    editorView.visible = editing;
    editorPanel.active = editing;
    byId('editor-panel').hidden = !editing;
    byId('input-panel').hidden = editing;
    byId('gamepad-panel').hidden = editing;
    checksButton.classList.toggle('active', !editing);
    editorButton.classList.toggle('active', editing);
    if (!editing) editor.pointerMove(null);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // only a convenience
    }
  };
  checksButton.addEventListener('click', () => setMode('checks'));
  editorButton.addEventListener('click', () => setMode('editor'));
  setMode(savedMode());
  void editorPanel.restore();

  // Editor mouse input on the canvas only, so clicks on panels never draw.
  const canvas = app.canvas;
  const at = (e: MouseEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('mousedown', (e) => {
    if (mode !== 'editor') return;
    e.preventDefault();
    editor.pointerDown(at(e), e.button, e.detail === 2);
  });
  window.addEventListener('mousemove', (e) => {
    if (mode !== 'editor') return;
    editor.pointerMove(e.target === canvas ? at(e) : null);
  });
  window.addEventListener('mouseup', () => {
    if (mode === 'editor') editor.pointerUp();
  });
  canvas.addEventListener('mouseleave', () => {
    if (mode === 'editor') editor.pointerMove(null);
  });

  const fpsEl = byId('fps');
  const hud = byId('hud');
  km.onPress('F3', () => (fpsEl.hidden = !fpsEl.hidden));
  km.onPress('F2', () => setMode(mode === 'editor' ? 'checks' : 'editor'));
  km.onPress('KeyH', () => (hud.hidden = !hud.hidden));
  km.onPress('KeyP', () => hud.classList.toggle('left'));

  // Simulation: 60 fixed steps per second. Only polls input for now.
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

    if (mode === 'editor') {
      editorView.draw();
      return;
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
