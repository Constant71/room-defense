import { TOOLS } from '../editor/editor';
import type { RemoteCommand, RemoteState } from '../remote/protocol';
import { el } from '../ui/dom';
import { Connection, type ConnectionStatus } from './connection';
import { MapView } from './mapView';

const app = document.getElementById('app')!;

/** Touch wording for each tool (the PC hints talk about the mouse and keys). */
const PHONE_HINTS: Record<string, string> = {
  select:
    'Tap to select. Drag a point to move it, or drag a zone to move all of it. Double-tap an edge of the selected shape to add a point; long-press a point to remove it.',
  corners:
    'Drag each corner onto the matching corner in the room while watching the projector. Tap a corner, then use the Nudge arrows for pixel-perfect placement. Turn on Fine for slow, precise drags.',
  spawn: 'Tap where enemies should appear.',
  goal: 'Tap the base enemies attack.',
  path: 'Tap a spawn, then tap waypoints, then tap a goal to finish. Finish, Remove last point and Cancel are under the map.',
  buildZone: 'Tap the corners of an area where towers may go, then tap Finish (or double-tap).',
  blocked: 'Tap the corners of an area to keep clear, then tap Finish (or double-tap).',
};
const conn = new Connection();
const send = (cmd: RemoteCommand): void => conn.send(cmd);
const map = new MapView(send);
let state: RemoteState | null = null;

// ---- pairing screen --------------------------------------------------------

const codeInput = el('input', {
  class: 'code-input',
  inputmode: 'numeric',
  autocomplete: 'one-time-code',
  maxlength: '6',
  placeholder: '000000',
  'aria-label': 'Pairing code',
});
const pairError = el('p', { class: 'error' });
const pairButton = el('button', { class: 'primary' }, 'Connect');
pairButton.addEventListener('click', () => conn.pairWithCode(codeInput.value));
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') conn.pairWithCode(codeInput.value);
});
const pairScreen = el(
  'section',
  {},
  el('h1', {}, 'Room Defense · Phone editor'),
  el(
    'p',
    {},
    'Enter the 6-digit pairing code shown in the Phone panel of the room editor on the projector.',
  ),
  codeInput,
  el('p', {}, ''),
  pairButton,
  pairError,
);

const waitScreen = el(
  'section',
  {},
  el('h1', {}, 'Room Defense · Phone editor'),
  el('p', { id: 'wait-text' }, ''),
);

// ---- editor screen ---------------------------------------------------------

const dot = el('span', { class: 'dot' });
const title = el('span', { class: 'title' }, '');
const saveButton = el('button', { class: 'primary' }, 'Save');
saveButton.addEventListener('click', () => send({ kind: 'save' }));

const toolButtons = new Map<string, HTMLButtonElement>();
const toolGrid = el('div', { class: 'grid' });
for (const t of TOOLS) {
  const b = el('button', {}, t.label);
  b.addEventListener('click', () => send({ kind: 'tool', tool: t.tool }));
  toolButtons.set(t.tool, b);
  toolGrid.append(b);
}

const hint = el('p', { class: 'hint' });
const message = el('p', { class: 'warn' });

const fitButton = el('button', {}, 'Fit');
fitButton.addEventListener('click', () => map.resetView());
const fineButton = el('button', {}, 'Fine');
fineButton.addEventListener('click', () => {
  map.fine = !map.fine;
  fineButton.classList.toggle('active', map.fine);
});
const mapWrap = el('div', { class: 'map-wrap' }, map.canvas);
// Under the map, not on it, so they never cover a corner handle.
const mapRow = el(
  'div',
  { class: 'map-row' },
  el('p', { class: 'hint' }, 'Two fingers: zoom and pan the map. Long-press: remove a point.'),
  el('div', { class: 'map-tools' }, fineButton, fitButton),
);

