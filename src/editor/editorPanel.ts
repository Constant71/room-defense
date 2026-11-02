import { el } from '../ui/dom';
import { emptyRoom, fileNameFor } from '../room/room';
import { listRooms, loadRoom, saveRoom } from '../room/storage';
import { TOOLS, type Editor, type Tool } from './editor';

const LAST_ROOM_KEY = 'roomDefense.lastRoom';

function remember(file: string): void {
  try {
    localStorage.setItem(LAST_ROOM_KEY, file);
  } catch {
    // storage can be unavailable; it only remembers the last room
  }
}

function lastRoom(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}

const KIND_LABEL: Record<string, string> = {
  surface: 'Surface',
  spawn: 'Spawn',
  goal: 'Goal',
  path: 'Path',
  buildZone: 'Build zone',
  blocked: 'Blocked area',
};

/** Side panel for the room editor, plus its keyboard shortcuts. */
export class EditorPanel {
  private isActive = false;
  /** Status bar outside the panels, so the current tool's instructions stay visible. */
  private readonly statusBar = document.getElementById('editor-status');

  get active(): boolean {
    return this.isActive;
  }

  set active(on: boolean) {
    this.isActive = on;
    if (this.statusBar) this.statusBar.hidden = !on;
  }

  private readonly nameInput = el('input', {
    type: 'text',
    maxlength: '60',
    'aria-label': 'Room name',
  });
  private readonly fileInfo = el('span', { class: 'muted small' });
  private readonly status = el('span', {});
  private readonly openSelect = el('select', { 'aria-label': 'Saved rooms' });
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly hint = el('p', { class: 'muted small' });
  private readonly message = el('p', { class: 'warn' });
  private readonly surfaceList = el('div', { class: 'surface-list' });
  private readonly surfaceName = el('input', {
    type: 'text',
    maxlength: '40',
    'aria-label': 'Surface name',
  });
  private readonly selectionInfo = el('span', { class: 'value' });
  private readonly deleteButton = el('button', {}, 'Delete (Del)');
  private readonly undoButton = el('button', {}, 'Undo');
  private readonly redoButton = el('button', {}, 'Redo');
  private readonly problemList = el('ul', { class: 'problems' });

