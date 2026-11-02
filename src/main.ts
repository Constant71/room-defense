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
import { uiScale } from './ui/uiScale';
import { RemoteHost } from './remote/host';
import { Play } from './game/play';

type Mode = 'checks' | 'editor' | 'play';
const MODES: Mode[] = ['checks', 'editor', 'play'];
const MODE_KEY = 'roomDefense.mode';

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

function savedMode(): Mode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return MODES.includes(saved as Mode) ? (saved as Mode) : 'checks';
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
  const play = new Play(byId('play-hud'), pads, km);
  app.stage.addChild(play.view);

  // ---- modes ---------------------------------------------------------------
  const checksButton = el('button', {}, 'Checks');
  const editorButton = el('button', {}, 'Room editor');
  const playButton = el('button', {}, 'Play');
  const smaller = el('button', { title: 'Smaller text (-)' }, 'A−');
  const bigger = el('button', { title: 'Bigger text (=)' }, 'A+');
  const sizeLabel = el('span', { class: 'value' });
  smaller.addEventListener('click', () => uiScale.step(-1));
  bigger.addEventListener('click', () => uiScale.step(1));
  byId('mode-bar').append(
    checksButton,
    editorButton,
    playButton,
    el('span', { class: 'spacer' }),
    el('span', {}, 'Text'),
    smaller,
    sizeLabel,
    bigger,
  );
  const applyScale = (v: number): void => {
    sizeLabel.textContent = `${Math.round(v * 100)}%`;
    editor.handleScale = v;
  };
  uiScale.onChange(applyScale);
  applyScale(uiScale.value);
  let mode: Mode = 'checks';
  // Panels are hidden while playing (they would cover the room) and come back after.
  let hudHiddenBeforePlay = false;
  const setMode = (next: Mode): void => {
    const leavingPlay = mode === 'play' && next !== 'play';
    const enteringPlay = mode !== 'play' && next === 'play';
    const hudEl = byId('hud');
    if (enteringPlay) {
      hudHiddenBeforePlay = hudEl.hidden;
      hudEl.hidden = true;
    } else if (leavingPlay) {
      hudEl.hidden = hudHiddenBeforePlay;
    }
    mode = next;
    const checks = mode === 'checks';
    const editing = mode === 'editor';
    const playing = mode === 'play';
    pattern.visible = checks;
    cursor.visible = checks;
    editorView.visible = editing;
    play.view.visible = playing;
    editorPanel.active = editing;
    byId('editor-panel').hidden = !editing;
    byId('phone-panel').hidden = !editing;
    byId('input-panel').hidden = !checks;
    byId('gamepad-panel').hidden = !checks;
    byId('projector-panel').hidden = playing || !!document.fullscreenElement;
    byId('play-hud').hidden = !playing;
    checksButton.classList.toggle('active', checks);
    editorButton.classList.toggle('active', editing);
    playButton.classList.toggle('active', playing);
    if (!editing) editor.pointerMove(null);
    if (playing) play.enter(editor.room);
    if (leavingPlay && play.game?.phase === 'wave' && !play.game.paused) play.game.togglePause();
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // only a convenience
    }
  };
  // Blur after clicking so Space (start wave) can't re-press the button.
  for (const [b, m] of [
    [checksButton, 'checks'],
    [editorButton, 'editor'],
    [playButton, 'play'],
  ] as const) {
    b.addEventListener('click', () => {
      setMode(m);
      b.blur();
    });
  }
  setMode(savedMode());
  void editorPanel.restore();
  void new RemoteHost(byId('phone-panel'), editor, editorPanel, () => {
    if (mode !== 'editor') setMode('editor');
  }).start();

  // Editor mouse input on the canvas only, so clicks on panels never draw.
  const canvas = app.canvas;
  const at = (e: MouseEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('mousedown', (e) => {
    if (mode === 'play') {
      e.preventDefault();
      play.players.mouseClick(e.button);
      return;
    }
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
  km.onPress('F2', () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]));
  km.onPress('KeyH', () => (hud.hidden = !hud.hidden));
  km.onPress('KeyP', () => hud.classList.toggle('left'));
  for (const code of ['Minus', 'NumpadSubtract']) km.onPress(code, () => uiScale.step(-1));
  for (const code of ['Equal', 'NumpadAdd']) km.onPress(code, () => uiScale.step(1));

  // Simulation: 60 fixed steps per second.
  let padsChanged = false;
  const loop = new FixedStepLoop((dt) => {
    if (pads.poll()) padsChanged = true;
    if (mode === 'play') play.step(dt);
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
    if (mode === 'play') {
      play.render(app.screen.width, app.screen.height, uiScale.value);
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