const action = (label: string, cmd: RemoteCommand): HTMLButtonElement => {
  const b = el('button', {}, label);
  b.addEventListener('click', () => send(cmd));
  return b;
};
const finishB = action('Finish', { kind: 'finish' });
const backB = action('Remove last point', { kind: 'backspace' });
const cancelB = action('Cancel', { kind: 'cancel' });
const drawActions = el('div', { class: 'grid three' }, finishB, backB, cancelB);
const deleteB = action('Delete selected', { kind: 'delete' });
const deselectB = action('Deselect', { kind: 'deselect' });
const undoB = action('Undo', { kind: 'undo' });
const redoB = action('Redo', { kind: 'redo' });
const editActions = el('div', { class: 'grid' }, undoB, redoB, deleteB, deselectB);

let step = 1;
const stepButton = el('button', {}, 'Step 1 px');
stepButton.addEventListener('click', () => {
  step = step === 1 ? 10 : 1;
  stepButton.textContent = `Step ${step} px`;
});
const arrow = (label: string, dx: number, dy: number): HTMLButtonElement => {
  const b = el('button', { 'aria-label': `Nudge ${label}` }, label);
  b.addEventListener('click', () => send({ kind: 'nudge', dx: dx * step, dy: dy * step }));
  return b;
};
const nudgeInfo = el('p', { class: 'hint' });
const nudge = el(
  'div',
  { class: 'nudge-wrap' },
  el(
    'div',
    { class: 'nudge' },
    el('span', {}),
    arrow('↑', 0, -1),
    el('span', {}),
    arrow('←', -1, 0),
    el('span', {}),
    arrow('→', 1, 0),
    el('span', {}),
    arrow('↓', 0, 1),
    el('span', {}),
  ),
  el('div', {}, stepButton, nudgeInfo),
);

const surfaceRow = el('div', { class: 'row' });
const addSurfaceB = action('+ Add surface', { kind: 'addSurface' });
const surfaceName = el('input', { type: 'text', maxlength: '40', 'aria-label': 'Surface name' });
surfaceName.addEventListener('change', () => {
  if (state?.activeSurfaceId && surfaceName.value.trim()) {
    send({ kind: 'renameSurface', id: state.activeSurfaceId, name: surfaceName.value.trim() });
  }
});

const roomName = el('input', { type: 'text', maxlength: '60', 'aria-label': 'Room name' });
roomName.addEventListener('change', () => {
  if (roomName.value.trim()) send({ kind: 'rename', name: roomName.value.trim() });
});
const roomSelect = el('select', { 'aria-label': 'Saved rooms' });
const discardOk = (): boolean =>
  !state?.dirty || window.confirm('This room has unsaved changes. Discard them?');
const openB = el('button', {}, 'Open');
openB.addEventListener('click', () => {
  if (roomSelect.value && discardOk()) send({ kind: 'open', file: roomSelect.value });
});
const newB = el('button', {}, 'New room');
newB.addEventListener('click', () => {
  if (discardOk()) send({ kind: 'newRoom' });
});
roomSelect.addEventListener('focus', () => send({ kind: 'refreshRooms' }));
const fileInfo = el('p', { class: 'hint' });
const problems = el('ul', {});

const editorScreen = el(
  'section',
  {},
  el('div', { class: 'bar' }, dot, title, saveButton),
  toolGrid,
  hint,
  message,
  mapWrap,
  mapRow,
  drawActions,
  el('h2', {}, 'Edit'),
  editActions,
  el('h2', {}, 'Nudge'),
  nudge,
  el('h2', {}, 'Surfaces'),
  surfaceRow,
  el('div', { class: 'row' }, surfaceName, addSurfaceB),
  el('h2', {}, 'Room check'),
  problems,
  el('h2', {}, 'Room'),
  roomName,
  fileInfo,
  el('div', { class: 'row' }, roomSelect),
  el('div', { class: 'row' }, openB, newB),
);

// ---- rendering -------------------------------------------------------------