  constructor(
    root: HTMLElement,
    private readonly editor: Editor,
  ) {
    const saveButton = el('button', { class: 'primary' }, 'Save (Ctrl+S)');
    saveButton.addEventListener('click', () => void this.save());
    const newButton = el('button', {}, 'New room');
    newButton.addEventListener('click', () => this.newRoom());
    const openButton = el('button', {}, 'Open');
    openButton.addEventListener('click', () => void this.open(this.openSelect.value));
    this.openSelect.addEventListener('focus', () => void this.refreshList());

    this.nameInput.addEventListener('change', () => editor.rename(this.nameInput.value));
    this.surfaceName.addEventListener('change', () => {
      if (editor.activeSurfaceId)
        editor.renameSurface(editor.activeSurfaceId, this.surfaceName.value);
    });

    const tools = el('div', { class: 'tool-grid' });
    for (const t of TOOLS) {
      const b = el('button', { title: t.hint }, `${t.key} ${t.label}`);
      b.addEventListener('click', () => editor.setTool(t.tool));
      this.toolButtons.set(t.tool, b);
      tools.append(b);
    }

    const addSurface = el('button', {}, '+ Add surface');
    addSurface.addEventListener('click', () => editor.addSurface());
    this.deleteButton.addEventListener('click', () => editor.deleteSelection());
    this.undoButton.addEventListener('click', () => editor.undo());
    this.redoButton.addEventListener('click', () => editor.redo());

    root.append(
      el('h2', {}, 'Room editor'),
      el('div', { class: 'row' }, 'Name ', this.nameInput),
      el('div', { class: 'row' }, this.status, this.fileInfo),
      el('div', { class: 'row wrap' }, saveButton, newButton, this.openSelect, openButton),
      el('h3', {}, 'Tools'),
      tools,
      this.hint,
      this.message,
      el('h3', {}, 'Surfaces'),
      this.surfaceList,
      el('div', { class: 'row' }, 'Name ', this.surfaceName),
      el('div', { class: 'row wrap' }, addSurface),
      el('h3', {}, 'Selection'),
      el(
        'div',
        { class: 'row wrap' },
        this.selectionInfo,
        this.deleteButton,
        this.undoButton,
        this.redoButton,
      ),
      el('h3', {}, 'Room check'),
      this.problemList,
      el(
        'p',
        { class: 'muted small' },
        'Keys: 1–7 tools · Enter finish · Esc cancel · Backspace undo point · Del delete · Ctrl+Z / Ctrl+Y undo/redo · arrows nudge · P move panel · H hide panels · − / = text size',
      ),
    );

    editor.onChange(() => this.render());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', (e) => {
      if (editor.dirty) e.preventDefault();
    });
    this.render();
  }

  /** Open the last used room, if any. */
  async restore(): Promise<void> {
    const file = lastRoom();
    if (file) await this.open(file, true);
    void this.refreshList();
  }

  private async refreshList(): Promise<void> {
    try {
      const rooms = await listRooms();
      const current = this.openSelect.value;
      this.openSelect.replaceChildren(
        ...(rooms.length
          ? rooms.map((r) => el('option', { value: r.file }, `${r.name} (${r.file}.json)`))
          : [el('option', { value: '' }, 'No saved rooms')]),
      );
      if (rooms.some((r) => r.file === current)) this.openSelect.value = current;
    } catch (err) {
      this.openSelect.replaceChildren(el('option', { value: '' }, 'Rooms unavailable'));
      this.editor.message = `Could not list rooms: ${String(err)}. Start the game with "npm run dev".`;
      this.render();
    }
  }

  private confirmDiscard(): boolean {
    return (
      !this.editor.dirty || window.confirm('You have unsaved changes to this room. Discard them?')
    );
  }

  private newRoom(): void {
    if (!this.confirmDiscard()) return;
    const vp = this.editor.viewport;
    this.editor.setRoom(
      emptyRoom(
        'New room',
        Math.round(vp.width * devicePixelRatio),
        Math.round(vp.height * devicePixelRatio),
      ),
      null,
    );
    this.editor.addSurface();
  }

  private async open(file: string, quiet = false): Promise<void> {
    if (!file || !this.confirmDiscard()) return;
    try {
      this.editor.setRoom(await loadRoom(file), file);
      remember(file);
    } catch (err) {
      if (!quiet) {
        this.editor.message = `Could not open ${file}.json: ${err instanceof Error ? err.message : String(err)}`;
        this.render();
      }
    }
  }

  private async save(): Promise<void> {
    const ed = this.editor;
    ed.rename(this.nameInput.value);
    let file = ed.file;
    if (!file) {
      file = fileNameFor(ed.room.name);
      try {
        const existing = await listRooms();
        if (
          existing.some((r) => r.file === file) &&
          !window.confirm(`rooms/${file}.json already exists. Replace it?`)
        ) {
          return;
        }
      } catch {
        // the save below reports the real problem
      }
    }
    try {
      const vp = ed.viewport;
      ed.room.output = {
        width: Math.round(vp.width * devicePixelRatio),
        height: Math.round(vp.height * devicePixelRatio),
      };
      await saveRoom(file, ed.room);
      ed.markSaved(file);
      ed.message = '';
      remember(file);
      void this.refreshList();
    } catch (err) {
      ed.message = `Save failed: ${err instanceof Error ? err.message : String(err)}`;
      this.render();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isActive) return;
    const ed = this.editor;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyS') {
      e.preventDefault();
      void this.save();
      return;
    }
    // Leave typing in text fields alone.
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
    ) {
      if (e.key === 'Enter' || e.key === 'Escape') target.blur();
      return;
    }
    if (ctrl && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) ed.redo();
      else ed.undo();
      return;
    }
    if (ctrl && e.code === 'KeyY') {
      e.preventDefault();
      ed.redo();
      return;
    }
    if (ctrl || e.altKey) return;
    const tool = TOOLS.find((t) => t.key === e.key);
    if (tool) {
      ed.setTool(tool.tool);
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case 'Enter':
        ed.finishDraft();
        break;
      case 'Escape':
        if (ed.draft) ed.cancelDraft();
        else {
          ed.selection = null;
          ed.selectedCorner = null;
          this.render();
        }
        break;
      case 'Backspace':
        e.preventDefault();
        ed.removeLastDraftPoint();
        break;
      case 'Delete':
        ed.deleteSelection();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        ed.nudge(-step, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        ed.nudge(step, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        ed.nudge(0, -step);
        break;
      case 'ArrowDown':
        e.preventDefault();
        ed.nudge(0, step);
        break;
    }
  }

  private render(): void {
    const ed = this.editor;
    if (document.activeElement !== this.nameInput) this.nameInput.value = ed.room.name;
    this.status.textContent = ed.dirty ? 'Unsaved changes' : 'Saved';
    this.status.className = ed.dirty ? 'warn' : 'ok';
    this.fileInfo.textContent = ed.file ? `rooms/${ed.file}.json` : 'not saved yet';

    for (const [tool, b] of this.toolButtons) b.classList.toggle('active', tool === ed.tool);
    this.hint.textContent = TOOLS.find((t) => t.tool === ed.tool)?.hint ?? '';
    this.message.textContent = ed.message;
    this.message.hidden = !ed.message;
    const tool = TOOLS.find((t) => t.tool === ed.tool);
    this.statusBar?.replaceChildren(
      el('span', { class: 'tool' }, `${tool?.key ?? ''} ${tool?.label ?? ''}`),
      tool?.hint ?? '',
      ...(ed.message ? [el('p', { class: 'warn' }, ed.message)] : []),
    );

    this.surfaceList.replaceChildren(
      ...(ed.room.surfaces.length
        ? ed.room.surfaces.map((s) => {
            const b = el('button', { class: s.id === ed.activeSurfaceId ? 'active' : '' }, s.name);
            b.addEventListener('click', () => ed.setActiveSurface(s.id));
            return b;
          })
        : [
            el(
              'p',
              { class: 'warn' },
              'No surfaces. Add one for each flat area the projector hits (floor, wall, table).',
            ),
          ]),
    );
    const active = ed.surface(ed.activeSurfaceId);
    this.surfaceName.disabled = !active;
    if (document.activeElement !== this.surfaceName) this.surfaceName.value = active?.name ?? '';

    const sel = ed.selection;
    this.selectionInfo.textContent = sel
      ? sel.kind === 'surface'
        ? `${KIND_LABEL.surface}: ${ed.surface(sel.id)?.name ?? sel.id}`
        : `${KIND_LABEL[sel.kind]} (${sel.id})`
      : 'nothing';
    this.deleteButton.disabled = !sel;
    this.undoButton.disabled = !ed.canUndo;
    this.redoButton.disabled = !ed.canRedo;

    const problems = ed.problems();
    this.problemList.replaceChildren(
      ...(problems.length
        ? problems.map((p) =>
            el('li', { class: p.level === 'error' ? 'error' : 'warn' }, p.message),
          )
        : [el('li', { class: 'ok' }, 'Room is ready to play.')]),
    );
  }
}
