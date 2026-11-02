import QRCode from 'qrcode';
import type { Editor } from '../editor/editor';
import type { EditorPanel } from '../editor/editorPanel';
import { el } from '../ui/dom';
import {
  parseCommand,
  REMOTE_INFO_PATH,
  REMOTE_WS_PATH,
  type RemoteCommand,
  type RemoteInfo,
  type RemoteState,
} from './protocol';

/** Pixel radius the editor uses for handles at scale 1 (see Editor HANDLE). */
const BASE_HANDLE_PX = 12;
const STATE_INTERVAL_MS = 33;

/**
 * PC side of phone editing: shows the pairing QR code, streams the editor
 * state to phones and runs their commands on the real Editor.
 */
export class RemoteHost {
  private ws: WebSocket | null = null;
  private phones = 0;
  private info: RemoteInfo = { enabled: false };
  private sendTimer: number | null = null;
  private lastSent = 0;
  private readonly body = el('div', {});

  constructor(
    root: HTMLElement,
    private readonly editor: Editor,
    private readonly panel: EditorPanel,
    private readonly showEditor: () => void,
  ) {
    root.append(el('h2', {}, 'Phone'), this.body);
    editor.onChange(() => this.queueState());
    panel.onRoomsChanged(() => this.queueState());
  }

  async start(): Promise<void> {
    try {
      this.info = (await (await fetch(REMOTE_INFO_PATH)).json()) as RemoteInfo;
    } catch {
      this.info = { enabled: false };
    }
    await this.render();
    if (this.info.enabled) this.connect();
  }

  private connect(): void {
    const ws = new WebSocket(`ws://${location.host}${REMOTE_WS_PATH}?role=host`);
    this.ws = ws;
    ws.addEventListener('open', () => this.sendState());
    ws.addEventListener('message', (e) => this.onMessage(String(e.data)));
    ws.addEventListener('close', () => {
      this.ws = null;
      this.phones = 0;
      void this.render();
      setTimeout(() => this.connect(), 2000);
    });
  }

  private onMessage(text: string): void {
    let msg: { type?: string; count?: number; cmd?: unknown };
    try {
      msg = JSON.parse(text) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === 'phones' && typeof msg.count === 'number') {
      const before = this.phones;
      this.phones = msg.count;
      void this.render();
      if (msg.count > before) {
        this.sendState();
        void this.panel.refreshList();
      }
      return;
    }
    if (msg.type === 'cmd') {
      const cmd = parseCommand(msg.cmd);
      if (cmd) this.run(cmd);
    }
  }

  private toPx(p: { x: number; y: number }): { x: number; y: number } {
    return { x: p.x * this.editor.viewport.width, y: p.y * this.editor.viewport.height };
  }

  private run(cmd: RemoteCommand): void {
    const ed = this.editor;
    // Whatever the phone does should be visible on the projector.
    this.showEditor();
    switch (cmd.kind) {
      case 'pointer': {
        const px = this.toPx(cmd.at);
        if (cmd.phase === 'down') {
          ed.pointerDown(
            px,
            cmd.button,
            cmd.double,
            (cmd.hit * ed.viewport.width) / BASE_HANDLE_PX,
          );
        } else if (cmd.phase === 'move') ed.pointerMove(px);
        else ed.pointerUp();
        break;
      }
      case 'tool':
        ed.setTool(cmd.tool);
        break;
      case 'nudge':
        ed.nudge(cmd.dx, cmd.dy);
        break;
      case 'surface':
        if (ed.surface(cmd.id)) ed.setActiveSurface(cmd.id);
        break;
      case 'open':
        void this.panel.open(cmd.file, false, true);
        break;
      case 'rename':
        ed.rename(cmd.name);
        break;
      case 'renameSurface':
        ed.renameSurface(cmd.id, cmd.name);
        break;
      case 'undo':
        ed.undo();
        break;
      case 'redo':
        ed.redo();
        break;
      case 'finish':
        ed.finishDraft();
        break;
      case 'cancel':
        ed.cancelDraft();
        break;
      case 'backspace':
        ed.removeLastDraftPoint();
        break;
      case 'delete':
        ed.deleteSelection();
        break;
      case 'deselect':
        ed.selection = null;
        ed.selectedCorner = null;
        this.queueState();
        break;
      case 'addSurface':
        ed.addSurface();
        break;
      case 'save':
        void this.panel.save(true);
        break;
      case 'newRoom':
        this.panel.newRoom(true);
        break;
      case 'refreshRooms':
        void this.panel.refreshList();
        break;
    }
  }

  /** Send at most ~30 updates a second, always including the latest. */
  private queueState(): void {
    if (!this.ws || this.phones === 0 || this.sendTimer !== null) return;
    const wait = Math.max(0, STATE_INTERVAL_MS - (performance.now() - this.lastSent));
    this.sendTimer = window.setTimeout(() => {
      this.sendTimer = null;
      this.sendState();
    }, wait);
  }

  private sendState(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const ed = this.editor;
    const state: RemoteState = {
      room: ed.room,
      file: ed.file,
      dirty: ed.dirty,
      tool: ed.tool,
      activeSurfaceId: ed.activeSurfaceId,
      selection: ed.selection,
      selectedCorner: ed.selectedCorner,
      draft: ed.draft,
      message: ed.message,
      canUndo: ed.canUndo,
      canRedo: ed.canRedo,
      problems: ed.problems(),
      viewport: ed.viewport,
      rooms: this.panel.rooms.map((r) => ({ file: r.file, name: r.name })),
    };
    ws.send(JSON.stringify({ type: 'state', state }));
    this.lastSent = performance.now();
  }

  private async render(): Promise<void> {
    if (!this.info.enabled) {
      this.body.replaceChildren(
        el('p', {}, 'Edit this room from your phone: close the game, then start it with'),
        el('p', { class: 'value' }, 'npm run dev:phone'),
        el('p', { class: 'muted small' }, 'Your phone must be on the same Wi-Fi as this PC.'),
      );
      return;
    }
    const url = this.info.urls?.[0];
    if (!url || !this.info.code) {
      this.body.replaceChildren(
        el(
          'p',
          { class: 'warn' },
          'No network address found. Connect this PC to your home Wi-Fi or network, then restart.',
        ),
      );
      return;
    }
    const pairUrl = `${url}#code=${this.info.code}`;
    const qr = el('img', { class: 'qr', alt: 'QR code to open the phone editor' });
    qr.src = await QRCode.toDataURL(pairUrl, {
      margin: 2,
      scale: 8,
      color: { dark: '#000000', light: '#ffffff' },
    });
    const status =
      this.phones > 0
        ? el('p', { class: 'ok' }, `${this.phones} phone${this.phones > 1 ? 's' : ''} connected.`)
        : el('p', {}, 'Scan with your phone camera (same Wi-Fi as this PC).');
    this.body.replaceChildren(
      status,
      qr,
      el('p', {}, 'Or open ', el('span', { class: 'value' }, url)),
      el('p', {}, 'Pairing code ', el('span', { class: 'value code' }, this.info.code)),
      ...(this.info.urls && this.info.urls.length > 1
        ? [
            el(
              'p',
              { class: 'muted small' },
              `Other addresses: ${this.info.urls.slice(1).join(', ')}`,
            ),
          ]
        : []),
    );
  }
}