function showScreen(s: ConnectionStatus): void {
  if (s.kind === 'need-code') {
    app.replaceChildren(pairScreen);
    pairError.textContent = s.error ?? '';
    codeInput.focus();
  } else if (s.kind === 'connected') {
    if (editorScreen.parentElement !== app) {
      app.replaceChildren(editorScreen);
      map.layout();
    }
  } else {
    const text =
      s.kind === 'connecting'
        ? 'Connecting to the game…'
        : 'Paired. Waiting for the game on the PC: open it and switch to the Room editor.';
    if (state && s.kind === 'connecting') {
      // Keep the editor visible while reconnecting; just show the red dot.
      dot.classList.remove('on');
      return;
    }
    waitScreen.querySelector('#wait-text')!.textContent = text;
    app.replaceChildren(waitScreen);
  }
  dot.classList.toggle('on', s.kind === 'connected');
}

let surfaceSig = '';
let roomsSig = '';
let problemsSig = '';

function render(s: RemoteState): void {
  title.textContent = `${s.room.name}${s.dirty ? ' •' : ''}`;
  saveButton.textContent = s.dirty ? 'Save' : 'Saved';
  for (const [tool, b] of toolButtons) b.classList.toggle('active', tool === s.tool);
  hint.textContent = PHONE_HINTS[s.tool] ?? '';
  message.textContent = s.message;
  message.hidden = !s.message;

  const drawing = !!s.draft;
  drawActions.hidden = !drawing && !['path', 'buildZone', 'blocked'].includes(s.tool);
  finishB.disabled = backB.disabled = cancelB.disabled = !drawing;
  undoB.disabled = !s.canUndo;
  redoB.disabled = !s.canRedo;
  deleteB.disabled = deselectB.disabled = !s.selection;

  const corner = s.tool === 'corners' && s.selectedCorner;
  const marker = s.selection && (s.selection.kind === 'spawn' || s.selection.kind === 'goal');
  nudgeInfo.textContent = corner
    ? 'Moves the selected corner on the projector.'
    : marker
      ? `Moves the selected ${s.selection!.kind}.`
      : 'Select a corner (Corners tool) or a spawn/goal to nudge it.';

  const sig = JSON.stringify([s.room.surfaces.map((x) => [x.id, x.name]), s.activeSurfaceId]);
  if (sig !== surfaceSig) {
    surfaceSig = sig;
    surfaceRow.replaceChildren(
      ...(s.room.surfaces.length
        ? s.room.surfaces.map((x) => {
            const b = el('button', { class: x.id === s.activeSurfaceId ? 'active' : '' }, x.name);
            b.addEventListener('click', () => send({ kind: 'surface', id: x.id }));
            return b;
          })
        : [
            el(
              'p',
              { class: 'warn' },
              'No surfaces yet. Add one for each flat area the projector hits.',
            ),
          ]),
    );
  }
  const active = s.room.surfaces.find((x) => x.id === s.activeSurfaceId);
  surfaceName.disabled = !active;
  if (document.activeElement !== surfaceName) surfaceName.value = active?.name ?? '';
  if (document.activeElement !== roomName) roomName.value = s.room.name;
  fileInfo.textContent = s.file ? `Saved on the PC as rooms/${s.file}.json` : 'Not saved yet';

  const rsig = JSON.stringify(s.rooms);
  if (rsig !== roomsSig) {
    roomsSig = rsig;
    const current = roomSelect.value || s.file || '';
    roomSelect.replaceChildren(
      ...(s.rooms.length
        ? s.rooms.map((r) => el('option', { value: r.file }, r.name))
        : [el('option', { value: '' }, 'No saved rooms')]),
    );
    if (s.rooms.some((r) => r.file === current)) roomSelect.value = current;
  }

  const psig = JSON.stringify(s.problems);
  if (psig !== problemsSig) {
    problemsSig = psig;
    problems.replaceChildren(
      ...(s.problems.length
        ? s.problems.map((p) =>
            el('li', { class: p.level === 'error' ? 'error' : 'warn' }, p.message),
          )
        : [el('li', { class: 'ok' }, 'Room is ready to play.')]),
    );
  }
  map.setState(s);
}

conn.onStatus = showScreen;
conn.onState = (s) => {
  state = s;
  render(s);
};

// A QR code link carries the code in the #fragment (never sent to the server's logs).
const fromLink = new URLSearchParams(location.hash.slice(1)).get('code');
if (fromLink) history.replaceState(null, '', location.pathname);
conn.start(fromLink);
